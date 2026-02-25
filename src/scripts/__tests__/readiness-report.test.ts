/**
 * Readiness Report Tests
 *
 * Covers: readiness-score.ts, readiness-renderer.ts
 */

import { describe, it, expect } from 'vitest';
import { calculateReadiness, scoreToRiskLevel } from '../report/readiness-score';
import { renderReadinessHTML, renderReadinessMarkdown } from '../report/readiness-renderer';
import type { Issue } from '../types';
import type { PreflightItem } from '../analysis/preflight';

// ============================================================================
// Helpers
// ============================================================================

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'test-issue',
    type: 'schema',
    category: 'invalidObjects',
    severity: 'warning',
    title: 'Test Issue',
    description: 'Test description',
    suggestion: 'Test suggestion',
    ...overrides,
  };
}

function makePreflightItem(overrides: Partial<PreflightItem> = {}): PreflightItem {
  return {
    id: 'pf-test',
    title: 'Test Check',
    description: 'Test preflight check',
    required: false,
    query: null,
    status: 'pending',
    ...overrides,
  };
}

// ============================================================================
// Score Calculation
// ============================================================================

describe('calculateReadiness', () => {
  it('should return perfect score (100) for zero issues', () => {
    const result = calculateReadiness([]);
    expect(result.score).toBe(100);
    expect(result.riskLevel).toBe('low');
  });

  it('should apply error penalty (-10 per error)', () => {
    const issues = [
      makeIssue({ severity: 'error' }),
    ];
    const result = calculateReadiness(issues);
    expect(result.score).toBe(90);
  });

  it('should apply warning penalty (-2 per warning)', () => {
    const issues = [
      makeIssue({ severity: 'warning' }),
    ];
    const result = calculateReadiness(issues);
    expect(result.score).toBe(98);
  });

  it('should apply info penalty (-0.5 per info)', () => {
    const issues = [
      makeIssue({ severity: 'info' }),
    ];
    const result = calculateReadiness(issues);
    // 100 - 0.5 = 99.5 → rounded to 100
    expect(result.score).toBe(100);
  });

  it('should apply info penalty visible with multiple infos', () => {
    const issues = Array.from({ length: 4 }, (_, i) =>
      makeIssue({ id: `info-${i}`, severity: 'info' })
    );
    const result = calculateReadiness(issues);
    // 100 - (0.5 * 4) = 98
    expect(result.score).toBe(98);
  });

  it('should apply 50% discount for auto-fixable issues (fixQuery)', () => {
    const issues = [
      makeIssue({ severity: 'error', fixQuery: 'ALTER TABLE ...' }),
    ];
    const result = calculateReadiness(issues);
    // 100 - (10 * 0.5) = 95
    expect(result.score).toBe(95);
  });

  it('should apply 50% discount for auto-fixable issues (fixOptions with sqlTemplate)', () => {
    const issues = [
      makeIssue({
        severity: 'error',
        fixOptions: [{
          strategy: 'engine_convert',
          label: 'Convert to InnoDB',
          description: 'Convert engine',
          sqlTemplate: 'ALTER TABLE t ENGINE=InnoDB',
          isRecommended: true,
          effort: 'low',
          risk: 'low',
          impact: 'Engine changed',
          reversibility: 'reversible',
        }],
      }),
    ];
    const result = calculateReadiness(issues);
    expect(result.score).toBe(95);
  });

  it('should NOT discount manual-only fixOptions (sqlTemplate=null)', () => {
    const issues = [
      makeIssue({
        severity: 'error',
        fixOptions: [{
          strategy: 'manual',
          label: 'Manual fix',
          description: 'Fix manually',
          sqlTemplate: null,
          isRecommended: true,
          effort: 'high',
          risk: 'high',
          impact: 'Must fix manually',
          reversibility: 'manual_only',
        }],
      }),
    ];
    const result = calculateReadiness(issues);
    // Full penalty: 100 - 10 = 90
    expect(result.score).toBe(90);
  });

  it('should apply preflight incomplete penalty (-15)', () => {
    const items: PreflightItem[] = [
      makePreflightItem({ id: 'pf1', required: true, status: 'pending' }),
    ];
    const result = calculateReadiness([], items);
    // 100 - 15 = 85
    expect(result.score).toBe(85);
  });

  it('should NOT apply preflight penalty when all required passed', () => {
    const items: PreflightItem[] = [
      makePreflightItem({ id: 'pf1', required: true, status: 'passed' }),
      makePreflightItem({ id: 'pf2', required: false, status: 'pending' }),
    ];
    const result = calculateReadiness([], items);
    expect(result.score).toBe(100);
  });

  it('should clamp score to minimum 0', () => {
    // 15 errors = 150 penalty → score = max(0, 100-150) = 0
    const issues = Array.from({ length: 15 }, (_, i) =>
      makeIssue({ id: `err-${i}`, severity: 'error' })
    );
    const result = calculateReadiness(issues);
    expect(result.score).toBe(0);
    expect(result.riskLevel).toBe('critical');
  });

  it('should combine multiple penalty types', () => {
    const issues = [
      makeIssue({ id: 'e1', severity: 'error' }),              // -10
      makeIssue({ id: 'w1', severity: 'warning' }),             // -2
      makeIssue({ id: 'w2', severity: 'warning', fixQuery: 'X' }), // -2 * 0.5 = -1
    ];
    const items: PreflightItem[] = [
      makePreflightItem({ required: true, status: 'pending' }), // -15
    ];
    const result = calculateReadiness(issues, items);
    // 100 - 10 - 2 - 1 - 15 = 72
    expect(result.score).toBe(72);
  });
});

// ============================================================================
// Risk Level Mapping
// ============================================================================

describe('scoreToRiskLevel', () => {
  it('should map 80-100 to low', () => {
    expect(scoreToRiskLevel(100)).toBe('low');
    expect(scoreToRiskLevel(80)).toBe('low');
  });

  it('should map 60-79 to medium', () => {
    expect(scoreToRiskLevel(79)).toBe('medium');
    expect(scoreToRiskLevel(60)).toBe('medium');
  });

  it('should map 40-59 to high', () => {
    expect(scoreToRiskLevel(59)).toBe('high');
    expect(scoreToRiskLevel(40)).toBe('high');
  });

  it('should map 0-39 to critical', () => {
    expect(scoreToRiskLevel(39)).toBe('critical');
    expect(scoreToRiskLevel(0)).toBe('critical');
  });
});

// ============================================================================
// Category Breakdown
// ============================================================================

describe('calculateReadiness - categoryBreakdown', () => {
  it('should group issues by category', () => {
    const issues = [
      makeIssue({ id: 'a', category: 'invalidObjects', severity: 'error' }),
      makeIssue({ id: 'b', category: 'invalidObjects', severity: 'warning' }),
      makeIssue({ id: 'c', category: 'dataIntegrity', severity: 'error' }),
    ];
    const result = calculateReadiness(issues);

    expect(result.categoryBreakdown.length).toBe(2);

    const invalidObj = result.categoryBreakdown.find(c => c.category === 'invalidObjects');
    expect(invalidObj).toBeDefined();
    expect(invalidObj!.errorCount).toBe(1);
    expect(invalidObj!.warningCount).toBe(1);
    expect(invalidObj!.total).toBe(2);

    const charset = result.categoryBreakdown.find(c => c.category === 'dataIntegrity');
    expect(charset).toBeDefined();
    expect(charset!.errorCount).toBe(1);
    expect(charset!.total).toBe(1);
  });

  it('should sort by total descending', () => {
    const issues = [
      makeIssue({ id: 'a', category: 'dataIntegrity', severity: 'error' }),
      makeIssue({ id: 'b', category: 'invalidObjects', severity: 'warning' }),
      makeIssue({ id: 'c', category: 'invalidObjects', severity: 'info' }),
      makeIssue({ id: 'd', category: 'invalidObjects', severity: 'error' }),
    ];
    const result = calculateReadiness(issues);
    expect(result.categoryBreakdown[0].category).toBe('invalidObjects');
    expect(result.categoryBreakdown[0].total).toBe(3);
  });

  it('should return empty breakdown for zero issues', () => {
    const result = calculateReadiness([]);
    expect(result.categoryBreakdown).toEqual([]);
  });
});

// ============================================================================
// Fix Summary
// ============================================================================

describe('calculateReadiness - fixSummary', () => {
  it('should count auto-fixable vs manual', () => {
    const issues = [
      makeIssue({ id: 'auto1', severity: 'error', fixQuery: 'ALTER ...' }),
      makeIssue({ id: 'manual1', severity: 'error' }),
      makeIssue({ id: 'auto2', severity: 'warning', fixOptions: [{
        strategy: 'engine_convert',
        label: 'Fix',
        description: 'Fix it',
        sqlTemplate: 'SQL',
        isRecommended: true,
        effort: 'medium',
        risk: 'low',
        impact: 'Fixed',
        reversibility: 'reversible',
      }] }),
    ];
    const result = calculateReadiness(issues);

    expect(result.fixSummary.autoFixable).toBe(2);
    expect(result.fixSummary.manualOnly).toBe(1);
    expect(result.fixSummary.totalFixable).toBe(3);
  });

  it('should distribute effort correctly', () => {
    const issues = [
      makeIssue({
        id: 'fix1',
        severity: 'error',
        fixOptions: [{
          strategy: 'engine_convert',
          label: 'Low',
          description: 'Low effort',
          sqlTemplate: 'SQL',
          isRecommended: true,
          effort: 'low',
          risk: 'low',
          impact: 'OK',
          reversibility: 'reversible',
        }],
      }),
      makeIssue({
        id: 'fix2',
        severity: 'error',
        fixOptions: [{
          strategy: 'type_change',
          label: 'High',
          description: 'High effort',
          sqlTemplate: 'SQL',
          isRecommended: true,
          effort: 'high',
          risk: 'high',
          impact: 'OK',
          reversibility: 'partially_reversible',
        }],
      }),
      makeIssue({
        id: 'fix3',
        severity: 'warning',
        fixQuery: 'ALTER ...',  // fallback → low effort
      }),
    ];
    const result = calculateReadiness(issues);

    expect(result.fixSummary.effortDistribution.low).toBe(2);
    expect(result.fixSummary.effortDistribution.high).toBe(1);
    expect(result.fixSummary.effortDistribution.medium).toBe(0);
  });

  it('should not count info-only issues as manual', () => {
    const issues = [
      makeIssue({ id: 'info1', severity: 'info' }),
    ];
    const result = calculateReadiness(issues);
    expect(result.fixSummary.manualOnly).toBe(0);
  });
});

// ============================================================================
// Preflight Status
// ============================================================================

describe('calculateReadiness - preflightStatus', () => {
  it('should handle no preflight items', () => {
    const result = calculateReadiness([]);
    expect(result.preflightStatus.total).toBe(0);
    expect(result.preflightStatus.allRequiredPassed).toBe(true);
  });

  it('should count passed and skipped as completed', () => {
    const items: PreflightItem[] = [
      makePreflightItem({ id: 'p1', status: 'passed' }),
      makePreflightItem({ id: 'p2', status: 'skipped' }),
      makePreflightItem({ id: 'p3', status: 'pending' }),
    ];
    const result = calculateReadiness([], items);
    expect(result.preflightStatus.completed).toBe(2);
    expect(result.preflightStatus.total).toBe(3);
  });

  it('should track required items separately', () => {
    const items: PreflightItem[] = [
      makePreflightItem({ id: 'r1', required: true, status: 'passed' }),
      makePreflightItem({ id: 'r2', required: true, status: 'pending' }),
      makePreflightItem({ id: 'o1', required: false, status: 'pending' }),
    ];
    const result = calculateReadiness([], items);
    expect(result.preflightStatus.requiredTotal).toBe(2);
    expect(result.preflightStatus.requiredCompleted).toBe(1);
    expect(result.preflightStatus.allRequiredPassed).toBe(false);
  });
});

// ============================================================================
// Priority Issues
// ============================================================================

describe('calculateReadiness - priorityIssues', () => {
  it('should return top 5 sorted by severity', () => {
    const issues = [
      makeIssue({ id: 'w1', severity: 'warning', title: 'Warning 1' }),
      makeIssue({ id: 'e1', severity: 'error', title: 'Error 1' }),
      makeIssue({ id: 'i1', severity: 'info', title: 'Info 1' }),
      makeIssue({ id: 'e2', severity: 'error', title: 'Error 2' }),
      makeIssue({ id: 'w2', severity: 'warning', title: 'Warning 2' }),
      makeIssue({ id: 'e3', severity: 'error', title: 'Error 3' }),
      makeIssue({ id: 'i2', severity: 'info', title: 'Info 2' }),
    ];
    const result = calculateReadiness(issues);

    expect(result.priorityIssues.length).toBe(5);
    // First 3 should be errors
    expect(result.priorityIssues[0].severity).toBe('error');
    expect(result.priorityIssues[1].severity).toBe('error');
    expect(result.priorityIssues[2].severity).toBe('error');
    // Next 2 should be warnings
    expect(result.priorityIssues[3].severity).toBe('warning');
    expect(result.priorityIssues[4].severity).toBe('warning');
  });

  it('should return empty for zero issues', () => {
    const result = calculateReadiness([]);
    expect(result.priorityIssues).toEqual([]);
  });
});

// ============================================================================
// Disclaimer
// ============================================================================

describe('calculateReadiness - disclaimer', () => {
  it('should include heuristic disclaimer', () => {
    const result = calculateReadiness([]);
    expect(result.disclaimer).toContain('휴리스틱');
  });
});

// ============================================================================
// HTML Renderer
// ============================================================================

describe('renderReadinessHTML', () => {
  it('should produce valid HTML structure', () => {
    const result = calculateReadiness([]);
    const html = renderReadinessHTML(result, '2026-02-25');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('</html>');
    expect(html).toContain('MySQL Migration Readiness Report');
    expect(html).toContain('2026-02-25');
  });

  it('should include CSP meta tag', () => {
    const result = calculateReadiness([]);
    const html = renderReadinessHTML(result, '2026-02-25');
    expect(html).toContain('Content-Security-Policy');
  });

  it('should render score and risk level', () => {
    const issues = [
      makeIssue({ severity: 'error' }),
      makeIssue({ id: 'e2', severity: 'error' }),
    ];
    const result = calculateReadiness(issues);
    const html = renderReadinessHTML(result, '2026-02-25');

    expect(html).toContain(`${result.score}`);
    expect(html).toContain('risk-medium');
  });

  it('should render category breakdown table', () => {
    const issues = [
      makeIssue({ category: 'invalidObjects', severity: 'error' }),
    ];
    const result = calculateReadiness(issues);
    const html = renderReadinessHTML(result, '2026-02-25');

    expect(html).toContain('category-table');
    expect(html).toContain('bar-error');
  });

  it('should escape XSS in generated date', () => {
    const result = calculateReadiness([]);
    const html = renderReadinessHTML(result, '<script>alert(1)</script>');

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should handle empty category breakdown', () => {
    const result = calculateReadiness([]);
    const html = renderReadinessHTML(result, '2026-02-25');
    expect(html).toContain('No issues found');
  });

  it('should handle empty priority issues', () => {
    const result = calculateReadiness([]);
    const html = renderReadinessHTML(result, '2026-02-25');
    expect(html).toContain('No issues to resolve');
  });
});

// ============================================================================
// Markdown Renderer
// ============================================================================

describe('renderReadinessMarkdown', () => {
  it('should produce valid markdown', () => {
    const result = calculateReadiness([]);
    const md = renderReadinessMarkdown(result, '2026-02-25');

    expect(md).toContain('# MySQL Migration Readiness Report');
    expect(md).toContain('Generated: 2026-02-25');
    expect(md).toContain('Readiness Score: 100/100');
  });

  it('should include risk level', () => {
    const issues = Array.from({ length: 5 }, (_, i) =>
      makeIssue({ id: `e-${i}`, severity: 'error' })
    );
    const result = calculateReadiness(issues);
    const md = renderReadinessMarkdown(result, '2026-02-25');

    expect(md).toContain('**Risk Level**: HIGH');
  });

  it('should render category table', () => {
    const issues = [
      makeIssue({ category: 'invalidObjects', severity: 'error' }),
      makeIssue({ id: 'w1', category: 'invalidObjects', severity: 'warning' }),
    ];
    const result = calculateReadiness(issues);
    const md = renderReadinessMarkdown(result, '2026-02-25');

    expect(md).toContain('| Category |');
    expect(md).toContain('| Error | Warning | Info | Total |');
  });

  it('should render fix summary', () => {
    const issues = [
      makeIssue({ severity: 'error', fixQuery: 'ALTER ...' }),
      makeIssue({ id: 'e2', severity: 'error' }),
    ];
    const result = calculateReadiness(issues);
    const md = renderReadinessMarkdown(result, '2026-02-25');

    expect(md).toContain('Auto-fixable: 1');
    expect(md).toContain('Manual only: 1');
  });

  it('should render preflight status', () => {
    const items: PreflightItem[] = [
      makePreflightItem({ required: true, status: 'passed' }),
      makePreflightItem({ id: 'p2', required: true, status: 'pending' }),
    ];
    const result = calculateReadiness([], items);
    const md = renderReadinessMarkdown(result, '2026-02-25');

    expect(md).toContain('Required: 1/2');
    expect(md).toContain('All Required Passed: **No**');
  });

  it('should render priority issues', () => {
    const issues = [
      makeIssue({ severity: 'error', title: 'Critical Bug' }),
    ];
    const result = calculateReadiness(issues);
    const md = renderReadinessMarkdown(result, '2026-02-25');

    expect(md).toContain('Top Priority Issues');
    expect(md).toContain('[ERROR]');
    expect(md).toContain('Critical Bug');
  });

  it('should not include priority section for zero issues', () => {
    const result = calculateReadiness([]);
    const md = renderReadinessMarkdown(result, '2026-02-25');
    expect(md).not.toContain('Top Priority Issues');
  });

  it('should escape HTML in issue titles', () => {
    const issues = [
      makeIssue({ severity: 'error', title: '<b>XSS</b>' }),
    ];
    const result = calculateReadiness(issues);
    const md = renderReadinessMarkdown(result, '2026-02-25');

    expect(md).not.toContain('<b>XSS</b>');
    expect(md).toContain('&lt;b&gt;');
  });
});
