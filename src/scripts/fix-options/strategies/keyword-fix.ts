/**
 * Keyword Fix Strategies
 * Handles: reserved_keyword_table_parsed, reserved_keyword_column_parsed
 */

import type { FixOption } from '../../domain/fix-option';
import type { Issue } from '../../types';
import { escapeIdentifier } from '../../security/sql-escape';

export function generateKeywordFixOptions(issue: Issue): FixOption[] {
  const table = issue.tableName ?? 'unknown';
  const column = issue.columnName;
  const isTableLevel = issue.id === 'reserved_keyword_table_parsed';
  const escapedTable = escapeIdentifier(table);

  const options: FixOption[] = [];

  if (isTableLevel) {
    const renamedTable = escapeIdentifier(table + '_tbl');
    // Option A: Rename table
    options.push({
      strategy: 'rename',
      label: '테이블 이름 변경',
      description: `예약어와 충돌하는 테이블 이름을 변경합니다. 참조하는 모든 코드와 FK를 수정해야 합니다.`,
      sqlTemplate: `ALTER TABLE ${escapedTable} RENAME TO ${renamedTable};`,
      isRecommended: false,
      effort: 'high',
      risk: 'high',
      impact: '모든 참조 코드, 뷰, 프로시저, FK를 수정해야 함',
      reversibility: 'reversible',
      rollbackTemplate: `ALTER TABLE ${renamedTable} RENAME TO ${escapedTable};`,
    });

    // Option B: Use backtick quoting
    options.push({
      strategy: 'backtick_quote',
      label: '백틱(`) 인용 사용',
      description: `테이블 이름을 백틱으로 감싸서 예약어 충돌을 회피합니다. 모든 SQL 쿼리에서 백틱을 사용해야 합니다.`,
      sqlTemplate: `-- 모든 SQL에서 테이블 이름을 백틱으로 감싸세요:\n-- SELECT * FROM ${escapedTable};`,
      isRecommended: false,
      effort: 'medium',
      risk: 'low',
      impact: '모든 SQL 쿼리에서 백틱 필요. ORM 사용 시 자동 처리됨.',
      reversibility: 'reversible',
    });
  } else if (column) {
    const escapedColumn = escapeIdentifier(column);
    const renamedColumn = escapeIdentifier(column + '_col');
    // Column-level rename
    options.push({
      strategy: 'rename',
      label: '컬럼 이름 변경',
      description: `예약어와 충돌하는 컬럼 이름을 변경합니다.`,
      sqlTemplate: `ALTER TABLE ${escapedTable} RENAME COLUMN ${escapedColumn} TO ${renamedColumn};`,
      isRecommended: false,
      effort: 'high',
      risk: 'high',
      impact: '모든 참조 코드, 뷰, 인덱스를 수정해야 함',
      reversibility: 'reversible',
      rollbackTemplate: `ALTER TABLE ${escapedTable} RENAME COLUMN ${renamedColumn} TO ${escapedColumn};`,
    });

    // Option B: Use backtick quoting
    options.push({
      strategy: 'backtick_quote',
      label: '백틱(`) 인용 사용',
      description: `컬럼 이름을 백틱으로 감싸서 예약어 충돌을 회피합니다.`,
      sqlTemplate: `-- 모든 SQL에서 컬럼 이름을 백틱으로 감싸세요:\n-- SELECT ${escapedColumn} FROM ${escapedTable};`,
      isRecommended: false,
      effort: 'medium',
      risk: 'low',
      impact: '모든 SQL 쿼리에서 백틱 필요. ORM 사용 시 자동 처리됨.',
      reversibility: 'reversible',
    });
  }

  return options;
}
