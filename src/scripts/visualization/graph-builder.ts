/**
 * Graph Builder
 *
 * Converts AnalysisContext + FKGraphBuilder data into GraphInput
 * for the Sugiyama layout algorithm.
 *
 * Handles scalability: node/edge caps, cluster view, progressive rendering.
 */

import type { Issue } from '../types';
import type { AnalysisContext, IFKEdge } from '../domain/analysis-context';
import type { GraphInput } from './sugiyama-layout';

// ============================================================================
// Constants
// ============================================================================

export const NODE_CAP = 200;
export const EDGE_CAP = 500;

// ============================================================================
// Public API
// ============================================================================

export interface GraphBuildResult {
  graph: GraphInput;
  /** True if the graph was capped/clustered */
  isCapped: boolean;
  /** Total node count before capping */
  totalNodes: number;
  /** Total edge count before capping */
  totalEdges: number;
  /** When capped, which tables were included */
  includedTables?: Set<string>;
}

/**
 * Build graph input from analysis context.
 * If graph exceeds caps, returns a filtered/clustered version.
 *
 * @param progressiveOnly If true, only include tables with issues
 */
export function buildGraphFromContext(
  context: AnalysisContext,
  issues: Issue[],
  progressiveOnly: boolean = true
): GraphBuildResult {
  const fkGraph = context.fkGraph;

  // Collect all tables with FK relationships
  const allEdges: ReadonlyArray<IFKEdge> = fkGraph.getAllEdges();
  const allTableIds = new Set<string>();
  for (const edge of allEdges) {
    allTableIds.add(edge.childTable);
    allTableIds.add(edge.parentTable);
  }

  const totalNodes = allTableIds.size;
  const totalEdges = allEdges.length;

  // Determine which tables to include
  let includedTables: Set<string>;

  if (progressiveOnly) {
    // Only tables with issues
    const issueTableSet = new Set(
      issues
        .filter(i => i.tableName)
        .map(i => i.tableName!.toLowerCase())
    );
    // Also include their FK neighbors for context.
    // Track BFS-visited tables to avoid re-running BFS for tables already discovered
    // by a prior iteration (deduplicates O(issueTables * graph) → effectively O(graph)).
    includedTables = new Set<string>();
    const bfsVisited = new Set<string>();
    for (const table of issueTableSet) {
      // Issue #5 fix: Always include issue tables, even without FK edges
      includedTables.add(table);
      // Skip BFS if this table's neighborhood was already discovered
      if (!bfsVisited.has(table) && allTableIds.has(table)) {
        const related = fkGraph.getRelatedTables(table);
        for (const r of related) {
          includedTables.add(r);
          bfsVisited.add(r);
        }
        bfsVisited.add(table);
      }
    }
  } else {
    includedTables = new Set(allTableIds);
  }

  // Apply node cap
  let isCapped = false;
  if (includedTables.size > NODE_CAP) {
    isCapped = true;
    // Keep only tables with issues + their direct parents/children
    const issueTableSet = new Set(
      issues.filter(i => i.tableName).map(i => i.tableName!.toLowerCase())
    );
    const reducedSet = new Set<string>();
    for (const table of issueTableSet) {
      reducedSet.add(table);
      for (const p of fkGraph.getParents(table)) reducedSet.add(p);
      for (const c of fkGraph.getChildren(table)) reducedSet.add(c);
      if (reducedSet.size >= NODE_CAP) break;
    }
    includedTables = reducedSet;
  }

  // Build severity map
  const severityMap = new Map<string, 'error' | 'warning' | 'info' | 'none'>();
  for (const issue of issues) {
    if (!issue.tableName) continue;
    const key = issue.tableName.toLowerCase();
    const current = severityMap.get(key) ?? 'none';
    const incoming = issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info';
    if (severityRank(incoming) > severityRank(current)) {
      severityMap.set(key, incoming);
    }
  }

  // Build charset mismatch edge set — only exact FK pairs, not all related tables
  const charsetMismatchEdges = new Set<string>();
  for (const issue of issues) {
    if (issue.id === 'fk_charset_mismatch' && issue.fkContext && issue.fkContext.relatedTables.length >= 2) {
      // fkContext.relatedTables[0] = child table, [1] = parent table (set in charset-cascade.ts)
      const child = issue.fkContext.relatedTables[0].toLowerCase();
      const parent = issue.fkContext.relatedTables[1].toLowerCase();
      // FK edge direction: child -> parent
      charsetMismatchEdges.add(`${child}->${parent}`);
    }
  }

  // Build graph nodes
  const nodes: GraphInput['nodes'] = [];
  for (const tableId of includedTables) {
    nodes.push({
      id: tableId,
      label: tableId,
      severity: severityMap.get(tableId) ?? 'none',
    });
  }

  // Build graph edges (filter to included tables, apply edge cap)
  // FK edges: child → parent direction
  let filteredEdges = allEdges.filter(
    (e: IFKEdge) => includedTables.has(e.childTable) && includedTables.has(e.parentTable)
  );

  if (filteredEdges.length > EDGE_CAP) {
    isCapped = true;
    // Prioritize edges connected to issue tables
    const issueTableSet = new Set(
      issues.filter(i => i.tableName).map(i => i.tableName!.toLowerCase())
    );
    filteredEdges = [...filteredEdges].sort((a: IFKEdge, b: IFKEdge) => {
      const aScore = (issueTableSet.has(a.childTable) ? 1 : 0) + (issueTableSet.has(a.parentTable) ? 1 : 0);
      const bScore = (issueTableSet.has(b.childTable) ? 1 : 0) + (issueTableSet.has(b.parentTable) ? 1 : 0);
      return bScore - aScore;
    }).slice(0, EDGE_CAP);
  }

  const edges: GraphInput['edges'] = filteredEdges.map((e: IFKEdge) => ({
    from: e.childTable,
    to: e.parentTable,
    style: charsetMismatchEdges.has(`${e.childTable}->${e.parentTable}`) ? 'dashed' as const : 'solid' as const,
    color: charsetMismatchEdges.has(`${e.childTable}->${e.parentTable}`) ? '#dc2626' : undefined,
  }));

  return {
    graph: { nodes, edges },
    isCapped,
    totalNodes,
    totalEdges,
    includedTables,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function severityRank(s: string): number {
  switch (s) {
    case 'error': return 3;
    case 'warning': return 2;
    case 'info': return 1;
    default: return 0;
  }
}
