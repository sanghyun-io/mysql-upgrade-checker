/**
 * Readiness Score Calculator
 *
 * Computes a 0-100 migration readiness score based on issues and pre-flight status.
 * Score formula: 100 - (penalty per issue) - (pre-flight penalty)
 * Auto-fixable issues get 50% discount on penalties.
 */

import type { Issue, RuleCategory } from '../types';
import type { PreflightItem } from '../analysis/preflight';

// ============================================================================
// Types
// ============================================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ReadinessResult {
  /** Overall score 0-100 */
  score: number;
  /** Risk level based on score */
  riskLevel: RiskLevel;
  /** Breakdown by category */
  categoryBreakdown: CategoryBreakdown[];
  /** Fix strategy distribution */
  fixSummary: FixSummary;
  /** Pre-flight completion status */
  preflightStatus: PreflightStatus;
  /** Top priority issues to fix first */
  priorityIssues: Issue[];
  /** Disclaimer text */
  disclaimer: string;
}

export interface CategoryBreakdown {
  category: RuleCategory;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  total: number;
}

export interface FixSummary {
  autoFixable: number;
  manualOnly: number;
  totalFixable: number;
  effortDistribution: { low: number; medium: number; high: number };
}

export interface PreflightStatus {
  total: number;
  completed: number;
  requiredTotal: number;
  requiredCompleted: number;
  allRequiredPassed: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const ERROR_PENALTY = 10;
const WARNING_PENALTY = 2;
const INFO_PENALTY = 0.5;
const AUTO_FIX_DISCOUNT = 0.5;
const PREFLIGHT_INCOMPLETE_PENALTY = 15;

const DISCLAIMER = '이 점수는 휴리스틱 기반이며, 정확한 리스크 평가를 대체하지 않습니다. 실제 마이그레이션 전 반드시 전문가 검토를 거치세요.';

// ============================================================================
// Score Calculation
// ============================================================================

/**
 * Calculate readiness score from issues and pre-flight status.
 */
export function calculateReadiness(
  issues: Issue[],
  preflightItems?: PreflightItem[]
): ReadinessResult {
  // Calculate penalty
  let totalPenalty = 0;

  for (const issue of issues) {
    const basePenalty = getIssuePenalty(issue.severity);
    const isAutoFixable = hasAutoFix(issue);
    const discount = isAutoFixable ? AUTO_FIX_DISCOUNT : 1;
    totalPenalty += basePenalty * discount;
  }

  // Pre-flight penalty
  const preflightStatus = computePreflightStatus(preflightItems);
  if (!preflightStatus.allRequiredPassed) {
    totalPenalty += PREFLIGHT_INCOMPLETE_PENALTY;
  }

  // Compute score (min 0)
  const score = Math.max(0, Math.round(100 - totalPenalty));

  return {
    score,
    riskLevel: scoreToRiskLevel(score),
    categoryBreakdown: computeCategoryBreakdown(issues),
    fixSummary: computeFixSummary(issues),
    preflightStatus,
    priorityIssues: getTopPriorityIssues(issues, 5),
    disclaimer: DISCLAIMER,
  };
}

/**
 * Map a score to a risk level.
 */
export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'low';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'high';
  return 'critical';
}

// ============================================================================
// Helpers
// ============================================================================

function getIssuePenalty(severity: string): number {
  switch (severity) {
    case 'error': return ERROR_PENALTY;
    case 'warning': return WARNING_PENALTY;
    case 'info': return INFO_PENALTY;
    default: return 0;
  }
}

function hasAutoFix(issue: Issue): boolean {
  if (issue.fixOptions && issue.fixOptions.length > 0) {
    return issue.fixOptions.some(o => o.sqlTemplate !== null);
  }
  return !!issue.fixQuery;
}

function computePreflightStatus(items?: PreflightItem[]): PreflightStatus {
  if (!items || items.length === 0) {
    return {
      total: 0,
      completed: 0,
      requiredTotal: 0,
      requiredCompleted: 0,
      allRequiredPassed: true, // No checks = nothing to fail
    };
  }

  const total = items.length;
  const completed = items.filter(i => i.status === 'passed' || i.status === 'skipped').length;
  const requiredTotal = items.filter(i => i.required).length;
  const requiredCompleted = items.filter(i => i.required && (i.status === 'passed' || i.status === 'skipped')).length;

  return {
    total,
    completed,
    requiredTotal,
    requiredCompleted,
    allRequiredPassed: requiredCompleted >= requiredTotal,
  };
}

function computeCategoryBreakdown(issues: Issue[]): CategoryBreakdown[] {
  const map = new Map<RuleCategory, { error: number; warning: number; info: number }>();

  for (const issue of issues) {
    if (!map.has(issue.category)) {
      map.set(issue.category, { error: 0, warning: 0, info: 0 });
    }
    const counts = map.get(issue.category)!;
    if (issue.severity === 'error') counts.error++;
    else if (issue.severity === 'warning') counts.warning++;
    else counts.info++;
  }

  const result: CategoryBreakdown[] = [];
  for (const [category, counts] of map) {
    result.push({
      category,
      errorCount: counts.error,
      warningCount: counts.warning,
      infoCount: counts.info,
      total: counts.error + counts.warning + counts.info,
    });
  }

  // Sort by total descending
  result.sort((a, b) => b.total - a.total);
  return result;
}

function computeFixSummary(issues: Issue[]): FixSummary {
  let autoFixable = 0;
  let manualOnly = 0;
  const effort = { low: 0, medium: 0, high: 0 };

  for (const issue of issues) {
    if (hasAutoFix(issue)) {
      autoFixable++;
      const recommended = issue.fixOptions?.find(o => o.isRecommended) ?? issue.fixOptions?.[0];
      if (recommended) {
        effort[recommended.effort]++;
      } else {
        effort.low++; // fixQuery fallback assumed low effort
      }
    } else if (issue.severity !== 'info') {
      manualOnly++;
    }
  }

  return {
    autoFixable,
    manualOnly,
    totalFixable: autoFixable + manualOnly,
    effortDistribution: effort,
  };
}

function getTopPriorityIssues(issues: Issue[], count: number): Issue[] {
  const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };

  return [...issues]
    .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
    .slice(0, count);
}
