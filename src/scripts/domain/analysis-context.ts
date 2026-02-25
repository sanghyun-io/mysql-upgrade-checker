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
  childColumns: string[];
  parentColumns: string[];
  fkName: string;
}

export interface IFKGraphBuilder {
  getRelatedTables(table: string): Set<string>;
  getTopologicalOrder(tables: Set<string>): string[];
  getParents(table: string): Set<string>;
  getChildren(table: string): Set<string>;
  hasCycle(): boolean;
  getSCCs(): string[][];
  getAllEdges(): ReadonlyArray<IFKEdge>;
  /** Get tables with self-referencing FKs */
  getSelfRefTables?(): ReadonlySet<string>;
  /** Get tables referenced by FKs but not present in the dump */
  getMissingTables?(): ReadonlySet<string>;
}

/**
 * Immutable analysis context shared across all post-analysis modules.
 *
 * All properties are readonly. tableInfos is a defensive copy (new Map) so
 * callers cannot mutate internal analyzer state. fkGraph exposes only
 * read methods via IFKGraphBuilder interface.
 */
export interface AnalysisContext {
  /** FK dependency graph (built once, read-only interface) */
  readonly fkGraph: Readonly<IFKGraphBuilder>;

  /** All parsed table information keyed by table name (defensive copy, treat as read-only) */
  readonly tableInfos: ReadonlyMap<string, Readonly<TableInfo>>;

  /** All detected issues */
  readonly issues: ReadonlyArray<Issue>;
}
