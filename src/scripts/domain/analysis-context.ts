/**
 * Analysis Context - Shared context store for analysis results.
 *
 * Built once during analysis (Task 2), then shared immutably across:
 * - Fix option generator (Task 3)
 * - Migration plan generator (Task 4)
 * - FK visualization (Task 6)
 * - Readiness report (Task 7)
 *
 * This is a stub interface for Task 0. Full implementation in Task 2.
 */

import type { TableInfo, Issue } from '../types';

/**
 * FK Graph interface stub.
 * Full implementation: src/scripts/analysis/fk-graph.ts (Task 2)
 */
export interface IFKEdge {
  childTable: string;
  parentTable: string;
}

export interface IFKGraphBuilder {
  getRelatedTables(table: string): Set<string>;
  getTopologicalOrder(tables: Set<string>): string[];
  getParents(table: string): Set<string>;
  getChildren(table: string): Set<string>;
  hasCycle(): boolean;
  getSCCs(): string[][];
  getAllEdges(): ReadonlyArray<IFKEdge>;
}

/**
 * Immutable analysis context shared across all post-analysis modules.
 */
export interface AnalysisContext {
  /** FK dependency graph (built once, immutable) */
  readonly fkGraph: IFKGraphBuilder;

  /** All parsed table information keyed by table name */
  readonly tableInfos: Map<string, TableInfo>;

  /** All detected issues */
  readonly issues: ReadonlyArray<Issue>;
}
