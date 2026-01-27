/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Constants
 * Based on MySQL Shell util.checkForServerUpgrade() official 47 checks
 * Reference: https://dev.mysql.com/doc/mysql-shell/8.4/en/mysql-shell-utilities-upgrade.html
 */

// ============================================================================
// 1. REMOVED SYSTEM VARIABLES (MySQL 8.4)
// ============================================================================
export const REMOVED_SYS_VARS_84 = [
  'avoid_temporal_upgrade',
  'binlog_transaction_dependency_tracking',
  'daemon_memcached_enable_binlog',
  'daemon_memcached_engine_lib_name',
  'daemon_memcached_engine_lib_path',
  'daemon_memcached_option',
  'daemon_memcached_r_batch_size',
  'daemon_memcached_w_batch_size',
  'default_authentication_plugin',
  'expire_logs_days',
  'group_replication_ip_whitelist',
  'group_replication_primary_member',
  'group_replication_recovery_complete_at',
  'have_openssl',
  'have_ssl',
  'innodb_api_bk_commit_interval',
  'innodb_api_disable_rowlock',
  'innodb_api_enable_binlog',
  'innodb_api_enable_mdl',
  'innodb_api_trx_level',
  'keyring_encrypted_file_data',
  'keyring_encrypted_file_password',
  'keyring_file_data',
  'keyring_oci_ca_certificate',
  'keyring_oci_compartment',
  'keyring_oci_encryption_endpoint',
  'keyring_oci_key_file',
  'keyring_oci_key_fingerprint',
  'keyring_oci_management_endpoint',
  'keyring_oci_master_key',
  'keyring_oci_secrets_endpoint',
  'keyring_oci_tenancy',
  'keyring_oci_user',
  'keyring_oci_vaults_endpoint',
  'keyring_oci_virtual_vault',
  'language',
  'log_bin_use_v1_row_events',
  'master_info_repository',
  'new',
  'old',
  'old_style_user_limits',
  'relay_log_info_repository',
  'show_old_temporals',
  'slave_rows_search_algorithms',
  'transaction_write_set_extraction',
  'authentication_fido_rp_id',
  'innodb_log_file_size',
  'innodb_log_files_in_group'
] as const;

// ============================================================================
// 2. SYSTEM VARIABLES WITH NEW DEFAULTS (MySQL 8.4)
// ============================================================================
export const SYS_VARS_NEW_DEFAULTS_84 = {
  // variable: [old_default, new_default, description]
  'replica_parallel_workers': [0, 4, '병렬 복제 워커 수'],
  'innodb_adaptive_hash_index': ['ON', 'OFF', 'Adaptive Hash Index'],
  'innodb_doublewrite_pages': [null, 128, 'Doublewrite 페이지 수'],
  'innodb_flush_method': ['fsync', 'O_DIRECT', 'InnoDB 플러시 방법'],
  'innodb_io_capacity': [200, 10000, 'I/O 처리 용량'],
  'innodb_io_capacity_max': [2000, 20000, '최대 I/O 처리 용량'],
  'innodb_log_buffer_size': [16777216, 67108864, '로그 버퍼 크기'],
  'innodb_redo_log_capacity': [104857600, 419430400, 'Redo 로그 용량'],
  'innodb_change_buffering': ['all', 'none', 'Change Buffering'],
  'binlog_transaction_dependency_tracking': ['COMMIT_ORDER', 'WRITESET', '트랜잭션 의존성 추적']
} as const;

// ============================================================================
// 3. RESERVED KEYWORDS (New in MySQL 8.4)
// ============================================================================
export const NEW_RESERVED_KEYWORDS_84 = [
  'MANUAL',
  'PARALLEL',
  'QUALIFY',
  'TABLESAMPLE'
] as const;

// All reserved keywords that could conflict with identifiers
export const ALL_RESERVED_KEYWORDS = [
  ...NEW_RESERVED_KEYWORDS_84,
  'ACCESSIBLE', 'ADD', 'ALL', 'ALTER', 'ANALYZE', 'AND', 'AS', 'ASC',
  'ASENSITIVE', 'BEFORE', 'BETWEEN', 'BIGINT', 'BINARY', 'BLOB', 'BOTH',
  'BY', 'CALL', 'CASCADE', 'CASE', 'CHANGE', 'CHAR', 'CHARACTER', 'CHECK',
  'COLLATE', 'COLUMN', 'CONDITION', 'CONSTRAINT', 'CONTINUE', 'CONVERT',
  'CREATE', 'CROSS', 'CUBE', 'CUME_DIST', 'CURRENT_DATE', 'CURRENT_TIME',
  'CURRENT_TIMESTAMP', 'CURRENT_USER', 'CURSOR', 'DATABASE', 'DATABASES',
  'DAY_HOUR', 'DAY_MICROSECOND', 'DAY_MINUTE', 'DAY_SECOND', 'DEC', 'DECIMAL',
  'DECLARE', 'DEFAULT', 'DELAYED', 'DELETE', 'DENSE_RANK', 'DESC', 'DESCRIBE',
  'DETERMINISTIC', 'DISTINCT', 'DISTINCTROW', 'DIV', 'DOUBLE', 'DROP', 'DUAL',
  'EACH', 'ELSE', 'ELSEIF', 'EMPTY', 'ENCLOSED', 'ESCAPED', 'EXCEPT', 'EXISTS',
  'EXIT', 'EXPLAIN', 'FALSE', 'FETCH', 'FIRST_VALUE', 'FLOAT', 'FLOAT4', 'FLOAT8',
  'FOR', 'FORCE', 'FOREIGN', 'FROM', 'FULLTEXT', 'FUNCTION', 'GENERATED', 'GET',
  'GRANT', 'GROUP', 'GROUPING', 'GROUPS', 'HAVING', 'HIGH_PRIORITY', 'HOUR_MICROSECOND',
  'HOUR_MINUTE', 'HOUR_SECOND', 'IF', 'IGNORE', 'IN', 'INDEX', 'INFILE', 'INNER',
  'INOUT', 'INSENSITIVE', 'INSERT', 'INT', 'INT1', 'INT2', 'INT3', 'INT4', 'INT8',
  'INTEGER', 'INTERVAL', 'INTO', 'IO_AFTER_GTIDS', 'IO_BEFORE_GTIDS', 'IS', 'ITERATE',
  'JOIN', 'JSON_TABLE', 'KEY', 'KEYS', 'KILL', 'LAG', 'LAST_VALUE', 'LATERAL', 'LEAD',
  'LEADING', 'LEAVE', 'LEFT', 'LIKE', 'LIMIT', 'LINEAR', 'LINES', 'LOAD', 'LOCALTIME',
  'LOCALTIMESTAMP', 'LOCK', 'LONG', 'LONGBLOB', 'LONGTEXT', 'LOOP', 'LOW_PRIORITY',
  'MASTER_BIND', 'MASTER_SSL_VERIFY_SERVER_CERT', 'MATCH', 'MAXVALUE', 'MEDIUMBLOB',
  'MEDIUMINT', 'MEDIUMTEXT', 'MIDDLEINT', 'MINUTE_MICROSECOND', 'MINUTE_SECOND', 'MOD',
  'MODIFIES', 'NATURAL', 'NOT', 'NO_WRITE_TO_BINLOG', 'NTH_VALUE', 'NTILE', 'NULL',
  'NUMERIC', 'OF', 'ON', 'OPTIMIZE', 'OPTIMIZER_COSTS', 'OPTION', 'OPTIONALLY', 'OR',
  'ORDER', 'OUT', 'OUTER', 'OUTFILE', 'OVER', 'PARTITION', 'PERCENT_RANK', 'PRECISION',
  'PRIMARY', 'PROCEDURE', 'PURGE', 'RANGE', 'RANK', 'READ', 'READS', 'READ_WRITE',
  'REAL', 'RECURSIVE', 'REFERENCES', 'REGEXP', 'RELEASE', 'RENAME', 'REPEAT', 'REPLACE',
  'REQUIRE', 'RESIGNAL', 'RESTRICT', 'RETURN', 'REVOKE', 'RIGHT', 'RLIKE', 'ROW',
  'ROWS', 'ROW_NUMBER', 'SCHEMA', 'SCHEMAS', 'SECOND_MICROSECOND', 'SELECT', 'SENSITIVE',
  'SEPARATOR', 'SET', 'SHOW', 'SIGNAL', 'SMALLINT', 'SPATIAL', 'SPECIFIC', 'SQL',
  'SQLEXCEPTION', 'SQLSTATE', 'SQLWARNING', 'SQL_BIG_RESULT', 'SQL_CALC_FOUND_ROWS',
  'SQL_SMALL_RESULT', 'SSL', 'STARTING', 'STORED', 'STRAIGHT_JOIN', 'SYSTEM', 'TABLE',
  'TERMINATED', 'THEN', 'TINYBLOB', 'TINYINT', 'TINYTEXT', 'TO', 'TRAILING', 'TRIGGER',
  'TRUE', 'UNDO', 'UNION', 'UNIQUE', 'UNLOCK', 'UNSIGNED', 'UPDATE', 'USAGE', 'USE',
  'USING', 'UTC_DATE', 'UTC_TIME', 'UTC_TIMESTAMP', 'VALUES', 'VARBINARY', 'VARCHAR',
  'VARCHARACTER', 'VARYING', 'VIRTUAL', 'WHEN', 'WHERE', 'WHILE', 'WINDOW', 'WITH',
  'WRITE', 'XOR', 'YEAR_MONTH', 'ZEROFILL'
] as const;

// ============================================================================
// 4. AUTHENTICATION PLUGINS
// ============================================================================
export const AUTH_PLUGINS = {
  // Disabled by default in 8.4 (must be explicitly enabled)
  disabled: ['mysql_native_password'],

  // Completely removed in 8.4
  removed: ['authentication_fido', 'authentication_fido_client'],

  // Deprecated (will be removed in future)
  deprecated: ['sha256_password'],

  // Recommended authentication plugin
  recommended: 'caching_sha2_password'
} as const;

// ============================================================================
// 5. REMOVED FUNCTIONS
// ============================================================================
export const REMOVED_FUNCTIONS_84 = [
  'PASSWORD',
  'ENCRYPT',
  'ENCODE',
  'DECODE',
  'DES_ENCRYPT',
  'DES_DECRYPT'
] as const;

// Deprecated functions (not yet removed)
export const DEPRECATED_FUNCTIONS_84 = [
  'FOUND_ROWS',
  'SQL_CALC_FOUND_ROWS'
] as const;

// ============================================================================
// 6. OBSOLETE SQL MODES
// ============================================================================
export const OBSOLETE_SQL_MODES = [
  'DB2',
  'MAXDB',
  'MSSQL',
  'MYSQL323',
  'MYSQL40',
  'ORACLE',
  'POSTGRESQL',
  'NO_FIELD_OPTIONS',
  'NO_KEY_OPTIONS',
  'NO_TABLE_OPTIONS'
] as const;

// ============================================================================
// 7. REMOVED PRIVILEGES
// ============================================================================
export const REMOVED_PRIVILEGES_84 = [
  'SUPER'  // Replaced with dynamic privileges
] as const;

// Privileges that replace SUPER
export const SUPER_REPLACEMENT_PRIVILEGES = [
  'SYSTEM_VARIABLES_ADMIN',
  'BINLOG_ADMIN',
  'CONNECTION_ADMIN',
  'ENCRYPTION_KEY_ADMIN',
  'GROUP_REPLICATION_ADMIN',
  'REPLICATION_SLAVE_ADMIN',
  'ROLE_ADMIN',
  'SET_USER_ID',
  'XA_RECOVER_ADMIN',
  'SYSTEM_USER',
  'PERSIST_RO_VARIABLES_ADMIN',
  'CLONE_ADMIN',
  'BACKUP_ADMIN',
  'RESOURCE_GROUP_ADMIN',
  'RESOURCE_GROUP_USER',
  'APPLICATION_PASSWORD_ADMIN',
  'AUDIT_ADMIN',
  'INNODB_REDO_LOG_ARCHIVE',
  'INNODB_REDO_LOG_ENABLE'
] as const;

// ============================================================================
// 8. REMOVED/DEPRECATED STORAGE ENGINES
// ============================================================================
export const DEPRECATED_ENGINES = [
  'MyISAM',
  'ARCHIVE',
  'BLACKHOLE',
  'MERGE',
  'FEDERATED',
  'EXAMPLE',
  'NDB'
] as const;

// ============================================================================
// 9. CHANGED FUNCTION BEHAVIORS IN GENERATED COLUMNS
// ============================================================================
export const CHANGED_FUNCTIONS_IN_GENERATED_COLUMNS = [
  'IF',
  'IFNULL',
  'NULLIF',
  'CASE',
  'COALESCE',
  'GREATEST',
  'LEAST',
  'BIT_AND',
  'BIT_OR',
  'BIT_XOR'
] as const;

// ============================================================================
// 10. MYSQL SCHEMA TABLES (cannot have user tables with same names)
// ============================================================================
export const MYSQL_SCHEMA_TABLES = [
  'catalogs',
  'check_constraints',
  'collations',
  'columns',
  'column_statistics',
  'dd_properties',
  'events',
  'foreign_key_column_usage',
  'foreign_keys',
  'index_column_usage',
  'index_partitions',
  'indexes',
  'innodb_ddl_log',
  'innodb_dynamic_metadata',
  'parameter_type_elements',
  'parameters',
  'resource_groups',
  'routines',
  'schemata',
  'st_spatial_reference_systems',
  'table_partition_values',
  'table_partitions',
  'table_stats',
  'tables',
  'tablespace_files',
  'tablespaces',
  'triggers',
  'view_routine_usage',
  'view_table_usage',
  'column_type_elements'
] as const;

// ============================================================================
// 11. IDENTIFIER LENGTH LIMITS
// ============================================================================
export const IDENTIFIER_LIMITS = {
  TABLE_NAME: 64,
  COLUMN_NAME: 64,
  INDEX_NAME: 64,
  FOREIGN_KEY_NAME: 64,
  CONSTRAINT_NAME: 64,
  DATABASE_NAME: 64,
  VIEW_NAME: 64,
  TRIGGER_NAME: 64,
  ALIAS: 256,
  ENUM_ELEMENT: 255
} as const;

// ============================================================================
// 12. GEOMETRY TYPE CHANGES
// ============================================================================
export const OLD_GEOMETRY_TYPES = [
  'GEOMETRYCOLLECTION'  // Should be GeometryCollection
] as const;

// ============================================================================
// 13. CONFIGURATION FILE KEYWORDS
// ============================================================================
export const CONFIG_SECTIONS = [
  'mysqld',
  'mysql',
  'client',
  'mysqldump',
  'mysqlimport'
] as const;

// ============================================================================
// 14. INVALID 5.7 CHARACTER SEQUENCES IN IDENTIFIERS
// ============================================================================
export const INVALID_57_NAME_PATTERNS = {
  // Dollar sign at start (deprecated)
  dollarStart: /^\$/,
  // Multiple consecutive dots
  multipleDots: /\.\./,
  // Trailing spaces
  trailingSpace: /\s+$/,
  // Invalid UTF-8 sequences
  invalidUtf8: /[\x00-\x1f]/
} as const;

// ============================================================================
// 15. PARTITION RELATED
// ============================================================================
export const SHARED_TABLESPACES = [
  'mysql',
  'innodb_system',
  'innodb_temporary'
] as const;

// Non-native partitioning engines (deprecated)
export const NON_NATIVE_PARTITION_ENGINES = [
  'MyISAM',
  'MERGE',
  'CSV'
] as const;

// ============================================================================
// 16. FTS (Full-Text Search) PREFIXES
// ============================================================================
export const FTS_TABLE_PREFIXES = [
  'FTS_',
  'fts_'
] as const;

// ============================================================================
// 17. RULE CATEGORIES (matches MySQL Shell categories)
// ============================================================================
export const RULE_CATEGORIES = {
  REMOVED_SYS_VARS: 'Removed System Variables',
  NEW_DEFAULT_VARS: 'New Default Values',
  RESERVED_KEYWORDS: 'Reserved Keywords',
  AUTHENTICATION: 'Authentication',
  INVALID_PRIVILEGES: 'Invalid Privileges',
  INVALID_OBJECTS: 'Invalid Objects',
  DATA_INTEGRITY: 'Data Integrity'
} as const;

// ============================================================================
// 18. CHECK IDS (matches MySQL Shell checkForServerUpgrade output)
// ============================================================================
export const MYSQL_SHELL_CHECK_IDS = {
  // Removed System Variables
  removedSysVars: 'removedSysVars',

  // New Default Values
  sysVarsNewDefaults: 'sysVarsNewDefaults',
  zeroDates: 'zeroDates',

  // Reserved Keywords
  reservedKeywords: 'reservedKeywords',
  routineSyntax: 'routineSyntax',

  // Authentication
  defaultAuthenticationPlugin: 'defaultAuthenticationPlugin',
  authMethodUsage: 'authMethodUsage',
  pluginUsage: 'pluginUsage',
  deprecatedDefaultAuth: 'deprecatedDefaultAuth',
  deprecatedRouterAuthMethod: 'deprecatedRouterAuthMethod',

  // Invalid Privileges
  invalidPrivileges: 'invalidPrivileges',

  // Invalid Objects
  oldTemporal: 'oldTemporal',
  utf8mb3: 'utf8mb3',
  removedFunctions: 'removedFunctions',
  obsoleteSqlModeFlags: 'obsoleteSqlModeFlags',
  maxdbSqlModeFlags: 'maxdbSqlModeFlags',
  groupbyAscSyntax: 'groupbyAscSyntax',
  mysqlSchema: 'mysqlSchema',
  nonNativePartitioning: 'nonNativePartitioning',
  foreignKeyLength: 'foreignKeyLength',
  enumSetElementLength: 'enumSetElementLength',
  partitionedTablesInSharedTablespaces: 'partitionedTablesInSharedTablespaces',
  circularDirectory: 'circularDirectory',
  schemaInconsistency: 'schemaInconsistency',
  ftsInTablename: 'ftsInTablename',
  engineMixup: 'engineMixup',
  oldGeometryTypes: 'oldGeometryTypes',
  checkTableCommand: 'checkTableCommand',
  changedFunctionsInGeneratedColumns: 'changedFunctionsInGeneratedColumns',
  columnsWhichCannotHaveDefaults: 'columnsWhichCannotHaveDefaults',
  invalid57Names: 'invalid57Names',
  orphanedObjects: 'orphanedObjects',
  dollarSignName: 'dollarSignName',
  indexTooLarge: 'indexTooLarge',

  // Data type specific
  zerofill: 'zerofill',
  floatPrecision: 'floatPrecision',
  intDisplayWidth: 'intDisplayWidth',
  myisamEngine: 'myisamEngine',
  latin1Charset: 'latin1Charset'
} as const;

// ============================================================================
// 19. SERVER-REQUIRED CHECKS (cannot be done from static dump analysis)
// ============================================================================
export interface ServerRequiredCheck {
  id: string;
  name: string;
  description: string;
  reason: string;
  query: string;
  analyzeResult: string;
}

export const SERVER_REQUIRED_CHECKS: ServerRequiredCheck[] = [
  {
    id: 'circularDirectory',
    name: '순환 디렉토리 참조',
    description: '테이블스페이스 파일이 순환 디렉토리 참조를 가지는지 확인',
    reason: '파일시스템 접근이 필요합니다.',
    query: `-- 데이터 디렉토리 외부의 테이블스페이스 확인
SELECT
  TABLESPACE_NAME,
  FILE_NAME,
  FILE_TYPE
FROM INFORMATION_SCHEMA.FILES
WHERE FILE_NAME NOT LIKE CONCAT(@@datadir, '%')
  AND ENGINE = 'InnoDB';`,
    analyzeResult: '결과가 있으면 데이터 디렉토리 외부 참조가 있음을 의미합니다.'
  },
  {
    id: 'schemaInconsistency',
    name: '스키마 불일치',
    description: 'SHOW CREATE TABLE과 INFORMATION_SCHEMA 간의 불일치 확인',
    reason: '실시간 서버 쿼리가 필요합니다.',
    query: `-- 각 테이블에 대해 SHOW CREATE TABLE 실행 후 비교
-- (자동화된 스크립트로 실행 권장)
SELECT
  TABLE_SCHEMA,
  TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
  AND TABLE_TYPE = 'BASE TABLE';`,
    analyzeResult: '각 테이블에 대해 SHOW CREATE TABLE 결과와 비교하여 불일치 확인'
  },
  {
    id: 'engineMixup',
    name: '엔진 혼동',
    description: '.frm 파일과 실제 스토리지 엔진의 불일치 확인',
    reason: '런타임 엔진 상태 확인이 필요합니다.',
    query: `-- 테이블의 실제 엔진 상태 확인
SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  ENGINE,
  CREATE_OPTIONS
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
  AND TABLE_TYPE = 'BASE TABLE';`,
    analyzeResult: 'ENGINE 값이 예상과 다르거나 NULL인 경우 문제가 있을 수 있습니다.'
  },
  {
    id: 'checkTableCommand',
    name: 'CHECK TABLE 결과',
    description: '테이블 무결성 검사 결과 확인',
    reason: 'CHECK TABLE 명령 실행이 필요합니다.',
    query: `-- 모든 사용자 테이블에 대해 CHECK TABLE 실행
-- 주의: 대용량 테이블에서는 시간이 오래 걸릴 수 있습니다
CHECK TABLE your_database.your_table FOR UPGRADE;

-- 또는 mysqlcheck 유틸리티 사용:
-- mysqlcheck -u root -p --all-databases --check-upgrade`,
    analyzeResult: 'status가 OK가 아닌 경우 업그레이드 전 수정이 필요합니다.'
  },
  {
    id: 'orphanedObjects',
    name: '고아 객체',
    description: '참조하는 테이블이 없는 루틴, 트리거, 이벤트 확인',
    reason: 'sys 스키마 또는 SHOW STATUS 쿼리가 필요합니다.',
    query: `-- 고아 루틴 확인
SELECT
  ROUTINE_SCHEMA,
  ROUTINE_NAME,
  ROUTINE_TYPE
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys');

-- 고아 트리거 확인
SELECT
  TRIGGER_SCHEMA,
  TRIGGER_NAME,
  EVENT_OBJECT_TABLE
FROM INFORMATION_SCHEMA.TRIGGERS
WHERE TRIGGER_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys');`,
    analyzeResult: '참조하는 테이블이 존재하지 않는 객체가 있는지 확인'
  },
  {
    id: 'deprecatedRouterAuthMethod',
    name: 'Router 인증 방식',
    description: 'MySQL Router에서 폐기된 인증 방식 사용 여부 확인',
    reason: 'Router 설정 파일 접근이 필요합니다.',
    query: `-- MySQL Router 사용자의 인증 플러그인 확인
SELECT
  User,
  Host,
  plugin
FROM mysql.user
WHERE User LIKE 'mysql_router%'
   OR User LIKE 'router%';`,
    analyzeResult: 'plugin이 mysql_native_password인 경우 caching_sha2_password로 변경 필요'
  },
  {
    id: 'columnDefinition',
    name: '컬럼 정의 검증',
    description: 'INFORMATION_SCHEMA.COLUMNS의 상세 컬럼 정의 확인',
    reason: 'I_S.COLUMNS 실시간 쿼리가 필요합니다.',
    query: `-- 상세 컬럼 정의 확인
SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  COLUMN_DEFAULT,
  IS_NULLABLE,
  EXTRA,
  GENERATION_EXPRESSION
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;`,
    analyzeResult: '덤프에서 감지하기 어려운 세부 컬럼 속성 확인'
  },
  {
    id: 'sysvarAllowedValues',
    name: '시스템 변수 허용값',
    description: '현재 설정된 시스템 변수 값이 8.4에서 유효한지 확인',
    reason: 'SHOW VARIABLES 실행이 필요합니다.',
    query: `-- 현재 시스템 변수 값 확인
SHOW GLOBAL VARIABLES WHERE Variable_name IN (
  'sql_mode',
  'default_authentication_plugin',
  'character_set_server',
  'collation_server',
  'innodb_file_format',
  'innodb_large_prefix'
);

-- 또는 상세 확인
SELECT
  VARIABLE_NAME,
  VARIABLE_VALUE
FROM performance_schema.global_variables
WHERE VARIABLE_NAME REGEXP 'sql_mode|auth|character|collation|innodb';`,
    analyzeResult: '8.4에서 제거되거나 변경된 값이 설정되어 있는지 확인'
  },
  {
    id: 'defaultAuthenticationPluginMds',
    name: 'MDS 기본 인증 플러그인',
    description: 'MySQL Database Service (MDS) 전용 인증 검사',
    reason: 'MDS 환경 전용으로, 일반 서버에서는 해당 없음',
    query: `-- MDS 환경에서의 인증 플러그인 확인
SELECT
  User,
  Host,
  plugin
FROM mysql.user
WHERE plugin NOT IN ('caching_sha2_password', 'mysql_no_login');`,
    analyzeResult: 'MDS에서는 caching_sha2_password만 지원됩니다.'
  }
];

// ============================================================================
// 20. CHECK GUIDE DATA (all checks organized by category)
// ============================================================================
export interface CheckGuideItem {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  mysqlShellCheckId?: string;
  serverRequired?: boolean;
}

export interface CheckGuideCategory {
  id: string;
  name: string;
  description: string;
  checks: CheckGuideItem[];
}

export const CHECK_GUIDE: CheckGuideCategory[] = [
  {
    id: 'removedSysVars',
    name: '제거된 시스템 변수',
    description: 'MySQL 8.4에서 제거된 시스템 변수를 사용하는 설정을 감지합니다.',
    checks: [
      {
        id: 'removedSysVars',
        name: '제거된 시스템 변수',
        description: '47개의 제거된 시스템 변수 사용 감지 (avoid_temporal_upgrade, default_authentication_plugin, expire_logs_days 등)',
        severity: 'error',
        mysqlShellCheckId: 'removedSysVars'
      }
    ]
  },
  {
    id: 'newDefaultVars',
    name: '기본값 변경된 변수',
    description: '기본값이 변경되어 동작이 달라질 수 있는 시스템 변수입니다.',
    checks: [
      {
        id: 'sysVarsNewDefaults',
        name: '기본값 변경된 시스템 변수',
        description: 'innodb_adaptive_hash_index, innodb_flush_method, replica_parallel_workers 등의 기본값 변경',
        severity: 'warning',
        mysqlShellCheckId: 'sysVarsNewDefaults'
      },
      {
        id: 'zeroDates',
        name: '0000-00-00 날짜 값',
        description: 'DATE, DATETIME 컬럼의 "0000-00-00" 또는 "0000-00-00 00:00:00" 값 감지',
        severity: 'error',
        mysqlShellCheckId: 'zeroDates'
      }
    ]
  },
  {
    id: 'reservedKeywords',
    name: '예약어 충돌',
    description: '새로운 예약어와 충돌하는 테이블, 컬럼, 함수 이름입니다.',
    checks: [
      {
        id: 'reservedKeywords',
        name: '신규 예약어 충돌',
        description: 'MANUAL, PARALLEL, QUALIFY, TABLESAMPLE 예약어와 충돌하는 식별자',
        severity: 'error',
        mysqlShellCheckId: 'reservedKeywords'
      },
      {
        id: 'routineSyntax',
        name: '루틴 내 예약어',
        description: '저장 프로시저, 함수 내에서 예약어 사용',
        severity: 'warning',
        mysqlShellCheckId: 'routineSyntax'
      }
    ]
  },
  {
    id: 'authentication',
    name: '인증',
    description: '인증 플러그인 및 사용자 계정 관련 호환성 문제입니다.',
    checks: [
      {
        id: 'authMethodUsage',
        name: 'mysql_native_password 사용',
        description: '8.4에서 기본 비활성화된 mysql_native_password 플러그인 사용 계정',
        severity: 'error',
        mysqlShellCheckId: 'authMethodUsage'
      },
      {
        id: 'deprecatedDefaultAuth',
        name: 'sha256_password 사용',
        description: '폐기 예정인 sha256_password 플러그인 사용 계정',
        severity: 'warning',
        mysqlShellCheckId: 'deprecatedDefaultAuth'
      },
      {
        id: 'pluginUsage',
        name: '제거된 인증 플러그인',
        description: 'authentication_fido, authentication_fido_client 플러그인 사용',
        severity: 'error',
        mysqlShellCheckId: 'pluginUsage'
      },
      {
        id: 'defaultAuthenticationPlugin',
        name: '기본 인증 플러그인 설정',
        description: 'default_authentication_plugin 변수 사용 (제거됨)',
        severity: 'error',
        mysqlShellCheckId: 'defaultAuthenticationPlugin'
      }
    ]
  },
  {
    id: 'invalidPrivileges',
    name: '제거된 권한',
    description: '제거되었거나 변경된 권한을 사용하는 GRANT 문입니다.',
    checks: [
      {
        id: 'invalidPrivileges',
        name: 'SUPER 권한 사용',
        description: 'SUPER 권한 사용 (동적 권한으로 대체됨)',
        severity: 'warning',
        mysqlShellCheckId: 'invalidPrivileges'
      }
    ]
  },
  {
    id: 'invalidObjects',
    name: '잘못된 객체',
    description: '스키마 구조, 데이터 타입, 객체 이름 관련 호환성 문제입니다.',
    checks: [
      {
        id: 'oldTemporal',
        name: 'YEAR(2) 타입',
        description: 'YEAR(2) 데이터 타입 사용 (YEAR(4)로 변경 필요)',
        severity: 'error',
        mysqlShellCheckId: 'oldTemporal'
      },
      {
        id: 'utf8mb3',
        name: 'utf8mb3/utf8 문자셋',
        description: 'utf8 (utf8mb3) 문자셋 사용 (utf8mb4 권장)',
        severity: 'warning',
        mysqlShellCheckId: 'utf8mb3'
      },
      {
        id: 'zerofill',
        name: 'ZEROFILL 속성',
        description: '숫자 컬럼의 ZEROFILL 속성 (폐기됨)',
        severity: 'warning',
        mysqlShellCheckId: 'zerofill'
      },
      {
        id: 'floatPrecision',
        name: 'FLOAT/DOUBLE 정밀도',
        description: 'FLOAT(M,D), DOUBLE(M,D) 구문 (폐기됨)',
        severity: 'warning',
        mysqlShellCheckId: 'floatPrecision'
      },
      {
        id: 'intDisplayWidth',
        name: '정수형 표시 너비',
        description: 'INT(11) 등의 표시 너비 지정 (폐기됨)',
        severity: 'info',
        mysqlShellCheckId: 'intDisplayWidth'
      },
      {
        id: 'myisamEngine',
        name: 'MyISAM 엔진',
        description: 'MyISAM 스토리지 엔진 사용 (InnoDB 권장)',
        severity: 'warning',
        mysqlShellCheckId: 'myisamEngine'
      },
      {
        id: 'latin1Charset',
        name: 'latin1 문자셋',
        description: 'latin1 문자셋 사용 (utf8mb4 권장)',
        severity: 'info',
        mysqlShellCheckId: 'latin1Charset'
      },
      {
        id: 'removedFunctions',
        name: '제거된 함수',
        description: 'PASSWORD(), ENCRYPT(), ENCODE(), DECODE() 등 제거된 함수 사용',
        severity: 'error',
        mysqlShellCheckId: 'removedFunctions'
      },
      {
        id: 'obsoleteSqlModeFlags',
        name: '폐기된 SQL 모드',
        description: 'DB2, MAXDB, MSSQL, ORACLE 등 폐기된 SQL 모드 플래그',
        severity: 'warning',
        mysqlShellCheckId: 'obsoleteSqlModeFlags'
      },
      {
        id: 'groupbyAscSyntax',
        name: 'GROUP BY ASC/DESC',
        description: 'GROUP BY 절에서 ASC/DESC 사용 (제거됨)',
        severity: 'error',
        mysqlShellCheckId: 'groupbyAscSyntax'
      },
      {
        id: 'mysqlSchema',
        name: 'mysql 스키마 충돌',
        description: 'mysql 스키마의 시스템 테이블과 동일한 이름 사용',
        severity: 'error',
        mysqlShellCheckId: 'mysqlSchema'
      },
      {
        id: 'foreignKeyLength',
        name: '외래키 이름 길이',
        description: '외래키 이름이 64자를 초과하는 경우',
        severity: 'error',
        mysqlShellCheckId: 'foreignKeyLength'
      },
      {
        id: 'enumSetElementLength',
        name: 'ENUM/SET 요소 길이',
        description: 'ENUM 또는 SET 요소가 255자를 초과하는 경우',
        severity: 'error',
        mysqlShellCheckId: 'enumSetElementLength'
      },
      {
        id: 'ftsInTablename',
        name: 'FTS_ 테이블 이름',
        description: '테이블 이름이 FTS_로 시작하는 경우 (예약됨)',
        severity: 'warning',
        mysqlShellCheckId: 'ftsInTablename'
      },
      {
        id: 'oldGeometryTypes',
        name: '구버전 Geometry 타입',
        description: 'GEOMETRYCOLLECTION 사용 (GeometryCollection 권장)',
        severity: 'info',
        mysqlShellCheckId: 'oldGeometryTypes'
      },
      {
        id: 'changedFunctionsInGeneratedColumns',
        name: '생성 컬럼의 함수 변경',
        description: 'IF, CASE, COALESCE 등 생성 컬럼에서 동작이 변경된 함수 사용',
        severity: 'warning',
        mysqlShellCheckId: 'changedFunctionsInGeneratedColumns'
      },
      {
        id: 'columnsWhichCannotHaveDefaults',
        name: '기본값 불가 컬럼',
        description: 'BLOB, TEXT, GEOMETRY, JSON 컬럼에 DEFAULT 값 설정',
        severity: 'warning',
        mysqlShellCheckId: 'columnsWhichCannotHaveDefaults'
      },
      {
        id: 'dollarSignName',
        name: '$ 기호 식별자',
        description: '식별자 이름이 $로 시작하는 경우 (폐기됨)',
        severity: 'warning',
        mysqlShellCheckId: 'dollarSignName'
      },
      {
        id: 'nonNativePartitioning',
        name: '비네이티브 파티셔닝',
        description: 'MyISAM, CSV 등 비네이티브 파티셔닝 사용',
        severity: 'error',
        mysqlShellCheckId: 'nonNativePartitioning'
      },
      {
        id: 'partitionedTablesInSharedTablespaces',
        name: '공유 테이블스페이스 파티션',
        description: '파티션 테이블이 공유 테이블스페이스에 있는 경우',
        severity: 'error',
        mysqlShellCheckId: 'partitionedTablesInSharedTablespaces'
      },
      {
        id: 'invalid57Names',
        name: '5.7 무효 식별자',
        description: '연속 점(..), 후행 공백 등 무효한 식별자',
        severity: 'error',
        mysqlShellCheckId: 'invalid57Names'
      },
      {
        id: 'indexTooLarge',
        name: '과대 인덱스',
        description: '인덱스 키 크기가 제한을 초과하는 경우',
        severity: 'error',
        mysqlShellCheckId: 'indexTooLarge'
      },
      {
        id: 'emptyDotTableSyntax',
        name: '.table_name 구문',
        description: '스키마 없이 .table_name 형태 사용',
        severity: 'warning',
        mysqlShellCheckId: 'emptyDotTableSyntax'
      },
      {
        id: 'maxdbSqlModeFlags',
        name: 'MAXDB SQL 모드',
        description: 'MAXDB SQL 모드 사용 (제거됨)',
        severity: 'error',
        mysqlShellCheckId: 'maxdbSqlModeFlags'
      }
    ]
  },
  {
    id: 'dataIntegrity',
    name: '데이터 무결성',
    description: '데이터 값 자체에 존재하는 호환성 문제입니다.',
    checks: [
      {
        id: 'enumOutOfRange',
        name: 'ENUM 범위 초과',
        description: 'ENUM 컬럼에 정의되지 않은 값이 존재',
        severity: 'error'
      },
      {
        id: 'timestampRange',
        name: 'TIMESTAMP 범위',
        description: 'TIMESTAMP 범위(1970-2038)를 벗어나는 값',
        severity: 'error'
      },
      {
        id: 'invalidDateFormat',
        name: '잘못된 날짜 형식',
        description: 'DATE/DATETIME 컬럼의 잘못된 형식 값',
        severity: 'error'
      }
    ]
  },
  {
    id: 'serverRequired',
    name: '서버 접근 필요',
    description: '다음 검사 항목은 덤프 파일만으로는 확인할 수 없으며, 서버에 직접 쿼리를 실행해야 합니다.',
    checks: [
      {
        id: 'circularDirectory',
        name: '순환 디렉토리 참조',
        description: '테이블스페이스 파일이 순환 디렉토리 참조를 가지는지 확인',
        severity: 'warning',
        mysqlShellCheckId: 'circularDirectory',
        serverRequired: true
      },
      {
        id: 'schemaInconsistency',
        name: '스키마 불일치',
        description: 'SHOW CREATE TABLE과 INFORMATION_SCHEMA 간의 불일치 확인',
        severity: 'error',
        mysqlShellCheckId: 'schemaInconsistency',
        serverRequired: true
      },
      {
        id: 'engineMixup',
        name: '엔진 혼동',
        description: '.frm 파일과 실제 스토리지 엔진의 불일치 확인',
        severity: 'error',
        mysqlShellCheckId: 'engineMixup',
        serverRequired: true
      },
      {
        id: 'checkTableCommand',
        name: 'CHECK TABLE 결과',
        description: '테이블 무결성 검사 결과 확인',
        severity: 'warning',
        mysqlShellCheckId: 'checkTableCommand',
        serverRequired: true
      },
      {
        id: 'orphanedObjects',
        name: '고아 객체',
        description: '참조하는 테이블이 없는 루틴, 트리거, 이벤트 확인',
        severity: 'warning',
        mysqlShellCheckId: 'orphanedObjects',
        serverRequired: true
      },
      {
        id: 'deprecatedRouterAuthMethod',
        name: 'Router 인증 방식',
        description: 'MySQL Router에서 폐기된 인증 방식 사용 여부 확인',
        severity: 'warning',
        mysqlShellCheckId: 'deprecatedRouterAuthMethod',
        serverRequired: true
      },
      {
        id: 'columnDefinition',
        name: '컬럼 정의 검증',
        description: 'INFORMATION_SCHEMA.COLUMNS의 상세 컬럼 정의 확인',
        severity: 'info',
        mysqlShellCheckId: 'columnDefinition',
        serverRequired: true
      },
      {
        id: 'sysvarAllowedValues',
        name: '시스템 변수 허용값',
        description: '현재 설정된 시스템 변수 값이 8.4에서 유효한지 확인',
        severity: 'warning',
        mysqlShellCheckId: 'sysvarAllowedValues',
        serverRequired: true
      },
      {
        id: 'defaultAuthenticationPluginMds',
        name: 'MDS 기본 인증 플러그인',
        description: 'MySQL Database Service (MDS) 전용 인증 검사',
        severity: 'info',
        mysqlShellCheckId: 'defaultAuthenticationPluginMds',
        serverRequired: true
      }
    ]
  }
];

// ============================================================================
// 21. COMBINED SERVER CHECK QUERY (for upload feature)
// ============================================================================
export const COMBINED_SERVER_CHECK_QUERY = `-- MySQL 8.0 → 8.4 업그레이드 검증: 서버 체크 쿼리
-- 이 쿼리를 MySQL 서버에서 실행하고 결과를 JSON으로 저장하세요.

-- 1. 사용자 인증 플러그인 확인
SELECT
  'user_auth' AS check_type,
  User AS user_name,
  Host AS host,
  plugin AS auth_plugin,
  password_expired,
  account_locked
FROM mysql.user
WHERE plugin IN ('mysql_native_password', 'sha256_password', 'authentication_fido');

-- 2. 시스템 변수 확인
SELECT
  'sys_vars' AS check_type,
  VARIABLE_NAME AS var_name,
  VARIABLE_VALUE AS var_value
FROM performance_schema.global_variables
WHERE VARIABLE_NAME IN (
  'sql_mode',
  'default_authentication_plugin',
  'character_set_server',
  'collation_server',
  'innodb_adaptive_hash_index',
  'innodb_flush_method',
  'replica_parallel_workers'
);

-- 3. 테이블스페이스 파일 위치 확인
SELECT
  'tablespace_files' AS check_type,
  TABLESPACE_NAME,
  FILE_NAME,
  FILE_TYPE,
  ENGINE
FROM INFORMATION_SCHEMA.FILES
WHERE ENGINE = 'InnoDB'
  AND FILE_NAME IS NOT NULL;

-- 4. 테이블 엔진 상태 확인
SELECT
  'table_engines' AS check_type,
  TABLE_SCHEMA,
  TABLE_NAME,
  ENGINE,
  TABLE_COLLATION,
  CREATE_OPTIONS
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
  AND TABLE_TYPE = 'BASE TABLE';

-- 5. 루틴 목록 (고아 객체 확인용)
SELECT
  'routines' AS check_type,
  ROUTINE_SCHEMA,
  ROUTINE_NAME,
  ROUTINE_TYPE,
  DEFINER
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys');

-- 6. 트리거 목록
SELECT
  'triggers' AS check_type,
  TRIGGER_SCHEMA,
  TRIGGER_NAME,
  EVENT_OBJECT_SCHEMA,
  EVENT_OBJECT_TABLE,
  DEFINER
FROM INFORMATION_SCHEMA.TRIGGERS
WHERE TRIGGER_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys');
`;
