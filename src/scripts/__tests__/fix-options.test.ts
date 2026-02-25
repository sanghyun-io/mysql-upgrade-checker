/**
 * Fix Options Generator & Recommender Tests
 */

import { describe, it, expect } from 'vitest';
import { generateFixOptions, enrichIssuesWithFixOptions } from '../fix-options/generator';
import type { Issue } from '../types';

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

describe('generateFixOptions', () => {
  describe('date fix strategies', () => {
    it('should generate 3 options for nullable date column', () => {
      const issue = makeIssue({
        id: 'invalid_date_zero',
        tableName: 'orders',
        columnName: 'created_at',
        columnContext: { nullable: true, hasDefault: false },
      });

      const options = generateFixOptions(issue);
      expect(options.length).toBe(3);
      expect(options.map(o => o.strategy)).toContain('date_to_null');
      expect(options.map(o => o.strategy)).toContain('date_to_min');
      expect(options.map(o => o.strategy)).toContain('date_to_custom');
    });

    it('should generate 2 options for NOT NULL date column (no NULL option)', () => {
      const issue = makeIssue({
        id: 'invalid_date_zero',
        tableName: 'orders',
        columnName: 'created_at',
        columnContext: { nullable: false, hasDefault: false },
      });

      const options = generateFixOptions(issue);
      expect(options.length).toBe(2);
      expect(options.map(o => o.strategy)).not.toContain('date_to_null');
    });

    it('should handle datetime type', () => {
      const issue = makeIssue({
        id: 'invalid_datetime_zero',
        tableName: 'events',
        columnName: 'event_time',
        columnContext: { nullable: true, hasDefault: false },
      });

      const options = generateFixOptions(issue);
      const minDateOpt = options.find(o => o.strategy === 'date_to_min');
      expect(minDateOpt?.sqlTemplate).toContain('1000-01-01 00:00:00');
    });
  });

  describe('charset fix strategies', () => {
    it('should generate single conversion option for table without FK', () => {
      const issue = makeIssue({
        id: 'utf8_charset',
        tableName: 'logs',
      });

      const options = generateFixOptions(issue);
      expect(options.some(o => o.strategy === 'collation_single')).toBe(true);
      expect(options.some(o => o.strategy === 'collation_fk_cascade')).toBe(false);
    });

    it('should generate FK cascade options for table with FK relations', () => {
      const issue = makeIssue({
        id: 'utf8_charset',
        tableName: 'orders',
        fkContext: {
          relatedTables: ['users', 'products'],
          isChildTable: true,
        },
      });

      const options = generateFixOptions(issue);
      expect(options.some(o => o.strategy === 'collation_fk_cascade')).toBe(true);
      expect(options.some(o => o.strategy === 'collation_fk_safe')).toBe(true);
      expect(options.some(o => o.strategy === 'skip')).toBe(true);
    });

    it('should include related table names in FK cascade SQL', () => {
      const issue = makeIssue({
        id: 'utf8_charset',
        tableName: 'orders',
        fkContext: {
          relatedTables: ['users'],
          isChildTable: true,
        },
      });

      const options = generateFixOptions(issue);
      const cascadeOpt = options.find(o => o.strategy === 'collation_fk_cascade');
      expect(cascadeOpt?.sqlTemplate).toContain('users');
      expect(cascadeOpt?.sqlTemplate).toContain('FOREIGN_KEY_CHECKS');
    });
  });

  describe('engine fix strategies', () => {
    it('should generate InnoDB conversion option', () => {
      const issue = makeIssue({
        id: 'myisam_engine',
        tableName: 'legacy_data',
        matchedText: 'MyISAM',
      });

      const options = generateFixOptions(issue);
      expect(options.length).toBe(2);
      expect(options[0].strategy).toBe('engine_convert');
      expect(options[0].sqlTemplate).toContain('ENGINE=InnoDB');
    });
  });

  describe('keyword fix strategies', () => {
    it('should generate rename and backtick options for table', () => {
      const issue = makeIssue({
        id: 'reserved_keyword_table_parsed',
        tableName: 'RANK',
      });

      const options = generateFixOptions(issue);
      expect(options.some(o => o.strategy === 'rename')).toBe(true);
      expect(options.some(o => o.strategy === 'backtick_quote')).toBe(true);
    });

    it('should generate rename and backtick options for column', () => {
      const issue = makeIssue({
        id: 'reserved_keyword_column_parsed',
        tableName: 'users',
        columnName: 'RANK',
      });

      const options = generateFixOptions(issue);
      expect(options.length).toBe(2);
      expect(options[0].strategy).toBe('rename');
    });
  });

  describe('auth fix strategies', () => {
    it('should generate caching_sha2_password option for mysql_native_password', () => {
      const issue = makeIssue({
        id: 'mysql_native_password',
        userName: 'app_user',
      });

      const options = generateFixOptions(issue);
      expect(options[0].strategy).toBe('auth_change');
      expect(options[0].sqlTemplate).toContain('caching_sha2_password');
    });

    it('should generate webauthn option for authentication_fido', () => {
      const issue = makeIssue({
        id: 'authentication_fido',
        userName: 'fido_user',
      });

      const options = generateFixOptions(issue);
      expect(options[0].sqlTemplate).toContain('authentication_webauthn');
    });
  });

  describe('type fix strategies', () => {
    it('should generate FLOAT and DECIMAL options', () => {
      const issue = makeIssue({
        id: 'float_double_precision',
        tableName: 'measurements',
        columnName: 'value',
        columnType: 'FLOAT(10, 2)',
      });

      const options = generateFixOptions(issue);
      expect(options.length).toBe(2);
      expect(options[0].sqlTemplate).toContain('FLOAT');
      expect(options[1].sqlTemplate).toContain('DECIMAL(10,2)');
    });
  });

  describe('fallback behavior', () => {
    it('should wrap existing fixQuery as single option for unknown issue types', () => {
      const issue = makeIssue({
        id: 'some_custom_rule',
        fixQuery: 'ALTER TABLE foo ADD INDEX idx_bar (bar);',
      });

      const options = generateFixOptions(issue);
      expect(options.length).toBe(1);
      expect(options[0].strategy).toBe('manual');
      expect(options[0].sqlTemplate).toContain('ALTER TABLE foo');
      expect(options[0].isRecommended).toBe(true);
    });

    it('should return empty array for issues without fix', () => {
      const issue = makeIssue({ id: 'info_only_issue' });
      const options = generateFixOptions(issue);
      expect(options.length).toBe(0);
    });
  });
});

describe('applyRecommendation', () => {
  it('should recommend date_to_null for nullable date issues', () => {
    const issue = makeIssue({
      id: 'invalid_date_zero',
      columnContext: { nullable: true, hasDefault: false },
    });
    const options = generateFixOptions(issue);
    const recommended = options.find(o => o.isRecommended);
    expect(recommended?.strategy).toBe('date_to_null');
  });

  it('should recommend date_to_min for NOT NULL date issues', () => {
    const issue = makeIssue({
      id: 'invalid_date_zero',
      columnContext: { nullable: false, hasDefault: false },
    });
    const options = generateFixOptions(issue);
    const recommended = options.find(o => o.isRecommended);
    expect(recommended?.strategy).toBe('date_to_min');
  });

  it('should recommend collation_single for charset issues without FK', () => {
    const issue = makeIssue({ id: 'utf8_charset', tableName: 'logs' });
    const options = generateFixOptions(issue);
    const recommended = options.find(o => o.isRecommended);
    expect(recommended?.strategy).toBe('collation_single');
  });

  it('should recommend collation_fk_safe for charset issues with FK', () => {
    const issue = makeIssue({
      id: 'utf8_charset',
      tableName: 'orders',
      fkContext: { relatedTables: ['users'], isChildTable: true },
    });
    const options = generateFixOptions(issue);
    const recommended = options.find(o => o.isRecommended);
    expect(recommended?.strategy).toBe('collation_fk_safe');
  });

  it('should recommend engine_convert for MyISAM', () => {
    const issue = makeIssue({ id: 'myisam_engine', tableName: 'legacy', matchedText: 'MyISAM' });
    const options = generateFixOptions(issue);
    const recommended = options.find(o => o.isRecommended);
    expect(recommended?.strategy).toBe('engine_convert');
  });

  it('should recommend backtick_quote for reserved keywords', () => {
    const issue = makeIssue({
      id: 'reserved_keyword_table_parsed',
      tableName: 'RANK',
    });
    const options = generateFixOptions(issue);
    const recommended = options.find(o => o.isRecommended);
    expect(recommended?.strategy).toBe('backtick_quote');
  });

  it('should recommend auth_change for mysql_native_password', () => {
    const issue = makeIssue({ id: 'mysql_native_password', userName: 'user1' });
    const options = generateFixOptions(issue);
    const recommended = options.find(o => o.isRecommended);
    expect(recommended?.strategy).toBe('auth_change');
  });
});

describe('enrichIssuesWithFixOptions', () => {
  it('should add fix options to all enrichable issues', () => {
    const issues: Issue[] = [
      makeIssue({ id: 'invalid_date_zero', tableName: 'orders', columnName: 'date', columnContext: { nullable: true, hasDefault: false } }),
      makeIssue({ id: 'utf8_charset', tableName: 'logs' }),
      makeIssue({ id: 'info_only_issue' }), // no fix available
    ];

    enrichIssuesWithFixOptions(issues);

    expect(issues[0].fixOptions!.length).toBeGreaterThan(0);
    expect(issues[1].fixOptions!.length).toBeGreaterThan(0);
    expect(issues[2].fixOptions).toBeUndefined();
  });

  it('should not overwrite existing fix options', () => {
    const existingOptions = [{
      strategy: 'manual' as const,
      label: 'Existing',
      description: 'Already set',
      sqlTemplate: 'SELECT 1',
      isRecommended: true,
      effort: 'low' as const,
      risk: 'low' as const,
      impact: 'none',
      reversibility: 'reversible' as const,
    }];

    const issues: Issue[] = [
      makeIssue({ id: 'invalid_date_zero', fixOptions: existingOptions }),
    ];

    enrichIssuesWithFixOptions(issues);

    expect(issues[0].fixOptions).toBe(existingOptions);
    expect(issues[0].fixOptions!.length).toBe(1);
  });
});
