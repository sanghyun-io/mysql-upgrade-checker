/**
 * Migration Plan Generator
 *
 * Generates a 4-phase migration execution plan from analysis results.
 * Phases: Pre-flight → Preparation → Execution → Validation
 */

import type { Issue } from '../types';
import type { AnalysisContext } from '../domain/analysis-context';
import type { Reversibility } from '../domain/issue-taxonomy';
import { computeExecutionOrder } from './execution-order';
import { generateRollbackEntry } from './rollback-generator';
import type { RollbackEntry } from './rollback-generator';
import type { OrderedFixGroup } from './execution-order';

// ============================================================================
// Plan Data Types
// ============================================================================

export interface MigrationPlan {
  generatedAt: string;
  totalIssues: number;
  fixableIssues: number;
  phases: MigrationPhase[];
  summary: PlanSummary;
}

export interface MigrationPhase {
  id: 'preflight' | 'preparation' | 'execution' | 'validation';
  title: string;
  description: string;
  steps: PlanStep[];
}

export interface PlanStep {
  order: number;
  title: string;
  description: string;
  type: 'check' | 'query' | 'action' | 'info';
  sql?: string;
  rollback?: RollbackEntry;
  tableName?: string;
  severity?: 'error' | 'warning' | 'info';
  required: boolean;
}

export interface PlanSummary {
  reversibleCount: number;
  partiallyReversibleCount: number;
  manualOnlyCount: number;
  tablesAffected: number;
  hasCyclicDependencies: boolean;
  needsFKDisable: boolean;
}

// ============================================================================
// Generator
// ============================================================================

/**
 * Generate a 4-phase migration plan from analysis context.
 */
export function generateMigrationPlan(
  issues: Issue[],
  context: AnalysisContext | null
): MigrationPlan {
  const fixableIssues = issues.filter(i => i.fixQuery || (i.fixOptions && i.fixOptions.length > 0));
  const fkGraph = context?.fkGraph ?? null;
  const orderedGroups = computeExecutionOrder(fixableIssues, fkGraph);

  // Compute summary stats
  const summary = computeSummary(fixableIssues, orderedGroups);

  return {
    generatedAt: new Date().toISOString(),
    totalIssues: issues.length,
    fixableIssues: fixableIssues.length,
    phases: [
      generatePreflightPhase(issues),
      generatePreparationPhase(orderedGroups, summary),
      generateExecutionPhase(orderedGroups),
      generateValidationPhase(orderedGroups),
    ],
    summary,
  };
}

// ============================================================================
// Phase Generators
// ============================================================================

function generatePreflightPhase(issues: Issue[]): MigrationPhase {
  const steps: PlanStep[] = [
    {
      order: 1,
      title: '데이터베이스 백업 확인',
      description: '마이그레이션 전 전체 데이터베이스 백업이 완료되었는지 확인합니다.',
      type: 'check',
      required: true,
    },
    {
      order: 2,
      title: 'MySQL 버전 확인',
      description: '현재 MySQL 서버 버전을 확인합니다.',
      type: 'query',
      sql: 'SELECT VERSION();',
      required: true,
    },
    {
      order: 3,
      title: '디스크 공간 확인',
      description: '스키마별 데이터 크기를 확인하여 ALTER TABLE에 필요한 여유 공간을 파악합니다.',
      type: 'query',
      sql: [
        'SELECT table_schema,',
        '  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb',
        'FROM information_schema.tables',
        'GROUP BY table_schema',
        'ORDER BY size_mb DESC;',
      ].join('\n'),
      required: false,
    },
    {
      order: 4,
      title: '활성 연결 확인',
      description: '현재 활성 연결 수를 확인합니다. 마이그레이션 시 연결을 최소화하세요.',
      type: 'query',
      sql: 'SHOW PROCESSLIST;',
      required: false,
    },
  ];

  if (issues.some(i => i.severity === 'error')) {
    steps.push({
      order: 5,
      title: '심각한 이슈 인지',
      description: `${issues.filter(i => i.severity === 'error').length}개의 Error 수준 이슈가 발견되었습니다. 마이그레이션 전 모두 해결해야 합니다.`,
      type: 'info',
      severity: 'error',
      required: true,
    });
  }

  return {
    id: 'preflight',
    title: 'Phase 1: Pre-flight 검사',
    description: '마이그레이션 실행 전 필수 사전 검사 항목입니다.',
    steps,
  };
}

function generatePreparationPhase(
  groups: OrderedFixGroup[],
  summary: PlanSummary
): MigrationPhase {
  const steps: PlanStep[] = [];
  let order = 1;

  // Config file changes
  const configIssues = groups.find(g => g.tableName === '__config__');
  if (configIssues) {
    steps.push({
      order: order++,
      title: '설정 파일 변경',
      description: `my.cnf에서 제거된 시스템 변수 ${configIssues.issues.length}개를 제거/수정합니다.`,
      type: 'action',
      required: true,
    });
  }

  // FK disable if needed
  if (summary.needsFKDisable) {
    steps.push({
      order: order++,
      title: 'FK 체크 비활성화',
      description: 'FK 순환 참조 또는 charset 불일치로 인해 FK 체크를 비활성화합니다.',
      type: 'query',
      sql: 'SET FOREIGN_KEY_CHECKS = 0;',
      required: true,
    });
  }

  // Backup reminder
  if (summary.partiallyReversibleCount > 0 || summary.manualOnlyCount > 0) {
    steps.push({
      order: order++,
      title: '백업 재확인',
      description: `${summary.partiallyReversibleCount + summary.manualOnlyCount}개의 변경이 완전한 롤백을 지원하지 않습니다. 반드시 백업을 확인하세요.`,
      type: 'check',
      severity: 'warning',
      required: true,
    });
  }

  return {
    id: 'preparation',
    title: 'Phase 2: 준비',
    description: '설정 변경, FK 비활성화 등 실행 전 준비 단계입니다.',
    steps,
  };
}

function generateExecutionPhase(groups: OrderedFixGroup[]): MigrationPhase {
  const steps: PlanStep[] = [];
  let order = 1;

  for (const group of groups) {
    if (group.tableName === '__config__') continue;

    for (const issue of group.issues) {
      const rollback = generateRollbackEntry(issue);
      const recommendedOption = issue.fixOptions?.find(o => o.isRecommended);
      // Issue #7 fix: fallback to first option with SQL when recommended has none
      const fixOption = recommendedOption?.sqlTemplate
        ? recommendedOption
        : issue.fixOptions?.find(o => o.sqlTemplate) ?? recommendedOption ?? issue.fixOptions?.[0];
      const sql = fixOption?.sqlTemplate ?? issue.fixQuery;

      if (!sql) continue;

      steps.push({
        order: order++,
        title: `${group.tableName}: ${issue.title}`,
        description: issue.description,
        type: 'query',
        sql,
        rollback: rollback ?? undefined,
        tableName: group.tableName,
        severity: issue.severity,
        required: issue.severity === 'error',
      });
    }
  }

  return {
    id: 'execution',
    title: 'Phase 3: 실행',
    description: 'FK 의존성 순서에 따라 수정 SQL을 실행합니다.',
    steps,
  };
}

function generateValidationPhase(groups: OrderedFixGroup[]): MigrationPhase {
  const steps: PlanStep[] = [];
  let order = 1;

  // Collect unique table names
  const tables = groups
    .filter(g => g.tableName !== '__config__')
    .map(g => g.tableName);

  if (tables.length > 0) {
    // CHECK TABLE for all affected tables
    const checkSQL = tables.map(t => `CHECK TABLE \`${t}\` EXTENDED;`).join('\n');
    steps.push({
      order: order++,
      title: '테이블 무결성 검사',
      description: `수정된 ${tables.length}개 테이블의 무결성을 검사합니다.`,
      type: 'query',
      sql: checkSQL,
      required: true,
    });

    // FK re-enable
    steps.push({
      order: order++,
      title: 'FK 체크 재활성화',
      description: 'FK 체크를 다시 활성화합니다.',
      type: 'query',
      sql: 'SET FOREIGN_KEY_CHECKS = 1;',
      required: true,
    });
  }

  // Version re-check
  steps.push({
    order: order++,
    title: '업그레이드 호환성 재검증',
    description: '모든 수정이 적용된 후 MySQL Shell util.checkForServerUpgrade()를 다시 실행하여 검증합니다.',
    type: 'action',
    required: false,
  });

  // Application connection test
  steps.push({
    order: order++,
    title: '애플리케이션 연결 테스트',
    description: '애플리케이션이 수정된 데이터베이스에 정상 연결되는지 확인합니다.',
    type: 'check',
    required: false,
  });

  return {
    id: 'validation',
    title: 'Phase 4: 검증',
    description: '수정 후 무결성 검사 및 애플리케이션 테스트 단계입니다.',
    steps,
  };
}

// ============================================================================
// Helper
// ============================================================================

function computeSummary(issues: Issue[], groups: OrderedFixGroup[]): PlanSummary {
  const reversibilityCounts: Record<Reversibility, number> = {
    reversible: 0,
    partially_reversible: 0,
    manual_only: 0,
  };

  for (const issue of issues) {
    const fixOption = issue.fixOptions?.find(o => o.isRecommended) ?? issue.fixOptions?.[0];
    if (fixOption) {
      reversibilityCounts[fixOption.reversibility]++;
    } else if (issue.fixQuery) {
      reversibilityCounts.manual_only++;
    }
  }

  const hasCycles = groups.some(g => g.hasCycle);
  const hasCharsetFK = issues.some(i => i.id === 'fk_charset_mismatch');

  const uniqueTables = new Set(
    groups.filter(g => g.tableName !== '__config__').map(g => g.tableName)
  );

  return {
    reversibleCount: reversibilityCounts.reversible,
    partiallyReversibleCount: reversibilityCounts.partially_reversible,
    manualOnlyCount: reversibilityCounts.manual_only,
    tablesAffected: uniqueTables.size,
    hasCyclicDependencies: hasCycles,
    needsFKDisable: hasCycles || hasCharsetFK,
  };
}
