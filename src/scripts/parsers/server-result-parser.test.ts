/**
 * Server Result Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseTabSeparatedResult,
  parseJsonResult,
  parseServerResult
} from './server-result-parser';

describe('parseTabSeparatedResult', () => {
  it('should parse simple TSV data', () => {
    const tsv = `User\tHost\tplugin
root\tlocalhost\tcaching_sha2_password
admin\t%\tmysql_native_password`;

    const result = parseTabSeparatedResult(tsv);

    expect(result.columns).toEqual(['User', 'Host', 'plugin']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      User: 'root',
      Host: 'localhost',
      plugin: 'caching_sha2_password'
    });
    expect(result.rows[1]).toEqual({
      User: 'admin',
      Host: '%',
      plugin: 'mysql_native_password'
    });
  });

  it('should handle NULL values', () => {
    const tsv = `col1\tcol2\tcol3
value1\tNULL\tvalue3
NULL\tvalue2\t`;

    const result = parseTabSeparatedResult(tsv);

    expect(result.rows[0].col2).toBeNull();
    expect(result.rows[1].col1).toBeNull();
    expect(result.rows[1].col3).toBeNull();
  });

  it('should parse numeric values', () => {
    const tsv = `name\tcount\tprice
item1\t10\t99.99`;

    const result = parseTabSeparatedResult(tsv);

    expect(result.rows[0].count).toBe(10);
    expect(result.rows[0].price).toBe(99.99);
  });

  it('should handle empty input', () => {
    const result = parseTabSeparatedResult('');
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });
});

describe('parseJsonResult', () => {
  it('should parse JSON with columns and rows', () => {
    const json = JSON.stringify({
      columns: ['User', 'Host', 'plugin'],
      rows: [
        { User: 'root', Host: 'localhost', plugin: 'caching_sha2_password' },
        { User: 'admin', Host: '%', plugin: 'mysql_native_password' }
      ]
    });

    const result = parseJsonResult(json);

    expect(result.columns).toEqual(['User', 'Host', 'plugin']);
    expect(result.rows).toHaveLength(2);
  });

  it('should parse JSON array of objects', () => {
    const json = JSON.stringify([
      { User: 'root', Host: 'localhost', plugin: 'caching_sha2_password' },
      { User: 'admin', Host: '%', plugin: 'mysql_native_password' }
      ]);

    const result = parseJsonResult(json);

    expect(result.columns).toEqual(['User', 'Host', 'plugin']);
    expect(result.rows).toHaveLength(2);
  });

  it('should handle empty array', () => {
    const result = parseJsonResult('[]');
    expect(result.columns).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('should throw error on invalid JSON', () => {
    expect(() => parseJsonResult('invalid json')).toThrow('Invalid JSON format');
  });
});

describe('parseServerResult', () => {
  it('should auto-detect and parse JSON', () => {
    const json = JSON.stringify([
      { User: 'root', Host: 'localhost', plugin: 'caching_sha2_password' }
    ]);

    const result = parseServerResult(json);

    expect(result.columns).toContain('User');
    expect(result.rows).toHaveLength(1);
  });

  it('should auto-detect and parse TSV', () => {
    const tsv = `User\tHost\tplugin
root\tlocalhost\tcaching_sha2_password`;

    const result = parseServerResult(tsv);

    expect(result.columns).toEqual(['User', 'Host', 'plugin']);
    expect(result.rows).toHaveLength(1);
  });

  it('should parse system variable query result', () => {
    const tsv = `VARIABLE_NAME\tVARIABLE_VALUE
replica_parallel_workers\t0
innodb_adaptive_hash_index\tON`;

    const result = parseServerResult(tsv);

    expect(result.columns).toEqual(['VARIABLE_NAME', 'VARIABLE_VALUE']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].VARIABLE_NAME).toBe('replica_parallel_workers');
    expect(result.rows[0].VARIABLE_VALUE).toBe(0);
  });

  it('should parse combined query result with check_type', () => {
    const tsv = `check_type\tUser\tHost\tplugin
user_auth\troot\tlocalhost\tcaching_sha2_password
user_auth\tadmin\t%\tmysql_native_password`;

    const result = parseServerResult(tsv);

    expect(result.columns).toContain('check_type');
    expect(result.rows).toHaveLength(2);
  });
});
