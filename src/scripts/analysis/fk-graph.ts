/**
 * FK Dependency Graph Builder
 *
 * Builds a directed graph from foreign key relationships between tables.
 * Supports:
 * - BFS-based related table discovery
 * - Tarjan's algorithm for strongly connected components (cycle detection)
 * - Topological sort (SCC-aware for cyclic graphs)
 * - Self-referencing FK handling
 * - Missing reference detection
 */

import type { TableInfo } from '../types';
import type { IFKGraphBuilder } from '../domain/analysis-context';

/** Edge in the FK graph: from child table to parent (referenced) table */
interface FKEdge {
  childTable: string;
  parentTable: string;
  childColumns: string[];
  parentColumns: string[];
  fkName: string;
}

export class FKGraphBuilder implements IFKGraphBuilder {
  /** Adjacency list: child -> set of parent tables */
  private childToParents: Map<string, Set<string>> = new Map();

  /** Reverse adjacency: parent -> set of child tables */
  private parentToChildren: Map<string, Set<string>> = new Map();

  /** All edges with full detail */
  private edges: FKEdge[] = [];

  /** All known table names (lowercase) */
  private allTables: Set<string> = new Set();

  /** Tables referenced by FKs but not present in the dump */
  private missingTables: Set<string> = new Set();

  /** Self-referencing tables */
  private selfRefTables: Set<string> = new Set();

  /** Cached SCCs (computed lazily) */
  private cachedSCCs: string[][] | null = null;

  /** Cached cycle flag */
  private cachedHasCycle: boolean | null = null;

  /**
   * Build the FK graph from parsed table information.
   */
  buildFromTableInfos(tables: Map<string, TableInfo>): void {
    this.clear();

    // Register all known tables
    for (const [name] of tables) {
      this.allTables.add(name.toLowerCase());
    }

    // Build edges from FK definitions
    for (const [, table] of tables) {
      const childKey = table.name.toLowerCase();

      for (const fk of table.foreignKeys) {
        const parentKey = fk.refTable.toLowerCase();

        // Check for self-reference
        if (childKey === parentKey) {
          this.selfRefTables.add(childKey);
          // Include in graph but mark as self-ref
        }

        // Check for missing reference table
        if (!this.allTables.has(parentKey)) {
          this.missingTables.add(parentKey);
          // Don't add edge for missing tables
          continue;
        }

        // Add edge
        this.edges.push({
          childTable: childKey,
          parentTable: parentKey,
          childColumns: fk.columns.map(c => c.toLowerCase()),
          parentColumns: fk.refColumns.map(c => c.toLowerCase()),
          fkName: fk.name,
        });

        // Adjacency lists
        if (!this.childToParents.has(childKey)) {
          this.childToParents.set(childKey, new Set());
        }
        this.childToParents.get(childKey)!.add(parentKey);

        if (!this.parentToChildren.has(parentKey)) {
          this.parentToChildren.set(parentKey, new Set());
        }
        this.parentToChildren.get(parentKey)!.add(childKey);
      }
    }

    // Invalidate caches
    this.cachedSCCs = null;
    this.cachedHasCycle = null;
  }

  /**
   * BFS: Get all tables related to the given table (both directions).
   */
  getRelatedTables(table: string): Set<string> {
    const key = table.toLowerCase();
    const visited = new Set<string>();
    const queue: string[] = [key];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      // Parents (tables this one references)
      const parents = this.childToParents.get(current);
      if (parents) {
        for (const p of parents) {
          if (!visited.has(p)) queue.push(p);
        }
      }

      // Children (tables that reference this one)
      const children = this.parentToChildren.get(current);
      if (children) {
        for (const c of children) {
          if (!visited.has(c)) queue.push(c);
        }
      }
    }

    // Remove the starting table itself
    visited.delete(key);
    return visited;
  }

  /**
   * Get parent tables (tables that this table references via FK).
   * Returns a defensive copy to prevent mutation of internal state.
   */
  getParents(table: string): Set<string> {
    const internal = this.childToParents.get(table.toLowerCase());
    return internal ? new Set(internal) : new Set();
  }

  /**
   * Get child tables (tables that reference this table via FK).
   * Returns a defensive copy to prevent mutation of internal state.
   */
  getChildren(table: string): Set<string> {
    const internal = this.parentToChildren.get(table.toLowerCase());
    return internal ? new Set(internal) : new Set();
  }

  /**
   * Check whether the FK graph contains any cycles.
   */
  hasCycle(): boolean {
    if (this.cachedHasCycle !== null) return this.cachedHasCycle;
    const sccs = this.getSCCs();
    this.cachedHasCycle = sccs.some(scc => scc.length > 1) ||
      // A self-loop also counts as a cycle
      this.selfRefTables.size > 0;
    return this.cachedHasCycle;
  }

  /**
   * Tarjan's algorithm: find all strongly connected components.
   * Returns SCCs sorted in reverse topological order.
   */
  getSCCs(): string[][] {
    if (this.cachedSCCs !== null) return this.cachedSCCs;

    // Collect all nodes that participate in FK relationships
    const nodes = new Set<string>();
    for (const [child] of this.childToParents) nodes.add(child);
    for (const [parent] of this.parentToChildren) nodes.add(parent);

    let index = 0;
    const stack: string[] = [];
    const onStack = new Set<string>();
    const indices = new Map<string, number>();
    const lowlinks = new Map<string, number>();
    const sccs: string[][] = [];

    const strongconnect = (v: string): void => {
      indices.set(v, index);
      lowlinks.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);

      // Consider successors (parents in FK graph: child -> parent)
      const successors = this.childToParents.get(v);
      if (successors) {
        for (const w of successors) {
          if (!indices.has(w)) {
            strongconnect(w);
            lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
          } else if (onStack.has(w)) {
            lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
          }
        }
      }

      // If v is a root node, pop SCC
      if (lowlinks.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        sccs.push(scc);
      }
    };

    for (const node of nodes) {
      if (!indices.has(node)) {
        strongconnect(node);
      }
    }

    this.cachedSCCs = sccs;
    return sccs;
  }

  /**
   * Topological sort of given tables, respecting FK dependencies.
   * Parents come before children (safe execution order).
   * Handles cycles by grouping SCCs.
   */
  getTopologicalOrder(tables: Set<string>): string[] {
    const tableKeys = new Set<string>();
    for (const t of tables) tableKeys.add(t.toLowerCase());

    // Build a filtered subgraph
    const inDegree = new Map<string, number>();
    const adj = new Map<string, Set<string>>();

    for (const t of tableKeys) {
      inDegree.set(t, 0);
      adj.set(t, new Set());
    }

    // child -> parent means parent must come first
    // So edge direction for topo sort: parent -> child
    for (const edge of this.edges) {
      if (tableKeys.has(edge.childTable) && tableKeys.has(edge.parentTable)) {
        // Skip self-references for topo sort
        if (edge.childTable === edge.parentTable) continue;

        adj.get(edge.parentTable)!.add(edge.childTable);
        inDegree.set(edge.childTable, (inDegree.get(edge.childTable) ?? 0) + 1);
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [node, deg] of inDegree) {
      if (deg === 0) queue.push(node);
    }

    const result: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);
      result.push(node);

      const neighbors = adj.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDeg);
          if (newDeg === 0 && !visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }

    // Handle remaining nodes (part of cycles) - add in SCC order
    for (const t of tableKeys) {
      if (!visited.has(t)) {
        result.push(t);
      }
    }

    return result;
  }

  /**
   * Get all FK edges for a specific table.
   */
  getEdgesForTable(table: string): FKEdge[] {
    const key = table.toLowerCase();
    return this.edges.filter(e => e.childTable === key || e.parentTable === key);
  }

  /**
   * Get all FK edges in the graph.
   */
  getAllEdges(): ReadonlyArray<FKEdge> {
    return this.edges;
  }

  /**
   * Get tables referenced by FKs but not present in the dump.
   */
  getMissingTables(): ReadonlySet<string> {
    return this.missingTables;
  }

  /**
   * Get self-referencing tables.
   */
  getSelfRefTables(): ReadonlySet<string> {
    return this.selfRefTables;
  }

  /**
   * Check if a table has any FK relationships.
   */
  hasRelationships(table: string): boolean {
    const key = table.toLowerCase();
    return this.childToParents.has(key) || this.parentToChildren.has(key);
  }

  /**
   * Get the total number of tables in the graph.
   */
  getNodeCount(): number {
    const nodes = new Set<string>();
    for (const [child] of this.childToParents) nodes.add(child);
    for (const [parent] of this.parentToChildren) nodes.add(parent);
    return nodes.size;
  }

  /**
   * Get the total number of FK edges.
   */
  getEdgeCount(): number {
    return this.edges.length;
  }

  /**
   * Clear all graph data.
   */
  private clear(): void {
    this.childToParents.clear();
    this.parentToChildren.clear();
    this.edges = [];
    this.allTables.clear();
    this.missingTables.clear();
    this.selfRefTables.clear();
    this.cachedSCCs = null;
    this.cachedHasCycle = null;
  }
}
