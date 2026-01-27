import type { CompatibilityRule } from './types';

export const compatibilityRules: CompatibilityRule[] = [
  // 스키마 호환성
  {
    id: 'utf8_charset',
    type: 'schema',
    pattern: /CHARSET\s*=\s*utf8(?!\w|mb4)/gi,
    severity: 'warning',
    title: 'utf8 문자셋 사용 (utf8mb3)',
    description: 'MySQL 8.4에서 utf8은 utf8mb4를 가리킵니다. 명시적으로 utf8mb4를 사용하는 것이 권장됩니다.',
    suggestion: 'CHARSET=utf8을 CHARSET=utf8mb4로 변경하세요.',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`;
      }
      return null;
    }
  },
  {
    id: 'myisam_engine',
    type: 'schema',
    pattern: /ENGINE\s*=\s*MyISAM/gi,
    severity: 'warning',
    title: 'MyISAM 엔진 사용',
    description: 'InnoDB 사용이 강력히 권장됩니다.',
    suggestion: 'ENGINE=InnoDB로 변경을 고려하세요.',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` ENGINE=InnoDB;`;
      }
      return null;
    }
  },
  {
    id: 'year2',
    type: 'schema',
    pattern: /YEAR\(2\)/gi,
    severity: 'error',
    title: 'YEAR(2) 데이터 타입',
    description: 'YEAR(2)는 deprecated되었으며 YEAR(4)로 자동 변환됩니다.',
    suggestion: 'YEAR(2)를 YEAR 또는 YEAR(4)로 변경하세요.',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      const columnMatch = context.code?.match(/`?(\w+)`?\s+YEAR\(2\)/i);
      if (tableMatch && columnMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` MODIFY COLUMN \`${columnMatch[1]}\` YEAR;`;
      }
      return null;
    }
  },
  {
    id: 'zerofill',
    type: 'schema',
    pattern: /`?(\w+)`?\s+\w+\s+ZEROFILL/gi,
    severity: 'warning',
    title: 'ZEROFILL 속성 사용',
    description: 'ZEROFILL은 MySQL 8.0.17부터 deprecated되었습니다.',
    suggestion: '애플리케이션 레벨에서 제로 패딩을 처리하세요.',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      const columnMatch = context.code?.match(/`?(\w+)`?\s+(\w+)\s+ZEROFILL/i);
      if (tableMatch && columnMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` MODIFY COLUMN \`${columnMatch[1]}\` ${columnMatch[2]};`;
      }
      return null;
    }
  },
  {
    id: 'float_precision',
    type: 'schema',
    pattern: /FLOAT\(\d+,\d+\)|DOUBLE\(\d+,\d+\)/gi,
    severity: 'warning',
    title: 'FLOAT/DOUBLE 정밀도 명시',
    description: 'FLOAT(M,D) 및 DOUBLE(M,D) 형식은 deprecated되었습니다.',
    suggestion: 'DECIMAL 타입 사용을 권장합니다.',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      const columnMatch = context.code?.match(/`?(\w+)`?\s+(FLOAT|DOUBLE)\((\d+),(\d+)\)/i);
      if (tableMatch && columnMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` MODIFY COLUMN \`${columnMatch[1]}\` DECIMAL(${columnMatch[3]},${columnMatch[4]});`;
      }
      return null;
    }
  },
  {
    id: 'latin1',
    type: 'schema',
    pattern: /CHARSET\s*=\s*latin1/gi,
    severity: 'warning',
    title: 'latin1 문자셋 사용',
    description: 'MySQL 8.4의 기본 문자셋은 utf8mb4입니다.',
    suggestion: 'utf8mb4로 변경을 고려하세요.',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`;
      }
      return null;
    }
  },
  {
    id: 'sql_calc_found_rows',
    type: 'query',
    pattern: /SQL_CALC_FOUND_ROWS/gi,
    severity: 'warning',
    title: 'SQL_CALC_FOUND_ROWS 사용',
    description: 'SQL_CALC_FOUND_ROWS는 MySQL 8.0.17부터 deprecated되었습니다.',
    suggestion: '두 개의 쿼리로 분리하거나 다른 방법을 사용하세요.'
  },
  {
    id: 'int_display_width',
    type: 'schema',
    pattern: /INT\(\d+\)(?!\s+ZEROFILL)/gi,
    severity: 'info',
    title: 'INTEGER display width',
    description: 'MySQL 8.0.17부터 정수형의 display width는 deprecated되었습니다.',
    suggestion: 'INT(11) 대신 INT를 사용하세요.'
  },

  // 데이터 무결성 문제
  {
    id: 'invalid_date_zero',
    type: 'data',
    severity: 'error',
    title: '잘못된 날짜 값: 0000-00-00',
    description: 'MySQL 8.0부터 NO_ZERO_DATE SQL 모드가 기본 활성화되어 0000-00-00 날짜를 허용하지 않습니다.',
    suggestion: 'NULL 또는 유효한 날짜로 변경해야 합니다.',
    detectInData: (value) => {
      return /['"]0000-00-00/.test(value);
    },
    generateFixQuery: (context) => {
      if (context.tableName && context.columnName) {
        return [
          `-- 0000-00-00 값을 NULL로 변경`,
          `UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = NULL WHERE \`${context.columnName}\` = '0000-00-00';`,
          ``,
          `-- 또는 특정 날짜로 변경 (예: 1970-01-01)`,
          `-- UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = '1970-01-01' WHERE \`${context.columnName}\` = '0000-00-00';`
        ].join('\n');
      }
      return null;
    }
  },
  {
    id: 'invalid_datetime_zero',
    type: 'data',
    severity: 'error',
    title: '잘못된 날짜시간 값: 0000-00-00 00:00:00',
    description: 'MySQL 8.0부터 NO_ZERO_DATE SQL 모드가 기본 활성화되어 0000-00-00 00:00:00을 허용하지 않습니다.',
    suggestion: 'NULL 또는 유효한 날짜시간으로 변경해야 합니다.',
    detectInData: (value) => {
      return /['"]0000-00-00 00:00:00/.test(value);
    },
    generateFixQuery: (context) => {
      if (context.tableName && context.columnName) {
        return [
          `-- 0000-00-00 00:00:00 값을 NULL로 변경`,
          `UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = NULL WHERE \`${context.columnName}\` = '0000-00-00 00:00:00';`,
          ``,
          `-- 또는 특정 날짜시간으로 변경 (예: 1970-01-01 00:00:00)`,
          `-- UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = '1970-01-01 00:00:00' WHERE \`${context.columnName}\` = '0000-00-00 00:00:00';`
        ].join('\n');
      }
      return null;
    }
  },
  {
    id: 'enum_empty_value',
    type: 'data',
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
