/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules - Schema Objects
 * Covers: invalidObjects (data types, functions, SQL modes, etc.)
 */

import type { CompatibilityRule } from '../types';
import {
  REMOVED_FUNCTIONS_84,
  DEPRECATED_FUNCTIONS_84,
  OBSOLETE_SQL_MODES,
  MYSQL_SCHEMA_TABLES,
  IDENTIFIER_LIMITS,
  FTS_TABLE_PREFIXES,
  CHANGED_FUNCTIONS_IN_GENERATED_COLUMNS
} from '../constants';
import { buildWordBoundaryPattern } from './utils';

// ============================================================================
// INVALID OBJECTS RULES (Schema Issues)
// ============================================================================
export const invalidObjectsRules: CompatibilityRule[] = [
  // Old Temporal Types
  {
    id: 'year2',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /YEAR\(2\)/gi,
    severity: 'error',
    title: 'YEAR(2) 데이터 타입',
    description: 'YEAR(2)는 deprecated되었으며 YEAR(4)로 자동 변환됩니다.',
    suggestion: 'YEAR(2)를 YEAR 또는 YEAR(4)로 변경하세요.',
    mysqlShellCheckId: 'oldTemporal',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      const columnMatch = context.code?.match(/`?(\w+)`?\s+YEAR\(2\)/i);
      if (tableMatch && columnMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` MODIFY COLUMN \`${columnMatch[1]}\` YEAR;`;
      }
      return null;
    }
  },

  // UTF8 (utf8mb3) Character Set
  {
    id: 'utf8_charset',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /CHARSET\s*=\s*utf8(?!\w|mb4)/gi,
    severity: 'warning',
    title: 'utf8 문자셋 사용 (utf8mb3)',
    description: 'MySQL 8.4에서 utf8은 utf8mb4를 가리킵니다. 명시적으로 utf8mb4를 사용하는 것이 권장됩니다.',
    suggestion: 'CHARSET=utf8을 CHARSET=utf8mb4로 변경하세요.',
    mysqlShellCheckId: 'utf8mb3',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`;
      }
      return null;
    }
  },
  {
    id: 'utf8mb3_explicit',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /CHARSET\s*=\s*utf8mb3/gi,
    severity: 'warning',
    title: 'utf8mb3 문자셋 사용',
    description: 'utf8mb3는 3바이트 UTF-8입니다. 이모지 등 4바이트 문자 지원을 위해 utf8mb4 사용을 권장합니다.',
    suggestion: 'CHARSET=utf8mb3을 CHARSET=utf8mb4로 변경하세요.',
    mysqlShellCheckId: 'utf8mb3'
  },

  // Deprecated Data Types
  {
    id: 'zerofill',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /`?(\w+)`?\s+\w+\s+ZEROFILL/gi,
    severity: 'warning',
    title: 'ZEROFILL 속성 사용',
    description: 'ZEROFILL은 MySQL 8.0.17부터 deprecated되었습니다.',
    suggestion: '애플리케이션 레벨에서 제로 패딩을 처리하세요.',
    mysqlShellCheckId: 'zerofill',
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
    category: 'invalidObjects',
    pattern: /FLOAT\(\d+,\d+\)|DOUBLE\(\d+,\d+\)/gi,
    severity: 'warning',
    title: 'FLOAT/DOUBLE 정밀도 명시',
    description: 'FLOAT(M,D) 및 DOUBLE(M,D) 형식은 deprecated되었습니다.',
    suggestion: 'DECIMAL 타입 사용을 권장합니다.',
    mysqlShellCheckId: 'floatPrecision',
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
    id: 'int_display_width',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /(?:TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)\(\d+\)(?!\s*(?:UNSIGNED\s+)?ZEROFILL)/gi,
    severity: 'info',
    title: 'INTEGER display width',
    description: 'MySQL 8.0.17부터 정수형의 display width는 deprecated되었습니다.',
    suggestion: 'INT(11) 대신 INT를 사용하세요.',
    mysqlShellCheckId: 'intDisplayWidth'
  },

  // latin1 Charset
  {
    id: 'latin1',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /CHARSET\s*=\s*latin1/gi,
    severity: 'warning',
    title: 'latin1 문자셋 사용',
    description: 'MySQL 8.4의 기본 문자셋은 utf8mb4입니다.',
    suggestion: 'utf8mb4로 변경을 고려하세요.',
    mysqlShellCheckId: 'latin1Charset',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`;
      }
      return null;
    }
  },

  // Removed Functions
  {
    id: 'removed_function',
    type: 'query',
    category: 'invalidObjects',
    pattern: buildWordBoundaryPattern(REMOVED_FUNCTIONS_84),
    severity: 'error',
    title: '제거된 함수 사용',
    description: `다음 함수들은 MySQL 8.4에서 제거되었습니다: ${REMOVED_FUNCTIONS_84.join(', ')}`,
    suggestion: '대체 함수를 사용하세요. PASSWORD() → SHA2(), ENCRYPT() → AES_ENCRYPT() 등',
    mysqlShellCheckId: 'removedFunctions',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/added-deprecated-removed.html'
  },
  {
    id: 'sql_calc_found_rows',
    type: 'query',
    category: 'invalidObjects',
    pattern: /SQL_CALC_FOUND_ROWS/gi,
    severity: 'warning',
    title: 'SQL_CALC_FOUND_ROWS 사용',
    description: 'SQL_CALC_FOUND_ROWS는 MySQL 8.0.17부터 deprecated되었습니다.',
    suggestion: '두 개의 쿼리로 분리하거나 다른 방법을 사용하세요.',
    mysqlShellCheckId: 'removedFunctions'
  },
  {
    id: 'deprecated_function_84',
    type: 'query',
    category: 'invalidObjects',
    pattern: new RegExp(`\\b(${DEPRECATED_FUNCTIONS_84.join('|')})\\s*\\(`, 'gi'),
    severity: 'warning',
    title: 'Deprecated 함수 사용',
    description: `다음 함수는 MySQL 8.4에서 deprecated되었습니다: ${DEPRECATED_FUNCTIONS_84.join(', ')}`,
    suggestion: 'FOUND_ROWS() 대신 COUNT 쿼리를 별도로 실행하세요.',
    mysqlShellCheckId: 'removedFunctions',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/information-functions.html',
    generateFixQuery: () => {
      return [
        `-- SQL_CALC_FOUND_ROWS와 FOUND_ROWS() 대신:`,
        `-- 1. 데이터 조회 쿼리`,
        `-- SELECT * FROM users WHERE ... LIMIT 10;`,
        ``,
        `-- 2. 전체 개수 조회 쿼리 (별도 실행)`,
        `-- SELECT COUNT(*) FROM users WHERE ...;`
      ].join('\n');
    }
  },

  // Obsolete SQL Modes
  {
    id: 'obsolete_sql_mode',
    type: 'config',
    category: 'invalidObjects',
    pattern: new RegExp(`sql_mode\\s*=.*\\b(${OBSOLETE_SQL_MODES.join('|')})\\b`, 'gi'),
    severity: 'error',
    title: '폐기된 SQL 모드',
    description: `다음 SQL 모드는 MySQL 8.4에서 제거되었습니다: ${OBSOLETE_SQL_MODES.join(', ')}`,
    suggestion: '해당 SQL 모드를 설정에서 제거하세요.',
    mysqlShellCheckId: 'obsoleteSqlModeFlags'
  },

  // GROUP BY ASC/DESC Syntax
  {
    id: 'groupby_asc_desc',
    type: 'query',
    category: 'invalidObjects',
    pattern: /GROUP\s+BY\s+[^;]*(?:ASC|DESC)(?!\s*\))/gi,
    severity: 'error',
    title: 'GROUP BY ... ASC/DESC 구문',
    description: 'GROUP BY 절에서 ASC/DESC 사용은 MySQL 8.0에서 제거되었습니다.',
    suggestion: 'ORDER BY 절에서 정렬 순서를 지정하세요.',
    mysqlShellCheckId: 'groupbyAscSyntax',
    generateFixQuery: () => {
      return `-- GROUP BY column ASC/DESC를 다음과 같이 변경:\n-- SELECT ... FROM ... GROUP BY column ORDER BY column ASC/DESC`;
    }
  },

  // mysql Schema Name Conflicts
  {
    id: 'mysql_schema_conflict',
    type: 'schema',
    category: 'invalidObjects',
    pattern: new RegExp(
      `CREATE\\s+TABLE\\s+(?:mysql\\.)?(?:\`?)(${MYSQL_SCHEMA_TABLES.join('|')})(?:\`?)\\s*\\(`,
      'gi'
    ),
    severity: 'error',
    title: 'mysql 스키마 테이블명 충돌',
    description: 'mysql 스키마의 시스템 테이블과 이름이 충돌합니다.',
    suggestion: '다른 테이블 이름을 사용하세요.',
    mysqlShellCheckId: 'mysqlSchema'
  },

  // Foreign Key Name Length
  {
    id: 'fk_name_length',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /CONSTRAINT\s+`?(\w{65,})`?\s+FOREIGN\s+KEY/gi,
    severity: 'error',
    title: '외래키 이름 64자 초과',
    description: `외래키 이름은 ${IDENTIFIER_LIMITS.FOREIGN_KEY_NAME}자를 초과할 수 없습니다.`,
    suggestion: '외래키 이름을 64자 이내로 줄이세요.',
    mysqlShellCheckId: 'foreignKeyLength'
  },

  // ENUM/SET Element Length
  {
    id: 'enum_element_length',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /ENUM\s*\([^)]+\)/gi,
    severity: 'warning',
    title: 'ENUM 요소 길이 확인 필요',
    description: `각 ENUM 요소는 ${IDENTIFIER_LIMITS.ENUM_ELEMENT}자를 초과할 수 없습니다.`,
    suggestion: 'ENUM 요소 길이를 확인하고 255자 이내로 유지하세요.',
    mysqlShellCheckId: 'enumSetElementLength'
  },

  // FTS Table Name Prefix
  {
    id: 'fts_tablename',
    type: 'schema',
    category: 'invalidObjects',
    pattern: new RegExp(`CREATE\\s+TABLE\\s+\`?(${FTS_TABLE_PREFIXES.join('|')})`, 'gi'),
    severity: 'warning',
    title: 'FTS 예약 접두사 테이블명',
    description: 'FTS_ 또는 fts_ 접두사는 InnoDB 전문검색 내부 테이블에 예약되어 있습니다.',
    suggestion: '다른 테이블명 접두사를 사용하세요.',
    mysqlShellCheckId: 'ftsInTablename'
  },

  // Old Geometry Types
  {
    id: 'old_geometry_type',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /GEOMETRYCOLLECTION(?!\s*EMPTY)/gi,
    severity: 'info',
    title: '구버전 Geometry 타입 표기',
    description: 'GEOMETRYCOLLECTION은 GeometryCollection으로 표기하는 것이 표준입니다.',
    suggestion: 'GeometryCollection 표기법을 사용하세요.',
    mysqlShellCheckId: 'oldGeometryTypes'
  },

  // Changed Functions in Generated Columns
  {
    id: 'generated_column_function',
    type: 'schema',
    category: 'invalidObjects',
    pattern: new RegExp(
      `(?:GENERATED\\s+ALWAYS\\s+)?AS\\s*\\([^)]*\\b(${CHANGED_FUNCTIONS_IN_GENERATED_COLUMNS.join('|')})\\b[^)]*\\)`,
      'gi'
    ),
    severity: 'warning',
    title: '생성 컬럼 함수 동작 변경',
    description: `다음 함수들은 생성 컬럼에서 결과 타입 추론 방식이 변경되었습니다: ${CHANGED_FUNCTIONS_IN_GENERATED_COLUMNS.join(', ')}`,
    suggestion: 'CHECK TABLE ... FOR UPGRADE로 검사하고 필요시 컬럼을 재생성하세요.',
    mysqlShellCheckId: 'changedFunctionsInGeneratedColumns'
  },

  // Columns Cannot Have Defaults (BLOB/TEXT/GEOMETRY/JSON)
  {
    id: 'blob_text_default',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /(?:BLOB|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT|TINYBLOB|MEDIUMBLOB|LONGBLOB|GEOMETRY|POINT|LINESTRING|POLYGON|JSON)\s+(?:NOT\s+NULL\s+)?DEFAULT\s+(?!NULL)/gi,
    severity: 'error',
    title: 'BLOB/TEXT/GEOMETRY/JSON 컬럼 기본값',
    description: 'BLOB, TEXT, GEOMETRY, JSON 타입 컬럼은 리터럴 기본값을 가질 수 없습니다.',
    suggestion: 'DEFAULT 절을 제거하거나 DEFAULT NULL로 변경하세요.',
    mysqlShellCheckId: 'columnsWhichCannotHaveDefaults'
  },

  // Dollar Sign in Names
  {
    id: 'dollar_sign_name',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /CREATE\s+(?:TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER)\s+`?\$\w*`?/gi,
    severity: 'warning',
    title: '$ 기호로 시작하는 객체명',
    description: '$ 기호로 시작하는 식별자는 향후 버전에서 제한될 수 있습니다.',
    suggestion: '$ 기호로 시작하지 않는 이름을 사용하세요.',
    mysqlShellCheckId: 'dollarSignName'
  },

  // Partitioned Tables in Shared Tablespaces
  {
    id: 'partition_shared_tablespace',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /PARTITION.*TABLESPACE\s*=\s*(?:mysql|innodb_system|innodb_temporary)/gi,
    severity: 'error',
    title: '공유 테이블스페이스의 파티션 테이블',
    description: '파티션 테이블은 공유 테이블스페이스(mysql, innodb_system, innodb_temporary)에 저장할 수 없습니다.',
    suggestion: 'file-per-table 또는 general 테이블스페이스를 사용하세요.',
    mysqlShellCheckId: 'partitionedTablesInSharedTablespaces'
  },

  // Invalid 5.7 Names (trailing spaces, control chars)
  {
    id: 'invalid_57_name_trailing_space',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /CREATE\s+TABLE\s+`[^`]*\s`/gi,
    severity: 'error',
    title: '테이블명 후행 공백',
    description: '식별자에 후행 공백이 있습니다.',
    suggestion: '후행 공백을 제거하세요.',
    mysqlShellCheckId: 'invalid57Names'
  },

  // Index Too Large (3072 bytes for utf8mb4)
  {
    id: 'index_too_large',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /(?:VARCHAR|CHAR)\((\d+)\).*(?:PRIMARY\s+KEY|UNIQUE|INDEX|KEY)/gi,
    severity: 'info',
    title: '인덱스 키 크기 확인 필요',
    description: 'InnoDB의 최대 인덱스 키 크기는 3072바이트입니다. utf8mb4에서 VARCHAR(768) 이상의 전체 컬럼 인덱스는 불가능합니다.',
    suggestion: '프리픽스 인덱스를 사용하거나 컬럼 크기를 줄이세요.',
    mysqlShellCheckId: 'indexTooLarge'
  },

  // Empty Dot Table Syntax (._tableName_)
  {
    id: 'empty_dot_table_syntax',
    type: 'query',
    category: 'invalidObjects',
    pattern: /\.\s*`?\w+`?\s*(?:WHERE|SET|FROM|JOIN|INTO)/gi,
    severity: 'warning',
    title: '._tableName_ 구문 사용',
    description: '루틴에서 ._tableName_ 형태의 deprecated 구문이 사용되고 있습니다.',
    suggestion: '스키마 이름을 명시적으로 지정하세요 (예: schema_name.table_name).',
    mysqlShellCheckId: 'emptyDotTableSyntax'
  },

  // Deprecated Temporal Delimiter
  {
    id: 'deprecated_temporal_delimiter',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /PARTITION\s+BY\s+RANGE\s*\(\s*(?:YEAR|MONTH|DAY|TO_DAYS|TO_SECONDS)\s*\([^)]+\)\s*\/\s*\d+/gi,
    severity: 'warning',
    title: 'deprecated 날짜 구분자 사용',
    description: '파티션 정의에서 deprecated된 날짜 구분자 형식이 사용되고 있습니다.',
    suggestion: 'INTERVAL 또는 표준 날짜 함수를 사용하세요.',
    mysqlShellCheckId: 'deprecatedTemporalDelimiter'
  },

  // InnoDB Row Format
  {
    id: 'innodb_row_format',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /ROW_FORMAT\s*=\s*(?:REDUNDANT|COMPACT)/gi,
    severity: 'info',
    title: 'InnoDB 구버전 ROW_FORMAT',
    description: 'REDUNDANT 및 COMPACT row format은 성능상 이유로 DYNAMIC 또는 COMPRESSED 사용을 권장합니다.',
    suggestion: 'ROW_FORMAT=DYNAMIC으로 변경을 고려하세요.',
    mysqlShellCheckId: 'innodbRowFormat'
  },

  // Partitions with Prefix Keys
  {
    id: 'partition_prefix_key',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /PARTITION\s+BY\s+(?:KEY|LINEAR\s+KEY)\s*\([^)]*\(\d+\)[^)]*\)/gi,
    severity: 'error',
    title: '프리픽스 인덱스 컬럼의 파티션 키',
    description: '프리픽스 인덱스가 있는 컬럼을 파티션 키로 사용할 수 없습니다. MySQL 8.0.21에서 deprecated, 8.4에서 제거되었습니다.',
    suggestion: '프리픽스 없는 컬럼으로 파티션 키를 변경하세요.',
    mysqlShellCheckId: 'partitionsWithPrefixKeys'
  },

  // Foreign Key References Non-Unique Index
  {
    id: 'fk_non_unique_index',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+[^(]+\([^)]+\)/gi,
    severity: 'info',
    title: '외래키 참조 검증 필요',
    description: '외래키가 참조하는 컬럼은 PRIMARY KEY 또는 UNIQUE 인덱스여야 합니다.',
    suggestion: '참조 대상 컬럼에 적절한 인덱스가 있는지 확인하세요.',
    mysqlShellCheckId: 'foreignKeyReferences'
  },

  // MAXDB SQL Mode (specific check)
  {
    id: 'maxdb_sql_mode',
    type: 'config',
    category: 'invalidObjects',
    pattern: /sql_mode\s*=.*\bMAXDB\b/gi,
    severity: 'error',
    title: 'MAXDB SQL 모드',
    description: 'MAXDB SQL 모드는 MySQL 8.0에서 제거되었습니다.',
    suggestion: 'sql_mode에서 MAXDB를 제거하세요.',
    mysqlShellCheckId: 'maxdbSqlModeFlags'
  }
];
