/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules - Data Integrity
 * Covers: dataIntegrity
 */

import type { CompatibilityRule } from '../types';

// ============================================================================
// DATA INTEGRITY RULES
// ============================================================================
export const dataIntegrityRules: CompatibilityRule[] = [
  {
    id: 'enum_empty_value',
    type: 'data',
    category: 'dataIntegrity',
    severity: 'error',
    title: 'ENUM 컬럼에 빈 값',
    description: 'ENUM 컬럼에 빈 문자열이 저장되어 있습니다. strict 모드에서 문제가 될 수 있습니다.',
    suggestion: 'ENUM에 정의된 유효한 값으로 변경하거나 NULL을 허용하도록 스키마를 수정하세요.',
    detectInData: (value, columnType) => {
      return /ENUM/i.test(columnType || '') && /[,\(]['"]['"]/i.test(value);
    },
    generateFixQuery: (context) => {
      if (context.tableName && context.columnName && context.enumValues) {
        const firstValue = context.enumValues[0] || 'default';
        return [
          `-- ENUM 컬럼의 빈 값을 첫 번째 ENUM 값으로 변경`,
          `UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = '${firstValue}' WHERE \`${context.columnName}\` = '';`,
          ``,
          `-- 또는 NULL을 허용하도록 컬럼 수정`,
          `-- ALTER TABLE \`${context.tableName}\` MODIFY COLUMN \`${context.columnName}\` ${context.columnType} NULL;`,
          `-- UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = NULL WHERE \`${context.columnName}\` = '';`
        ].join('\n');
      }
      return null;
    }
  },
  {
    id: 'enum_numeric_index',
    type: 'data',
    category: 'dataIntegrity',
    severity: 'warning',
    title: 'ENUM 숫자 인덱스 사용',
    description: 'ENUM 값을 숫자로 저장하면 ENUM 정의 순서 변경 시 데이터가 잘못 해석될 수 있습니다.',
    suggestion: 'ENUM 값은 문자열로 저장하는 것이 안전합니다.',
    detectInData: (value, columnType) => {
      return /ENUM/i.test(columnType || '') && /[,\(]\d+[,\)]/i.test(value);
    }
  },
  {
    id: 'data_4byte_chars',
    type: 'data',
    category: 'dataIntegrity',
    severity: 'warning',
    title: '4바이트 UTF-8 문자 발견',
    description: 'utf8mb3 문자셋으로는 저장할 수 없는 이모지 또는 4바이트 UTF-8 문자가 포함되어 있습니다.',
    suggestion: '테이블 문자셋을 utf8mb4로 변경해야 합니다.',
    generateFixQuery: (context) => {
      if (context.tableName) {
        return `ALTER TABLE \`${context.tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`;
      }
      return null;
    }
  },
  {
    id: 'data_null_byte',
    type: 'data',
    category: 'dataIntegrity',
    severity: 'error',
    title: 'NULL 바이트 발견',
    description: '데이터에 NULL 바이트(\\0)가 포함되어 있습니다.',
    suggestion: 'NULL 바이트를 제거하거나 BLOB 타입 사용을 고려하세요.',
    generateFixQuery: (context) => {
      if (context.tableName && context.columnName) {
        return `UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = REPLACE(\`${context.columnName}\`, CHAR(0), '') WHERE \`${context.columnName}\` LIKE '%' + CHAR(0) + '%';`;
      }
      return null;
    }
  },
  {
    id: 'timestamp_out_of_range',
    type: 'data',
    category: 'dataIntegrity',
    severity: 'error',
    title: 'TIMESTAMP 범위 초과',
    description: 'TIMESTAMP는 1970-01-01 00:00:01 ~ 2038-01-19 03:14:07 범위만 지원합니다.',
    suggestion: 'DATETIME 타입으로 변경을 고려하세요.',
    detectInData: (value, columnType) => {
      if (!/TIMESTAMP/i.test(columnType || '')) return false;
      const match = value.match(/['"](\d{4}-\d{2}-\d{2})/);
      if (match) {
        const year = parseInt(match[1].split('-')[0]);
        return year < 1970 || year > 2038;
      }
      return false;
    },
    generateFixQuery: (context) => {
      if (context.tableName && context.columnName) {
        return `ALTER TABLE \`${context.tableName}\` MODIFY COLUMN \`${context.columnName}\` DATETIME;`;
      }
      return null;
    }
  }
];
