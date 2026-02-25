/**
 * FK Dependency Graph Builder
 *
 * Builds a directed graph from foreign key relationships between tables.
 * Supports:
 * - BFS-based related table discovery
 * - Tarjan's algorithm for strongly connected components (cycle detection)
 * - Topological sort via Kahn's algorithm with alphabetical tie-breaking.
 *   Cycle nodes (SCCs with >1 member or self-referencing tables) are appended
 *   at the end using a condensation-graph sort: SCCs are topologically ordered
 *   by inter-SCC dependencies, and tables within each SCC are sorted alphabetically.
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
    let idx = 0;

    while (idx < queue.length) {
      const current = queue[idx++];
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
   *
   * Implemented iteratively to avoid JS call-stack overflow on deep FK chains
   * (1000+ tables). Uses an explicit call-stack where each frame tracks the
   * current node and the iterator position over its successors.
   */
  getSCCs(): string[][] {
    if (this.cachedSCCs !== null) return this.cachedSCCs;

    // Collect all nodes that participate in FK relationships
    const nodes = new Set<string>();
    for (const [child] of this.childToParents) nodes.add(child);
    for (const [parent] of this.parentToChildren) nodes.add(parent);

    let index = 0;
    const tarjanStack: string[] = [];
    const onStack = new Set<string>();
    const indices = new Map<string, number>();
    const lowlinks = new Map<string, number>();
    const sccs: string[][] = [];

    /** One frame of the iterative call stack */
    interface TarjanFrame {
      node: string;
      neighbors: string[];
      neighborIdx: number;
    }

    for (const startNode of nodes) {
      if (indices.has(startNode)) continue;

      // Simulate recursive strongconnect(startNode) with an explicit stack
      const callStack: TarjanFrame[] = [];

      // Initialize the first frame
      const initNeighbors = this.childToParents.has(startNode)
        ? [...this.childToParents.get(startNode)!]
        : [];
      indices.set(startNode, index);
      lowlinks.set(startNode, index);
      index++;
      tarjanStack.push(startNode);
      onStack.add(startNode);
      callStack.push({ node: startNode, neighbors: initNeighbors, neighborIdx: 0 });

      while (callStack.length > 0) {
        const frame = callStack[callStack.length - 1];
        const { node: v } = frame;

        if (frame.neighborIdx < frame.neighbors.length) {
          // Process next neighbor
          const w = frame.neighbors[frame.neighborIdx];
          frame.neighborIdx++;

          if (!indices.has(w)) {
            // w not yet visited — "recurse" into w
            const wNeighbors = this.childToParents.has(w)
              ? [...this.childToParents.get(w)!]
              : [];
            indices.set(w, index);
            lowlinks.set(w, index);
            index++;
            tarjanStack.push(w);
            onStack.add(w);
            callStack.push({ node: w, neighbors: wNeighbors, neighborIdx: 0 });
          } else if (onStack.has(w)) {
            // w is on the Tarjan stack — update lowlink of v
            lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
          }
        } else {
          // All neighbors processed — pop this frame (equivalent to returning from recursion)
          callStack.pop();

          // Update parent's lowlink with v's lowlink (if there is a parent)
          if (callStack.length > 0) {
            const parent = callStack[callStack.length - 1].node;
            lowlinks.set(parent, Math.min(lowlinks.get(parent)!, lowlinks.get(v)!));
          }

          // If v is a root node of an SCC, pop the SCC off the Tarjan stack
          if (lowlinks.get(v) === indices.get(v)) {
            const scc: string[] = [];
            let w: string;
            do {
              w = tarjanStack.pop()!;
              onStack.delete(w);
              scc.push(w);
            } while (w !== v);
            sccs.push(scc);
          }
        }
      }
    }

    this.cachedSCCs = sccs;
    return sccs;
  }

  /**
   * Kahn's algorithm with alphabetical tie-breaking.
   *
   * Parents come before children (safe execution order). Within each BFS
   * layer (nodes whose in-degree reaches 0 in the same round), tables are
   * sorted alphabetically so that the output is deterministic regardless of
   * Map/Set insertion order.
   *
   * Cycle nodes (tables involved in circular FK dependencies) cannot be fully
   * topologically ordered within their SCC. After Kahn's acyclic portion:
   * 1. Collect SCCs from the remaining (unvisited) cycle nodes.
   * 2. Build a condensation DAG of those SCC groups using the edges between
   *    different SCCs in the filtered subgraph (inter-SCC dependencies).
   * 3. Topologically sort the condensation DAG (Kahn's on SCC nodes),
   *    so that if SCC-A has an edge into SCC-B, SCC-A is emitted before SCC-B.
   * 4. Within each SCC, tables are sorted alphabetically (no valid ordering
   *    exists inside a cycle, so alphabetical gives a deterministic result).
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

    // Kahn's algorithm with alphabetical tie-breaking:
    // Seed the first layer sorted alphabetically, then process layer by layer.
    // When a node's in-degree reaches 0, it is added to the next-layer buffer
    // (nextLayer), which is sorted before being added to the queue so that
    // nodes in the same BFS round are always emitted in alphabetical order.
    const result: string[] = [];
    const visited = new Set<string>();

    // Initial layer: all zero-in-degree nodes, sorted alphabetically
    let currentLayer: string[] = [];
    for (const [node, deg] of inDegree) {
      if (deg === 0) currentLayer.push(node);
    }
    currentLayer.sort();

    while (currentLayer.length > 0) {
      const nextLayer: string[] = [];

      for (const node of currentLayer) {
        if (visited.has(node)) continue;
        visited.add(node);
        result.push(node);

        const neighbors = adj.get(node);
        if (neighbors) {
          for (const neighbor of neighbors) {
            const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
            inDegree.set(neighbor, newDeg);
            if (newDeg === 0 && !visited.has(neighbor)) {
              nextLayer.push(neighbor);
            }
          }
        }
      }

      // Sort the next layer alphabetically before processing
      nextLayer.sort();
      currentLayer = nextLayer;
    }

    // Handle remaining nodes (part of cycles).
    // Build a condensation graph of SCC groups and topologically sort it so
    // that inter-SCC dependencies are respected. Within each SCC, tables are
    // sorted alphabetically since no valid ordering exists inside a cycle.
    const cycleNodes = new Set<string>();
    for (const t of tableKeys) {
      if (!visited.has(t)) cycleNodes.add(t);
    }

    if (cycleNodes.size > 0) {
      // Step 1: Collect SCC groups from the unvisited (cycle) nodes.
      const allSCCs = this.getSCCs();
      const sccGroups: string[][] = [];

      for (const scc of allSCCs) {
        // Only keep members that are in our cycle nodes set
        const filtered = scc.filter(t => cycleNodes.has(t)).sort();
        if (filtered.length > 0) {
          sccGroups.push(filtered);
        }
      }

      // Any cycle nodes not captured by any SCC group (e.g. isolated self-refs
      // that getSCCs() may not include) get their own single-node SCC group.
      const assignedByScc = new Set<string>();
      for (const group of sccGroups) {
        for (const t of group) assignedByScc.add(t);
      }
      for (const t of [...cycleNodes].sort()) {
        if (!assignedByScc.has(t)) {
          sccGroups.push([t]);
        }
      }

      // Step 2: Build a condensation DAG.
      // Map each table to its SCC index for fast lookup.
      const tableToSccIndex = new Map<string, number>();
      for (let i = 0; i < sccGroups.length; i++) {
        for (const t of sccGroups[i]) {
          tableToSccIndex.set(t, i);
        }
      }

      // Build adjacency list and in-degree for the condensation DAG.
      // An edge from SCC-i to SCC-j means SCC-i must come before SCC-j
      // (i.e. there is an edge from a table in SCC-i to a table in SCC-j
      // in the parent->child direction of our topo-sort graph).
      const sccAdj = new Map<number, Set<number>>();
      const sccInDegree = new Map<number, number>();
      for (let i = 0; i < sccGroups.length; i++) {
        sccAdj.set(i, new Set());
        sccInDegree.set(i, 0);
      }

      // Traverse edges in the filtered subgraph (parent -> child direction).
      // If source and target belong to different SCCs, add a condensation edge.
      for (const [parentNode, children] of adj) {
        const parentScc = tableToSccIndex.get(parentNode);
        if (parentScc === undefined) continue; // not a cycle node

        for (const childNode of children) {
          const childScc = tableToSccIndex.get(childNode);
          if (childScc === undefined) continue; // not a cycle node
          if (parentScc === childScc) continue; // same SCC, skip

          if (!sccAdj.get(parentScc)!.has(childScc)) {
            sccAdj.get(parentScc)!.add(childScc);
            sccInDegree.set(childScc, sccInDegree.get(childScc)! + 1);
          }
        }
      }

      // Step 3: Topologically sort the condensation DAG with alphabetical
      // tie-breaking (using the alphabetically smallest table in each SCC group
      // as the sort key so the output is deterministic).
      const sccVisited = new Set<number>();
      let sccCurrentLayer: number[] = [];
      for (const [idx, deg] of sccInDegree) {
        if (deg === 0) sccCurrentLayer.push(idx);
      }
      // Sort by the smallest member of each SCC group for determinism
      sccCurrentLayer.sort((a, b) => sccGroups[a][0].localeCompare(sccGroups[b][0]));

      while (sccCurrentLayer.length > 0) {
        const sccNextLayer: number[] = [];

        for (const sccIdx of sccCurrentLayer) {
          if (sccVisited.has(sccIdx)) continue;
          sccVisited.add(sccIdx);

          // Step 4: Emit tables in this SCC (already sorted alphabetically).
          for (const t of sccGroups[sccIdx]) {
            result.push(t);
          }

          // Decrement in-degrees of successor SCCs
          for (const nextSccIdx of sccAdj.get(sccIdx)!) {
            const newDeg = sccInDegree.get(nextSccIdx)! - 1;
            sccInDegree.set(nextSccIdx, newDeg);
            if (newDeg === 0 && !sccVisited.has(nextSccIdx)) {
              sccNextLayer.push(nextSccIdx);
            }
          }
        }

        sccNextLayer.sort((a, b) => sccGroups[a][0].localeCompare(sccGroups[b][0]));
        sccCurrentLayer = sccNextLayer;
      }

      // Safety: emit any SCC groups not yet visited (shouldn't happen in a
      // well-formed condensation DAG, but guards against edge cases).
      for (let i = 0; i < sccGroups.length; i++) {
        if (!sccVisited.has(i)) {
          for (const t of sccGroups[i]) {
            result.push(t);
          }
        }
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
