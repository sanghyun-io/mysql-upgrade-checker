/**
 * SQL Escape Security Regression Tests
 *
 * Tests for escapeIdentifier / escapeStringValue utilities,
 * and verifies that strategy files properly handle malicious
 * table/column/user names to prevent SQL injection.
 */

import { describe, it, expect } from 'vitest';
import { escapeIdentifier, escapeStringValue } from '../security/sql-escape';
import { generateFixOptions } from '../fix-options/generator';
import type { Issue } from '../types';

// ---------------------------------------------------------------------------
// escapeIdentifier unit tests
// ---------------------------------------------------------------------------

describe('escapeIdentifier', () => {
  it('wraps a normal identifier in backticks', () => {
    expect(escapeIdentifier('users')).toBe('`users`');
  });

  it('escapes an embedded backtick by doubling it', () => {
    expect(escapeIdentifier('my`table')).toBe('`my``table`');
  });

  it('escapes multiple embedded backticks', () => {
    expect(escapeIdentifier('a`b`c')).toBe('`a``b``c`');
  });

  it('handles a name that is only backticks', () => {
    // Input: one backtick character '`'
    // escapeIdentifier doubles it → '``', then wraps in backticks → '`' + '``' + '`' = 4 backticks
    const result = escapeIdentifier('`');
    expect(result).toBe('`' + '``' + '`');
  });

  it('handles names with single quotes', () => {
    // Single quotes in identifiers do not need special treatment — only backticks do
    const result = escapeIdentifier("user's_table");
    expect(result).toBe("`user's_table`");
  });

  it('handles names with semicolons (SQL injection attempt)', () => {
    const malicious = 'users; DROP TABLE users --';
    const result = escapeIdentifier(malicious);
    expect(result).toBe('`users; DROP TABLE users --`');
    // The semicolon and SQL are inside backticks and treated as part of the identifier name
  });

  it('handles empty string', () => {
    expect(escapeIdentifier('')).toBe('``');
  });

  it('handles names with double quotes', () => {
    expect(escapeIdentifier('col"name')).toBe('`col"name`');
  });

  it('handles names with newlines and whitespace', () => {
    const result = escapeIdentifier('col\nname');
    expect(result).toBe('`col\nname`');
  });

  it('handles a classic injection pattern with backtick inside', () => {
    // Attacker tries to break out of backtick quoting
    const malicious = 'users`; DROP TABLE users; --';
    const result = escapeIdentifier(malicious);
    // Backtick is doubled, so it's safely embedded
    expect(result).toBe('`users``; DROP TABLE users; --`');
    // Must NOT contain an unescaped unmatched backtick sequence
    const inner = result.slice(1, -1); // strip outer backticks
    // All backticks inside should appear in pairs
    const singleBacktickRe = /(?<!`)`(?!`)/g;
    expect(inner.match(singleBacktickRe)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// escapeStringValue unit tests
// ---------------------------------------------------------------------------

describe('escapeStringValue', () => {
  it('wraps a normal value in single quotes', () => {
    expect(escapeStringValue('hello')).toBe("'hello'");
  });

  it('escapes embedded single quotes by doubling them', () => {
    expect(escapeStringValue("O'Brien")).toBe("'O''Brien'");
  });

  it('handles empty string', () => {
    expect(escapeStringValue('')).toBe("''");
  });

  it('handles value with semicolons', () => {
    expect(escapeStringValue('val; DROP TABLE --')).toBe("'val; DROP TABLE --'");
  });

  it('handles value with backticks (no escaping needed in string values)', () => {
    expect(escapeStringValue('val`name')).toBe("'val`name'");
  });

  it('handles value with multiple single quotes', () => {
    // Input: "it's a ''test''" — 5 single quotes: positions after t, before test (×2), after test (×2)
    // Each ' → '', so 5 quotes become 10 doubled-up quotes in the body
    // Wrapped: 'it''s a ''''test'''''
    expect(escapeStringValue("it's a ''test''")).toBe("'it''s a ''''test'''''");
  });
});

// ---------------------------------------------------------------------------
// Strategy integration tests — malicious identifier in generated SQL
// ---------------------------------------------------------------------------

/** Helper: create a minimal issue */
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

/**
 * Verifies that no unescaped injection payload appears in generated SQL.
 * We check that the raw malicious string does NOT appear verbatim in the SQL,
 * and that any occurrence of the identifier name is inside a backtick-escaped form.
 */
function assertNoRawInjection(sql: string, maliciousName: string): void {
  // The raw malicious string should NOT appear literally in output
  // (it should appear only inside backtick-escaped form)
  const escaped = '`' + maliciousName.replace(/`/g, '``') + '`';
  if (sql.includes(maliciousName)) {
    // It's acceptable only if every occurrence is part of the escaped form
    let remaining = sql;
    while (remaining.includes(escaped)) {
      remaining = remaining.replace(escaped, '');
    }
    expect(remaining).not.toContain(maliciousName);
  }
}

describe('SQL injection regression tests — strategy files', () => {
  const maliciousTable = 'users`; DROP TABLE users; --';
  const maliciousColumn = 'col`; DELETE FROM mysql.user; --';
  const maliciousUser = 'admin`; GRANT ALL ON *.* TO evil@%;--';

  describe('engine-fix: malicious table name', () => {
    it('does not inject raw table name into SQL', () => {
      const issue = makeIssue({
        id: 'myisam_engine',
        tableName: maliciousTable,
        matchedText: 'MyISAM',
      });
      const options = generateFixOptions(issue);
      for (const opt of options) {
        if (opt.sqlTemplate) {
          assertNoRawInjection(opt.sqlTemplate, maliciousTable);
          // Backtick escaping must be present
          expect(opt.sqlTemplate).toContain('``');
        }
      }
    });
  });

  describe('date-fix: malicious table and column names', () => {
    it('does not inject raw table name into SQL', () => {
      const issue = makeIssue({
        id: 'invalid_date_zero',
        tableName: maliciousTable,
        columnName: 'created_at',
        columnContext: { nullable: true, hasDefault: false },
      });
      const options = generateFixOptions(issue);
      for (const opt of options) {
        if (opt.sqlTemplate && !opt.sqlTemplate.startsWith('--')) {
          assertNoRawInjection(opt.sqlTemplate, maliciousTable);
        }
      }
    });

    it('does not inject raw column name into SQL', () => {
      const issue = makeIssue({
        id: 'invalid_date_zero',
        tableName: 'orders',
        columnName: maliciousColumn,
        columnContext: { nullable: true, hasDefault: false },
      });
      const options = generateFixOptions(issue);
      for (const opt of options) {
        if (opt.sqlTemplate) {
          assertNoRawInjection(opt.sqlTemplate, maliciousColumn);
        }
      }
    });
  });

  describe('charset-fix: malicious table name', () => {
    it('does not inject raw table name for single-table conversion', () => {
      const issue = makeIssue({
        id: 'utf8_charset',
        tableName: maliciousTable,
      });
      const options = generateFixOptions(issue);
      for (const opt of options) {
        if (opt.sqlTemplate) {
          assertNoRawInjection(opt.sqlTemplate, maliciousTable);
        }
      }
    });

    it('does not inject raw related table names in FK cascade SQL', () => {
      const maliciousRelated = 'products`; TRUNCATE TABLE orders; --';
      const issue = makeIssue({
        id: 'utf8_charset',
        tableName: 'orders',
        fkContext: {
          relatedTables: [maliciousRelated],
          isChildTable: true,
        },
      });
      const options = generateFixOptions(issue);
      const cascadeOpt = options.find(o => o.strategy === 'collation_fk_cascade');
      if (cascadeOpt?.sqlTemplate) {
        assertNoRawInjection(cascadeOpt.sqlTemplate, maliciousRelated);
      }
    });
  });

  describe('type-fix: malicious table and column names', () => {
    it('does not inject raw table/column names into SQL', () => {
      const issue = makeIssue({
        id: 'float_double_precision',
        tableName: maliciousTable,
        columnName: maliciousColumn,
        columnType: 'FLOAT(10, 2)',
      });
      const options = generateFixOptions(issue);
      for (const opt of options) {
        if (opt.sqlTemplate) {
          assertNoRawInjection(opt.sqlTemplate, maliciousTable);
          assertNoRawInjection(opt.sqlTemplate, maliciousColumn);
        }
      }
    });
  });

  describe('keyword-fix: malicious table name', () => {
    it('does not inject raw table name into SQL', () => {
      const issue = makeIssue({
        id: 'reserved_keyword_table_parsed',
        tableName: maliciousTable,
      });
      const options = generateFixOptions(issue);
      for (const opt of options) {
        if (opt.sqlTemplate) {
          assertNoRawInjection(opt.sqlTemplate, maliciousTable);
        }
      }
    });

    it('does not inject raw column name into SQL', () => {
      const issue = makeIssue({
        id: 'reserved_keyword_column_parsed',
        tableName: 'users',
        columnName: maliciousColumn,
      });
      const options = generateFixOptions(issue);
      for (const opt of options) {
        if (opt.sqlTemplate) {
          assertNoRawInjection(opt.sqlTemplate, maliciousColumn);
        }
      }
    });
  });

  describe('auth-fix: malicious user name', () => {
    it('does not inject raw user name into SQL', () => {
      const issue = makeIssue({
        id: 'mysql_native_password',
        userName: maliciousUser,
      });
      const options = generateFixOptions(issue);
      for (const opt of options) {
        if (opt.sqlTemplate) {
          assertNoRawInjection(opt.sqlTemplate, maliciousUser);
        }
        if (opt.rollbackTemplate) {
          assertNoRawInjection(opt.rollbackTemplate, maliciousUser);
        }
      }
    });

    it('does not inject raw user name for sha256_password', () => {
      const issue = makeIssue({
        id: 'sha256_password',
        userName: maliciousUser,
      });
      const options = generateFixOptions(issue);
      for (const opt of options) {
        if (opt.sqlTemplate) {
          assertNoRawInjection(opt.sqlTemplate, maliciousUser);
        }
      }
    });
  });

  describe('normal names still produce valid SQL structure', () => {
    it('engine-fix with normal table produces ALTER TABLE with backtick-wrapped name', () => {
      const issue = makeIssue({
        id: 'myisam_engine',
        tableName: 'legacy_data',
        matchedText: 'MyISAM',
      });
      const options = generateFixOptions(issue);
      const convertOpt = options.find(o => o.strategy === 'engine_convert');
      expect(convertOpt?.sqlTemplate).toBe('ALTER TABLE `legacy_data` ENGINE=InnoDB;');
    });

    it('date-fix with normal names produces UPDATE with backtick-wrapped identifiers', () => {
      const issue = makeIssue({
        id: 'invalid_date_zero',
        tableName: 'orders',
        columnName: 'created_at',
        columnContext: { nullable: false, hasDefault: false },
      });
      const options = generateFixOptions(issue);
      const minOpt = options.find(o => o.strategy === 'date_to_min');
      expect(minOpt?.sqlTemplate).toContain('`orders`');
      expect(minOpt?.sqlTemplate).toContain('`created_at`');
    });

    it('auth-fix with normal user produces ALTER USER with backtick-wrapped user', () => {
      const issue = makeIssue({
        id: 'mysql_native_password',
        userName: 'app_user',
      });
      const options = generateFixOptions(issue);
      const authOpt = options.find(o => o.strategy === 'auth_change');
      expect(authOpt?.sqlTemplate).toContain('`app_user`');
    });
  });
});
