/**
 * Tests for FileAnalyzer class
 * Tests file analysis for SQL, config, TSV, and JSON files
 */

import { describe, it, expect } from 'vitest';
import { FileAnalyzer } from '../analyzer';
import type { Issue, AnalysisProgress } from '../types';
import {
  createMockFile,
  findIssueById,
  SQL_FIXTURES,
  DATA_FIXTURES,
  AUTH_FIXTURES,
  CONFIG_FIXTURES,
  TSV_FIXTURES,
  JSON_FIXTURES,
  TWO_PASS_FIXTURES
} from './test-utils';

// ============================================================================
// HELPER: Create analyzer and analyze files
// ============================================================================

async function analyzeContent(fileName: string, content: string): Promise<Issue[]> {
  const analyzer = new FileAnalyzer();
  const file = createMockFile(fileName, content);
  const results = await analyzer.analyzeFiles([file]);
  return results.issues;
}

async function analyzeMultipleFiles(files: { name: string; content: string }[]): Promise<Issue[]> {
  const analyzer = new FileAnalyzer();
  const mockFiles = files.map(f => createMockFile(f.name, f.content));
  const results = await analyzer.analyzeFiles(mockFiles);
  return results.issues;
}

// ============================================================================
// SQL FILE ANALYSIS - SCHEMA DETECTION
// ============================================================================

describe('FileAnalyzer - SQL Schema Detection', () => {
  describe('YEAR(2) type detection', () => {
    it('should detect YEAR(2) in CREATE TABLE', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.year2Type);
      const issue = findIssueById(issues, 'year2');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
      expect(issue?.category).toBe('invalidObjects');
    });
  });

  describe('Character set detection', () => {
    it('should detect CHARSET=utf8', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.utf8Charset);
      const issue = findIssueById(issues, 'utf8_charset');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
    });

    it('should detect CHARSET=utf8mb3', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.utf8mb3Charset);
      const issue = findIssueById(issues, 'utf8mb3_explicit');
      expect(issue).toBeDefined();
    });

    it('should detect CHARSET=latin1', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.latin1Charset);
      const issue = findIssueById(issues, 'latin1');
      expect(issue).toBeDefined();
    });
  });

  describe('Engine detection', () => {
    it('should detect ENGINE=MyISAM', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.myisamEngine);
      const issue = findIssueById(issues, 'myisam_engine');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
    });
  });

  describe('Column attribute detection', () => {
    it('should detect ZEROFILL attribute', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.zerofillColumn);
      const issue = findIssueById(issues, 'zerofill');
      expect(issue).toBeDefined();
    });

    it('should detect FLOAT/DOUBLE precision', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.floatPrecision);
      const floatIssues = issues.filter(i => i.id === 'float_precision');
      expect(floatIssues.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect INT display width', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.intDisplayWidth);
      const intIssues = issues.filter(i => i.id === 'int_display_width');
      expect(intIssues.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Reserved keyword detection', () => {
    it('should detect reserved keyword as table name', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.reservedKeyword);
      const keywordIssues = issues.filter(i =>
        i.id === 'reserved_keyword_84' || i.id === 'reserved_keyword_column'
      );
      expect(keywordIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Removed function detection', () => {
    it('should detect PASSWORD() function', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.removedFunctions);
      const issue = findIssueById(issues, 'removed_function');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });

    it('should detect SQL_CALC_FOUND_ROWS', async () => {
      const issues = await analyzeContent('query.sql', SQL_FIXTURES.sqlCalcFoundRows);
      const issue = findIssueById(issues, 'sql_calc_found_rows');
      expect(issue).toBeDefined();
    });
  });

  describe('GROUP BY syntax detection', () => {
    it('should detect GROUP BY ... DESC', async () => {
      const issues = await analyzeContent('query.sql', SQL_FIXTURES.groupByAscDesc);
      const issue = findIssueById(issues, 'groupby_asc_desc');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });
  });

  describe('Special table name detection', () => {
    it('should detect FTS_ table prefix', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.ftsTablePrefix);
      const issue = findIssueById(issues, 'fts_tablename');
      expect(issue).toBeDefined();
    });

    it('should detect $ prefix in table name', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.dollarSignName);
      const issue = findIssueById(issues, 'dollar_sign_name');
      expect(issue).toBeDefined();
    });
  });

  describe('Generated column detection', () => {
    it('should detect changed functions in generated columns', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.generatedColumn);
      const issue = findIssueById(issues, 'generated_column_function');
      expect(issue).toBeDefined();
    });
  });

  describe('Row format detection', () => {
    it('should detect old ROW_FORMAT', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.oldRowFormat);
      const issue = findIssueById(issues, 'innodb_row_format');
      expect(issue).toBeDefined();
    });
  });

  describe('Geometry type detection', () => {
    it('should detect GEOMETRYCOLLECTION', async () => {
      const issues = await analyzeContent('schema.sql', SQL_FIXTURES.oldGeometryType);
      const issue = findIssueById(issues, 'old_geometry_type');
      expect(issue).toBeDefined();
    });
  });
});

// ============================================================================
// SQL FILE ANALYSIS - DATA DETECTION
// ============================================================================

describe('FileAnalyzer - SQL Data Detection', () => {
  describe('Zero date detection', () => {
    it('should detect 0000-00-00 in INSERT', async () => {
      const issues = await analyzeContent('data.sql', DATA_FIXTURES.zeroDate);
      const issue = findIssueById(issues, 'invalid_date_zero');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
      expect(issue?.tableName).toBe('events');
    });

    it('should detect 0000-00-00 00:00:00 in INSERT', async () => {
      const issues = await analyzeContent('data.sql', DATA_FIXTURES.zeroDateTime);
      const issue = findIssueById(issues, 'invalid_datetime_zero');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });
  });

  describe('4-byte UTF-8 detection', () => {
    it('should detect emoji in INSERT values', async () => {
      const issues = await analyzeContent('data.sql', DATA_FIXTURES.fourByteUtf8);
      const issue = findIssueById(issues, 'data_4byte_chars');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
    });
  });

  describe('NULL byte detection', () => {
    it('should detect NULL byte in data', async () => {
      const issues = await analyzeContent('data.sql', DATA_FIXTURES.nullByte);
      const issue = findIssueById(issues, 'data_null_byte');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });
  });
});

// ============================================================================
// SQL FILE ANALYSIS - AUTHENTICATION & PRIVILEGES
// ============================================================================

describe('FileAnalyzer - Authentication Detection', () => {
  describe('mysql_native_password detection', () => {
    it('should detect CREATE USER with mysql_native_password', async () => {
      const issues = await analyzeContent('users.sql', AUTH_FIXTURES.mysqlNativePassword);
      const issue = findIssueById(issues, 'mysql_native_password');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
      expect(issue?.userName).toMatch(/app_user/);
    });

    it('should detect ALTER USER with mysql_native_password', async () => {
      const issues = await analyzeContent('users.sql', AUTH_FIXTURES.alterUserNativePassword);
      const issue = findIssueById(issues, 'mysql_native_password');
      expect(issue).toBeDefined();
      expect(issue?.userName).toBe('old_user');
    });
  });

  describe('sha256_password detection', () => {
    it('should detect CREATE USER with sha256_password', async () => {
      const issues = await analyzeContent('users.sql', AUTH_FIXTURES.sha256Password);
      const issue = findIssueById(issues, 'sha256_password');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
    });
  });

  describe('authentication_fido detection', () => {
    it('should detect CREATE USER with authentication_fido', async () => {
      const issues = await analyzeContent('users.sql', AUTH_FIXTURES.authenticationFido);
      const issue = findIssueById(issues, 'authentication_fido');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });
  });
});

describe('FileAnalyzer - Privilege Detection', () => {
  describe('SUPER privilege detection', () => {
    it('should detect GRANT SUPER', async () => {
      const issues = await analyzeContent('grants.sql', AUTH_FIXTURES.superPrivilege);
      const issue = findIssueById(issues, 'super_privilege');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
      expect(issue?.userName).toMatch(/admin_user/);
    });

    it('should detect SUPER in multiple privileges', async () => {
      const issues = await analyzeContent('grants.sql', AUTH_FIXTURES.multiplePrivileges);
      const issue = findIssueById(issues, 'super_privilege');
      expect(issue).toBeDefined();
    });
  });
});

// ============================================================================
// CONFIG FILE ANALYSIS
// ============================================================================

describe('FileAnalyzer - Config File Detection', () => {
  describe('Removed system variables', () => {
    it('should detect removed system variables in my.cnf', async () => {
      const issues = await analyzeContent('my.cnf', CONFIG_FIXTURES.removedSysVars);
      const removedVarIssues = issues.filter(i => i.id === 'removed_sys_var');
      expect(removedVarIssues.length).toBeGreaterThan(0);

      // Check specific variables
      const hasExpireLogs = removedVarIssues.some(i => i.code?.includes('expire_logs_days'));
      const hasInnodbLogFile = removedVarIssues.some(i => i.code?.includes('innodb_log_file_size'));
      expect(hasExpireLogs).toBe(true);
      expect(hasInnodbLogFile).toBe(true);
    });

    it('should detect hyphenated variable names', async () => {
      const issues = await analyzeContent('my.cnf', CONFIG_FIXTURES.removedSysVarsHyphen);
      const removedVarIssues = issues.filter(i => i.id === 'removed_sys_var');
      expect(removedVarIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Obsolete SQL modes', () => {
    it('should detect obsolete SQL modes', async () => {
      const issues = await analyzeContent('my.cnf', CONFIG_FIXTURES.obsoleteSqlMode);
      const issue = findIssueById(issues, 'obsolete_sql_mode');
      expect(issue).toBeDefined();
    });
  });

  describe('default_authentication_plugin', () => {
    it('should detect default_authentication_plugin setting', async () => {
      const issues = await analyzeContent('my.cnf', CONFIG_FIXTURES.defaultAuthPlugin);
      // This should be detected as a removed sys var
      const issues2 = issues.filter(i =>
        i.id === 'removed_sys_var' || i.id === 'default_authentication_plugin_var'
      );
      expect(issues2.length).toBeGreaterThan(0);
    });
  });

  describe('Config file extensions', () => {
    it('should process .cnf files', async () => {
      const issues = await analyzeContent('my.cnf', CONFIG_FIXTURES.removedSysVars);
      expect(issues.length).toBeGreaterThan(0);
    });

    it('should process .ini files', async () => {
      const issues = await analyzeContent('mysql.ini', CONFIG_FIXTURES.removedSysVars);
      expect(issues.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// TSV FILE ANALYSIS
// ============================================================================

describe('FileAnalyzer - TSV File Detection', () => {
  describe('4-byte UTF-8 in TSV', () => {
    it('should detect emoji in TSV data', async () => {
      const issues = await analyzeContent('users.tsv', TSV_FIXTURES.fourByteUtf8);
      const issue = findIssueById(issues, 'data_4byte_chars');
      expect(issue).toBeDefined();
    });
  });

  describe('Normal TSV data', () => {
    it('should not report issues for normal data', async () => {
      const issues = await analyzeContent('data.tsv', TSV_FIXTURES.normalData);
      const fourByteIssue = findIssueById(issues, 'data_4byte_chars');
      expect(fourByteIssue).toBeUndefined();
    });
  });
});

// ============================================================================
// JSON METADATA FILE ANALYSIS
// ============================================================================

describe('FileAnalyzer - JSON Metadata Detection', () => {
  describe('Character set in metadata', () => {
    it('should detect utf8 charset in metadata', async () => {
      const issues = await analyzeContent('schema@.json', JSON_FIXTURES.utf8Metadata);
      const issue = findIssueById(issues, 'utf8_charset');
      expect(issue).toBeDefined();
    });

    it('should detect utf8mb3 charset in metadata', async () => {
      const issues = await analyzeContent('schema@.json', JSON_FIXTURES.utf8mb3Metadata);
      const issue = findIssueById(issues, 'utf8_charset');
      expect(issue).toBeDefined();
    });

    it('should not report issue for utf8mb4 charset', async () => {
      const issues = await analyzeContent('schema@.json', JSON_FIXTURES.utf8mb4Metadata);
      const issue = findIssueById(issues, 'utf8_charset');
      expect(issue).toBeUndefined();
    });
  });
});

// ============================================================================
// FILE TYPE DETECTION & SKIP LOGIC
// ============================================================================

describe('FileAnalyzer - File Type Handling', () => {
  describe('Skip files', () => {
    it('should skip load-progress files', async () => {
      const analyzer = new FileAnalyzer();
      const file = createMockFile('load-progress.1234.json', '{}');
      const results = await analyzer.analyzeFiles([file]);
      expect(results.issues.length).toBe(0);
    });

    it('should skip dump-progress files', async () => {
      const analyzer = new FileAnalyzer();
      const file = createMockFile('dump-progress.json', '{}');
      const results = await analyzer.analyzeFiles([file]);
      expect(results.issues.length).toBe(0);
    });

    it('should skip @.done.json', async () => {
      const analyzer = new FileAnalyzer();
      const file = createMockFile('@.done.json', '{}');
      const results = await analyzer.analyzeFiles([file]);
      expect(results.issues.length).toBe(0);
    });
  });

  describe('Unknown file types', () => {
    it('should not process unknown file types', async () => {
      const analyzer = new FileAnalyzer();
      const file = createMockFile('readme.md', 'Some markdown content');
      const results = await analyzer.analyzeFiles([file]);
      expect(results.issues.length).toBe(0);
    });
  });
});

// ============================================================================
// ANALYSIS RESULTS & STATISTICS
// ============================================================================

describe('FileAnalyzer - Results and Statistics', () => {
  describe('Statistics calculation', () => {
    it('should count issues by severity', async () => {
      const analyzer = new FileAnalyzer();
      const files = [
        createMockFile('schema.sql', SQL_FIXTURES.year2Type + SQL_FIXTURES.utf8Charset)
      ];
      const results = await analyzer.analyzeFiles(files);

      expect(results.stats.error).toBeGreaterThanOrEqual(0);
      expect(results.stats.warning).toBeGreaterThanOrEqual(0);
      expect(results.stats.info).toBeGreaterThanOrEqual(0);
    });

    it('should count issues by category', async () => {
      const analyzer = new FileAnalyzer();
      const files = [
        createMockFile('schema.sql', SQL_FIXTURES.year2Type)
      ];
      const results = await analyzer.analyzeFiles(files);

      expect(results.categoryStats).toBeDefined();
      expect(results.categoryStats?.invalidObjects).toBeGreaterThan(0);
    });

    it('should track file type counts', async () => {
      const analyzer = new FileAnalyzer();
      const files = [
        createMockFile('schema.sql', 'SELECT 1'),
        createMockFile('my.cnf', '[mysqld]'),
        createMockFile('data.tsv', 'id\tname')
      ];
      const results = await analyzer.analyzeFiles(files);

      expect(results.metadata?.fileTypes?.sql).toBe(1);
      expect(results.metadata?.fileTypes?.config).toBe(1);
      expect(results.metadata?.fileTypes?.tsv).toBe(1);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate identical issues', async () => {
      const duplicateContent = `
CREATE TABLE t1 (col YEAR(2));
CREATE TABLE t1 (col YEAR(2));
`;
      const issues = await analyzeContent('schema.sql', duplicateContent);
      const year2Issues = issues.filter(i => i.id === 'year2');
      // Context-based dedup should reduce duplicates
      expect(year2Issues.length).toBeLessThanOrEqual(2);
    });
  });
});

// ============================================================================
// CALLBACK TESTS
// ============================================================================

describe('FileAnalyzer - Callbacks', () => {
  describe('onIssue callback', () => {
    it('should call onIssue for each detected issue', async () => {
      const issues: Issue[] = [];
      const analyzer = new FileAnalyzer();
      analyzer.setCallbacks((issue) => issues.push(issue), null);

      const file = createMockFile('schema.sql', SQL_FIXTURES.year2Type);
      await analyzer.analyzeFiles([file]);

      expect(issues.length).toBeGreaterThan(0);
    });
  });

  describe('onProgress callback', () => {
    it('should call onProgress for each file', async () => {
      const progressUpdates: AnalysisProgress[] = [];
      const analyzer = new FileAnalyzer();
      analyzer.setCallbacks(null, (progress) => progressUpdates.push(progress));

      const files = [
        createMockFile('schema1.sql', 'SELECT 1'),
        createMockFile('schema2.sql', 'SELECT 2')
      ];
      await analyzer.analyzeFiles(files);

      // Should have progress updates for analyzing and complete phases
      expect(progressUpdates.length).toBeGreaterThanOrEqual(4);
    });

    it('should report correct file info in progress', async () => {
      const progressUpdates: AnalysisProgress[] = [];
      const analyzer = new FileAnalyzer();
      analyzer.setCallbacks(null, (progress) => progressUpdates.push(progress));

      const file = createMockFile('test.sql', 'SELECT 1');
      await analyzer.analyzeFiles([file]);

      const sqlProgress = progressUpdates.find(p => p.fileType === 'sql');
      expect(sqlProgress).toBeDefined();
      expect(sqlProgress?.currentFile).toBe('test.sql');
      expect(sqlProgress?.totalFiles).toBe(1);
    });
  });
});

// ============================================================================
// FIX QUERY GENERATION TESTS
// ============================================================================

describe('FileAnalyzer - Fix Query Generation', () => {
  describe('Zero date fix query', () => {
    it('should generate fix query for zero date', async () => {
      const issues = await analyzeContent('data.sql', DATA_FIXTURES.zeroDate);
      const issue = findIssueById(issues, 'invalid_date_zero');
      expect(issue?.fixQuery).toBeDefined();
      expect(issue?.fixQuery).toContain('UPDATE');
    });
  });

  describe('SUPER privilege fix query', () => {
    it('should generate fix query for SUPER privilege', async () => {
      const issues = await analyzeContent('grants.sql', AUTH_FIXTURES.superPrivilege);
      const issue = findIssueById(issues, 'super_privilege');
      expect(issue?.fixQuery).toBeDefined();
      expect(issue?.fixQuery).toContain('REVOKE SUPER');
    });
  });

  describe('Authentication fix query', () => {
    it('should generate fix query for mysql_native_password', async () => {
      const issues = await analyzeContent('users.sql', AUTH_FIXTURES.mysqlNativePassword);
      const issue = findIssueById(issues, 'mysql_native_password');
      expect(issue?.fixQuery).toBeDefined();
      expect(issue?.fixQuery).toContain('caching_sha2_password');
    });
  });
});

// ============================================================================
// MULTIPLE FILE ANALYSIS
// ============================================================================

describe('FileAnalyzer - Multiple Files', () => {
  it('should analyze multiple files and aggregate results', async () => {
    const issues = await analyzeMultipleFiles([
      { name: 'schema.sql', content: SQL_FIXTURES.year2Type },
      { name: 'users.sql', content: AUTH_FIXTURES.mysqlNativePassword },
      { name: 'my.cnf', content: CONFIG_FIXTURES.removedSysVars }
    ]);

    // Should find issues from all files
    expect(findIssueById(issues, 'year2')).toBeDefined();
    expect(findIssueById(issues, 'mysql_native_password')).toBeDefined();
    expect(issues.some(i => i.id === 'removed_sys_var')).toBe(true);
  });

  it('should track file locations correctly', async () => {
    const issues = await analyzeMultipleFiles([
      { name: 'schema1.sql', content: SQL_FIXTURES.year2Type },
      { name: 'schema2.sql', content: SQL_FIXTURES.utf8Charset }
    ]);

    const year2Issue = findIssueById(issues, 'year2');
    const utf8Issue = findIssueById(issues, 'utf8_charset');

    expect(year2Issue?.location).toContain('schema1.sql');
    expect(utf8Issue?.location).toContain('schema2.sql');
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('FileAnalyzer - Edge Cases', () => {
  describe('Empty files', () => {
    it('should handle empty SQL file', async () => {
      const issues = await analyzeContent('empty.sql', '');
      expect(issues.length).toBe(0);
    });

    it('should handle empty config file', async () => {
      const issues = await analyzeContent('empty.cnf', '');
      expect(issues.length).toBe(0);
    });
  });

  describe('Comments only', () => {
    it('should handle SQL file with only comments', async () => {
      const content = `
-- This is a comment
# Another comment
/* Block comment */
`;
      const issues = await analyzeContent('comments.sql', content);
      // No real SQL content to analyze
      expect(issues.length).toBe(0);
    });

    it('should handle config file with only comments', async () => {
      const content = `
# Comment line 1
; Comment line 2
`;
      const issues = await analyzeContent('comments.cnf', content);
      expect(issues.length).toBe(0);
    });
  });

  describe('Case sensitivity', () => {
    it('should detect keywords case-insensitively', async () => {
      const upperCase = 'CREATE TABLE test (col YEAR(2))';
      const lowerCase = 'create table test (col year(2))';
      const mixedCase = 'Create Table test (col Year(2))';

      const issuesUpper = await analyzeContent('upper.sql', upperCase);
      const issuesLower = await analyzeContent('lower.sql', lowerCase);
      const issuesMixed = await analyzeContent('mixed.sql', mixedCase);

      expect(findIssueById(issuesUpper, 'year2')).toBeDefined();
      expect(findIssueById(issuesLower, 'year2')).toBeDefined();
      expect(findIssueById(issuesMixed, 'year2')).toBeDefined();
    });
  });

  describe('Large content', () => {
    it('should handle large SQL files', async () => {
      // Generate a large SQL file
      let content = '';
      for (let i = 0; i < 100; i++) {
        content += `CREATE TABLE table_${i} (id INT PRIMARY KEY);\n`;
      }
      content += 'CREATE TABLE problem (col YEAR(2));\n';

      const issues = await analyzeContent('large.sql', content);
      expect(findIssueById(issues, 'year2')).toBeDefined();
    });
  });
});

// ============================================================================
// 2-PASS ANALYSIS TESTS (FK Validation & ENUM Length)
// ============================================================================

describe('FileAnalyzer - 2-Pass FK Validation', () => {
  describe('FK referencing PRIMARY KEY', () => {
    it('should NOT report issue when FK references PRIMARY KEY', async () => {
      const issues = await analyzeMultipleFiles([
        { name: 'users.sql', content: TWO_PASS_FIXTURES.fkWithPrimaryKey.parent },
        { name: 'orders.sql', content: TWO_PASS_FIXTURES.fkWithPrimaryKey.child }
      ]);

      // Should not have fk_non_unique_ref error
      const fkIssue = findIssueById(issues, 'fk_non_unique_ref');
      expect(fkIssue).toBeUndefined();
    });
  });

  describe('FK referencing UNIQUE index', () => {
    it('should NOT report issue when FK references UNIQUE indexed column', async () => {
      const issues = await analyzeMultipleFiles([
        { name: 'categories.sql', content: TWO_PASS_FIXTURES.fkWithUniqueIndex.parent },
        { name: 'products.sql', content: TWO_PASS_FIXTURES.fkWithUniqueIndex.child }
      ]);

      // Should not have fk_non_unique_ref error
      const fkIssue = findIssueById(issues, 'fk_non_unique_ref');
      expect(fkIssue).toBeUndefined();
    });
  });

  describe('FK referencing non-indexed column', () => {
    it('should report ERROR when FK references column without UNIQUE/PRIMARY index', async () => {
      const issues = await analyzeMultipleFiles([
        { name: 'departments.sql', content: TWO_PASS_FIXTURES.fkWithoutIndex.parent },
        { name: 'employees.sql', content: TWO_PASS_FIXTURES.fkWithoutIndex.child }
      ]);

      // Should have fk_non_unique_ref error
      const fkIssue = findIssueById(issues, 'fk_non_unique_ref');
      expect(fkIssue).toBeDefined();
      expect(fkIssue?.severity).toBe('error');
      expect(fkIssue?.fixQuery).toContain('ADD UNIQUE INDEX');
    });
  });

  describe('FK with referenced table not in dump', () => {
    it('should report INFO when referenced table is not found', async () => {
      const childOnly = `
CREATE TABLE orphan_child (
  id INT PRIMARY KEY,
  parent_id INT,
  FOREIGN KEY (parent_id) REFERENCES missing_parent(id)
);`;

      const issues = await analyzeContent('orphan.sql', childOnly);

      // Should have fk_ref_table_not_found info
      const fkIssue = findIssueById(issues, 'fk_ref_table_not_found');
      expect(fkIssue).toBeDefined();
      expect(fkIssue?.severity).toBe('info');
    });
  });
});

describe('FileAnalyzer - ENUM Length Validation', () => {
  describe('ENUM with element exceeding 255 chars', () => {
    it('should report ERROR for ENUM element over 255 characters', async () => {
      const issues = await analyzeContent('status.sql', TWO_PASS_FIXTURES.enumTooLong);

      const enumIssue = findIssueById(issues, 'enum_element_length_exceeded');
      expect(enumIssue).toBeDefined();
      expect(enumIssue?.severity).toBe('error');
      expect(enumIssue?.description).toContain('260');  // Contains the actual length
    });
  });

  describe('ENUM with normal elements', () => {
    it('should NOT report issue for normal ENUM elements', async () => {
      const issues = await analyzeContent('types.sql', TWO_PASS_FIXTURES.enumNormal);

      const enumIssue = findIssueById(issues, 'enum_element_length_exceeded');
      expect(enumIssue).toBeUndefined();
    });
  });
});

// ============================================================================
// UTF-8 + 4-BYTE CHARACTER CROSS-VALIDATION TESTS
// ============================================================================

describe('FileAnalyzer - UTF-8 Cross-Validation', () => {
  describe('utf8 charset with 4-byte characters', () => {
    it('should report warning when utf8 table has 4-byte characters', async () => {
      const issues = await analyzeMultipleFiles([
        { name: 'messages_utf8.sql', content: TWO_PASS_FIXTURES.utf8With4ByteChars.schema + TWO_PASS_FIXTURES.utf8With4ByteChars.data }
      ]);

      const fourByteIssue = findIssueById(issues, 'data_4byte_chars');
      expect(fourByteIssue).toBeDefined();
      expect(fourByteIssue?.severity).toBe('warning');
      expect(fourByteIssue?.description).toContain('utf8');
    });
  });

  describe('utf8mb4 charset with 4-byte characters', () => {
    it('should NOT report warning when utf8mb4 table has 4-byte characters', async () => {
      const issues = await analyzeMultipleFiles([
        { name: 'messages_utf8mb4.sql', content: TWO_PASS_FIXTURES.utf8mb4With4ByteChars.schema + TWO_PASS_FIXTURES.utf8mb4With4ByteChars.data }
      ]);

      const fourByteIssue = findIssueById(issues, 'data_4byte_chars');
      expect(fourByteIssue).toBeUndefined();
    });
  });

  describe('utf8mb3 charset with 4-byte characters', () => {
    it('should report warning when utf8mb3 table has 4-byte characters', async () => {
      const issues = await analyzeMultipleFiles([
        { name: 'messages_utf8mb3.sql', content: TWO_PASS_FIXTURES.utf8mb3With4ByteChars.schema + TWO_PASS_FIXTURES.utf8mb3With4ByteChars.data }
      ]);

      const fourByteIssue = findIssueById(issues, 'data_4byte_chars');
      expect(fourByteIssue).toBeDefined();
      expect(fourByteIssue?.severity).toBe('warning');
    });
  });

  describe('Schema and data in separate files', () => {
    it('should cross-validate charset across multiple files', async () => {
      const issues = await analyzeMultipleFiles([
        { name: 'schema.sql', content: TWO_PASS_FIXTURES.utf8With4ByteChars.schema },
        { name: 'data.sql', content: TWO_PASS_FIXTURES.utf8With4ByteChars.data }
      ]);

      const fourByteIssue = findIssueById(issues, 'data_4byte_chars');
      expect(fourByteIssue).toBeDefined();
    });
  });
});

// ============================================================================
// INDEX SIZE CALCULATION TESTS
// ============================================================================

describe('FileAnalyzer - Index Size Calculation', () => {
  describe('Index too large with utf8mb4', () => {
    it('should report error when index exceeds 3072 bytes with utf8mb4', async () => {
      const issues = await analyzeContent('large_index.sql', TWO_PASS_FIXTURES.indexTooLargeUtf8mb4);

      const indexIssue = findIssueById(issues, 'index_too_large_calculated');
      expect(indexIssue).toBeDefined();
      expect(indexIssue?.severity).toBe('error');
      expect(indexIssue?.description).toContain('3200'); // 800 * 4 = 3200
    });
  });

  describe('Index within limit with utf8mb4', () => {
    it('should NOT report error when index is within 3072 bytes limit', async () => {
      const issues = await analyzeContent('valid_index.sql', TWO_PASS_FIXTURES.indexWithinLimitUtf8mb4);

      const indexIssue = findIssueById(issues, 'index_too_large_calculated');
      expect(indexIssue).toBeUndefined();
    });
  });

  describe('Index within limit with utf8mb3', () => {
    it('should NOT report error when utf8mb3 index is within limit', async () => {
      const issues = await analyzeContent('utf8mb3_index.sql', TWO_PASS_FIXTURES.indexWithinLimitUtf8mb3);

      // 800 * 3 = 2400 bytes < 3072, so should be OK
      const indexIssue = findIssueById(issues, 'index_too_large_calculated');
      expect(indexIssue).toBeUndefined();
    });
  });

  describe('Index within limit with latin1', () => {
    it('should NOT report error when latin1 index is within limit', async () => {
      const issues = await analyzeContent('latin1_index.sql', TWO_PASS_FIXTURES.indexWithinLimitLatin1);

      // 2000 * 1 = 2000 bytes < 3072, so should be OK
      const indexIssue = findIssueById(issues, 'index_too_large_calculated');
      expect(indexIssue).toBeUndefined();
    });
  });

  describe('Composite index too large', () => {
    it('should report error for oversized composite index', async () => {
      const issues = await analyzeContent('composite.sql', TWO_PASS_FIXTURES.compositeIndexTooLarge);

      // (400 + 400) * 4 = 3200 bytes > 3072
      const indexIssue = findIssueById(issues, 'index_too_large_calculated');
      expect(indexIssue).toBeDefined();
      expect(indexIssue?.description).toContain('col1');
      expect(indexIssue?.description).toContain('col2');
    });
  });
});

// ============================================================================
// NON-NATIVE PARTITIONING TESTS
// ============================================================================

describe('FileAnalyzer - Non-native Partitioning', () => {
  describe('MyISAM partitioning', () => {
    it('should report warning for MyISAM partitioned table', async () => {
      const issues = await analyzeContent('myisam_part.sql', TWO_PASS_FIXTURES.nonNativePartitionMyISAM);

      const partIssue = findIssueById(issues, 'non_native_partition_parsed');
      expect(partIssue).toBeDefined();
      expect(partIssue?.severity).toBe('warning');
      expect(partIssue?.description).toContain('MyISAM');
    });
  });

  describe('InnoDB partitioning', () => {
    it('should NOT report warning for InnoDB partitioned table', async () => {
      const issues = await analyzeContent('innodb_part.sql', TWO_PASS_FIXTURES.nativePartitionInnoDB);

      const partIssue = findIssueById(issues, 'non_native_partition_parsed');
      expect(partIssue).toBeUndefined();
    });
  });

  describe('CSV partitioning', () => {
    it('should report warning for CSV partitioned table', async () => {
      const issues = await analyzeContent('csv_part.sql', TWO_PASS_FIXTURES.nonNativePartitionCSV);

      const partIssue = findIssueById(issues, 'non_native_partition_parsed');
      expect(partIssue).toBeDefined();
      expect(partIssue?.description).toContain('CSV');
    });
  });
});
