/**
 * Charset Cascade Analyzer
 *
 * Detects charset/collation mismatches across FK relationships.
 * When a utf8mb3 table has an FK to a utf8mb4 table (or vice versa),
 * MySQL 8.4 raises Error 3780 during ALTER TABLE.
 *
 * Also detects column-level collation mismatches in FK join columns.
 */

import type { TableInfo, Issue, ColumnInfo } from '../types';
import type { FKGraphBuilder } from './fk-graph';

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

/** Find column info by name (case-insensitive) */
function findColumn(table: TableInfo, columnName: string): ColumnInfo | undefined {
  return table.columns.find(c => c.name.toLowerCase() === columnName.toLowerCase());
}

/**
 * Analyze FK relationships for charset/collation mismatches.
 * Returns issues for each mismatched FK.
 */
export function analyzeCharsetCascade(
  tables: Map<string, TableInfo>,
  fkGraph: FKGraphBuilder
): Issue[] {
  const issues: Issue[] = [];
  const allEdges = fkGraph.getAllEdges();

  for (const edge of allEdges) {
    const childTable = tables.get(edge.childTable) ??
      findTableCaseInsensitive(tables, edge.childTable);
    const parentTable = tables.get(edge.parentTable) ??
      findTableCaseInsensitive(tables, edge.parentTable);

    if (!childTable || !parentTable) continue;

    // Check each FK column pair (only for text/string columns)
    for (let i = 0; i < edge.childColumns.length; i++) {
      const childCol = edge.childColumns[i];
      const parentCol = edge.parentColumns[i];

      // Issue #1 fix: Skip non-text columns (INT, BIGINT, etc.) — charset is irrelevant
      const childColInfo = findColumn(childTable, childCol);
      const parentColInfo = findColumn(parentTable, parentCol);
      if (childColInfo && !isTextColumn(childColInfo.type)) continue;
      if (parentColInfo && !isTextColumn(parentColInfo.type)) continue;

      const childCharsetInfo = resolveCharset(childTable, childCol);
      const parentCharsetInfo = resolveCharset(parentTable, parentCol);

      // Check charset mismatch
      if (childCharsetInfo.charset !== parentCharsetInfo.charset) {
        const severity = isCharsetUpgradeMismatch(childCharsetInfo.charset, parentCharsetInfo.charset)
          ? 'error' as const
          : 'warning' as const;

        issues.push({
          id: 'fk_charset_mismatch',
          type: 'schema',
          category: 'invalidObjects',
          severity,
          title: 'FK 문자셋 불일치 (Error 3780 위험)',
          description: `테이블 '${childTable.name}'의 FK '${edge.fkName}'에서 문자셋 불일치: ` +
            `${childTable.name}.${childCol} (${childCharsetInfo.charset}) ↔ ` +
            `${parentTable.name}.${parentCol} (${parentCharsetInfo.charset}). ` +
            `MySQL 8.4에서 ALTER TABLE 시 Error 3780이 발생합니다.`,
          suggestion: `FK 양쪽의 문자셋을 일치시키세요. 권장: 양쪽 모두 utf8mb4로 변환.`,
          location: `FK: ${childTable.name} -> ${parentTable.name}`,
          tableName: childTable.name,
          columnName: childCol,
          code: `FOREIGN KEY (${edge.childColumns.join(', ')}) REFERENCES ${parentTable.name}(${edge.parentColumns.join(', ')})`,
          fkContext: {
            relatedTables: [childTable.name, parentTable.name],
            isChildTable: true,
            hasCycle: false,
          },
          fixQuery: generateCharsetFixSQL(childTable.name, childCol, parentTable.name, parentCol, childTable, parentTable),
          mysqlShellCheckId: 'charsetMismatch',
        });
      }

      // Check collation mismatch (same charset but different collation)
      if (
        childCharsetInfo.charset === parentCharsetInfo.charset &&
        childCharsetInfo.collation && parentCharsetInfo.collation &&
        childCharsetInfo.collation !== parentCharsetInfo.collation
      ) {
        issues.push({
          id: 'fk_collation_mismatch',
          type: 'schema',
          category: 'invalidObjects',
          severity: 'warning',
          title: 'FK Collation 불일치',
          description: `테이블 '${childTable.name}'의 FK '${edge.fkName}'에서 collation 불일치: ` +
            `${childTable.name}.${childCol} (${childCharsetInfo.collation}) ↔ ` +
            `${parentTable.name}.${parentCol} (${parentCharsetInfo.collation}).`,
          suggestion: `FK 양쪽 컬럼의 collation을 일치시키세요.`,
          location: `FK: ${childTable.name} -> ${parentTable.name}`,
          tableName: childTable.name,
          columnName: childCol,
          code: `FOREIGN KEY (${edge.childColumns.join(', ')}) REFERENCES ${parentTable.name}(${edge.parentColumns.join(', ')})`,
          fkContext: {
            relatedTables: [childTable.name, parentTable.name],
            isChildTable: true,
          },
        });
      }
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
  childCol: string,
  parentTable: string,
  parentCol: string,
  childTableInfo?: TableInfo,
  parentTableInfo?: TableInfo
): string {
  const parentColDef = buildColumnModify(parentTableInfo, parentCol);
  const childColDef = buildColumnModify(childTableInfo, childCol);

  return [
    `-- Step 1: FK 비활성화`,
    `SET FOREIGN_KEY_CHECKS = 0;`,
    ``,
    `-- Step 2: 양쪽 컬럼을 utf8mb4로 변환`,
    `ALTER TABLE \`${parentTable}\` ${parentColDef};`,
    `ALTER TABLE \`${childTable}\` ${childColDef};`,
    ``,
    `-- Step 3: FK 재활성화`,
    `SET FOREIGN_KEY_CHECKS = 1;`,
  ].join('\n');
}

/** Build MODIFY COLUMN clause preserving original type/nullability/default */
function buildColumnModify(table: TableInfo | undefined, colName: string): string {
  if (!table) {
    return `MODIFY COLUMN \`${colName}\` /* 원본 타입 확인 필요 */ CHARACTER SET utf8mb4`;
  }
  const col = findColumn(table, colName);
  if (!col) {
    return `MODIFY COLUMN \`${colName}\` /* 원본 타입 확인 필요 */ CHARACTER SET utf8mb4`;
  }

  const parts = [`MODIFY COLUMN \`${colName}\` ${col.type} CHARACTER SET utf8mb4`];
  if (!col.nullable) parts.push('NOT NULL');
  if (col.default !== undefined) {
    parts.push(`DEFAULT ${col.default === 'NULL' ? 'NULL' : `'${col.default}'`}`);
  }
  return parts.join(' ');
}

function findTableCaseInsensitive(
  tables: Map<string, TableInfo>,
  name: string
): TableInfo | undefined {
  const lower = name.toLowerCase();
  for (const [key, table] of tables) {
    if (key.toLowerCase() === lower) return table;
  }
  return undefined;
}
