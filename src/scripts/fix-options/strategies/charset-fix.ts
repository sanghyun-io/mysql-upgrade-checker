/**
 * Charset Fix Strategies
 * Handles: utf8_charset, fk_charset_mismatch
 */

import type { FixOption } from '../../domain/fix-option';
import type { Issue } from '../../types';
import { escapeIdentifier } from '../../security/sql-escape';

export function generateCharsetFixOptions(issue: Issue): FixOption[] {
  const table = issue.tableName ?? 'unknown';
  const column = issue.columnName;
  const hasFKRelations = (issue.fkContext?.relatedTables?.length ?? 0) > 0;
  const relatedTables = issue.fkContext?.relatedTables ?? [];
  const escapedTable = escapeIdentifier(table);

  const options: FixOption[] = [];

  if (!hasFKRelations) {
    // Simple single-table charset conversion
    const escapedColumn = column ? escapeIdentifier(column) : null;
    options.push({
      strategy: 'collation_single',
      label: 'utf8mb4로 단일 변환',
      description: `테이블을 utf8mb4로 직접 변환합니다. FK 관계가 없어 안전합니다.`,
      sqlTemplate: escapedColumn
        ? `ALTER TABLE ${escapedTable} MODIFY COLUMN ${escapedColumn} ${issue.columnType ?? 'VARCHAR(255)'} CHARACTER SET utf8mb4;`
        : `ALTER TABLE ${escapedTable} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      isRecommended: false,
      effort: 'low',
      risk: 'low',
      impact: '인덱스 크기 증가 가능 (3byte -> 4byte per char)',
      reversibility: 'partially_reversible',
      rollbackTemplate: `ALTER TABLE ${escapedTable} CONVERT TO CHARACTER SET utf8mb3;`,
    });
  } else {
    // FK cascade mode: convert all related tables (FK checks managed by plan generator)
    const uniqueRelatedCascade = [...new Set(relatedTables.filter(t => t.toLowerCase() !== table.toLowerCase()))];
    const fkCascadeSQL = [
      `-- FK 체크는 Migration Plan에서 일괄 관리됩니다.`,
      ...uniqueRelatedCascade.map(t => `ALTER TABLE ${escapeIdentifier(t)} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`),
      `ALTER TABLE ${escapedTable} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    ].join('\n');

    options.push({
      strategy: 'collation_fk_cascade',
      label: 'FK 관련 테이블 일괄 변환',
      description: `FK 체크를 비활성화하고 관련 테이블(${uniqueRelatedCascade.length}개)을 모두 utf8mb4로 변환합니다.`,
      sqlTemplate: fkCascadeSQL,
      isRecommended: false,
      effort: 'medium',
      risk: 'medium',
      impact: `${uniqueRelatedCascade.length}개 관련 테이블 영향. 대용량 테이블의 경우 시간 소요.`,
      reversibility: 'partially_reversible',
      rollbackTemplate: null,
    });

    // FK safe mode: use Migration Plan for correct topological ordering
    const uniqueRelated = [...new Set(relatedTables.filter(t => t.toLowerCase() !== table.toLowerCase()))];
    options.push({
      strategy: 'collation_fk_safe',
      label: 'FK 안전 순서로 변환',
      description: `Migration Plan의 위상 정렬 순서에 따라 한 테이블씩 순서대로 변환합니다. 가장 안전하지만 느립니다.`,
      sqlTemplate: [
        `-- ⚠️ 실제 실행 순서는 Migration Plan의 FK 위상 정렬을 따르세요.`,
        `-- 아래는 변환 대상 테이블 목록입니다:`,
        ...uniqueRelated.map(t => `ALTER TABLE ${escapeIdentifier(t)} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`),
        `ALTER TABLE ${escapedTable} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      ].join('\n'),
      isRecommended: false,
      effort: 'high',
      risk: 'low',
      impact: '각 테이블을 순서대로 변환하여 FK 무결성 유지',
      reversibility: 'partially_reversible',
      rollbackTemplate: null,
    });
  }

  // Skip option
  options.push({
    strategy: 'skip',
    label: '변환하지 않음',
    description: `현재 상태를 유지합니다. utf8mb3은 MySQL 8.4에서 deprecated이지만 즉시 오류는 아닙니다.`,
    sqlTemplate: null,
    isRecommended: false,
    effort: 'low',
    risk: 'medium',
    impact: 'utf8mb3 관련 경고가 계속 발생. 향후 MySQL 버전에서 제거 예정.',
    reversibility: 'reversible',
  });

  return options;
}
