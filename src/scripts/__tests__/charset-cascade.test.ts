/**
 * Charset Cascade Analysis Tests
 *
 * Tests for charset/collation mismatch detection across FK relationships.
 */

import { describe, it, expect } from 'vitest';
import { FKGraphBuilder } from '../analysis/fk-graph';
import { analyzeCharsetCascade } from '../analysis/charset-cascade';
import type { TableInfo } from '../types';

function makeTable(
  name: string,
  opts: {
    charset?: string;
    collation?: string;
    columns?: Array<{
      name: string;
      type: string;
      nullable: boolean;
      default?: string;
      charset?: string;
      collation?: string;
    }>;
    fks?: Array<{ name: string; columns: string[]; refTable: string; refColumns: string[] }>;
  } = {}
): TableInfo {
  return {
    name,
    engine: 'InnoDB',
    charset: opts.charset ?? 'utf8mb4',
    collation: opts.collation,
    columns: opts.columns ?? [{ name: 'id', type: 'INT', nullable: false }],
    indexes: [{ name: 'PRIMARY', columns: ['id'], unique: true, type: 'PRIMARY' }],
    foreignKeys: (opts.fks ?? []).map(fk => ({
      name: fk.name,
      columns: fk.columns,
      refTable: fk.refTable,
      refColumns: fk.refColumns,
    })),
  };
}

describe('analyzeCharsetCascade', () => {
  it('should detect utf8mb3 vs utf8mb4 charset mismatch across FK (text columns)', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [{ name: 'id', type: 'VARCHAR(50)', nullable: false, charset: 'utf8mb4' }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb3',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'VARCHAR(50)', nullable: true, charset: 'utf8mb3' },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);

    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].id).toBe('fk_charset_mismatch');
    expect(issues[0].severity).toBe('error'); // utf8mb3 vs utf8mb4 is Error 3780
  });

  it('should not report issues when charsets match', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb4',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'INT', nullable: true },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    expect(charsetIssues.length).toBe(0);
  });

  it('should detect collation mismatch with same charset', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      collation: 'utf8mb4_unicode_ci',
      columns: [{ name: 'id', type: 'VARCHAR(50)', nullable: false, collation: 'utf8mb4_unicode_ci' }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb4',
      collation: 'utf8mb4_general_ci',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'VARCHAR(50)', nullable: true, collation: 'utf8mb4_general_ci' },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const collationIssues = issues.filter(i => i.id === 'fk_collation_mismatch');
    expect(collationIssues.length).toBe(1);
    expect(collationIssues[0].severity).toBe('warning');
  });

  it('should use column-level charset over table-level', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [{ name: 'id', type: 'VARCHAR(50)', nullable: false, charset: 'utf8mb4' }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb4', // table is utf8mb4
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'VARCHAR(50)', nullable: true, charset: 'utf8mb3' }, // but column is utf8mb3
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    expect(charsetIssues.length).toBe(1); // Column-level mismatch detected
  });

  it('should normalize utf8 to utf8mb3 for comparison', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8', // alias for utf8mb3
      columns: [{ name: 'id', type: 'VARCHAR(50)', nullable: false, charset: 'utf8' }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb4',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'VARCHAR(50)', nullable: true, charset: 'utf8mb4' },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    expect(charsetIssues.length).toBe(1);
    expect(charsetIssues[0].severity).toBe('error');
  });

  it('should handle composite FK with multiple column pairs', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [
        { name: 'id1', type: 'VARCHAR(50)', nullable: false },
        { name: 'id2', type: 'VARCHAR(50)', nullable: false },
      ],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb3', // mismatch
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'ref1', type: 'VARCHAR(50)', nullable: true },
        { name: 'ref2', type: 'VARCHAR(50)', nullable: true },
      ],
      fks: [{
        name: 'fk_composite',
        columns: ['ref1', 'ref2'],
        refTable: 'parent',
        refColumns: ['id1', 'id2'],
      }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    // Should report for each column pair
    expect(charsetIssues.length).toBe(2);
  });

  it('should handle tables with no FKs (no issues)', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('standalone', makeTable('standalone', { charset: 'utf8mb3' }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    expect(issues.length).toBe(0);
  });

  it('should handle missing referenced table gracefully', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('child', makeTable('child', {
      charset: 'utf8mb3',
      fks: [{ name: 'fk_missing', columns: ['ext_id'], refTable: 'missing_table', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    // Should not crash and should return no charset issues (missing table excluded from graph)
    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    expect(charsetIssues.length).toBe(0);
  });

  it('should include fix SQL in charset mismatch issues', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [{ name: 'id', type: 'VARCHAR(50)', nullable: false, charset: 'utf8mb4' }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb3',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'VARCHAR(50)', nullable: true, charset: 'utf8mb3' },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    expect(issues[0].fixQuery).toBeDefined();
    // FK checks are centralized in plan, not in per-issue fix SQL
    expect(issues[0].fixQuery).not.toContain('FOREIGN_KEY_CHECKS');
    expect(issues[0].fixQuery).toContain('utf8mb4');
  });

  it('should set fkContext on charset mismatch issues', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [{ name: 'id', type: 'VARCHAR(50)', nullable: false, charset: 'utf8mb4' }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb3',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'VARCHAR(50)', nullable: true, charset: 'utf8mb3' },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    expect(issues[0].fkContext).toBeDefined();
    expect(issues[0].fkContext!.relatedTables).toContain('child');
    expect(issues[0].fkContext!.relatedTables).toContain('parent');
    expect(issues[0].fkContext!.isChildTable).toBe(true);
  });

  it('should NOT flag INT/BIGINT FK columns as charset mismatch (non-text columns)', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [{ name: 'id', type: 'INT', nullable: false }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb3', // table-level mismatch, but FK columns are INT
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'INT', nullable: true },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    // INT columns should NOT be flagged — charset is irrelevant for numeric types
    expect(charsetIssues.length).toBe(0);
  });

  it('should NOT flag BIGINT FK columns as charset mismatch', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [{ name: 'id', type: 'BIGINT', nullable: false }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb3',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'BIGINT', nullable: true },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    expect(charsetIssues.length).toBe(0);
  });

  it('should use table-level CONVERT TO in fix SQL (safe DDL without column reconstruction)', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [{ name: 'code', type: 'CHAR(10)', nullable: false, charset: 'utf8mb4' }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb3',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_code', type: 'CHAR(10)', nullable: false, charset: 'utf8mb3' },
      ],
      fks: [{ name: 'fk_code', columns: ['parent_code'], refTable: 'parent', refColumns: ['code'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    expect(charsetIssues.length).toBe(1);
    expect(charsetIssues[0].fixQuery).toBeDefined();
    // Should use table-level CONVERT TO (not column-level MODIFY COLUMN)
    expect(charsetIssues[0].fixQuery).toContain('CONVERT TO CHARACTER SET utf8mb4');
    // Should not contain FOREIGN_KEY_CHECKS (centralized in plan)
    expect(charsetIssues[0].fixQuery).not.toContain('FOREIGN_KEY_CHECKS');
    // Should reference both tables
    expect(charsetIssues[0].fixQuery).toContain('parent');
    expect(charsetIssues[0].fixQuery).toContain('child');
  });

  it('should generate fix SQL that preserves all column attributes via CONVERT TO', () => {
    // CONVERT TO CHARACTER SET preserves ON UPDATE, defaults, generated cols automatically
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [{ name: 'id', type: 'VARCHAR(50)', nullable: false, charset: 'utf8mb4' }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'utf8mb3',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'VARCHAR(50)', nullable: false, charset: 'utf8mb3', default: 'CURRENT_TIMESTAMP' },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    expect(charsetIssues.length).toBe(1);
    expect(charsetIssues[0].fixQuery).toBeDefined();
    // Uses safe CONVERT TO (MySQL handles column attributes internally)
    expect(charsetIssues[0].fixQuery).toContain('ALTER TABLE');
    expect(charsetIssues[0].fixQuery).toContain('CONVERT TO CHARACTER SET utf8mb4');
  });

  it('should treat latin1 vs utf8mb4 as warning (not Error 3780)', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('parent', makeTable('parent', {
      charset: 'utf8mb4',
      columns: [{ name: 'id', type: 'VARCHAR(50)', nullable: false, charset: 'utf8mb4' }],
    }));
    tables.set('child', makeTable('child', {
      charset: 'latin1',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'parent_id', type: 'VARCHAR(50)', nullable: true, charset: 'latin1' },
      ],
      fks: [{ name: 'fk_child', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }],
    }));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const issues = analyzeCharsetCascade(tables, graph);
    const charsetIssues = issues.filter(i => i.id === 'fk_charset_mismatch');
    expect(charsetIssues.length).toBe(1);
    expect(charsetIssues[0].severity).toBe('warning'); // Not error, since not utf8mb3/utf8mb4 pair
  });
});
