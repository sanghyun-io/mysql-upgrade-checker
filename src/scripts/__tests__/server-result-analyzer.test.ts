/**
 * Server Result Analyzer & Pre-flight Tests
 *
 * Covers: server-result-analyzer.ts, preflight.ts
 * Including malformed/truncated input robustness (Review #10)
 */

import { describe, it, expect } from 'vitest';
import { analyzeServerResult, parseVersion } from '../analysis/server-result-analyzer';
import { createPreflightChecklist, getPreflightSummary, type PreflightItem } from '../analysis/preflight';

// ============================================================================
// parseVersion
// ============================================================================

describe('parseVersion', () => {
  it('should parse standard version string', () => {
    const v = parseVersion('8.0.35');
    expect(v).toEqual({ major: 8, minor: 0, patch: 35 });
  });

  it('should parse version with suffix', () => {
    const v = parseVersion('8.0.35-0ubuntu0.20.04.1');
    expect(v).toEqual({ major: 8, minor: 0, patch: 35 });
  });

  it('should parse commercial version', () => {
    const v = parseVersion('8.4.0-commercial');
    expect(v).toEqual({ major: 8, minor: 4, patch: 0 });
  });

  it('should return null for invalid version', () => {
    expect(parseVersion('invalid')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

// ============================================================================
// analyzeServerResult - Version
// ============================================================================

describe('analyzeServerResult - VERSION', () => {
  it('should detect MySQL 8.0.x as compatible', () => {
    const tsv = 'VERSION()\n8.0.35';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_compatible')).toBe(true);
  });

  it('should detect MySQL < 8.0 as too old', () => {
    const tsv = 'VERSION()\n5.7.44';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_too_old')).toBe(true);
    expect(issues.find(i => i.id === 'server_version_too_old')?.severity).toBe('error');
  });

  it('should detect MySQL 8.4+ as already target', () => {
    const tsv = 'VERSION()\n8.4.0';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_already_target')).toBe(true);
  });

  it('should warn for old patch version (< 8.0.25)', () => {
    const tsv = 'VERSION()\n8.0.12';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_old_patch')).toBe(true);
  });

  it('should not warn for newer patch (>= 8.0.25)', () => {
    const tsv = 'VERSION()\n8.0.35';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_old_patch')).toBe(false);
  });

  it('should handle version with suffix', () => {
    const tsv = 'VERSION()\n8.0.35-0ubuntu0.20.04.1';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_compatible')).toBe(true);
  });
});

// ============================================================================
// analyzeServerResult - Variables
// ============================================================================

describe('analyzeServerResult - VARIABLES', () => {
  it('should detect removed system variables', () => {
    const tsv = 'VARIABLE_NAME\tVARIABLE_VALUE\navoid_temporal_upgrade\tOFF\ninnodb_buffer_pool_size\t134217728';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_removed_variable' && i.variableName === 'avoid_temporal_upgrade')).toBe(true);
  });

  it('should not flag valid variables', () => {
    const tsv = 'VARIABLE_NAME\tVARIABLE_VALUE\ninnodb_buffer_pool_size\t134217728';
    const issues = analyzeServerResult(tsv);
    expect(issues.length).toBe(0);
  });

  it('should detect deprecated sql_mode values', () => {
    const tsv = 'VARIABLE_NAME\tVARIABLE_VALUE\nsql_mode\tSTRICT_TRANS_TABLES,NO_AUTO_CREATE_USER';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_deprecated_sql_mode')).toBe(true);
  });

  it('should handle multiple removed variables', () => {
    const tsv = 'VARIABLE_NAME\tVARIABLE_VALUE\navoid_temporal_upgrade\tOFF\nexpire_logs_days\t0\ninnodb_api_bk_commit_interval\t5';
    const issues = analyzeServerResult(tsv);
    const removedIssues = issues.filter(i => i.id === 'server_removed_variable');
    expect(removedIssues.length).toBe(3);
  });
});

// ============================================================================
// analyzeServerResult - Grants
// ============================================================================

describe('analyzeServerResult - GRANTS', () => {
  it('should detect SUPER privilege', () => {
    const tsv = 'Grants for root@localhost\nGRANT ALL PRIVILEGES, SUPER ON *.* TO `root`@`localhost`';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_super_privilege')).toBe(true);
  });

  it('should detect FILE privilege', () => {
    const tsv = 'Grants for user@localhost\nGRANT FILE ON *.* TO `user`@`localhost`';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_file_privilege')).toBe(true);
  });

  it('should not flag normal grants', () => {
    const tsv = 'Grants for user@localhost\nGRANT SELECT, INSERT ON `mydb`.* TO `user`@`localhost`';
    const issues = analyzeServerResult(tsv);
    expect(issues.length).toBe(0);
  });
});

// ============================================================================
// analyzeServerResult - Processlist
// ============================================================================

describe('analyzeServerResult - PROCESSLIST', () => {
  it('should detect long-running queries', () => {
    const tsv = 'Id\tUser\tHost\tCommand\tTime\tState\tInfo\n1\troot\tlocalhost\tQuery\t600\trunning\tSELECT ...';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_long_running_queries')).toBe(true);
  });

  it('should ignore Sleep connections for long-running check', () => {
    const tsv = 'Id\tUser\tHost\tCommand\tTime\tState\tInfo\n1\troot\tlocalhost\tSleep\t999\tNULL\tNULL';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_long_running_queries')).toBe(false);
  });
});

// ============================================================================
// analyzeServerResult - Table Size
// ============================================================================

describe('analyzeServerResult - TABLE SIZE', () => {
  it('should detect large schemas', () => {
    const tsv = 'table_schema\tsize_mb\nmydb\t2048\nsmalldb\t50';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_large_schemas')).toBe(true);
  });

  it('should not flag small schemas', () => {
    const tsv = 'table_schema\tsize_mb\nmydb\t500\nsmalldb\t50';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_large_schemas')).toBe(false);
  });
});

// ============================================================================
// Robustness Tests (Review #10)
// ============================================================================

describe('analyzeServerResult - robustness', () => {
  it('should handle empty input', () => {
    expect(analyzeServerResult('')).toEqual([]);
    expect(analyzeServerResult('  ')).toEqual([]);
  });

  it('should handle null-like input', () => {
    expect(analyzeServerResult(undefined as unknown as string)).toEqual([]);
  });

  it('should handle malformed TSV (mismatched columns)', () => {
    const tsv = 'col1\tcol2\tcol3\nval1\tval2'; // missing col3
    const issues = analyzeServerResult(tsv);
    // Should not crash - either empty or parse error
    expect(Array.isArray(issues)).toBe(true);
  });

  it('should handle truncated JSON', () => {
    const truncated = '[{"User":"root","Host":"local';
    const issues = analyzeServerResult(truncated);
    // Should fall back to TSV parsing gracefully
    expect(Array.isArray(issues)).toBe(true);
  });

  it('should handle completely invalid input', () => {
    const issues = analyzeServerResult('!@#$%^&*()');
    expect(Array.isArray(issues)).toBe(true);
  });

  it('should handle header-only TSV (no data rows)', () => {
    const tsv = 'col1\tcol2\tcol3';
    const issues = analyzeServerResult(tsv);
    expect(issues).toEqual([]);
  });

  it('should handle single column TSV', () => {
    const tsv = 'value\n42';
    const issues = analyzeServerResult(tsv);
    expect(Array.isArray(issues)).toBe(true);
  });

  it('should handle TSV with extra empty lines', () => {
    const tsv = '\n\nVERSION()\n8.0.35\n\n\n';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_compatible')).toBe(true);
  });

  it('should handle JSON with unexpected structure', () => {
    const json = '{"unexpected": "structure", "no_columns": true}';
    const issues = analyzeServerResult(json);
    // Should not crash
    expect(Array.isArray(issues)).toBe(true);
  });

  it('should handle very large input without crashing', () => {
    // 10000 rows of variable data
    let tsv = 'VARIABLE_NAME\tVARIABLE_VALUE\n';
    for (let i = 0; i < 10000; i++) {
      tsv += `var_${i}\tvalue_${i}\n`;
    }
    const issues = analyzeServerResult(tsv);
    expect(Array.isArray(issues)).toBe(true);
  });
});

// ============================================================================
// Pre-flight Checklist
// ============================================================================

describe('createPreflightChecklist', () => {
  it('should create checklist with all items', () => {
    const items = createPreflightChecklist();
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every(i => i.status === 'pending')).toBe(true);
  });

  it('should have required backup and version checks', () => {
    const items = createPreflightChecklist();
    const backup = items.find(i => i.id === 'backup_check');
    const version = items.find(i => i.id === 'version_check');
    expect(backup?.required).toBe(true);
    expect(version?.required).toBe(true);
    expect(backup?.query).toBeNull(); // Manual check
    expect(version?.query).toBeDefined();
  });

  it('should have recommended checks with queries', () => {
    const items = createPreflightChecklist();
    const disk = items.find(i => i.id === 'disk_space_check');
    expect(disk?.required).toBe(false);
    expect(disk?.query).toContain('information_schema');
  });
});

describe('getPreflightSummary', () => {
  it('should count completed items correctly', () => {
    const items: PreflightItem[] = [
      { id: 'a', title: '', description: '', required: true, query: null, status: 'passed' },
      { id: 'b', title: '', description: '', required: true, query: null, status: 'pending' },
      { id: 'c', title: '', description: '', required: false, query: null, status: 'passed' },
    ];

    const summary = getPreflightSummary(items);
    expect(summary.total).toBe(3);
    expect(summary.completed).toBe(2);
    expect(summary.required).toBe(2);
    expect(summary.requiredCompleted).toBe(1);
    expect(summary.allRequiredPassed).toBe(false);
  });

  it('should report all required passed when all required are done', () => {
    const items: PreflightItem[] = [
      { id: 'a', title: '', description: '', required: true, query: null, status: 'passed' },
      { id: 'b', title: '', description: '', required: true, query: null, status: 'passed' },
      { id: 'c', title: '', description: '', required: false, query: null, status: 'pending' },
    ];

    const summary = getPreflightSummary(items);
    expect(summary.allRequiredPassed).toBe(true);
  });

  it('should count skipped items as completed', () => {
    const items: PreflightItem[] = [
      { id: 'a', title: '', description: '', required: true, query: null, status: 'skipped' },
      { id: 'b', title: '', description: '', required: false, query: null, status: 'skipped' },
    ];

    const summary = getPreflightSummary(items);
    expect(summary.completed).toBe(2);
    expect(summary.allRequiredPassed).toBe(true);
  });

  it('should handle empty checklist', () => {
    const summary = getPreflightSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.completed).toBe(0);
    expect(summary.allRequiredPassed).toBe(true);
  });
});
