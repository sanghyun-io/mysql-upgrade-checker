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
    expect(analyzeServerResult('')).toEqual([{
      id: 'server_empty_result',
      type: 'config',
      category: 'invalidObjects',
      severity: 'warning',
      title: '서버 쿼리 결과가 비어있음',
      description: '업로드한 파일에 분석 가능한 데이터가 없습니다. 서버 쿼리를 다시 실행해 주세요.',
      suggestion: 'Server Query 탭의 쿼리를 실행한 결과를 복사하여 붙여넣기 해주세요.',
    }]);
    expect(analyzeServerResult('  ')).toEqual([{
      id: 'server_empty_result',
      type: 'config',
      category: 'invalidObjects',
      severity: 'warning',
      title: '서버 쿼리 결과가 비어있음',
      description: '업로드한 파일에 분석 가능한 데이터가 없습니다. 서버 쿼리를 다시 실행해 주세요.',
      suggestion: 'Server Query 탭의 쿼리를 실행한 결과를 복사하여 붙여넣기 해주세요.',
    }]);
  });

  it('should handle null-like input', () => {
    const result = analyzeServerResult(undefined as unknown as string);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('server_empty_result');
  });

  it('should handle malformed TSV (mismatched columns)', () => {
    const tsv = 'col1\tcol2\tcol3\nval1\tval2'; // missing col3
    const issues = analyzeServerResult(tsv);
    // Should not crash and should return structured result
    expect(Array.isArray(issues)).toBe(true);
    // If any issues returned, they should be properly structured
    for (const issue of issues) {
      expect(issue).toHaveProperty('id');
      expect(issue).toHaveProperty('severity');
    }
  });

  it('should handle truncated JSON', () => {
    const truncated = '[{"User":"root","Host":"local';
    const issues = analyzeServerResult(truncated);
    // Should fall back to TSV parsing gracefully with structured issues
    expect(Array.isArray(issues)).toBe(true);
    for (const issue of issues) {
      expect(issue).toHaveProperty('id');
      expect(issue).toHaveProperty('severity');
    }
  });

  it('should handle completely invalid input', () => {
    const issues = analyzeServerResult('!@#$%^&*()');
    expect(Array.isArray(issues)).toBe(true);
    // Should not produce parse error for arbitrary non-data strings
    for (const issue of issues) {
      expect(issue).toHaveProperty('id');
      expect(issue).toHaveProperty('severity');
    }
  });

  it('should handle header-only TSV (no data rows)', () => {
    const tsv = 'col1\tcol2\tcol3';
    const issues = analyzeServerResult(tsv);
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('server_no_data');
    expect(issues[0].severity).toBe('warning');
  });

  it('should handle single column TSV', () => {
    const tsv = 'value\n42';
    const issues = analyzeServerResult(tsv);
    expect(Array.isArray(issues)).toBe(true);
    for (const issue of issues) {
      expect(issue).toHaveProperty('id');
      expect(issue).toHaveProperty('severity');
    }
  });

  it('should handle TSV with extra empty lines', () => {
    const tsv = '\n\nVERSION()\n8.0.35\n\n\n';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_compatible')).toBe(true);
  });

  it('should handle JSON with unexpected structure', () => {
    const json = '{"unexpected": "structure", "no_columns": true}';
    const issues = analyzeServerResult(json);
    // Should not crash and produce structured issues
    expect(Array.isArray(issues)).toBe(true);
    for (const issue of issues) {
      expect(issue).toHaveProperty('id');
      expect(issue).toHaveProperty('severity');
    }
  });

  it('should handle very large input without crashing', () => {
    // 10000 rows of variable data
    let tsv = 'VARIABLE_NAME\tVARIABLE_VALUE\n';
    for (let i = 0; i < 10000; i++) {
      tsv += `var_${i}\tvalue_${i}\n`;
    }
    const issues = analyzeServerResult(tsv);
    expect(Array.isArray(issues)).toBe(true);
    for (const issue of issues) {
      expect(issue).toHaveProperty('id');
      expect(issue).toHaveProperty('severity');
    }
  });

  it('empty string should return server_empty_result issue', () => {
    const issues = analyzeServerResult('');
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('server_empty_result');
    expect(issues[0].severity).toBe('warning');
  });

  it('whitespace-only string should return server_empty_result issue', () => {
    const issues = analyzeServerResult('   \n\t  ');
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('server_empty_result');
    expect(issues[0].severity).toBe('warning');
  });

  it('valid headers but no data rows should return server_no_data issue', () => {
    const tsv = 'VARIABLE_NAME\tVARIABLE_VALUE';
    const issues = analyzeServerResult(tsv);
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('server_no_data');
    expect(issues[0].severity).toBe('warning');
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

  it('should count skipped items in completed tally but not satisfy allRequiredPassed for required items', () => {
    const items: PreflightItem[] = [
      { id: 'a', title: '', description: '', required: true, query: null, status: 'skipped' },
      { id: 'b', title: '', description: '', required: false, query: null, status: 'skipped' },
    ];

    const summary = getPreflightSummary(items);
    // Both items count toward 'completed' for UX progress display
    expect(summary.completed).toBe(2);
    // A required item with status 'skipped' does NOT satisfy the safety gate
    expect(summary.allRequiredPassed).toBe(false);
  });

  it('should handle empty checklist', () => {
    const summary = getPreflightSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.completed).toBe(0);
    expect(summary.allRequiredPassed).toBe(true);
  });
});

// ============================================================================
// Case-insensitive row key handling
// ============================================================================

describe('case-insensitive row key handling', () => {
  it('should handle UPPERCASE column names in SHOW VARIABLES result', () => {
    const tsv = 'VARIABLE_NAME\tVARIABLE_VALUE\ninnodb_stats_persistent\tON';
    const issues = analyzeServerResult(tsv);
    // Should parse without error (innodb_stats_persistent is not removed, so no error issue)
    expect(issues.every(i => i.id !== 'server_result_parse_error')).toBe(true);
  });

  it('should handle lowercase column names in SHOW VARIABLES result', () => {
    const tsv = 'variable_name\tvariable_value\ninnodb_stats_persistent\tON';
    const issues = analyzeServerResult(tsv);
    expect(issues.every(i => i.id !== 'server_result_parse_error')).toBe(true);
  });

  it('should handle mixed-case column names in SHOW VARIABLES result', () => {
    const tsv = 'Variable_name\tValue\ninnodb_stats_persistent\tON';
    const issues = analyzeServerResult(tsv);
    expect(issues.every(i => i.id !== 'server_result_parse_error')).toBe(true);
  });

  it('should detect removed variable regardless of key casing', () => {
    // Use a removed variable from REMOVED_SYS_VARS_84
    const tsvUpper = 'VARIABLE_NAME\tVARIABLE_VALUE\navoid_temporal_upgrade\tOFF';
    const tsvLower = 'variable_name\tvariable_value\navoid_temporal_upgrade\tOFF';
    const tsvMixed = 'Variable_name\tValue\navoid_temporal_upgrade\tOFF';

    const issuesUpper = analyzeServerResult(tsvUpper);
    const issuesLower = analyzeServerResult(tsvLower);
    const issuesMixed = analyzeServerResult(tsvMixed);

    // All three should detect the removed variable
    expect(issuesUpper.some(i => i.id === 'server_removed_variable')).toBe(true);
    expect(issuesLower.some(i => i.id === 'server_removed_variable')).toBe(true);
    expect(issuesMixed.some(i => i.id === 'server_removed_variable')).toBe(true);
  });

  it('should handle UPPERCASE command names in SHOW PROCESSLIST', () => {
    const tsv = 'Id\tCommand\tTime\tState\tInfo\n1\tSLEEP\t100\twaiting\tNULL\n2\tQUERY\t600\texecuting\tSELECT 1';
    const issues = analyzeServerResult(tsv);
    // Should detect the long-running query (600 > 300 and command != sleep)
    expect(issues.some(i => i.id === 'server_long_running_queries')).toBe(true);
  });

  it('should handle lowercase command names in SHOW PROCESSLIST', () => {
    const tsv = 'id\tcommand\ttime\tstate\tinfo\n1\tsleep\t100\twaiting\tnull\n2\tquery\t600\texecuting\tselect 1';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_long_running_queries')).toBe(true);
  });

  it('should handle empty/null cells gracefully', () => {
    const tsv = 'variable_name\tvariable_value\n\t\nsome_var\t';
    const issues = analyzeServerResult(tsv);
    // Should not crash
    expect(Array.isArray(issues)).toBe(true);
  });
});

// ============================================================================
// Combined result (check_type column) — Issue #2
// ============================================================================

describe('analyzeServerResult - COMBINED (check_type)', () => {
  it('should detect auth issues from user_auth check_type rows', () => {
    const tsv = [
      'check_type\tuser_name\thost\tauth_plugin\tpassword_expired\taccount_locked',
      "user_auth\talice\t%\tmysql_native_password\tN\tN",
      "user_auth\tbob\t%\tsha256_password\tN\tN",
    ].join('\n');
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_auth_plugin_disabled')).toBe(true);
    expect(issues.some(i => i.id === 'server_auth_plugin_deprecated')).toBe(true);
  });

  it('should detect removed auth plugin from user_auth rows', () => {
    const tsv = [
      'check_type\tuser_name\thost\tauth_plugin',
      'user_auth\tcharlie\t%\tauthentication_fido',
    ].join('\n');
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_auth_plugin_removed')).toBe(true);
  });

  it('should detect removed system variables from sys_vars check_type rows', () => {
    const tsv = [
      'check_type\tvar_name\tvar_value',
      'sys_vars\tavoid_temporal_upgrade\tOFF',
      'sys_vars\tsql_mode\tSTRICT_TRANS_TABLES,NO_AUTO_CREATE_USER',
      'sys_vars\tinnodb_buffer_pool_size\t134217728',
    ].join('\n');
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_removed_variable' && i.variableName === 'avoid_temporal_upgrade')).toBe(true);
    expect(issues.some(i => i.id === 'server_deprecated_sql_mode')).toBe(true);
    // innodb_buffer_pool_size is not removed — should not appear as removed_variable
    expect(issues.filter(i => i.id === 'server_removed_variable').length).toBe(1);
  });

  it('should handle mixed check_type rows in one result set', () => {
    const tsv = [
      'check_type\tuser_name\thost\tauth_plugin\tvar_name\tvar_value',
      'user_auth\talice\t%\tmysql_native_password\t\t',
      'sys_vars\t\t\t\tavoid_temporal_upgrade\tOFF',
    ].join('\n');
    const issues = analyzeServerResult(tsv);
    // Both auth and sysvar issues should be present
    expect(issues.some(i => i.id === 'server_auth_plugin_disabled')).toBe(true);
    expect(issues.some(i => i.id === 'server_removed_variable')).toBe(true);
  });

  it('should silently ignore unknown check_type values', () => {
    const tsv = [
      'check_type\ttablespace_name\tfile_name',
      'tablespace_files\tinnodb_system\t/var/lib/mysql/ibdata1',
    ].join('\n');
    const issues = analyzeServerResult(tsv);
    // tablespace_files rows are informational — no issues expected
    expect(issues).toEqual([]);
  });

  it('should return server_no_data for combined result with no matching rows', () => {
    const tsv = [
      'check_type\tuser_name\thost\tauth_plugin',
    ].join('\n');
    const issues = analyzeServerResult(tsv);
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('server_no_data');
  });
});

// ============================================================================
// Auth plugin rows (standalone, no check_type) — Issue #4
// ============================================================================

describe('analyzeServerResult - user_name/auth_plugin rows', () => {
  it('should detect mysql_native_password as disabled', () => {
    const tsv = 'user_name\thost\tauth_plugin\nroot\tlocalhost\tmysql_native_password';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_auth_plugin_disabled')).toBe(true);
    expect(issues.find(i => i.id === 'server_auth_plugin_disabled')?.severity).toBe('error');
  });

  it('should detect sha256_password as deprecated', () => {
    const tsv = 'user_name\thost\tauth_plugin\ndave\t%\tsha256_password';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_auth_plugin_deprecated')).toBe(true);
    expect(issues.find(i => i.id === 'server_auth_plugin_deprecated')?.severity).toBe('warning');
  });

  it('should detect authentication_fido as removed', () => {
    const tsv = 'user_name\thost\tauth_plugin\nfidouser\t%\tauthentication_fido';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_auth_plugin_removed')).toBe(true);
    expect(issues.find(i => i.id === 'server_auth_plugin_removed')?.severity).toBe('error');
  });

  it('should not flag caching_sha2_password users', () => {
    const tsv = 'user_name\thost\tauth_plugin\nadmin\tlocalhost\tcaching_sha2_password';
    const issues = analyzeServerResult(tsv);
    expect(issues.length).toBe(0);
  });
});

// ============================================================================
// MariaDB detection — Issue #3
// ============================================================================

describe('analyzeServerResult - MariaDB detection', () => {
  it('should return a warning issue for MariaDB version string, not "upgrade safe"', () => {
    const tsv = 'VERSION()\n10.11.6-MariaDB';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_mariadb_detected')).toBe(true);
    expect(issues.find(i => i.id === 'server_mariadb_detected')?.severity).toBe('warning');
  });

  it('should NOT produce server_version_compatible for MariaDB', () => {
    const tsv = 'VERSION()\n10.4.0-MariaDB';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_compatible')).toBe(false);
    expect(issues.some(i => i.id === 'server_version_too_old')).toBe(false);
  });

  it('should NOT produce server_version_already_target for high-numbered MariaDB', () => {
    const tsv = 'VERSION()\n11.2.0-MariaDB';
    const issues = analyzeServerResult(tsv);
    expect(issues.some(i => i.id === 'server_version_already_target')).toBe(false);
    expect(issues.some(i => i.id === 'server_mariadb_detected')).toBe(true);
  });

  it('parseVersion should return null for MariaDB version string', () => {
    expect(parseVersion('10.11.6-MariaDB')).toBeNull();
    expect(parseVersion('5.5.5-10.6.4-MariaDB')).toBeNull();
  });

  it('parseVersion should still work for non-MariaDB versions', () => {
    expect(parseVersion('8.0.35')).toEqual({ major: 8, minor: 0, patch: 35 });
    expect(parseVersion('8.4.0-commercial')).toEqual({ major: 8, minor: 4, patch: 0 });
  });
});
