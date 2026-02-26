/**
 * FK Graph Builder Tests
 *
 * Tests for FKGraphBuilder: BFS, Tarjan SCC, topological sort,
 * edge cases (cycles, self-ref, missing tables, composite FK).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FKGraphBuilder } from '../analysis/fk-graph';
import type { TableInfo } from '../types';

/** Helper: create a minimal TableInfo */
function makeTable(
  name: string,
  fks: Array<{ name: string; columns: string[]; refTable: string; refColumns: string[] }> = [],
  charset?: string,
  columns?: Array<{ name: string; type: string; charset?: string; collation?: string; nullable: boolean }>
): TableInfo {
  return {
    name,
    engine: 'InnoDB',
    charset: charset ?? 'utf8mb4',
    columns: columns ?? [{ name: 'id', type: 'INT', nullable: false }],
    indexes: [{ name: 'PRIMARY', columns: ['id'], unique: true, type: 'PRIMARY' }],
    foreignKeys: fks.map(fk => ({
      name: fk.name,
      columns: fk.columns,
      refTable: fk.refTable,
      refColumns: fk.refColumns,
    })),
  };
}

describe('FKGraphBuilder', () => {
  let graph: FKGraphBuilder;

  beforeEach(() => {
    graph = new FKGraphBuilder();
  });

  describe('buildFromTableInfos', () => {
    it('should build graph from simple parent-child relationship', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('parent', makeTable('parent'));
      tables.set('child', makeTable('child', [
        { name: 'fk_child_parent', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);

      expect(graph.getNodeCount()).toBe(2);
      expect(graph.getEdgeCount()).toBe(1);
    });

    it('should handle empty table map', () => {
      graph.buildFromTableInfos(new Map());
      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getEdgeCount()).toBe(0);
    });

    it('should handle tables with no FKs', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('standalone', makeTable('standalone'));
      tables.set('another', makeTable('another'));

      graph.buildFromTableInfos(tables);

      expect(graph.getNodeCount()).toBe(0);
      expect(graph.getEdgeCount()).toBe(0);
    });
  });

  describe('getParents / getChildren', () => {
    it('should return correct parent/child relationships', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('users', makeTable('users'));
      tables.set('orders', makeTable('orders', [
        { name: 'fk_orders_users', columns: ['user_id'], refTable: 'users', refColumns: ['id'] }
      ]));
      tables.set('order_items', makeTable('order_items', [
        { name: 'fk_items_orders', columns: ['order_id'], refTable: 'orders', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);

      expect(graph.getParents('orders')).toEqual(new Set(['users']));
      expect(graph.getChildren('orders')).toEqual(new Set(['order_items']));
      expect(graph.getParents('users')).toEqual(new Set());
      expect(graph.getChildren('users')).toEqual(new Set(['orders']));
    });
  });

  describe('getRelatedTables (BFS)', () => {
    it('should find all related tables via BFS', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('a', makeTable('a'));
      tables.set('b', makeTable('b', [
        { name: 'fk_b_a', columns: ['a_id'], refTable: 'a', refColumns: ['id'] }
      ]));
      tables.set('c', makeTable('c', [
        { name: 'fk_c_b', columns: ['b_id'], refTable: 'b', refColumns: ['id'] }
      ]));
      tables.set('d', makeTable('d')); // unrelated

      graph.buildFromTableInfos(tables);

      const relatedToA = graph.getRelatedTables('a');
      expect(relatedToA).toContain('b');
      expect(relatedToA).toContain('c');
      expect(relatedToA).not.toContain('d');
    });

    it('should return empty set for unknown table', () => {
      graph.buildFromTableInfos(new Map());
      expect(graph.getRelatedTables('nonexistent').size).toBe(0);
    });
  });

  describe('hasCycle / getSCCs (Tarjan)', () => {
    it('should detect no cycle in simple hierarchy', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('parent', makeTable('parent'));
      tables.set('child', makeTable('child', [
        { name: 'fk', columns: ['parent_id'], refTable: 'parent', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);
      expect(graph.hasCycle()).toBe(false);
    });

    it('should detect cycle between two tables', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('a', makeTable('a', [
        { name: 'fk_a_b', columns: ['b_id'], refTable: 'b', refColumns: ['id'] }
      ]));
      tables.set('b', makeTable('b', [
        { name: 'fk_b_a', columns: ['a_id'], refTable: 'a', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);
      expect(graph.hasCycle()).toBe(true);

      const sccs = graph.getSCCs().filter(scc => scc.length > 1);
      expect(sccs.length).toBe(1);
      expect(sccs[0]).toContain('a');
      expect(sccs[0]).toContain('b');
    });

    it('should detect cycle in a 3-table ring', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('a', makeTable('a', [
        { name: 'fk_a_c', columns: ['c_id'], refTable: 'c', refColumns: ['id'] }
      ]));
      tables.set('b', makeTable('b', [
        { name: 'fk_b_a', columns: ['a_id'], refTable: 'a', refColumns: ['id'] }
      ]));
      tables.set('c', makeTable('c', [
        { name: 'fk_c_b', columns: ['b_id'], refTable: 'b', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);
      expect(graph.hasCycle()).toBe(true);

      const sccs = graph.getSCCs().filter(scc => scc.length > 1);
      expect(sccs.length).toBe(1);
      expect(sccs[0].length).toBe(3);
    });

    it('should detect self-referencing FK as cycle', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('categories', makeTable('categories', [
        { name: 'fk_self', columns: ['parent_id'], refTable: 'categories', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);
      expect(graph.hasCycle()).toBe(true);
      expect(graph.getSelfRefTables().has('categories')).toBe(true);
    });
  });

  describe('getTopologicalOrder', () => {
    it('should return correct order for linear chain', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('a', makeTable('a'));
      tables.set('b', makeTable('b', [
        { name: 'fk_b_a', columns: ['a_id'], refTable: 'a', refColumns: ['id'] }
      ]));
      tables.set('c', makeTable('c', [
        { name: 'fk_c_b', columns: ['b_id'], refTable: 'b', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);

      const order = graph.getTopologicalOrder(new Set(['a', 'b', 'c']));
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });

    it('should handle tables with no FK relationships', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('x', makeTable('x'));
      tables.set('y', makeTable('y'));

      graph.buildFromTableInfos(tables);

      const order = graph.getTopologicalOrder(new Set(['x', 'y']));
      expect(order.length).toBe(2);
    });

    it('should handle cyclic dependencies (all nodes returned)', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('a', makeTable('a', [
        { name: 'fk_a_b', columns: ['b_id'], refTable: 'b', refColumns: ['id'] }
      ]));
      tables.set('b', makeTable('b', [
        { name: 'fk_b_a', columns: ['a_id'], refTable: 'a', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);

      const order = graph.getTopologicalOrder(new Set(['a', 'b']));
      expect(order.length).toBe(2);
      expect(order).toContain('a');
      expect(order).toContain('b');
    });

    it('should skip self-referencing in topological order', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('cat', makeTable('cat', [
        { name: 'fk_self', columns: ['parent_id'], refTable: 'cat', refColumns: ['id'] }
      ]));
      tables.set('item', makeTable('item', [
        { name: 'fk_item_cat', columns: ['cat_id'], refTable: 'cat', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);

      const order = graph.getTopologicalOrder(new Set(['cat', 'item']));
      expect(order.indexOf('cat')).toBeLessThan(order.indexOf('item'));
    });
  });

  describe('missing reference tables', () => {
    it('should detect missing reference tables', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('child', makeTable('child', [
        { name: 'fk_missing', columns: ['ext_id'], refTable: 'external_table', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);

      expect(graph.getMissingTables().has('external_table')).toBe(true);
      expect(graph.getEdgeCount()).toBe(0); // Edge not added for missing tables
    });
  });

  describe('composite FK', () => {
    it('should handle composite (multi-column) FKs', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('parent', makeTable('parent'));
      tables.set('child', makeTable('child', [
        { name: 'fk_composite', columns: ['a', 'b'], refTable: 'parent', refColumns: ['x', 'y'] }
      ]));

      graph.buildFromTableInfos(tables);

      const edges = graph.getEdgesForTable('child');
      expect(edges.length).toBe(1);
      expect(edges[0].childColumns).toEqual(['a', 'b']);
      expect(edges[0].parentColumns).toEqual(['x', 'y']);
    });
  });

  describe('case insensitivity', () => {
    it('should handle mixed case table names', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('Parent', makeTable('Parent'));
      tables.set('Child', makeTable('Child', [
        { name: 'fk', columns: ['parent_id'], refTable: 'Parent', refColumns: ['id'] }
      ]));

      graph.buildFromTableInfos(tables);

      expect(graph.getParents('child')).toEqual(new Set(['parent']));
      expect(graph.getChildren('PARENT')).toEqual(new Set(['child']));
    });
  });

  describe('hasRelationships', () => {
    it('should return true for tables with FK relationships', () => {
      const tables = new Map<string, TableInfo>();
      tables.set('a', makeTable('a'));
      tables.set('b', makeTable('b', [
        { name: 'fk', columns: ['a_id'], refTable: 'a', refColumns: ['id'] }
      ]));
      tables.set('c', makeTable('c'));

      graph.buildFromTableInfos(tables);

      expect(graph.hasRelationships('a')).toBe(true);
      expect(graph.hasRelationships('b')).toBe(true);
      expect(graph.hasRelationships('c')).toBe(false);
    });
  });

  describe('performance', () => {
    it('should handle 1000 tables efficiently', () => {
      const tables = new Map<string, TableInfo>();

      // Create a chain of 1000 tables
      for (let i = 0; i < 1000; i++) {
        const fks = i > 0
          ? [{ name: `fk_${i}`, columns: ['parent_id'], refTable: `table_${i - 1}`, refColumns: ['id'] }]
          : [];
        tables.set(`table_${i}`, makeTable(`table_${i}`, fks));
      }

      const start = performance.now();
      graph.buildFromTableInfos(tables);
      const buildTime = performance.now() - start;

      // Build should complete in reasonable time (< 2000ms for 1k tables, CI-friendly)
      expect(buildTime).toBeLessThan(2000);
      expect(graph.getNodeCount()).toBe(1000);
      expect(graph.getEdgeCount()).toBe(999);

      // Topological sort
      const sortStart = performance.now();
      const order = graph.getTopologicalOrder(new Set(tables.keys()));
      const sortTime = performance.now() - sortStart;

      expect(sortTime).toBeLessThan(2000);
      expect(order.length).toBe(1000);
      // First element should be table_0 (no parents)
      expect(order[0]).toBe('table_0');
    });

    it('should handle 5000 tables with tree structure', () => {
      const tables = new Map<string, TableInfo>();

      // Create root
      tables.set('root', makeTable('root'));

      // Create tree: each node has ~5 children, depth ~5
      let counter = 1;
      const queue = ['root'];
      while (counter < 5000 && queue.length > 0) {
        const parent = queue.shift()!;
        const childCount = Math.min(5, 5000 - counter);
        for (let c = 0; c < childCount; c++) {
          const childName = `t_${counter}`;
          tables.set(childName, makeTable(childName, [
            { name: `fk_${counter}`, columns: ['parent_id'], refTable: parent, refColumns: ['id'] }
          ]));
          queue.push(childName);
          counter++;
        }
      }

      const start = performance.now();
      graph.buildFromTableInfos(tables);
      const buildTime = performance.now() - start;

      expect(buildTime).toBeLessThan(2000);

      const sccStart = performance.now();
      graph.getSCCs();
      const sccTime = performance.now() - sccStart;

      expect(sccTime).toBeLessThan(2000);
      expect(graph.hasCycle()).toBe(false);
    });
  });
});
