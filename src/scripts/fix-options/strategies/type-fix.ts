/**
 * Type Fix Strategies
 * Handles: float_double_precision (FLOAT(M,D) / DOUBLE(M,D) deprecated syntax)
 */

import type { FixOption } from '../../domain/fix-option';
import type { Issue } from '../../types';
import { escapeIdentifier } from '../../security/sql-escape';

export function generateTypeFixOptions(issue: Issue): FixOption[] {
  const table = issue.tableName ?? 'unknown';
  const column = issue.columnName ?? 'unknown';
  const columnType = issue.columnType ?? 'FLOAT';
  const escapedTable = escapeIdentifier(table);
  const escapedColumn = escapeIdentifier(column);

  const options: FixOption[] = [];

  // Determine the base type
  const isDouble = /DOUBLE/i.test(columnType);
  const baseType = isDouble ? 'DOUBLE' : 'FLOAT';

  // Option A: Remove precision spec (keep FLOAT/DOUBLE)
  options.push({
    strategy: 'type_change',
    label: `${baseType}로 변환 (정밀도 제거)`,
    description: `${columnType}에서 deprecated된 (M,D) 구문을 제거하고 ${baseType}로 변경합니다.`,
    sqlTemplate: `ALTER TABLE ${escapedTable} MODIFY COLUMN ${escapedColumn} ${baseType};`,
    isRecommended: false,
    effort: 'low',
    risk: 'low',
    impact: '부동소수점 근사값 동작은 동일하게 유지됨',
    reversibility: 'reversible',
    rollbackTemplate: `ALTER TABLE ${escapedTable} MODIFY COLUMN ${escapedColumn} ${columnType};`,
  });

  // Option B: Convert to DECIMAL (exact precision)
  const precMatch = columnType.match(/\((\d+),\s*(\d+)\)/);
  const precision = precMatch ? precMatch[1] : '10';
  const scale = precMatch ? precMatch[2] : '2';

  options.push({
    strategy: 'type_change',
    label: `DECIMAL(${precision},${scale})로 변환`,
    description: `정확한 소수점 연산이 필요한 경우 DECIMAL 타입으로 변환합니다. 금액 등 정밀 계산에 권장.`,
    sqlTemplate: `ALTER TABLE ${escapedTable} MODIFY COLUMN ${escapedColumn} DECIMAL(${precision},${scale});`,
    isRecommended: false,
    effort: 'low',
    risk: 'medium',
    impact: '데이터 저장 방식 변경 (근사값 → 고정소수점). 기존 비교 로직 확인 필요.',
    reversibility: 'reversible',
    rollbackTemplate: `ALTER TABLE ${escapedTable} MODIFY COLUMN ${escapedColumn} ${columnType};`,
  });

  return options;
}
