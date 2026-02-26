/**
 * Execution Order
 *
 * Determines the safe order for executing fix SQL statements
 * based on FK dependency graph topological sort.
 */

import type { Issue } from '../types';
import type { IFKGraphBuilder } from '../domain/analysis-context';

export interface OrderedFixGroup {
  /** Table name (original case as provided by the issue) */
  tableName: string;
  /** Issues for this table, ordered by priority */
  issues: Issue[];
  /** Whether this table is part of a circular FK dependency */
  hasCycle: boolean;
}

/**
 * Group issues by table and order them using FK topological sort.
 *
 * Ordering is determined by getTopologicalOrder(): Kahn's algorithm with
 * alphabetical tie-breaking within each BFS layer. Tables involved in
 * circular FK dependencies (cycle members) are placed after all acyclic
 * tables, grouped by SCC and sorted alphabetically within each SCC group.
 * Tables without any FK relationships (not present in the FK graph) are
 * appended last, in the order they were inserted (byTable key order).
 */
export function computeExecutionOrder(
  issues: Issue[],
  fkGraph: IFKGraphBuilder | null
): OrderedFixGroup[] {
  // Group issues by table, preserving original case.
  // byTable key = original table name; lowerToOriginal maps lowercase -> first
  // seen original-case name (used to look up entries when the FK graph returns
  // lowercase table names).
  const byTable = new Map<string, Issue[]>();
  const lowerToOriginal = new Map<string, string>();
  const noTableIssues: Issue[] = [];

  for (const issue of issues) {
    if (issue.tableName) {
      const original = issue.tableName;
      const lower = original.toLowerCase();
      // First occurrence wins for the canonical casing of each table.
      if (!lowerToOriginal.has(lower)) {
        lowerToOriginal.set(lower, original);
      }
      const key = lowerToOriginal.get(lower)!;
      if (!byTable.has(key)) byTable.set(key, []);
      byTable.get(key)!.push(issue);
    } else {
      noTableIssues.push(issue);
    }
  }

  // Get topological order from FK graph.
  // The FK graph is keyed on lowercase names, so we pass lowercase sets for
  // lookups and translate the results back to original case for output.
  let orderedTables: string[];
  const cycleMembers = new Set<string>(); // stored in lowercase for graph lookups

  if (fkGraph) {
    // FK graph expects lowercase keys
    const allTablesLower = new Set([...byTable.keys()].map(t => t.toLowerCase()));
    const orderedLower = fkGraph.getTopologicalOrder(allTablesLower);

    // Identify cycle members (SCCs with size > 1 OR self-referencing tables)
    const sccs = fkGraph.getSCCs();
    for (const scc of sccs) {
      if (scc.length > 1) {
        for (const t of scc) cycleMembers.add(t); // t is already lowercase from graph
      }
    }
    // Self-referencing tables are also cycle members
    const selfRefTables = fkGraph.getSelfRefTables?.();
    if (selfRefTables) {
      for (const t of selfRefTables) cycleMembers.add(t);
    }

    // Translate ordered lowercase names back to original-case names
    orderedTables = orderedLower.map(lower => lowerToOriginal.get(lower) ?? lower);

    // Add tables not in FK graph (no relationships) - O(n) with Set
    const orderedSet = new Set(orderedLower);
    for (const originalName of byTable.keys()) {
      if (!orderedSet.has(originalName.toLowerCase())) {
        orderedTables.push(originalName);
      }
    }
  } else {
    orderedTables = [...byTable.keys()].sort();
  }

  // Build ordered groups
  const groups: OrderedFixGroup[] = [];

  for (const table of orderedTables) {
    const tableIssues = byTable.get(table);
    if (!tableIssues || tableIssues.length === 0) continue;

    // Sort issues within table: errors first, then warnings, then info
    const severityOrder = { error: 0, warning: 1, info: 2 };
    tableIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    groups.push({
      tableName: table, // original case preserved
      issues: tableIssues,
      hasCycle: cycleMembers.has(table.toLowerCase()), // graph uses lowercase
    });
  }

  // Add issues without table name as a special group
  if (noTableIssues.length > 0) {
    groups.push({
      tableName: '__config__',
      issues: noTableIssues,
      hasCycle: false,
    });
  }

  return groups;
}
