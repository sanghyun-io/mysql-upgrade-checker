/**
 * Date Fix Strategies
 * Handles: invalid_date_zero, invalid_datetime_zero
 */

import type { FixOption } from '../../domain/fix-option';
import type { Issue } from '../../types';

export function generateDateFixOptions(issue: Issue): FixOption[] {
  const table = issue.tableName ?? 'unknown';
  const column = issue.columnName ?? 'unknown';
  const isNullable = issue.columnContext?.nullable ?? false;

  const options: FixOption[] = [];

  // Option A: Set to NULL (only if column is nullable)
  if (isNullable) {
    options.push({
      strategy: 'date_to_null',
      label: 'NULL로 변환',
      description: `'0000-00-00' 값을 NULL로 변환합니다. 컬럼이 nullable이므로 안전합니다.`,
      sqlTemplate: `UPDATE \`${table}\` SET \`${column}\` = NULL WHERE \`${column}\` = '0000-00-00';`,
      isRecommended: false, // recommender에서 결정
      effort: 'low',
      risk: 'low',
      impact: '기존 코드에서 NULL 체크가 필요할 수 있음',
      reversibility: 'manual_only',
      rollbackTemplate: null,
    });
  }

  // Option B: Set to minimum valid date
  const isDateTime = issue.id === 'invalid_datetime_zero';
  const minDate = isDateTime ? '1000-01-01 00:00:00' : '1000-01-01';
  options.push({
    strategy: 'date_to_min',
    label: '최소 유효 날짜로 변환',
    description: `'0000-00-00' 값을 MySQL 최소 유효 날짜 '${minDate}'로 변환합니다.`,
    sqlTemplate: `UPDATE \`${table}\` SET \`${column}\` = '${minDate}' WHERE \`${column}\` = '0000-00-00';`,
    isRecommended: false,
    effort: 'low',
    risk: 'low',
    impact: '날짜 비교 로직에 영향 가능',
    reversibility: 'manual_only',
    rollbackTemplate: null,
  });

  // Option C: Custom date (manual)
  options.push({
    strategy: 'date_to_custom',
    label: '사용자 지정 날짜로 변환',
    description: `비즈니스 로직에 맞는 날짜를 직접 지정합니다.`,
    sqlTemplate: `-- 사용자 지정 날짜로 변환:\nUPDATE \`${table}\` SET \`${column}\` = 'YYYY-MM-DD' WHERE \`${column}\` = '0000-00-00';`,
    isRecommended: false,
    effort: 'medium',
    risk: 'low',
    impact: '비즈니스 로직에 가장 적합한 날짜를 선택 가능',
    reversibility: 'manual_only',
    rollbackTemplate: null,
  });

  return options;
}
