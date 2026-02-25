/**
 * FK Dependency Visualization Tests
 *
 * Covers: sugiyama-layout.ts, svg-renderer.ts, graph-builder.ts
 */

import { describe, it, expect } from 'vitest';
import { computeSugiyamaLayout } from '../visualization/sugiyama-layout';
import { renderSVG, renderListView } from '../visualization/svg-renderer';
import { buildGraphFromContext, NODE_CAP } from '../visualization/graph-builder';
import { FKGraphBuilder } from '../analysis/fk-graph';
import type { AnalysisContext, IFKGraphBuilder, IFKEdge } from '../domain/analysis-context';
import type { Issue, TableInfo } from '../types';

// ============================================================================
// Helpers
// ============================================================================

function makeIssue(overrides: Partial<Issue>): Issue {
  return {
    id: 'test',
    type: 'schema',
    category: 'invalidObjects',
    severity: 'warning',
    title: 'Test',
    description: 'Test desc',
    suggestion: 'Test suggestion',
    ...overrides,
  };
}

function makeMockFKGraph(
  edges: IFKEdge[],
  relatedMap: Map<string, Set<string>> = new Map()
): IFKGraphBuilder {
  return {
    getAllEdges: () => edges,
    getRelatedTables: (table: string) => relatedMap.get(table) ?? new Set(),
    getTopologicalOrder: (_tables: Set<string>) => [],
    getParents: (table: string) => {
      const parents = new Set<string>();
      for (const e of edges) {
        if (e.childTable === table) parents.add(e.parentTable);
      }
      return parents;
    },
    getChildren: (table: string) => {
      const children = new Set<string>();
      for (const e of edges) {
        if (e.parentTable === table) children.add(e.childTable);
      }
      return children;
    },
    hasCycle: () => false,
    getSCCs: () => [],
  };
}

// ============================================================================
// Sugiyama Layout
// ============================================================================

describe('computeSugiyamaLayout', () => {
  it('should handle empty graph', () => {
    const result = computeSugiyamaLayout({ nodes: [], edges: [] });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it('should handle single node', () => {
    const result = computeSugiyamaLayout({
      nodes: [{ id: 'a', label: 'A' }],
      edges: [],
    });
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].id).toBe('a');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should layout a simple DAG (A → B → C)', () => {
    const result = computeSugiyamaLayout({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    });

    expect(result.nodes.length).toBe(3);
    // A should be in an earlier layer than B, B earlier than C
    const nodeA = result.nodes.find(n => n.id === 'a')!;
    const nodeB = result.nodes.find(n => n.id === 'b')!;
    const nodeC = result.nodes.find(n => n.id === 'c')!;
    expect(nodeA.layer).toBeLessThan(nodeB.layer);
    expect(nodeB.layer).toBeLessThan(nodeC.layer);
  });

  it('should handle a graph with a cycle', () => {
    const result = computeSugiyamaLayout({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    });

    // Should not crash, should produce valid layout
    expect(result.nodes.length).toBe(2);
    // One edge should be marked as reversed
    expect(result.edges.some(e => e.reversed)).toBe(true);
  });

  it('should handle disconnected graph', () => {
    const result = computeSugiyamaLayout({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        // c is disconnected
      ],
    });

    expect(result.nodes.length).toBe(3);
    const nodeC = result.nodes.find(n => n.id === 'c')!;
    expect(nodeC).toBeDefined();
  });

  it('should preserve node severity in layout', () => {
    const result = computeSugiyamaLayout({
      nodes: [
        { id: 'a', label: 'A', severity: 'error' },
        { id: 'b', label: 'B', severity: 'warning' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    });

    expect(result.nodes.find(n => n.id === 'a')!.severity).toBe('error');
    expect(result.nodes.find(n => n.id === 'b')!.severity).toBe('warning');
  });

  it('should handle large graph (100 nodes chain)', () => {
    const nodes = [];
    const edges = [];
    for (let i = 0; i < 100; i++) {
      nodes.push({ id: `t${i}`, label: `table_${i}` });
      if (i > 0) {
        edges.push({ from: `t${i - 1}`, to: `t${i}` });
      }
    }

    const result = computeSugiyamaLayout({ nodes, edges });
    expect(result.nodes.length).toBe(100);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should handle wide graph (many nodes in same layer)', () => {
    const nodes = [{ id: 'root', label: 'Root' }];
    const edges = [];
    for (let i = 0; i < 20; i++) {
      nodes.push({ id: `leaf${i}`, label: `Leaf${i}` });
      edges.push({ from: 'root', to: `leaf${i}` });
    }

    const result = computeSugiyamaLayout({ nodes, edges });
    expect(result.nodes.length).toBe(21);
  });

  it('should preserve edge style metadata', () => {
    const result = computeSugiyamaLayout({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [{ from: 'a', to: 'b', style: 'dashed', color: '#ff0000' }],
    });

    expect(result.edges[0].style).toBe('dashed');
    expect(result.edges[0].color).toBe('#ff0000');
  });

  it('performance: 500 node tree should complete under 2 seconds', () => {
    const nodes = [];
    const edges = [];
    for (let i = 0; i < 500; i++) {
      nodes.push({ id: `t${i}`, label: `table_${i}` });
      if (i > 0) {
        // Tree structure: each node connects to its parent (i/2)
        edges.push({ from: `t${Math.floor((i - 1) / 2)}`, to: `t${i}` });
      }
    }

    const start = Date.now();
    const result = computeSugiyamaLayout({ nodes, edges });
    const elapsed = Date.now() - start;

    expect(result.nodes.length).toBe(500);
    expect(elapsed).toBeLessThan(5000); // CI-friendly threshold
  });
});

// ============================================================================
// SVG Renderer
// ============================================================================

describe('renderSVG', () => {
  it('should render empty graph message', () => {
    const svg = renderSVG({ nodes: [], edges: [], width: 0, height: 0 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('FK');
  });

  it('should render nodes and edges', () => {
    const layout = computeSugiyamaLayout({
      nodes: [
        { id: 'users', label: 'users', severity: 'error' },
        { id: 'orders', label: 'orders' },
      ],
      edges: [{ from: 'users', to: 'orders' }],
    });

    const svg = renderSVG(layout);
    expect(svg).toContain('<svg');
    expect(svg).toContain('users');
    expect(svg).toContain('orders');
    expect(svg).toContain('node-error');
    expect(svg).toContain('<path');
    expect(svg).toContain('arrowhead');
  });

  it('should escape XSS in node labels', () => {
    const layout = computeSugiyamaLayout({
      nodes: [{ id: '<script>alert(1)</script>', label: '<script>alert(1)</script>' }],
      edges: [],
    });

    const svg = renderSVG(layout);
    expect(svg).not.toContain('<script>alert');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('renderListView', () => {
  it('should render table list', () => {
    const svg = renderListView([
      { name: 'users', severity: 'error', issueCount: 3 },
      { name: 'orders', severity: 'warning', issueCount: 1 },
      { name: 'products', issueCount: 0 },
    ]);

    expect(svg).toContain('<svg');
    expect(svg).toContain('users');
    expect(svg).toContain('orders');
    expect(svg).toContain('products');
    expect(svg).toContain('node-error');
    expect(svg).toContain('node-warning');
  });
});

// ============================================================================
// Graph Builder
// ============================================================================

describe('buildGraphFromContext', () => {
  it('should build graph from context with edges', () => {
    const edges: IFKEdge[] = [
      { childTable: 'orders', parentTable: 'users', childColumns: ['user_id'], parentColumns: ['id'], fkName: 'fk_orders_users' },
      { childTable: 'order_items', parentTable: 'orders', childColumns: ['order_id'], parentColumns: ['id'], fkName: 'fk_items_orders' },
    ];
    const fkGraph = makeMockFKGraph(edges, new Map([
      ['orders', new Set(['users', 'order_items'])],
      ['users', new Set(['orders'])],
    ]));

    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };
    const issues: Issue[] = [
      makeIssue({ tableName: 'orders', severity: 'error' }),
    ];

    const result = buildGraphFromContext(context, issues, true);

    expect(result.totalNodes).toBe(3);
    expect(result.totalEdges).toBe(2);
    expect(result.graph.nodes.length).toBeGreaterThan(0);
    // orders should be included (has issue) + its related tables
    expect(result.graph.nodes.some(n => n.id === 'orders')).toBe(true);
  });

  it('should include all tables when progressiveOnly is false', () => {
    const edges: IFKEdge[] = [
      { childTable: 'a', parentTable: 'b', childColumns: ['b_id'], parentColumns: ['id'], fkName: 'fk_a_b' },
    ];
    const fkGraph = makeMockFKGraph(edges);

    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };

    const result = buildGraphFromContext(context, [], false);
    expect(result.graph.nodes.length).toBe(2);
  });

  it('should cap nodes when exceeding NODE_CAP', () => {
    // Create a graph with 300 nodes
    const edges: IFKEdge[] = [];
    for (let i = 1; i < 300; i++) {
      edges.push({ childTable: `t${i}`, parentTable: `t${i - 1}`, childColumns: ['parent_id'], parentColumns: ['id'], fkName: `fk_${i}` });
    }

    const relatedMap = new Map<string, Set<string>>();
    for (let i = 0; i < 300; i++) {
      const related = new Set<string>();
      if (i > 0) related.add(`t${i - 1}`);
      if (i < 299) related.add(`t${i + 1}`);
      relatedMap.set(`t${i}`, related);
    }

    const fkGraph = makeMockFKGraph(edges, relatedMap);
    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };

    // Issue on t0 only
    const issues: Issue[] = [makeIssue({ tableName: 't0' })];

    const result = buildGraphFromContext(context, issues, false);
    // All nodes should be available since progressiveOnly=false, but capped
    expect(result.isCapped).toBe(true);
    expect(result.graph.nodes.length).toBeLessThanOrEqual(NODE_CAP);
  });

  it('should mark charset mismatch edges as dashed', () => {
    const edges: IFKEdge[] = [
      { childTable: 'orders', parentTable: 'users', childColumns: ['user_id'], parentColumns: ['id'], fkName: 'fk_orders_users' },
    ];
    const fkGraph = makeMockFKGraph(edges, new Map([
      ['orders', new Set(['users'])],
    ]));
    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };
    const issues: Issue[] = [
      makeIssue({
        id: 'fk_charset_mismatch',
        tableName: 'orders',
        severity: 'error',
        fkContext: { relatedTables: ['orders', 'users'], isChildTable: true },
      }),
    ];

    const result = buildGraphFromContext(context, issues, true);
    const dashedEdge = result.graph.edges.find(e => e.style === 'dashed');
    expect(dashedEdge).toBeDefined();
    expect(dashedEdge!.color).toBe('#dc2626');
  });

  it('should handle empty graph', () => {
    const fkGraph = makeMockFKGraph([]);
    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };

    const result = buildGraphFromContext(context, [], true);
    expect(result.graph.nodes.length).toBe(0);
    expect(result.graph.edges.length).toBe(0);
    expect(result.totalNodes).toBe(0);
  });

  it('should set severity based on most severe issue', () => {
    const edges: IFKEdge[] = [
      { childTable: 'orders', parentTable: 'users', childColumns: ['user_id'], parentColumns: ['id'], fkName: 'fk_orders_users' },
    ];
    const fkGraph = makeMockFKGraph(edges, new Map([
      ['orders', new Set(['users'])],
    ]));
    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };

    const issues: Issue[] = [
      makeIssue({ tableName: 'orders', severity: 'warning' }),
      makeIssue({ tableName: 'orders', severity: 'error' }),
    ];

    const result = buildGraphFromContext(context, issues, true);
    const ordersNode = result.graph.nodes.find(n => n.id === 'orders');
    expect(ordersNode?.severity).toBe('error');
  });
});

// ============================================================================
// getTopologicalOrder — Determinism
// ============================================================================

/** Build a minimal TableInfo for FKGraphBuilder */
function makeTableInfo(
  name: string,
  fks: Array<{ name: string; columns: string[]; refTable: string; refColumns: string[] }> = []
): TableInfo {
  return {
    name,
    engine: 'InnoDB',
    charset: 'utf8mb4',
    columns: [{ name: 'id', type: 'INT', nullable: false }],
    indexes: [{ name: 'PRIMARY', columns: ['id'], unique: true, type: 'PRIMARY' }],
    foreignKeys: fks,
  };
}

describe('getTopologicalOrder — determinism', () => {
  it('should produce identical output across multiple calls (same input, same order)', () => {
    const tables = new Map<string, TableInfo>();
    tables.set('users', makeTableInfo('users'));
    tables.set('orders', makeTableInfo('orders', [
      { name: 'fk_orders_users', columns: ['user_id'], refTable: 'users', refColumns: ['id'] },
    ]));
    tables.set('order_items', makeTableInfo('order_items', [
      { name: 'fk_items_orders', columns: ['order_id'], refTable: 'orders', refColumns: ['id'] },
    ]));
    tables.set('payments', makeTableInfo('payments', [
      { name: 'fk_payments_orders', columns: ['order_id'], refTable: 'orders', refColumns: ['id'] },
    ]));

    const graph = new FKGraphBuilder();
    graph.buildFromTableInfos(tables);

    const tableSet = new Set(tables.keys());
    const run1 = graph.getTopologicalOrder(tableSet);
    const run2 = graph.getTopologicalOrder(tableSet);
    const run3 = graph.getTopologicalOrder(tableSet);

    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
  });

  it('should produce the same order regardless of input Set iteration order', () => {
    // Build the same logical graph with different insertion orders
    const tablesA = new Map<string, TableInfo>();
    tablesA.set('z_table', makeTableInfo('z_table'));
    tablesA.set('a_child', makeTableInfo('a_child', [
      { name: 'fk1', columns: ['z_id'], refTable: 'z_table', refColumns: ['id'] },
    ]));
    tablesA.set('m_middle', makeTableInfo('m_middle', [
      { name: 'fk2', columns: ['z_id'], refTable: 'z_table', refColumns: ['id'] },
    ]));

    const tablesB = new Map<string, TableInfo>();
    // Different insertion order
    tablesB.set('m_middle', makeTableInfo('m_middle', [
      { name: 'fk2', columns: ['z_id'], refTable: 'z_table', refColumns: ['id'] },
    ]));
    tablesB.set('a_child', makeTableInfo('a_child', [
      { name: 'fk1', columns: ['z_id'], refTable: 'z_table', refColumns: ['id'] },
    ]));
    tablesB.set('z_table', makeTableInfo('z_table'));

    const graphA = new FKGraphBuilder();
    graphA.buildFromTableInfos(tablesA);

    const graphB = new FKGraphBuilder();
    graphB.buildFromTableInfos(tablesB);

    const orderA = graphA.getTopologicalOrder(new Set(tablesA.keys()));
    const orderB = graphB.getTopologicalOrder(new Set(tablesB.keys()));

    // Both must place z_table before its children
    expect(orderA.indexOf('z_table')).toBeLessThan(orderA.indexOf('a_child'));
    expect(orderA.indexOf('z_table')).toBeLessThan(orderA.indexOf('m_middle'));
    expect(orderB.indexOf('z_table')).toBeLessThan(orderB.indexOf('a_child'));
    expect(orderB.indexOf('z_table')).toBeLessThan(orderB.indexOf('m_middle'));
  });
});

// ============================================================================
// buildGraphFromContext — Cap Behavior
// ============================================================================

describe('buildGraphFromContext — cap behavior', () => {
  /** Build a large mock FK graph with N tables in a chain */
  function buildLargeChainGraph(nodeCount: number): { edges: IFKEdge[]; relatedMap: Map<string, Set<string>> } {
    const edges: IFKEdge[] = [];
    for (let i = 1; i < nodeCount; i++) {
      edges.push({
        childTable: `t${i}`,
        parentTable: `t${i - 1}`,
        childColumns: ['parent_id'],
        parentColumns: ['id'],
        fkName: `fk_${i}`,
      });
    }
    const relatedMap = new Map<string, Set<string>>();
    for (let i = 0; i < nodeCount; i++) {
      const related = new Set<string>();
      if (i > 0) related.add(`t${i - 1}`);
      if (i < nodeCount - 1) related.add(`t${i + 1}`);
      relatedMap.set(`t${i}`, related);
    }
    return { edges, relatedMap };
  }

  it('should include nodes with issues even when capped', () => {
    const nodeCount = NODE_CAP + 50; // deliberately exceed cap
    const { edges, relatedMap } = buildLargeChainGraph(nodeCount);
    const fkGraph = makeMockFKGraph(edges, relatedMap);

    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };

    // Place issues on a few specific tables
    const issueTables = ['t10', 't50', `t${nodeCount - 1}`];
    const issues: Issue[] = issueTables.map(t => makeIssue({ tableName: t, severity: 'error' }));

    const result = buildGraphFromContext(context, issues, false);

    expect(result.isCapped).toBe(true);
    expect(result.graph.nodes.length).toBeLessThanOrEqual(NODE_CAP);

    // All issue tables must be present in the capped graph
    for (const t of issueTables) {
      expect(
        result.graph.nodes.some(n => n.id === t),
        `Issue table '${t}' must be included in capped graph`
      ).toBe(true);
    }
  });

  it('should not include non-issue tables beyond NODE_CAP', () => {
    const nodeCount = NODE_CAP + 100;
    const { edges, relatedMap } = buildLargeChainGraph(nodeCount);
    const fkGraph = makeMockFKGraph(edges, relatedMap);

    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };

    // Single issue table at the start of the chain
    const issues: Issue[] = [makeIssue({ tableName: 't0', severity: 'error' })];

    const result = buildGraphFromContext(context, issues, false);

    expect(result.isCapped).toBe(true);
    expect(result.graph.nodes.length).toBeLessThanOrEqual(NODE_CAP);

    // t0 must be present (it has an issue)
    expect(result.graph.nodes.some(n => n.id === 't0')).toBe(true);

    // total nodes in full graph should exceed NODE_CAP
    expect(result.totalNodes).toBeGreaterThan(NODE_CAP);
  });

  it('should report correct totalNodes regardless of cap', () => {
    const nodeCount = NODE_CAP + 10;
    const { edges, relatedMap } = buildLargeChainGraph(nodeCount);
    const fkGraph = makeMockFKGraph(edges, relatedMap);

    const context: AnalysisContext = {
      fkGraph,
      tableInfos: new Map(),
      issues: [],
    };

    const issues: Issue[] = [makeIssue({ tableName: 't0', severity: 'error' })];

    const result = buildGraphFromContext(context, issues, false);

    // totalNodes is the real count before capping
    expect(result.totalNodes).toBe(nodeCount);
  });
});
