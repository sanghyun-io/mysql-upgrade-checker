/**
 * Tests for MySQL 8.0 → 8.4 Compatibility Rules
 * Tests pattern matching and detection logic for all rule categories
 */

import { describe, it, expect } from 'vitest';
import { compatibilityRules, rulesByCategory } from '../rules';
import {
  REMOVED_SYS_VARS_84,
  SYS_VARS_NEW_DEFAULTS_84,
  NEW_RESERVED_KEYWORDS_84,
  REMOVED_FUNCTIONS_84
} from '../constants';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Test if a rule's pattern matches the given text
 */
function testPatternMatch(ruleId: string, text: string): boolean {
  const rule = compatibilityRules.find(r => r.id === ruleId);
  if (!rule?.pattern) return false;
  rule.pattern.lastIndex = 0; // Reset for global patterns
  return rule.pattern.test(text);
}

/**
 * Get all matches for a rule's pattern in the given text
 */
function _getPatternMatches(ruleId: string, text: string): string[] {
  const rule = compatibilityRules.find(r => r.id === ruleId);
  if (!rule?.pattern) return [];
  rule.pattern.lastIndex = 0;
  const matches = text.matchAll(rule.pattern);
  return Array.from(matches).map(m => m[0]);
}

/**
 * Test detectInData callback for data rules
 */
function _testDetectInData(ruleId: string, value: string, columnType?: string): boolean {
  const rule = compatibilityRules.find(r => r.id === ruleId);
  if (!rule?.detectInData) return false;
  return rule.detectInData(value, columnType);
}

// ============================================================================
// 1. REMOVED SYSTEM VARIABLES TESTS
// ============================================================================

describe('Removed System Variables Rules', () => {
  const rule = rulesByCategory.removedSysVars[0];

  it('should have correct rule metadata', () => {
    expect(rule.id).toBe('removed_sys_var');
    expect(rule.type).toBe('config');
    expect(rule.category).toBe('removedSysVars');
    expect(rule.severity).toBe('error');
  });

  it('should detect expire_logs_days', () => {
    expect(testPatternMatch('removed_sys_var', 'expire_logs_days=7')).toBe(true);
  });

  it('should detect default_authentication_plugin', () => {
    expect(testPatternMatch('removed_sys_var', 'default_authentication_plugin=mysql_native_password')).toBe(true);
  });

  it('should detect innodb_log_file_size', () => {
    expect(testPatternMatch('removed_sys_var', 'innodb_log_file_size=256M')).toBe(true);
  });

  it('should detect avoid_temporal_upgrade', () => {
    expect(testPatternMatch('removed_sys_var', 'avoid_temporal_upgrade=ON')).toBe(true);
  });

  it('should detect master_info_repository', () => {
    expect(testPatternMatch('removed_sys_var', 'master_info_repository=TABLE')).toBe(true);
  });

  it('should detect relay_log_info_repository', () => {
    expect(testPatternMatch('removed_sys_var', 'relay_log_info_repository=TABLE')).toBe(true);
  });

  it('should NOT match valid system variables', () => {
    expect(testPatternMatch('removed_sys_var', 'innodb_buffer_pool_size=1G')).toBe(false);
    expect(testPatternMatch('removed_sys_var', 'max_connections=100')).toBe(false);
  });

  it('should detect all removed system variables', () => {
    // Test a sample of removed variables
    const sampleVars = [
      'avoid_temporal_upgrade',
      'binlog_transaction_dependency_tracking',
      'expire_logs_days',
      'innodb_log_file_size',
      'innodb_log_files_in_group',
      'keyring_file_data',
      'language',
      'log_bin_use_v1_row_events',
      'old',
      'new',
      'show_old_temporals'
    ];

    for (const varName of sampleVars) {
      expect(testPatternMatch('removed_sys_var', `${varName}=value`)).toBe(true);
    }
  });

  it('should generate fix query', () => {
    expect(rule.generateFixQuery).toBeDefined();
    const fix = rule.generateFixQuery?.({ variableName: 'expire_logs_days' });
    expect(fix).toContain('expire_logs_days');
  });
});

// ============================================================================
// 2. NEW DEFAULT VALUES RULES TESTS
// ============================================================================

describe('New Default Values Rules', () => {
  describe('innodb_adaptive_hash_index rule', () => {
    it('should detect innodb_adaptive_hash_index=ON', () => {
      expect(testPatternMatch('sys_var_new_default_innodb_adaptive_hash', 'innodb_adaptive_hash_index=ON')).toBe(true);
      expect(testPatternMatch('sys_var_new_default_innodb_adaptive_hash', 'innodb_adaptive_hash_index = ON')).toBe(true);
    });

    it('should NOT match OFF setting', () => {
      expect(testPatternMatch('sys_var_new_default_innodb_adaptive_hash', 'innodb_adaptive_hash_index=OFF')).toBe(false);
    });
  });

  describe('innodb_change_buffering rule', () => {
    it('should detect innodb_change_buffering=all', () => {
      expect(testPatternMatch('sys_var_new_default_innodb_change_buffering', 'innodb_change_buffering=all')).toBe(true);
    });

    it('should NOT match none setting', () => {
      expect(testPatternMatch('sys_var_new_default_innodb_change_buffering', 'innodb_change_buffering=none')).toBe(false);
    });
  });

  describe('replica_parallel_workers rule', () => {
    it('should detect replica_parallel_workers=0', () => {
      expect(testPatternMatch('sys_var_new_default_replica_parallel_workers', 'replica_parallel_workers=0')).toBe(true);
    });

    it('should NOT match non-zero values', () => {
      expect(testPatternMatch('sys_var_new_default_replica_parallel_workers', 'replica_parallel_workers=4')).toBe(false);
    });
  });

  describe('SYS_VARS_NEW_DEFAULTS_84 dynamic rules', () => {
    it('should generate rules for all variables in SYS_VARS_NEW_DEFAULTS_84', () => {
      const varNames = Object.keys(SYS_VARS_NEW_DEFAULTS_84);
      for (const varName of varNames) {
        const ruleId = `sys_var_new_default_${varName}`;
        const rule = compatibilityRules.find(r => r.id === ruleId);
        expect(rule).toBeDefined();
        expect(rule?.category).toBe('newDefaultVars');
        expect(rule?.severity).toBe('warning');
      }
    });

    it('should detect innodb_adaptive_hash_index=ON', () => {
      expect(testPatternMatch('sys_var_new_default_innodb_adaptive_hash_index', 'innodb_adaptive_hash_index=ON')).toBe(true);
    });

    it('should detect innodb_flush_method=fsync', () => {
      expect(testPatternMatch('sys_var_new_default_innodb_flush_method', 'innodb_flush_method=fsync')).toBe(true);
    });

    it('should detect innodb_io_capacity=200', () => {
      expect(testPatternMatch('sys_var_new_default_innodb_io_capacity', 'innodb_io_capacity=200')).toBe(true);
    });

    it('should NOT match new default values', () => {
      expect(testPatternMatch('sys_var_new_default_innodb_adaptive_hash_index', 'innodb_adaptive_hash_index=OFF')).toBe(false);
      expect(testPatternMatch('sys_var_new_default_innodb_flush_method', 'innodb_flush_method=O_DIRECT')).toBe(false);
    });
  });

  describe('Zero Date rules', () => {
    const zeroDateRule = rulesByCategory.newDefaultVars.find(r => r.id === 'invalid_date_zero');
    const zeroDateTimeRule = rulesByCategory.newDefaultVars.find(r => r.id === 'invalid_datetime_zero');

    it('should detect 0000-00-00 date', () => {
      expect(zeroDateRule?.detectInData?.("'0000-00-00'")).toBe(true);
      expect(zeroDateRule?.detectInData?.('"0000-00-00"')).toBe(true);
    });

    it('should detect 0000-00-00 00:00:00 datetime', () => {
      expect(zeroDateTimeRule?.detectInData?.("'0000-00-00 00:00:00'")).toBe(true);
      expect(zeroDateTimeRule?.detectInData?.('"0000-00-00 00:00:00"')).toBe(true);
    });

    it('should NOT match valid dates', () => {
      expect(zeroDateRule?.detectInData?.("'2024-01-15'")).toBe(false);
      expect(zeroDateTimeRule?.detectInData?.("'2024-01-15 12:30:00'")).toBe(false);
    });

    it('should generate fix query', () => {
      const fix = zeroDateRule?.generateFixQuery?.({
        tableName: 'events',
        columnName: 'event_date'
      });
      expect(fix).toContain('UPDATE');
      expect(fix).toContain('events');
      expect(fix).toContain('event_date');
    });
  });
});

// ============================================================================
// 3. RESERVED KEYWORDS RULES TESTS
// ============================================================================

describe('Reserved Keywords Rules', () => {
  describe('Table name keyword detection', () => {
    it('should detect MANUAL as table name', () => {
      expect(testPatternMatch('reserved_keyword_84', 'CREATE TABLE manual (')).toBe(true);
      expect(testPatternMatch('reserved_keyword_84', 'CREATE TABLE MANUAL (')).toBe(true);
    });

    it('should detect PARALLEL as table name', () => {
      expect(testPatternMatch('reserved_keyword_84', 'CREATE TABLE parallel (')).toBe(true);
    });

    it('should detect QUALIFY as table name', () => {
      expect(testPatternMatch('reserved_keyword_84', 'CREATE TABLE qualify (')).toBe(true);
    });

    it('should detect TABLESAMPLE as table name', () => {
      expect(testPatternMatch('reserved_keyword_84', 'CREATE TABLE tablesample (')).toBe(true);
    });

    it('should detect ALTER TABLE with reserved keyword', () => {
      expect(testPatternMatch('reserved_keyword_84', 'ALTER TABLE manual ADD COLUMN x INT')).toBe(true);
    });

    it('should detect CREATE UNIQUE INDEX on reserved keyword table', () => {
      expect(testPatternMatch('reserved_keyword_84', 'CREATE UNIQUE INDEX manual ON tbl (col)')).toBe(true);
    });
  });

  describe('Column name keyword detection', () => {
    it('should detect MANUAL as column name', () => {
      expect(testPatternMatch('reserved_keyword_column', 'manual INT')).toBe(true);
    });

    it('should detect PARALLEL as column name', () => {
      expect(testPatternMatch('reserved_keyword_column', 'parallel VARCHAR(100)')).toBe(true);
    });

    it('should detect QUALIFY as column name', () => {
      expect(testPatternMatch('reserved_keyword_column', 'qualify TEXT')).toBe(true);
    });

    it('should detect TABLESAMPLE as column name', () => {
      expect(testPatternMatch('reserved_keyword_column', 'tablesample DATETIME')).toBe(true);
    });
  });

  describe('Routine name keyword detection', () => {
    it('should detect PROCEDURE with reserved keyword name', () => {
      expect(testPatternMatch('routine_syntax_keyword', 'CREATE PROCEDURE manual(')).toBe(true);
    });

    it('should detect FUNCTION with reserved keyword name', () => {
      expect(testPatternMatch('routine_syntax_keyword', 'CREATE FUNCTION parallel(')).toBe(true);
    });
  });
});

// ============================================================================
// 4. AUTHENTICATION RULES TESTS
// ============================================================================

describe('Authentication Rules', () => {
  describe('mysql_native_password detection', () => {
    it('should detect IDENTIFIED WITH mysql_native_password', () => {
      expect(testPatternMatch('mysql_native_password', "IDENTIFIED WITH mysql_native_password BY 'pass'")).toBe(true);
    });

    it('should detect plugin=mysql_native_password', () => {
      expect(testPatternMatch('mysql_native_password', "plugin='mysql_native_password'")).toBe(true);
      expect(testPatternMatch('mysql_native_password', 'plugin=mysql_native_password')).toBe(true);
    });

    it('should have warning severity', () => {
      const rule = compatibilityRules.find(r => r.id === 'mysql_native_password');
      expect(rule?.severity).toBe('warning');
    });
  });

  describe('sha256_password detection', () => {
    it('should detect IDENTIFIED WITH sha256_password', () => {
      expect(testPatternMatch('sha256_password', "IDENTIFIED WITH sha256_password BY 'pass'")).toBe(true);
    });

    it('should detect plugin=sha256_password', () => {
      expect(testPatternMatch('sha256_password', "plugin='sha256_password'")).toBe(true);
    });
  });

  describe('authentication_fido detection', () => {
    it('should detect IDENTIFIED WITH authentication_fido', () => {
      expect(testPatternMatch('authentication_fido', 'IDENTIFIED WITH authentication_fido')).toBe(true);
    });

    it('should detect plugin=authentication_fido', () => {
      expect(testPatternMatch('authentication_fido', "plugin='authentication_fido'")).toBe(true);
    });

    it('should have error severity (plugin removed)', () => {
      const rule = compatibilityRules.find(r => r.id === 'authentication_fido');
      expect(rule?.severity).toBe('error');
    });
  });

  describe('default_authentication_plugin variable detection', () => {
    it('should detect default_authentication_plugin setting', () => {
      expect(testPatternMatch('default_authentication_plugin_var', 'default_authentication_plugin=')).toBe(true);
      expect(testPatternMatch('default_authentication_plugin_var', 'default_authentication_plugin = mysql_native_password')).toBe(true);
    });

    it('should have error severity (variable removed)', () => {
      const rule = compatibilityRules.find(r => r.id === 'default_authentication_plugin_var');
      expect(rule?.severity).toBe('error');
    });
  });

  describe('NEW RULE 1: auth_plugin_disabled detection', () => {
    it('should detect IDENTIFIED BY mysql_native_password', () => {
      expect(testPatternMatch('auth_plugin_disabled', "IDENTIFIED BY 'mysql_native_password'")).toBe(true);
      expect(testPatternMatch('auth_plugin_disabled', 'IDENTIFIED BY mysql_native_password')).toBe(true);
    });

    it('should detect IDENTIFIED WITH mysql_native_password', () => {
      expect(testPatternMatch('auth_plugin_disabled', "IDENTIFIED WITH 'mysql_native_password'")).toBe(true);
      expect(testPatternMatch('auth_plugin_disabled', 'IDENTIFIED WITH mysql_native_password')).toBe(true);
    });

    it('should have warning severity', () => {
      const rule = compatibilityRules.find(r => r.id === 'auth_plugin_disabled');
      expect(rule?.severity).toBe('warning');
    });

    it('should have correct category', () => {
      const rule = compatibilityRules.find(r => r.id === 'auth_plugin_disabled');
      expect(rule?.category).toBe('authentication');
    });

    it('should generate fix query', () => {
      const rule = compatibilityRules.find(r => r.id === 'auth_plugin_disabled');
      const fix = rule?.generateFixQuery?.({ userName: 'test_user' });
      expect(fix).toContain('ALTER USER');
      expect(fix).toContain('test_user');
      expect(fix).toContain('caching_sha2_password');
    });
  });

  describe('NEW RULE 2: auth_plugin_removed detection', () => {
    it('should detect IDENTIFIED WITH authentication_fido', () => {
      expect(testPatternMatch('auth_plugin_removed', "IDENTIFIED WITH 'authentication_fido'")).toBe(true);
      expect(testPatternMatch('auth_plugin_removed', 'IDENTIFIED WITH authentication_fido')).toBe(true);
    });

    it('should detect IDENTIFIED WITH authentication_fido_client', () => {
      expect(testPatternMatch('auth_plugin_removed', "IDENTIFIED WITH 'authentication_fido_client'")).toBe(true);
      expect(testPatternMatch('auth_plugin_removed', 'IDENTIFIED WITH authentication_fido_client')).toBe(true);
    });

    it('should detect IDENTIFIED BY authentication_fido', () => {
      expect(testPatternMatch('auth_plugin_removed', "IDENTIFIED BY 'authentication_fido'")).toBe(true);
    });

    it('should have error severity', () => {
      const rule = compatibilityRules.find(r => r.id === 'auth_plugin_removed');
      expect(rule?.severity).toBe('error');
    });

    it('should have correct category', () => {
      const rule = compatibilityRules.find(r => r.id === 'auth_plugin_removed');
      expect(rule?.category).toBe('authentication');
    });

    it('should generate fix query', () => {
      const rule = compatibilityRules.find(r => r.id === 'auth_plugin_removed');
      const fix = rule?.generateFixQuery?.({ userName: 'fido_user' });
      expect(fix).toContain('ALTER USER');
      expect(fix).toContain('fido_user');
      expect(fix).toContain('caching_sha2_password');
    });
  });
});

// ============================================================================
// 5. INVALID PRIVILEGES RULES TESTS
// ============================================================================

describe('Invalid Privileges Rules', () => {
  describe('SUPER privilege detection', () => {
    it('should detect GRANT SUPER', () => {
      expect(testPatternMatch('super_privilege', "GRANT SUPER ON *.* TO 'user'@'%'")).toBe(true);
    });

    it('should detect SUPER in multiple privileges', () => {
      expect(testPatternMatch('super_privilege', "GRANT SELECT, SUPER, INSERT ON db.* TO 'user'@'%'")).toBe(true);
    });

    it('should NOT match GRANT without SUPER', () => {
      expect(testPatternMatch('super_privilege', "GRANT SELECT, INSERT ON db.* TO 'user'@'%'")).toBe(false);
    });

    it('should have warning severity', () => {
      const rule = compatibilityRules.find(r => r.id === 'super_privilege');
      expect(rule?.severity).toBe('warning');
    });

    it('should generate fix query', () => {
      const rule = compatibilityRules.find(r => r.id === 'super_privilege');
      const fix = rule?.generateFixQuery?.({ userName: 'admin' });
      expect(fix).toContain('REVOKE SUPER');
      expect(fix).toContain('admin');
    });
  });

  describe('NEW RULE 4: removed_privilege_84 detection', () => {
    it('should detect GRANT SUPER privilege', () => {
      expect(testPatternMatch('removed_privilege_84', "GRANT SUPER ON *.* TO 'user'@'%'")).toBe(true);
    });

    it('should detect SUPER in mixed privileges', () => {
      expect(testPatternMatch('removed_privilege_84', "GRANT SELECT, SUPER, INSERT ON db.* TO 'user'@'%'")).toBe(true);
    });

    it('should have error severity', () => {
      const rule = compatibilityRules.find(r => r.id === 'removed_privilege_84');
      expect(rule?.severity).toBe('error');
    });

    it('should have correct category', () => {
      const rule = compatibilityRules.find(r => r.id === 'removed_privilege_84');
      expect(rule?.category).toBe('invalidPrivileges');
    });

    it('should generate fix query', () => {
      const rule = compatibilityRules.find(r => r.id === 'removed_privilege_84');
      const fix = rule?.generateFixQuery?.({ userName: 'admin' });
      expect(fix).toContain('REVOKE SUPER');
      expect(fix).toContain('admin');
      expect(fix).toContain('SYSTEM_VARIABLES_ADMIN');
    });
  });

  describe('NEW RULE 5: super_privilege_replacement detection', () => {
    it('should detect GRANT SUPER for replacement suggestion', () => {
      expect(testPatternMatch('super_privilege_replacement', "GRANT SUPER ON *.* TO 'user'@'%'")).toBe(true);
    });

    it('should detect SUPER in mixed privileges', () => {
      expect(testPatternMatch('super_privilege_replacement', "GRANT ALL PRIVILEGES, SUPER ON *.* TO 'root'@'localhost'")).toBe(true);
    });

    it('should have warning severity', () => {
      const rule = compatibilityRules.find(r => r.id === 'super_privilege_replacement');
      expect(rule?.severity).toBe('warning');
    });

    it('should have correct category', () => {
      const rule = compatibilityRules.find(r => r.id === 'super_privilege_replacement');
      expect(rule?.category).toBe('invalidPrivileges');
    });

    it('should reference SUPER_REPLACEMENT_PRIVILEGES in description', () => {
      const rule = compatibilityRules.find(r => r.id === 'super_privilege_replacement');
      expect(rule?.description).toContain('SYSTEM_VARIABLES_ADMIN');
    });

    it('should generate fix query with dynamic privileges', () => {
      const rule = compatibilityRules.find(r => r.id === 'super_privilege_replacement');
      const fix = rule?.generateFixQuery?.({ userName: 'admin' });
      expect(fix).toContain('REVOKE SUPER');
      expect(fix).toContain('admin');
      expect(fix).toContain('SYSTEM_VARIABLES_ADMIN');
      expect(fix).toContain('CONNECTION_ADMIN');
    });
  });
});

// ============================================================================
// 6. INVALID OBJECTS RULES TESTS
// ============================================================================

describe('Invalid Objects Rules', () => {
  describe('YEAR(2) detection', () => {
    it('should detect YEAR(2) type', () => {
      expect(testPatternMatch('year2', 'birth_year YEAR(2)')).toBe(true);
    });

    it('should NOT match YEAR(4) or YEAR', () => {
      expect(testPatternMatch('year2', 'birth_year YEAR(4)')).toBe(false);
      expect(testPatternMatch('year2', 'birth_year YEAR')).toBe(false);
    });
  });

  describe('UTF8 charset detection', () => {
    it('should detect CHARSET=utf8 (not utf8mb4)', () => {
      expect(testPatternMatch('utf8_charset', 'CHARSET=utf8')).toBe(true);
      expect(testPatternMatch('utf8_charset', 'CHARSET = utf8')).toBe(true);
    });

    it('should NOT match CHARSET=utf8mb4', () => {
      expect(testPatternMatch('utf8_charset', 'CHARSET=utf8mb4')).toBe(false);
    });
  });

  describe('utf8mb3 charset detection', () => {
    it('should detect CHARSET=utf8mb3', () => {
      expect(testPatternMatch('utf8mb3_explicit', 'CHARSET=utf8mb3')).toBe(true);
    });
  });

  describe('ZEROFILL detection', () => {
    it('should detect ZEROFILL attribute', () => {
      // Pattern expects: column_name type ZEROFILL
      expect(testPatternMatch('zerofill', 'order_num INT ZEROFILL')).toBe(true);
    });

    it('should detect ZEROFILL with backticks', () => {
      expect(testPatternMatch('zerofill', '`order_num` INT ZEROFILL')).toBe(true);
    });
  });

  describe('FLOAT/DOUBLE precision detection', () => {
    it('should detect FLOAT(M,D)', () => {
      expect(testPatternMatch('float_precision', 'value FLOAT(10,2)')).toBe(true);
    });

    it('should detect DOUBLE(M,D)', () => {
      expect(testPatternMatch('float_precision', 'value DOUBLE(15,5)')).toBe(true);
    });

    it('should NOT match FLOAT without precision', () => {
      expect(testPatternMatch('float_precision', 'value FLOAT')).toBe(false);
    });
  });

  describe('INT display width detection', () => {
    it('should detect INT(11)', () => {
      expect(testPatternMatch('int_display_width', 'id INT(11)')).toBe(true);
    });

    it('should detect BIGINT(20)', () => {
      expect(testPatternMatch('int_display_width', 'id BIGINT(20)')).toBe(true);
    });

    it('should NOT match plain INT', () => {
      expect(testPatternMatch('int_display_width', 'id INT PRIMARY KEY')).toBe(false);
    });
  });

  describe('MyISAM engine detection', () => {
    it('should detect ENGINE=MyISAM', () => {
      expect(testPatternMatch('myisam_engine', 'ENGINE=MyISAM')).toBe(true);
      expect(testPatternMatch('myisam_engine', 'ENGINE = MyISAM')).toBe(true);
    });

    it('should NOT match ENGINE=InnoDB', () => {
      expect(testPatternMatch('myisam_engine', 'ENGINE=InnoDB')).toBe(false);
    });
  });

  describe('NEW RULE 6: deprecated_engine detection', () => {
    it('should detect ENGINE=ARCHIVE', () => {
      expect(testPatternMatch('deprecated_engine', 'ENGINE=ARCHIVE')).toBe(true);
      expect(testPatternMatch('deprecated_engine', 'ENGINE = ARCHIVE')).toBe(true);
    });

    it('should detect ENGINE=BLACKHOLE', () => {
      expect(testPatternMatch('deprecated_engine', 'ENGINE=BLACKHOLE')).toBe(true);
    });

    it('should detect ENGINE=MERGE', () => {
      expect(testPatternMatch('deprecated_engine', 'ENGINE=MERGE')).toBe(true);
    });

    it('should detect ENGINE=FEDERATED', () => {
      expect(testPatternMatch('deprecated_engine', 'ENGINE=FEDERATED')).toBe(true);
    });

    it('should detect ENGINE=NDB', () => {
      expect(testPatternMatch('deprecated_engine', 'ENGINE=NDB')).toBe(true);
    });

    it('should NOT detect ENGINE=MyISAM (has separate rule)', () => {
      expect(testPatternMatch('deprecated_engine', 'ENGINE=MyISAM')).toBe(false);
    });

    it('should NOT match ENGINE=InnoDB', () => {
      expect(testPatternMatch('deprecated_engine', 'ENGINE=InnoDB')).toBe(false);
    });

    it('should have warning severity', () => {
      const rule = compatibilityRules.find(r => r.id === 'deprecated_engine');
      expect(rule?.severity).toBe('warning');
    });

    it('should have correct category', () => {
      const rule = compatibilityRules.find(r => r.id === 'deprecated_engine');
      expect(rule?.category).toBe('invalidObjects');
    });

    it('should generate fix query', () => {
      const rule = compatibilityRules.find(r => r.id === 'deprecated_engine');
      const fix = rule?.generateFixQuery?.({ code: 'CREATE TABLE archive_test (id INT) ENGINE=ARCHIVE' });
      expect(fix).toContain('ALTER TABLE');
      expect(fix).toContain('ENGINE=InnoDB');
    });
  });

  describe('latin1 charset detection', () => {
    it('should detect CHARSET=latin1', () => {
      expect(testPatternMatch('latin1', 'CHARSET=latin1')).toBe(true);
    });
  });

  describe('Removed functions detection', () => {
    it('should detect PASSWORD() function', () => {
      expect(testPatternMatch('removed_function', "PASSWORD('test')"  )).toBe(true);
    });

    it('should detect ENCRYPT() function', () => {
      expect(testPatternMatch('removed_function', "ENCRYPT('data')")).toBe(true);
    });

    it('should detect ENCODE() function', () => {
      expect(testPatternMatch('removed_function', "ENCODE('data', 'key')"  )).toBe(true);
    });

    it('should detect DECODE() function', () => {
      expect(testPatternMatch('removed_function', "DECODE('data', 'key')"  )).toBe(true);
    });

    it('should detect DES_ENCRYPT() function', () => {
      expect(testPatternMatch('removed_function', "DES_ENCRYPT('data')"  )).toBe(true);
    });

    it('should detect DES_DECRYPT() function', () => {
      expect(testPatternMatch('removed_function', "DES_DECRYPT('data')"  )).toBe(true);
    });
  });

  describe('SQL_CALC_FOUND_ROWS detection', () => {
    it('should detect SQL_CALC_FOUND_ROWS', () => {
      expect(testPatternMatch('sql_calc_found_rows', 'SELECT SQL_CALC_FOUND_ROWS * FROM users')).toBe(true);
    });
  });

  describe('NEW RULE 3: deprecated_function_84 detection', () => {
    it('should detect FOUND_ROWS() function', () => {
      expect(testPatternMatch('deprecated_function_84', 'SELECT FOUND_ROWS()')).toBe(true);
    });

    it('should detect SQL_CALC_FOUND_ROWS in query', () => {
      expect(testPatternMatch('deprecated_function_84', 'SELECT SQL_CALC_FOUND_ROWS() FROM users')).toBe(true);
    });

    it('should have warning severity', () => {
      const rule = compatibilityRules.find(r => r.id === 'deprecated_function_84');
      expect(rule?.severity).toBe('warning');
    });

    it('should have correct category', () => {
      const rule = compatibilityRules.find(r => r.id === 'deprecated_function_84');
      expect(rule?.category).toBe('invalidObjects');
    });

    it('should generate fix query with alternative approach', () => {
      const rule = compatibilityRules.find(r => r.id === 'deprecated_function_84');
      const fix = rule?.generateFixQuery?.({});
      expect(fix).toContain('SQL_CALC_FOUND_ROWS');
      expect(fix).toContain('COUNT(*)');
    });
  });

  describe('Obsolete SQL modes detection', () => {
    it('should detect MAXDB SQL mode', () => {
      expect(testPatternMatch('obsolete_sql_mode', 'sql_mode=STRICT_TRANS_TABLES,MAXDB')).toBe(true);
    });

    it('should detect ORACLE SQL mode', () => {
      expect(testPatternMatch('obsolete_sql_mode', 'sql_mode=ORACLE')).toBe(true);
    });

    it('should detect DB2 SQL mode', () => {
      expect(testPatternMatch('obsolete_sql_mode', 'sql_mode=DB2')).toBe(true);
    });
  });

  describe('GROUP BY ASC/DESC detection', () => {
    it('should detect GROUP BY ... ASC', () => {
      expect(testPatternMatch('groupby_asc_desc', 'GROUP BY category ASC')).toBe(true);
    });

    it('should detect GROUP BY ... DESC', () => {
      expect(testPatternMatch('groupby_asc_desc', 'GROUP BY category DESC')).toBe(true);
    });
  });

  describe('FTS table prefix detection', () => {
    it('should detect FTS_ prefix', () => {
      expect(testPatternMatch('fts_tablename', 'CREATE TABLE FTS_test (')).toBe(true);
    });

    it('should detect fts_ prefix (lowercase)', () => {
      expect(testPatternMatch('fts_tablename', 'CREATE TABLE fts_test (')).toBe(true);
    });
  });

  describe('BLOB/TEXT default detection', () => {
    it('should detect TEXT with default value', () => {
      expect(testPatternMatch('blob_text_default', "content TEXT DEFAULT 'empty'")).toBe(true);
    });

    it('should detect BLOB with default value', () => {
      expect(testPatternMatch('blob_text_default', "data BLOB DEFAULT 'data'")).toBe(true);
    });

    it('should NOT match TEXT DEFAULT NULL', () => {
      expect(testPatternMatch('blob_text_default', 'content TEXT DEFAULT NULL')).toBe(false);
    });
  });

  describe('Dollar sign name detection', () => {
    it('should detect $ prefix in table name', () => {
      expect(testPatternMatch('dollar_sign_name', 'CREATE TABLE $test (')).toBe(true);
    });

    it('should detect $ prefix in view name', () => {
      expect(testPatternMatch('dollar_sign_name', 'CREATE VIEW $my_view AS')).toBe(true);
    });
  });

  describe('Old geometry type detection', () => {
    it('should detect GEOMETRYCOLLECTION', () => {
      expect(testPatternMatch('old_geometry_type', 'geom GEOMETRYCOLLECTION')).toBe(true);
    });
  });

  describe('Old row format detection', () => {
    it('should detect ROW_FORMAT=COMPACT', () => {
      expect(testPatternMatch('innodb_row_format', 'ROW_FORMAT=COMPACT')).toBe(true);
    });

    it('should detect ROW_FORMAT=REDUNDANT', () => {
      expect(testPatternMatch('innodb_row_format', 'ROW_FORMAT=REDUNDANT')).toBe(true);
    });

    it('should NOT match ROW_FORMAT=DYNAMIC', () => {
      expect(testPatternMatch('innodb_row_format', 'ROW_FORMAT=DYNAMIC')).toBe(false);
    });
  });

  describe('Trailing space in name detection', () => {
    it('should detect trailing space in table name', () => {
      expect(testPatternMatch('invalid_57_name_trailing_space', 'CREATE TABLE `test `')).toBe(true);
    });
  });

  describe('Generated column function detection', () => {
    it('should detect IF function in generated column', () => {
      expect(testPatternMatch('generated_column_function', 'AS (IF(a > b, a, b))')).toBe(true);
    });

    it('should detect CASE function in generated column', () => {
      expect(testPatternMatch('generated_column_function', 'AS (CASE WHEN a > 0 THEN a ELSE 0 END)')).toBe(true);
    });

    it('should detect COALESCE function in generated column', () => {
      expect(testPatternMatch('generated_column_function', 'GENERATED ALWAYS AS (COALESCE(a, b, 0))')).toBe(true);
    });
  });

  describe('Invalid 5.7 identifier patterns', () => {
    describe('Dollar sign start detection', () => {
      it('should detect $ prefix in table name', () => {
        expect(testPatternMatch('invalid_57_name_dollar_start', 'CREATE TABLE $test (')).toBe(true);
      });

      it('should detect $ prefix in database name', () => {
        expect(testPatternMatch('invalid_57_name_dollar_start', 'CREATE DATABASE $mydb')).toBe(true);
      });

      it('should detect $ prefix in view name', () => {
        expect(testPatternMatch('invalid_57_name_dollar_start', 'CREATE VIEW $my_view AS')).toBe(true);
      });

      it('should NOT match valid identifiers', () => {
        expect(testPatternMatch('invalid_57_name_dollar_start', 'CREATE TABLE test_table (')).toBe(false);
      });
    });

    describe('Multiple dots detection', () => {
      it('should detect consecutive dots in identifier', () => {
        expect(testPatternMatch('invalid_57_name_multiple_dots', 'CREATE TABLE db..table (')).toBe(true);
      });

      it('should NOT match single dot (valid schema.table)', () => {
        expect(testPatternMatch('invalid_57_name_multiple_dots', 'CREATE TABLE db.table (')).toBe(false);
      });
    });

    describe('Trailing space detection', () => {
      it('should detect trailing space in table name with backticks', () => {
        expect(testPatternMatch('invalid_57_name_trailing_space', 'CREATE TABLE `test `')).toBe(true);
      });

      it('should detect trailing space in database name', () => {
        expect(testPatternMatch('invalid_57_name_trailing_space', 'CREATE DATABASE `mydb `')).toBe(true);
      });

      it('should NOT match names without trailing spaces', () => {
        expect(testPatternMatch('invalid_57_name_trailing_space', 'CREATE TABLE `test`')).toBe(false);
      });
    });
  });

  describe('Shared tablespace partition detection', () => {
    it('should detect partition table in mysql tablespace', () => {
      expect(testPatternMatch('partitioned_tables_in_shared_tablespaces',
        'CREATE TABLE t1 (id INT) TABLESPACE=mysql PARTITION BY RANGE (id)')).toBe(true);
    });

    it('should detect partition table in innodb_system tablespace', () => {
      expect(testPatternMatch('partitioned_tables_in_shared_tablespaces',
        'CREATE TABLE t2 (id INT) TABLESPACE="innodb_system" PARTITION BY HASH (id)')).toBe(true);
    });

    it('should detect partition table in innodb_temporary tablespace', () => {
      expect(testPatternMatch('partitioned_tables_in_shared_tablespaces',
        'CREATE TABLE t3 (id INT) TABLESPACE innodb_temporary PARTITION BY LIST (id)')).toBe(true);
    });

    it('should NOT match file-per-table partitions', () => {
      expect(testPatternMatch('partitioned_tables_in_shared_tablespaces',
        'CREATE TABLE t4 (id INT) TABLESPACE=innodb_file_per_table PARTITION BY RANGE (id)')).toBe(false);
    });

    it('should have correct severity and category', () => {
      const rule = compatibilityRules.find(r => r.id === 'partitioned_tables_in_shared_tablespaces');
      expect(rule?.severity).toBe('error');
      expect(rule?.category).toBe('invalidObjects');
    });
  });

  describe('Non-native partition engine detection', () => {
    it('should detect MyISAM partition', () => {
      expect(testPatternMatch('non_native_partition_engine',
        'PARTITION BY RANGE (year) ENGINE=MyISAM')).toBe(true);
    });

    it('should detect CSV partition', () => {
      expect(testPatternMatch('non_native_partition_engine',
        'PARTITION BY HASH (id) ENGINE=CSV')).toBe(true);
    });

    it('should detect MERGE partition', () => {
      expect(testPatternMatch('non_native_partition_engine',
        'PARTITION BY LIST (status) ENGINE=MERGE')).toBe(true);
    });

    it('should NOT match InnoDB partition', () => {
      expect(testPatternMatch('non_native_partition_engine',
        'PARTITION BY RANGE (id) ENGINE=InnoDB')).toBe(false);
    });

    it('should have correct severity and category', () => {
      const rule = compatibilityRules.find(r => r.id === 'non_native_partition_engine');
      expect(rule?.severity).toBe('warning');
      expect(rule?.category).toBe('invalidObjects');
    });

    it('should generate fix query', () => {
      const rule = compatibilityRules.find(r => r.id === 'non_native_partition_engine');
      const fix = rule?.generateFixQuery?.({
        code: 'CREATE TABLE part_test (id INT) PARTITION BY RANGE (id) ENGINE=MyISAM'
      });
      expect(fix).toContain('ALTER TABLE');
      expect(fix).toContain('ENGINE=InnoDB');
    });
  });
});

// ============================================================================
// 7. DATA INTEGRITY RULES TESTS
// ============================================================================

describe('Data Integrity Rules', () => {
  describe('ENUM empty value detection', () => {
    const rule = rulesByCategory.dataIntegrity.find(r => r.id === 'enum_empty_value');

    it('should detect empty string in ENUM column', () => {
      const result = rule?.detectInData?.("('',", 'ENUM');
      expect(result).toBe(true);
    });

    it('should NOT detect non-empty ENUM value', () => {
      const result = rule?.detectInData?.("('active',", 'ENUM');
      expect(result).toBe(false);
    });

    it('should only apply to ENUM columns', () => {
      const result = rule?.detectInData?.("('',", 'VARCHAR');
      expect(result).toBe(false);
    });
  });

  describe('ENUM numeric index detection', () => {
    const rule = rulesByCategory.dataIntegrity.find(r => r.id === 'enum_numeric_index');

    it('should detect numeric value for ENUM column', () => {
      const result = rule?.detectInData?.('(1,', 'ENUM');
      expect(result).toBe(true);
    });

    it('should only apply to ENUM columns', () => {
      const result = rule?.detectInData?.('(1,', 'INT');
      expect(result).toBe(false);
    });
  });

  describe('TIMESTAMP range detection', () => {
    const rule = rulesByCategory.dataIntegrity.find(r => r.id === 'timestamp_out_of_range');

    it('should detect year before 1970', () => {
      const result = rule?.detectInData?.("'1969-12-31'", 'TIMESTAMP');
      expect(result).toBe(true);
    });

    it('should detect year after 2038', () => {
      const result = rule?.detectInData?.("'2039-01-01'", 'TIMESTAMP');
      expect(result).toBe(true);
    });

    it('should NOT detect valid timestamp year', () => {
      const result = rule?.detectInData?.("'2024-01-15'", 'TIMESTAMP');
      expect(result).toBe(false);
    });

    it('should only apply to TIMESTAMP columns', () => {
      const result = rule?.detectInData?.("'2039-01-01'", 'DATETIME');
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// RULE STRUCTURE VALIDATION
// ============================================================================

describe('Rule Structure Validation', () => {
  it('should have unique rule IDs', () => {
    const ids = compatibilityRules.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it('all rules should have required properties', () => {
    for (const rule of compatibilityRules) {
      expect(rule.id).toBeDefined();
      expect(rule.type).toBeDefined();
      expect(rule.category).toBeDefined();
      expect(rule.severity).toBeDefined();
      expect(rule.title).toBeDefined();
      expect(rule.description).toBeDefined();
      expect(rule.suggestion).toBeDefined();
    }
  });

  it('most rules should have either pattern or detectInData/detectInConfig', () => {
    // Some data rules rely on analyzer's specific logic rather than patterns
    const rulesWithoutDetection = ['data_4byte_chars', 'data_null_byte'];
    for (const rule of compatibilityRules) {
      if (rulesWithoutDetection.includes(rule.id)) continue;
      const hasDetection = rule.pattern || rule.detectInData || rule.detectInConfig;
      expect(hasDetection).toBeTruthy();
    }
  });

  it('severity should be valid', () => {
    const validSeverities = ['error', 'warning', 'info'];
    for (const rule of compatibilityRules) {
      expect(validSeverities).toContain(rule.severity);
    }
  });

  it('type should be valid', () => {
    const validTypes = ['schema', 'data', 'query', 'config', 'privilege'];
    for (const rule of compatibilityRules) {
      expect(validTypes).toContain(rule.type);
    }
  });

  it('category should be valid', () => {
    const validCategories = [
      'removedSysVars',
      'newDefaultVars',
      'reservedKeywords',
      'authentication',
      'invalidPrivileges',
      'invalidObjects',
      'dataIntegrity'
    ];
    for (const rule of compatibilityRules) {
      expect(validCategories).toContain(rule.category);
    }
  });
});

// ============================================================================
// CONSTANTS VALIDATION
// ============================================================================

describe('Constants Validation', () => {
  it('should have removed system variables defined', () => {
    expect(REMOVED_SYS_VARS_84.length).toBeGreaterThan(0);
    expect(REMOVED_SYS_VARS_84).toContain('expire_logs_days');
    expect(REMOVED_SYS_VARS_84).toContain('default_authentication_plugin');
  });

  it('should have new reserved keywords defined', () => {
    expect(NEW_RESERVED_KEYWORDS_84.length).toBe(4);
    expect(NEW_RESERVED_KEYWORDS_84).toContain('MANUAL');
    expect(NEW_RESERVED_KEYWORDS_84).toContain('PARALLEL');
    expect(NEW_RESERVED_KEYWORDS_84).toContain('QUALIFY');
    expect(NEW_RESERVED_KEYWORDS_84).toContain('TABLESAMPLE');
  });

  it('should have removed functions defined', () => {
    expect(REMOVED_FUNCTIONS_84.length).toBeGreaterThan(0);
    expect(REMOVED_FUNCTIONS_84).toContain('PASSWORD');
    expect(REMOVED_FUNCTIONS_84).toContain('ENCRYPT');
  });
});
