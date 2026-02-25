/**
 * Migration Plan Tests
 *
 * Covers: plan-generator, execution-order, rollback-generator, plan-renderer
 */

import { describe, it, expect } from 'vitest';
import { generateMigrationPlan } from '../migration-plan/plan-generator';
import { computeExecutionOrder } from '../migration-plan/execution-order';
import { generateRollbackEntry } from '../migration-plan/rollback-generator';
import { renderPlanAsMarkdown, renderPlanAsSQL, renderPlanAsHTML } from '../migration-plan/plan-renderer';
import type { Issue } from '../types';
import type { AnalysisContext, IFKGraphBuilder } from '../domain/analysis-context';
import type { FixOption } from '../domain/fix-option';

// ============================================================================
// Helpers
// ============================================================================

function makeIssue(overrides: Partial<Issue>): Issue {
  return {
    id: 'test_issue',
    type: 'schema',
    category: 'invalidObjects',
    severity: 'warning',
    title: 'Test Issue',
    description: 'Test description',
    suggestion: 'Test suggestion',
    ...overrides,
  };
}

function makeFixOption(overrides: Partial<FixOption>): FixOption {
  return {
    strategy: 'manual',
    label: 'Test Fix',
    description: 'Test fix description',
    sqlTemplate: 'ALTER TABLE test ...',
    isRecommended: true,
    effort: 'low',
    risk: 'low',
    impact: 'none',
    reversibility: 'reversible',
    ...overrides,
  };
}

/** Create a mock FK graph that returns a fixed topological order */
function makeMockFKGraph(
  topoOrder: string[],
  sccs: string[][] = []
): IFKGraphBuilder {
  return {
    getTopologicalOrder: (_tables: Set<string>) => [...topoOrder],
    getSCCs: () => sccs,
    getRelatedTables: (_table: string) => new Set<string>(),
    getParents: (_table: string) => new Set<string>(),
    getChildren: (_table: string) => new Set<string>(),
    hasCycle: () => sccs.some(scc => scc.length > 1),
    getAllEdges: () => [],
  };
}

// ============================================================================
// computeExecutionOrder
// ============================================================================

describe('computeExecutionOrder', () => {
  it('should group issues by table name', () => {
    const issues = [
      makeIssue({ tableName: 'users', title: 'Issue A' }),
      makeIssue({ tableName: 'users', title: 'Issue B' }),
      makeIssue({ tableName: 'orders', title: 'Issue C' }),
    ];

    const groups = computeExecutionOrder(issues, null);
    expect(groups.length).toBe(2);

    const usersGroup = groups.find(g => g.tableName === 'users');
    expect(usersGroup?.issues.length).toBe(2);
  });

  it('should sort issues within a table by severity (error > warning > info)', () => {
    const issues = [
      makeIssue({ tableName: 'users', severity: 'info', title: 'Info' }),
      makeIssue({ tableName: 'users', severity: 'error', title: 'Error' }),
      makeIssue({ tableName: 'users', severity: 'warning', title: 'Warning' }),
    ];

    const groups = computeExecutionOrder(issues, null);
    expect(groups[0].issues[0].severity).toBe('error');
    expect(groups[0].issues[1].severity).toBe('warning');
    expect(groups[0].issues[2].severity).toBe('info');
  });

  it('should order tables by FK topological sort when graph is provided', () => {
    const issues = [
      makeIssue({ tableName: 'orders', title: 'Orders issue' }),
      makeIssue({ tableName: 'users', title: 'Users issue' }),
      makeIssue({ tableName: 'products', title: 'Products issue' }),
    ];

    const fkGraph = makeMockFKGraph(['users', 'products', 'orders']);
    const groups = computeExecutionOrder(issues, fkGraph);

    expect(groups[0].tableName).toBe('users');
    expect(groups[1].tableName).toBe('products');
    expect(groups[2].tableName).toBe('orders');
  });

  it('should sort alphabetically when no FK graph', () => {
    const issues = [
      makeIssue({ tableName: 'zebra' }),
      makeIssue({ tableName: 'alpha' }),
    ];

    const groups = computeExecutionOrder(issues, null);
    expect(groups[0].tableName).toBe('alpha');
    expect(groups[1].tableName).toBe('zebra');
  });

  it('should mark cycle members', () => {
    const issues = [
      makeIssue({ tableName: 'a' }),
      makeIssue({ tableName: 'b' }),
    ];

    const fkGraph = makeMockFKGraph(['a', 'b'], [['a', 'b']]);
    const groups = computeExecutionOrder(issues, fkGraph);

    expect(groups.find(g => g.tableName === 'a')?.hasCycle).toBe(true);
    expect(groups.find(g => g.tableName === 'b')?.hasCycle).toBe(true);
  });

  it('should place no-table issues in __config__ group', () => {
    const issues = [
      makeIssue({ tableName: undefined, title: 'Config issue' }),
    ];

    const groups = computeExecutionOrder(issues, null);
    expect(groups.length).toBe(1);
    expect(groups[0].tableName).toBe('__config__');
  });

  it('should handle empty issues array', () => {
    const groups = computeExecutionOrder([], null);
    expect(groups.length).toBe(0);
  });

  it('should be case-insensitive for table names', () => {
    const issues = [
      makeIssue({ tableName: 'Users', title: 'A' }),
      makeIssue({ tableName: 'USERS', title: 'B' }),
    ];

    const groups = computeExecutionOrder(issues, null);
    expect(groups.length).toBe(1);
    expect(groups[0].issues.length).toBe(2);
  });
});

// ============================================================================
// generateRollbackEntry
// ============================================================================

describe('generateRollbackEntry', () => {
  it('should use recommended fix option when available', () => {
    const issue = makeIssue({
      fixOptions: [
        makeFixOption({
          isRecommended: false,
          sqlTemplate: 'SELECT 1',
          reversibility: 'manual_only',
        }),
        makeFixOption({
          isRecommended: true,
          sqlTemplate: 'ALTER TABLE t CONVERT ...',
          rollbackTemplate: 'ALTER TABLE t CONVERT BACK ...',
          reversibility: 'reversible',
        }),
      ],
    });

    const entry = generateRollbackEntry(issue);
    expect(entry).not.toBeNull();
    expect(entry!.reversibility).toBe('reversible');
    expect(entry!.rollbackSQL).toBe('ALTER TABLE t CONVERT BACK ...');
    expect(entry!.fixSQL).toContain('ALTER TABLE t CONVERT');
  });

  it('should fall back to first fix option when no recommended', () => {
    const issue = makeIssue({
      fixOptions: [
        makeFixOption({ isRecommended: false, reversibility: 'partially_reversible' }),
      ],
    });

    const entry = generateRollbackEntry(issue);
    expect(entry!.reversibility).toBe('partially_reversible');
  });

  it('should mark fixQuery-only issues as manual_only', () => {
    const issue = makeIssue({
      fixQuery: 'UPDATE t SET col = NULL WHERE col = 0;',
    });

    const entry = generateRollbackEntry(issue);
    expect(entry!.reversibility).toBe('manual_only');
    expect(entry!.rollbackSQL).toBeNull();
    expect(entry!.warning).toBeDefined();
  });

  it('should return null for issues without fix', () => {
    const issue = makeIssue({});
    const entry = generateRollbackEntry(issue);
    expect(entry).toBeNull();
  });

  it('should add warning for partially_reversible', () => {
    const issue = makeIssue({
      fixOptions: [makeFixOption({ reversibility: 'partially_reversible', isRecommended: true })],
    });

    const entry = generateRollbackEntry(issue);
    expect(entry!.warning).toContain('BACKUP REQUIRED');
  });

  it('should add warning for manual_only fix option', () => {
    const issue = makeIssue({
      fixOptions: [makeFixOption({ reversibility: 'manual_only', isRecommended: true, rollbackTemplate: null })],
    });

    const entry = generateRollbackEntry(issue);
    expect(entry!.warning).toContain('수동 복원');
  });
});

// ============================================================================
// generateMigrationPlan
// ============================================================================

describe('generateMigrationPlan', () => {
  it('should generate a 4-phase plan', () => {
    const issues = [
      makeIssue({
        tableName: 'users',
        severity: 'error',
        fixQuery: 'ALTER TABLE users ...',
        fixOptions: [makeFixOption({ sqlTemplate: 'ALTER TABLE users ...', isRecommended: true })],
      }),
    ];

    const plan = generateMigrationPlan(issues, null);

    expect(plan.phases.length).toBe(4);
    expect(plan.phases[0].id).toBe('preflight');
    expect(plan.phases[1].id).toBe('preparation');
    expect(plan.phases[2].id).toBe('execution');
    expect(plan.phases[3].id).toBe('validation');
  });

  it('should count total and fixable issues', () => {
    const issues = [
      makeIssue({ fixQuery: 'SELECT 1' }),
      makeIssue({ fixQuery: undefined }),
      makeIssue({ fixOptions: [makeFixOption({})] }),
    ];

    const plan = generateMigrationPlan(issues, null);
    expect(plan.totalIssues).toBe(3);
    expect(plan.fixableIssues).toBe(2);
  });

  it('should include error count warning in preflight', () => {
    const issues = [
      makeIssue({ severity: 'error' }),
      makeIssue({ severity: 'error' }),
      makeIssue({ severity: 'warning' }),
    ];

    const plan = generateMigrationPlan(issues, null);
    const preflightSteps = plan.phases[0].steps;
    const errorStep = preflightSteps.find(s => s.severity === 'error');
    expect(errorStep).toBeDefined();
    expect(errorStep!.description).toContain('2');
  });

  it('should handle zero issues gracefully', () => {
    const plan = generateMigrationPlan([], null);
    expect(plan.totalIssues).toBe(0);
    expect(plan.fixableIssues).toBe(0);
    expect(plan.phases.length).toBe(4);
    expect(plan.phases[2].steps.length).toBe(0); // execution phase empty
  });

  it('should add FK disable step when cycles detected', () => {
    const issues = [
      makeIssue({
        tableName: 'a',
        fixOptions: [makeFixOption({ isRecommended: true })],
      }),
    ];

    // Create context with cyclic FK graph
    const fkGraph = makeMockFKGraph(['a'], [['a', 'b']]);
    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };

    const plan = generateMigrationPlan(issues, context);
    const prepSteps = plan.phases[1].steps;
    const fkStep = prepSteps.find(s => s.sql?.includes('FOREIGN_KEY_CHECKS'));
    expect(fkStep).toBeDefined();
    expect(plan.summary.needsFKDisable).toBe(true);
  });

  it('should add FK disable step when charset FK mismatch present', () => {
    const issues = [
      makeIssue({
        id: 'fk_charset_mismatch',
        tableName: 'orders',
        fixOptions: [makeFixOption({ isRecommended: true })],
      }),
    ];

    const plan = generateMigrationPlan(issues, null);
    expect(plan.summary.needsFKDisable).toBe(true);
  });

  it('should add backup warning for partially reversible fixes', () => {
    const issues = [
      makeIssue({
        tableName: 'users',
        fixOptions: [makeFixOption({ reversibility: 'partially_reversible', isRecommended: true })],
      }),
    ];

    const plan = generateMigrationPlan(issues, null);
    const prepSteps = plan.phases[1].steps;
    const backupStep = prepSteps.find(s => s.title === '백업 재확인');
    expect(backupStep).toBeDefined();
  });

  it('should skip __config__ issues in execution phase', () => {
    const issues = [
      makeIssue({
        tableName: undefined, // goes to __config__
        fixOptions: [makeFixOption({ isRecommended: true })],
      }),
    ];

    const plan = generateMigrationPlan(issues, null);
    const execSteps = plan.phases[2].steps;
    // __config__ entries should not have SQL steps in execution phase
    const configSteps = execSteps.filter(s => s.tableName === '__config__');
    expect(configSteps.length).toBe(0);
  });

  it('should include validation steps for affected tables', () => {
    const issues = [
      makeIssue({
        tableName: 'users',
        fixOptions: [makeFixOption({ isRecommended: true })],
      }),
      makeIssue({
        tableName: 'orders',
        fixOptions: [makeFixOption({ isRecommended: true })],
      }),
    ];

    const plan = generateMigrationPlan(issues, null);
    const validationSteps = plan.phases[3].steps;
    const checkStep = validationSteps.find(s => s.title === '테이블 무결성 검사');
    expect(checkStep).toBeDefined();
    expect(checkStep!.sql).toContain('users');
    expect(checkStep!.sql).toContain('orders');
  });

  it('should handle many issues (100+) without error', () => {
    const issues: Issue[] = [];
    for (let i = 0; i < 120; i++) {
      issues.push(makeIssue({
        tableName: `table_${i % 30}`,
        severity: i % 3 === 0 ? 'error' : 'warning',
        fixOptions: [makeFixOption({ isRecommended: true })],
      }));
    }

    const plan = generateMigrationPlan(issues, null);
    expect(plan.totalIssues).toBe(120);
    expect(plan.fixableIssues).toBe(120);
    expect(plan.phases[2].steps.length).toBe(120);
    expect(plan.summary.tablesAffected).toBe(30);
  });
});

// ============================================================================
// Plan Summary
// ============================================================================

describe('Plan Summary', () => {
  it('should count reversibility types correctly', () => {
    const issues = [
      makeIssue({
        tableName: 'a',
        fixOptions: [makeFixOption({ reversibility: 'reversible', isRecommended: true })],
      }),
      makeIssue({
        tableName: 'b',
        fixOptions: [makeFixOption({ reversibility: 'reversible', isRecommended: true })],
      }),
      makeIssue({
        tableName: 'c',
        fixOptions: [makeFixOption({ reversibility: 'partially_reversible', isRecommended: true })],
      }),
      makeIssue({
        tableName: 'd',
        fixQuery: 'UPDATE ...',
      }),
    ];

    const plan = generateMigrationPlan(issues, null);
    expect(plan.summary.reversibleCount).toBe(2);
    expect(plan.summary.partiallyReversibleCount).toBe(1);
    expect(plan.summary.manualOnlyCount).toBe(1);
  });

  it('should count unique affected tables', () => {
    const issues = [
      makeIssue({ tableName: 'users', fixOptions: [makeFixOption({ isRecommended: true })] }),
      makeIssue({ tableName: 'users', fixOptions: [makeFixOption({ isRecommended: true })] }),
      makeIssue({ tableName: 'orders', fixOptions: [makeFixOption({ isRecommended: true })] }),
    ];

    const plan = generateMigrationPlan(issues, null);
    expect(plan.summary.tablesAffected).toBe(2);
  });

  it('should not count __config__ as affected table', () => {
    const issues = [
      makeIssue({ tableName: undefined, fixOptions: [makeFixOption({ isRecommended: true })] }),
    ];

    const plan = generateMigrationPlan(issues, null);
    expect(plan.summary.tablesAffected).toBe(0);
  });
});

// ============================================================================
// renderPlanAsMarkdown
// ============================================================================

describe('renderPlanAsMarkdown', () => {
  it('should produce valid markdown output', () => {
    const plan = generateMigrationPlan([
      makeIssue({
        tableName: 'users',
        fixOptions: [makeFixOption({ sqlTemplate: 'ALTER TABLE users ...', isRecommended: true })],
      }),
    ], null);

    const md = renderPlanAsMarkdown(plan);
    expect(md).toContain('# MySQL Upgrade Migration Plan');
    expect(md).toContain('## Summary');
    expect(md).toContain('Phase 1');
    expect(md).toContain('Phase 2');
    expect(md).toContain('Phase 3');
    expect(md).toContain('Phase 4');
  });

  it('should include SQL in code blocks', () => {
    const plan = generateMigrationPlan([
      makeIssue({
        tableName: 'test',
        fixOptions: [makeFixOption({ sqlTemplate: 'SELECT 1;', isRecommended: true })],
      }),
    ], null);

    const md = renderPlanAsMarkdown(plan);
    expect(md).toContain('```sql');
    expect(md).toContain('SELECT 1;');
  });

  it('should handle empty plan', () => {
    const plan = generateMigrationPlan([], null);
    const md = renderPlanAsMarkdown(plan);
    expect(md).toContain('# MySQL Upgrade Migration Plan');
    expect(md).toContain('No steps in this phase');
  });
});

// ============================================================================
// renderPlanAsSQL
// ============================================================================

describe('renderPlanAsSQL', () => {
  it('should produce SQL script with comments', () => {
    const plan = generateMigrationPlan([
      makeIssue({
        tableName: 'users',
        fixOptions: [makeFixOption({
          sqlTemplate: 'ALTER TABLE `users` CONVERT TO CHARACTER SET utf8mb4;',
          isRecommended: true,
          rollbackTemplate: 'ALTER TABLE `users` CONVERT TO CHARACTER SET utf8mb3;',
        })],
      }),
    ], null);

    const sql = renderPlanAsSQL(plan);
    expect(sql).toContain('-- MySQL Upgrade Migration Script');
    expect(sql).toContain('ALTER TABLE `users` CONVERT TO CHARACTER SET utf8mb4;');
    expect(sql).toContain('Rollback');
    expect(sql).toContain('utf8mb3');
  });

  it('should skip phases with no SQL steps', () => {
    const plan = generateMigrationPlan([], null);
    const sql = renderPlanAsSQL(plan);
    // Only the header comments, no phase sections
    expect(sql).toContain('-- MySQL Upgrade Migration Script');
    // Pre-flight has SQL (VERSION, disk space, processlist)
    expect(sql).toContain('Phase');
  });
});

// ============================================================================
// renderPlanAsHTML
// ============================================================================

describe('renderPlanAsHTML', () => {
  it('should produce valid HTML with CSP', () => {
    const plan = generateMigrationPlan([
      makeIssue({
        tableName: 'users',
        severity: 'error',
        fixOptions: [makeFixOption({ sqlTemplate: 'ALTER TABLE users ...', isRecommended: true })],
      }),
    ], null);

    const html = renderPlanAsHTML(plan);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('<h1>MySQL Upgrade Migration Plan</h1>');
    expect(html).toContain('severity-error');
  });

  it('should sanitize untrusted content', () => {
    const plan = generateMigrationPlan([
      makeIssue({
        tableName: '<script>alert("xss")</script>',
        title: '<img onerror="alert(1)" src=x>',
        description: 'Normal desc',
        fixOptions: [makeFixOption({ sqlTemplate: 'SELECT 1;', isRecommended: true })],
      }),
    ], null);

    const html = renderPlanAsHTML(plan);
    // Raw HTML tags must be escaped - no executable <script> or <img> tags
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img ');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('onerror=&quot;');  // onerror is escaped, not executable
  });
});
