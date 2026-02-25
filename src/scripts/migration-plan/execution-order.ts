/**
 * Execution Order
 *
 * Determines the safe order for executing fix SQL statements
 * based on FK dependency graph topological sort.
 */

import type { Issue } from '../types';
import type { IFKGraphBuilder } from '../domain/analysis-context';

export interface OrderedFixGroup {
  /** Table name (lowercase) */
  tableName: string;
  /** Issues for this table, ordered by priority */
  issues: Issue[];
  /** Whether this table is part of a circular FK dependency */
  hasCycle: boolean;
}

/**
 * Group issues by table and order them using FK topological sort.
 * Tables without FK relationships come last (alphabetical).
 */
export function computeExecutionOrder(
  issues: Issue[],
  fkGraph: IFKGraphBuilder | null
): OrderedFixGroup[] {
  // Group issues by table
  const byTable = new Map<string, Issue[]>();
  const noTableIssues: Issue[] = [];

  for (const issue of issues) {
    if (issue.tableName) {
      const key = issue.tableName.toLowerCase();
      if (!byTable.has(key)) byTable.set(key, []);
      byTable.get(key)!.push(issue);
    } else {
      noTableIssues.push(issue);
    }
  }

  // Get topological order from FK graph
  let orderedTables: string[];
  const cycleMembers = new Set<string>();

  if (fkGraph) {
    const allTables = new Set(byTable.keys());
    orderedTables = fkGraph.getTopologicalOrder(allTables);

    // Identify cycle members (SCCs with size > 1 OR self-referencing tables)
    const sccs = fkGraph.getSCCs();
    for (const scc of sccs) {
      if (scc.length > 1) {
        for (const t of scc) cycleMembers.add(t);
      }
    }
    // Self-referencing tables are also cycle members
    const selfRefTables = fkGraph.getSelfRefTables?.();
    if (selfRefTables) {
      for (const t of selfRefTables) cycleMembers.add(t);
    }

    // Add tables not in FK graph (no relationships) - O(n) with Set
    const orderedSet = new Set(orderedTables);
    for (const t of byTable.keys()) {
      if (!orderedSet.has(t)) {
        orderedTables.push(t);
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
      tableName: table,
      issues: tableIssues,
      hasCycle: cycleMembers.has(table),
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
