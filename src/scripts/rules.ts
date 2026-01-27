/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules
 * Based on MySQL Shell util.checkForServerUpgrade() official 47 checks
 * Reference: https://dev.mysql.com/doc/mysql-shell/8.4/en/mysql-shell-utilities-upgrade.html
 */

import type { CompatibilityRule } from './types';
import {
  REMOVED_SYS_VARS_84,
  NEW_RESERVED_KEYWORDS_84,
  REMOVED_FUNCTIONS_84,
  OBSOLETE_SQL_MODES,
  MYSQL_SCHEMA_TABLES,
  IDENTIFIER_LIMITS,
  FTS_TABLE_PREFIXES,
  CHANGED_FUNCTIONS_IN_GENERATED_COLUMNS
} from './constants';

// ============================================================================
// HELPER: Build regex from array
// ============================================================================
const buildWordBoundaryPattern = (words: readonly string[]): RegExp => {
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
};

// ============================================================================
// 1. REMOVED SYSTEM VARIABLES RULES
// ============================================================================
const removedSysVarsRules: CompatibilityRule[] = [
  {
    id: 'removed_sys_var',
    type: 'config',
    category: 'removedSysVars',
    pattern: buildWordBoundaryPattern(REMOVED_SYS_VARS_84),
    severity: 'error',
    title: '제거된 시스템 변수 사용',
    description: 'MySQL 8.4에서 제거된 시스템 변수를 사용하고 있습니다. 서버 시작 시 오류가 발생합니다.',
    suggestion: '해당 변수를 설정 파일에서 제거하거나 대체 변수를 사용하세요.',
    mysqlShellCheckId: 'removedSysVars',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/added-deprecated-removed.html',
    generateFixQuery: (context) => {
      if (context.variableName) {
        return `-- 설정 파일(my.cnf)에서 다음 변수를 제거하세요:\n-- ${context.variableName}`;
      }
      return null;
    }
  }
];

// ============================================================================
// 2. NEW DEFAULT VALUES RULES
// ============================================================================
const newDefaultVarsRules: CompatibilityRule[] = [
  // 2.1 System Variables with Changed Defaults
  {
    id: 'sys_var_new_default_innodb_adaptive_hash',
    type: 'config',
    category: 'newDefaultVars',
    pattern: /innodb_adaptive_hash_index\s*=\s*ON/gi,
    severity: 'warning',
    title: 'innodb_adaptive_hash_index 기본값 변경',
    description: 'MySQL 8.4에서 innodb_adaptive_hash_index 기본값이 ON에서 OFF로 변경되었습니다.',
    suggestion: '명시적으로 ON으로 설정하면 8.4에서도 동일하게 동작합니다.',
    mysqlShellCheckId: 'sysVarsNewDefaults'
  },
  {
    id: 'sys_var_new_default_innodb_change_buffering',
    type: 'config',
    category: 'newDefaultVars',
    pattern: /innodb_change_buffering\s*=\s*all/gi,
    severity: 'warning',
    title: 'innodb_change_buffering 기본값 변경',
    description: 'MySQL 8.4에서 innodb_change_buffering 기본값이 all에서 none으로 변경되었습니다.',
    suggestion: '성능 특성이 변경될 수 있으니 테스트 후 적절한 값을 설정하세요.',
    mysqlShellCheckId: 'sysVarsNewDefaults'
  },
  {
    id: 'sys_var_new_default_replica_parallel',
    type: 'config',
    category: 'newDefaultVars',
    pattern: /(?:replica_parallel_workers|slave_parallel_workers)\s*=\s*0\b/gi,
    severity: 'info',
    title: 'replica_parallel_workers 기본값 변경',
    description: 'MySQL 8.4에서 replica_parallel_workers 기본값이 0에서 4로 변경되었습니다.',
    suggestion: '복제 동작이 병렬로 변경됩니다. 필요시 명시적으로 설정하세요.',
    mysqlShellCheckId: 'sysVarsNewDefaults'
  },
  // 2.2 Zero Dates
  {
    id: 'invalid_date_zero',
    type: 'data',
    category: 'newDefaultVars',
    severity: 'error',
    title: '잘못된 날짜 값: 0000-00-00',
    description: 'MySQL 8.0부터 NO_ZERO_DATE SQL 모드가 기본 활성화되어 0000-00-00 날짜를 허용하지 않습니다.',
    suggestion: 'NULL 또는 유효한 날짜로 변경해야 합니다.',
    mysqlShellCheckId: 'zeroDates',
    detectInData: (value) => /['"]0000-00-00/.test(value),
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
    category: 'newDefaultVars',
    severity: 'error',
    title: '잘못된 날짜시간 값: 0000-00-00 00:00:00',
    description: 'MySQL 8.0부터 NO_ZERO_DATE SQL 모드가 기본 활성화되어 0000-00-00 00:00:00을 허용하지 않습니다.',
    suggestion: 'NULL 또는 유효한 날짜시간으로 변경해야 합니다.',
    mysqlShellCheckId: 'zeroDates',
    detectInData: (value) => /['"]0000-00-00 00:00:00/.test(value),
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
  }
];

// ============================================================================
// 3. RESERVED KEYWORDS RULES
// ============================================================================
const reservedKeywordsRules: CompatibilityRule[] = [
  {
    id: 'reserved_keyword_84',
    type: 'schema',
    category: 'reservedKeywords',
    pattern: new RegExp(
      `(?:CREATE\\s+TABLE|ALTER\\s+TABLE|CREATE\\s+(?:UNIQUE\\s+)?INDEX)\\s+\`?(${NEW_RESERVED_KEYWORDS_84.join('|')})\`?\\b`,
      'gi'
    ),
    severity: 'error',
    title: 'MySQL 8.4 신규 예약어 사용',
    description: `객체 이름이 MySQL 8.4의 신규 예약어(${NEW_RESERVED_KEYWORDS_84.join(', ')})와 충돌합니다.`,
    suggestion: '객체 이름을 백틱(`)으로 감싸거나 다른 이름으로 변경하세요.',
    mysqlShellCheckId: 'reservedKeywords',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/keywords.html'
  },
  {
    id: 'reserved_keyword_column',
    type: 'schema',
    category: 'reservedKeywords',
    pattern: new RegExp(
      `\`?(${NEW_RESERVED_KEYWORDS_84.join('|')})\`?\\s+(?:INT|VARCHAR|TEXT|CHAR|DECIMAL|FLOAT|DOUBLE|DATE|TIME|DATETIME|TIMESTAMP|BLOB|ENUM|SET|BOOLEAN|BOOL|TINYINT|SMALLINT|MEDIUMINT|BIGINT)`,
      'gi'
    ),
    severity: 'error',
    title: 'MySQL 8.4 신규 예약어 컬럼명',
    description: `컬럼 이름이 MySQL 8.4의 신규 예약어(${NEW_RESERVED_KEYWORDS_84.join(', ')})와 충돌합니다.`,
    suggestion: '컬럼 이름을 백틱(`)으로 감싸거나 다른 이름으로 변경하세요.',
    mysqlShellCheckId: 'reservedKeywords'
  },
  {
    id: 'routine_syntax_keyword',
    type: 'schema',
    category: 'reservedKeywords',
    pattern: new RegExp(
      `(?:CREATE\\s+(?:PROCEDURE|FUNCTION))\\s+\`?(${NEW_RESERVED_KEYWORDS_84.join('|')})\`?\\s*\\(`,
      'gi'
    ),
    severity: 'error',
    title: '루틴 이름 예약어 충돌',
    description: '저장 프로시저 또는 함수 이름이 예약어와 충돌합니다.',
    suggestion: '루틴 이름을 백틱(`)으로 감싸거나 다른 이름으로 변경하세요.',
    mysqlShellCheckId: 'routineSyntax'
  }
];

// ============================================================================
// 4. AUTHENTICATION RULES
// ============================================================================
const authenticationRules: CompatibilityRule[] = [
  {
    id: 'mysql_native_password',
    type: 'privilege',
    category: 'authentication',
    pattern: /(?:IDENTIFIED\s+(?:WITH|BY)\s+['"]?mysql_native_password|plugin\s*=\s*['"]?mysql_native_password)/gi,
    severity: 'warning',
    title: 'mysql_native_password 인증 플러그인',
    description: 'MySQL 8.4에서 mysql_native_password는 기본적으로 비활성화됩니다. 명시적으로 활성화해야 사용 가능합니다.',
    suggestion: 'caching_sha2_password로 마이그레이션하거나 mysql_native_password_auto_generate_rsa_keys를 활성화하세요.',
    mysqlShellCheckId: 'authMethodUsage',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/native-pluggable-authentication.html',
    generateFixQuery: (context) => {
      if (context.userName) {
        return `ALTER USER '${context.userName}'@'%' IDENTIFIED WITH caching_sha2_password BY 'new_password';`;
      }
      return null;
    }
  },
  {
    id: 'sha256_password',
    type: 'privilege',
    category: 'authentication',
    pattern: /(?:IDENTIFIED\s+WITH\s+['"]?sha256_password|plugin\s*=\s*['"]?sha256_password)/gi,
    severity: 'warning',
    title: 'sha256_password 인증 플러그인 (deprecated)',
    description: 'sha256_password는 deprecated되었습니다. caching_sha2_password 사용을 권장합니다.',
    suggestion: 'caching_sha2_password로 마이그레이션하세요.',
    mysqlShellCheckId: 'deprecatedDefaultAuth'
  },
  {
    id: 'authentication_fido',
    type: 'privilege',
    category: 'authentication',
    pattern: /(?:IDENTIFIED\s+WITH\s+['"]?authentication_fido|plugin\s*=\s*['"]?authentication_fido)/gi,
    severity: 'error',
    title: 'authentication_fido 플러그인 제거됨',
    description: 'authentication_fido 플러그인은 MySQL 8.4에서 완전히 제거되었습니다.',
    suggestion: 'authentication_webauthn 또는 다른 인증 방법으로 마이그레이션하세요.',
    mysqlShellCheckId: 'pluginUsage'
  },
  {
    id: 'default_authentication_plugin_var',
    type: 'config',
    category: 'authentication',
    pattern: /default_authentication_plugin\s*=/gi,
    severity: 'error',
    title: 'default_authentication_plugin 변수 제거됨',
    description: 'default_authentication_plugin 시스템 변수는 MySQL 8.4에서 제거되었습니다.',
    suggestion: 'authentication_policy 시스템 변수를 대신 사용하세요.',
    mysqlShellCheckId: 'defaultAuthenticationPlugin',
    generateFixQuery: () => {
      return `-- my.cnf에서 default_authentication_plugin 제거 후:\nauthentication_policy=caching_sha2_password`;
    }
  }
];

// ============================================================================
// 5. INVALID PRIVILEGES RULES
// ============================================================================
const invalidPrivilegesRules: CompatibilityRule[] = [
  {
    id: 'super_privilege',
    type: 'privilege',
    category: 'invalidPrivileges',
    pattern: /GRANT\s+.*\bSUPER\b/gi,
    severity: 'warning',
    title: 'SUPER 권한 사용',
    description: 'SUPER 권한은 세분화된 동적 권한으로 대체되었습니다.',
    suggestion: '필요한 동적 권한(SYSTEM_VARIABLES_ADMIN, BINLOG_ADMIN 등)으로 변경하세요.',
    mysqlShellCheckId: 'invalidPrivileges',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/privileges-provided.html#privileges-provided-dynamic',
    generateFixQuery: (context) => {
      if (context.userName) {
        return [
          `-- SUPER 권한을 동적 권한으로 대체`,
          `REVOKE SUPER ON *.* FROM '${context.userName}'@'%';`,
          ``,
          `-- 필요한 권한만 부여 (예시)`,
          `-- GRANT SYSTEM_VARIABLES_ADMIN ON *.* TO '${context.userName}'@'%';`,
          `-- GRANT CONNECTION_ADMIN ON *.* TO '${context.userName}'@'%';`
        ].join('\n');
      }
      return null;
    }
  }
];

// ============================================================================
// 6. INVALID OBJECTS RULES (Schema Issues)
// ============================================================================
const invalidObjectsRules: CompatibilityRule[] = [
  // 6.1 Old Temporal Types
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

  // 6.2 UTF8 (utf8mb3) Character Set
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

  // 6.3 Deprecated Data Types
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

  // 6.4 Deprecated Engines
  {
    id: 'myisam_engine',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /ENGINE\s*=\s*MyISAM/gi,
    severity: 'warning',
    title: 'MyISAM 엔진 사용',
    description: 'InnoDB 사용이 강력히 권장됩니다.',
    suggestion: 'ENGINE=InnoDB로 변경을 고려하세요.',
    mysqlShellCheckId: 'myisamEngine',
    generateFixQuery: (context) => {
      const tableMatch = context.code?.match(/CREATE TABLE\s+`?(\w+)`?/i);
      if (tableMatch) {
        return `ALTER TABLE \`${tableMatch[1]}\` ENGINE=InnoDB;`;
      }
      return null;
    }
  },

  // 6.5 latin1 Charset
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

  // 6.6 Removed Functions
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

  // 6.7 Obsolete SQL Modes
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

  // 6.8 GROUP BY ASC/DESC Syntax
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

  // 6.9 mysql Schema Name Conflicts
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

  // 6.10 Foreign Key Name Length
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

  // 6.11 ENUM/SET Element Length
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

  // 6.12 FTS Table Name Prefix
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

  // 6.13 Old Geometry Types
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

  // 6.14 Changed Functions in Generated Columns
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

  // 6.15 Columns Cannot Have Defaults (BLOB/TEXT/GEOMETRY/JSON)
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

  // 6.16 Dollar Sign in Names
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

  // 6.17 Non-Native Partitioning
  {
    id: 'non_native_partition',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /ENGINE\s*=\s*(?:MyISAM|MERGE|CSV)[^;]*PARTITION\s+BY/gi,
    severity: 'warning',
    title: '비네이티브 파티셔닝',
    description: 'MyISAM, MERGE, CSV 엔진의 파티셔닝은 deprecated되었습니다.',
    suggestion: 'InnoDB로 변경 후 파티셔닝을 사용하세요.',
    mysqlShellCheckId: 'nonNativePartitioning'
  },

  // 6.18 Partitioned Tables in Shared Tablespaces
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

  // 6.19 Invalid 5.7 Names (trailing spaces, control chars)
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

  // 6.20 Index Too Large (3072 bytes for utf8mb4)
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

  // 6.21 Empty Dot Table Syntax (._tableName_)
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

  // 6.22 Invalid Engine Foreign Key (FK to different engine table)
  {
    id: 'invalid_engine_fk',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /ENGINE\s*=\s*(?:MyISAM|MEMORY|ARCHIVE)[^;]*FOREIGN\s+KEY/gi,
    severity: 'error',
    title: '비InnoDB 엔진의 외래키',
    description: 'MyISAM, MEMORY, ARCHIVE 엔진은 외래키를 지원하지 않습니다.',
    suggestion: 'ENGINE=InnoDB로 변경하세요.',
    mysqlShellCheckId: 'invalidEngineForeignKey'
  },

  // 6.23 Deprecated Temporal Delimiter
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

  // 6.24 InnoDB Row Format
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

  // 6.25 Partitions with Prefix Keys
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

  // 6.26 Foreign Key References Non-Unique Index
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

  // 6.27 MAXDB SQL Mode (specific check)
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

// ============================================================================
// 7. DATA INTEGRITY RULES
// ============================================================================
const dataIntegrityRules: CompatibilityRule[] = [
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

// ============================================================================
// EXPORT: Combined Rules Array
// ============================================================================
export const compatibilityRules: CompatibilityRule[] = [
  ...removedSysVarsRules,
  ...newDefaultVarsRules,
  ...reservedKeywordsRules,
  ...authenticationRules,
  ...invalidPrivilegesRules,
  ...invalidObjectsRules,
  ...dataIntegrityRules
];

// ============================================================================
// EXPORT: Rules by Category (for UI grouping)
// ============================================================================
export const rulesByCategory = {
  removedSysVars: removedSysVarsRules,
  newDefaultVars: newDefaultVarsRules,
  reservedKeywords: reservedKeywordsRules,
  authentication: authenticationRules,
  invalidPrivileges: invalidPrivilegesRules,
  invalidObjects: invalidObjectsRules,
  dataIntegrity: dataIntegrityRules
};

// ============================================================================
// EXPORT: Rule count for display
// ============================================================================
export const TOTAL_RULE_COUNT = compatibilityRules.length;
