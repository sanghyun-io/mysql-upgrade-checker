/**
 * Charset Cascade Analyzer
 *
 * Detects charset/collation mismatches across FK relationships.
 * When a utf8mb3 table has an FK to a utf8mb4 table (or vice versa),
 * MySQL 8.4 raises Error 3780 during ALTER TABLE.
 *
 * Also detects column-level collation mismatches in FK join columns.
 */

import type { TableInfo, Issue } from '../types';
import type { FKGraphBuilder } from './fk-graph';
import { escapeIdentifier } from '../security/sql-escape';

/** Charset mismatch detail for an FK relationship */
export interface CharsetMismatch {
  childTable: string;
  parentTable: string;
  childColumns: string[];
  parentColumns: string[];
  childCharset: string;
  parentCharset: string;
  childCollation?: string;
  parentCollation?: string;
  fkName: string;
}

/**
 * Resolve the effective charset for a column.
 * Priority: column charset > table charset > 'utf8mb4' (MySQL 8.4 default)
 */
function resolveCharset(
  table: TableInfo,
  columnName: string
): { charset: string; collation?: string } {
  const col = table.columns.find(c => c.name.toLowerCase() === columnName.toLowerCase());

  if (col?.charset) {
    return { charset: normalizeCharset(col.charset), collation: col.collation?.toLowerCase() };
  }

  if (table.charset) {
    return { charset: normalizeCharset(table.charset), collation: table.collation?.toLowerCase() };
  }

  return { charset: 'utf8mb4' };
}

/** Normalize utf8 -> utf8mb3 for consistent comparison */
function normalizeCharset(charset: string): string {
  const lower = charset.toLowerCase();
  if (lower === 'utf8') return 'utf8mb3';
  return lower;
}

/** Column types that have charset/collation (text/string family) */
const TEXT_TYPE_PATTERN = /^(char|varchar|text|tinytext|mediumtext|longtext|enum|set)\b/i;

/** Check if a column type is a character/string type that has charset */
function isTextColumn(type: string): boolean {
  return TEXT_TYPE_PATTERN.test(type.trim());
}

/** Mismatch info collected per column pair within one FK edge */
interface ColumnMismatch {
  childCol: string;
  parentCol: string;
  childCharset: string;
  parentCharset: string;
  childCollation?: string;
  parentCollation?: string;
  isCharsetMismatch: boolean;
  isCollationMismatch: boolean;
}

/**
 * Analyze FK relationships for charset/collation mismatches.
 * Returns issues for each mismatched FK.
 * One issue per FK edge (not per column pair) to avoid duplicates.
 */
export function analyzeCharsetCascade(
  tables: Map<string, TableInfo>,
  fkGraph: FKGraphBuilder
): Issue[] {
  const issues: Issue[] = [];
  const allEdges = fkGraph.getAllEdges();

  // Issue #13 fix: Build a lowercase lookup Map for O(1) table access instead of O(T) linear scan
  const tableMap = new Map<string, TableInfo>();
  for (const [key, table] of tables) {
    tableMap.set(key.toLowerCase(), table);
  }

  // Build per-table column maps on first access (lazy, keyed by table name lowercase)
  const columnMapCache = new Map<string, Map<string, TableInfo['columns'][number]>>();

  function getColumnMap(table: TableInfo): Map<string, TableInfo['columns'][number]> {
    const key = table.name.toLowerCase();
    let colMap = columnMapCache.get(key);
    if (!colMap) {
      colMap = new Map<string, TableInfo['columns'][number]>();
      for (const col of table.columns) {
        colMap.set(col.name.toLowerCase(), col);
      }
      columnMapCache.set(key, colMap);
    }
    return colMap;
  }

  for (const edge of allEdges) {
    // Issue #13 fix: O(1) lookup via Map instead of O(T) findTableCaseInsensitive
    const childTable = tableMap.get(edge.childTable.toLowerCase());
    const parentTable = tableMap.get(edge.parentTable.toLowerCase());

    if (!childTable || !parentTable) continue;

    // Issue #6 fix: Guard against length mismatch in composite FK column arrays
    if (edge.childColumns.length !== edge.parentColumns.length) continue;

    // Issue #7 fix: Collect all column mismatches for this edge first,
    // then emit a single issue per edge (not one per column pair)
    const charsetMismatches: ColumnMismatch[] = [];
    const collationMismatches: ColumnMismatch[] = [];

    const childColMap = getColumnMap(childTable);
    const parentColMap = getColumnMap(parentTable);

    for (let i = 0; i < edge.childColumns.length; i++) {
      const childColName = edge.childColumns[i];
      const parentColName = edge.parentColumns[i];

      // Issue #13 fix: O(1) column lookup via Map instead of O(C) find()
      const childColInfo = childColMap.get(childColName.toLowerCase());
      const parentColInfo = parentColMap.get(parentColName.toLowerCase());

      // Skip non-text columns (INT, BIGINT, etc.) — charset is irrelevant
      if (childColInfo && !isTextColumn(childColInfo.type)) continue;
      if (parentColInfo && !isTextColumn(parentColInfo.type)) continue;

      // Issue #6 fix: If column metadata is not found for a text column,
      // skip this pair rather than falling back to table default (avoids false positives)
      // Only skip when we have no info at all for either side — if one side has metadata
      // and the other doesn't, we still proceed (table-level fallback is valid for that side)
      const childColMissing = !childColInfo;
      const parentColMissing = !parentColInfo;
      if (childColMissing && parentColMissing) continue;

      const childCharsetInfo = resolveCharset(childTable, childColName);
      const parentCharsetInfo = resolveCharset(parentTable, parentColName);

      // Collect charset mismatch
      if (childCharsetInfo.charset !== parentCharsetInfo.charset) {
        charsetMismatches.push({
          childCol: childColName,
          parentCol: parentColName,
          childCharset: childCharsetInfo.charset,
          parentCharset: parentCharsetInfo.charset,
          childCollation: childCharsetInfo.collation,
          parentCollation: parentCharsetInfo.collation,
          isCharsetMismatch: true,
          isCollationMismatch: false,
        });
      }

      // Collect collation mismatch (same charset but different collation)
      if (
        childCharsetInfo.charset === parentCharsetInfo.charset &&
        childCharsetInfo.collation && parentCharsetInfo.collation &&
        childCharsetInfo.collation !== parentCharsetInfo.collation
      ) {
        collationMismatches.push({
          childCol: childColName,
          parentCol: parentColName,
          childCharset: childCharsetInfo.charset,
          parentCharset: parentCharsetInfo.charset,
          childCollation: childCharsetInfo.collation,
          parentCollation: parentCharsetInfo.collation,
          isCharsetMismatch: false,
          isCollationMismatch: true,
        });
      }
    }

    // Issue #7 fix: Emit one issue per FK edge for charset mismatches (aggregate all column pairs)
    if (charsetMismatches.length > 0) {
      // Use the first mismatch to determine severity — if any pair is utf8mb3/utf8mb4, it's an error
      const isError = charsetMismatches.some(m =>
        isCharsetUpgradeMismatch(m.childCharset, m.parentCharset)
      );
      const severity = isError ? 'error' as const : 'warning' as const;

      // Build description aggregating all mismatched column pairs
      const pairDescriptions = charsetMismatches.map(m =>
        `${childTable.name}.${m.childCol} (${m.childCharset}) ↔ ` +
        `${parentTable.name}.${m.parentCol} (${m.parentCharset})`
      ).join('; ');

      const description = charsetMismatches.length === 1
        ? `테이블 '${childTable.name}'의 FK '${edge.fkName}'에서 문자셋 불일치: ${pairDescriptions}. ` +
          `MySQL 8.4에서 ALTER TABLE 시 Error 3780이 발생합니다.`
        : `테이블 '${childTable.name}'의 FK '${edge.fkName}'에서 ${charsetMismatches.length}개 컬럼 쌍의 문자셋 불일치: ` +
          `${pairDescriptions}. MySQL 8.4에서 ALTER TABLE 시 Error 3780이 발생합니다.`;

      issues.push({
        id: 'fk_charset_mismatch',
        type: 'schema',
        category: 'invalidObjects',
        severity,
        title: 'FK 문자셋 불일치 (Error 3780 위험)',
        description,
        suggestion: `FK 양쪽의 문자셋을 일치시키세요. 권장: 양쪽 모두 utf8mb4로 변환.`,
        location: `FK: ${childTable.name} -> ${parentTable.name}`,
        tableName: childTable.name,
        columnName: charsetMismatches[0].childCol,
        code: `FOREIGN KEY (${edge.childColumns.join(', ')}) REFERENCES ${parentTable.name}(${edge.parentColumns.join(', ')})`,
        fkContext: {
          relatedTables: [childTable.name, parentTable.name],
          isChildTable: true,
          hasCycle: false,
        },
        fixQuery: generateCharsetFixSQL(childTable.name, charsetMismatches[0].childCol, parentTable.name, charsetMismatches[0].parentCol),
        mysqlShellCheckId: 'charsetMismatch',
      });
    }

    // Issue #7 fix: Emit one issue per FK edge for collation mismatches
    if (collationMismatches.length > 0) {
      const pairDescriptions = collationMismatches.map(m =>
        `${childTable.name}.${m.childCol} (${m.childCollation}) ↔ ` +
        `${parentTable.name}.${m.parentCol} (${m.parentCollation})`
      ).join('; ');

      const description = collationMismatches.length === 1
        ? `테이블 '${childTable.name}'의 FK '${edge.fkName}'에서 collation 불일치: ${pairDescriptions}.`
        : `테이블 '${childTable.name}'의 FK '${edge.fkName}'에서 ${collationMismatches.length}개 컬럼 쌍의 collation 불일치: ${pairDescriptions}.`;

      issues.push({
        id: 'fk_collation_mismatch',
        type: 'schema',
        category: 'invalidObjects',
        severity: 'warning',
        title: 'FK Collation 불일치',
        description,
        suggestion: `FK 양쪽 컬럼의 collation을 일치시키세요.`,
        location: `FK: ${childTable.name} -> ${parentTable.name}`,
        tableName: childTable.name,
        columnName: collationMismatches[0].childCol,
        code: `FOREIGN KEY (${edge.childColumns.join(', ')}) REFERENCES ${parentTable.name}(${edge.parentColumns.join(', ')})`,
        fkContext: {
          relatedTables: [childTable.name, parentTable.name],
          isChildTable: true,
        },
      });
    }
  }

  return issues;
}

/**
 * Check if the charset mismatch is specifically a utf8mb3 <-> utf8mb4 mismatch
 * which triggers Error 3780 during upgrade.
 */
function isCharsetUpgradeMismatch(charset1: string, charset2: string): boolean {
  const pair = [charset1, charset2].sort();
  return (pair[0] === 'utf8mb3' && pair[1] === 'utf8mb4');
}

function generateCharsetFixSQL(
  childTable: string,
  _childCol: string,
  parentTable: string,
  _parentCol: string,
): string {
  return [
    `-- FK 체크는 Migration Plan에서 일괄 관리됩니다.`,
    `-- 부모 테이블 먼저 변환:`,
    `ALTER TABLE ${escapeIdentifier(parentTable)} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    `-- 자식 테이블 변환:`,
    `ALTER TABLE ${escapeIdentifier(childTable)} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  ].join('\n');
}
