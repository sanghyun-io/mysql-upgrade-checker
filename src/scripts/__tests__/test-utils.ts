/**
 * Test utilities and fixtures for MySQL Upgrade Checker tests
 */

import type { Issue } from '../types';

/**
 * Creates a mock File object for testing
 */
export function createMockFile(name: string, content: string): File {
  const blob = new Blob([content], { type: 'text/plain' });
  return new File([blob], name, { type: 'text/plain' });
}

/**
 * Helper to check if an issue was detected with specific properties
 */
export function findIssueById(issues: Issue[], id: string): Issue | undefined {
  return issues.find(issue => issue.id === id);
}

/**
 * Helper to check if any issue contains specific text
 */
export function hasIssueWithText(issues: Issue[], text: string): boolean {
  return issues.some(issue =>
    issue.code?.includes(text) ||
    issue.matchedText?.includes(text)
  );
}

/**
 * Helper to count issues by severity
 */
export function countBySeverity(issues: Issue[], severity: 'error' | 'warning' | 'info'): number {
  return issues.filter(issue => issue.severity === severity).length;
}

/**
 * Helper to count issues by category
 */
export function countByCategory(issues: Issue[], category: string): number {
  return issues.filter(issue => issue.category === category).length;
}

// ============================================================================
// SQL FIXTURES - Schema Detection
// ============================================================================

export const SQL_FIXTURES = {
  // YEAR(2) type detection
  year2Type: `
CREATE TABLE test_table (
  id INT PRIMARY KEY,
  birth_year YEAR(2)
);`,

  // UTF8 charset detection
  utf8Charset: `
CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,

  // utf8mb3 explicit
  utf8mb3Charset: `
CREATE TABLE products (
  id INT PRIMARY KEY,
  name VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;`,

  // latin1 charset
  latin1Charset: `
CREATE TABLE legacy_data (
  id INT PRIMARY KEY,
  data TEXT
) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,

  // MyISAM engine
  myisamEngine: `
CREATE TABLE logs (
  id INT PRIMARY KEY,
  message TEXT
) ENGINE=MyISAM;`,

  // ZEROFILL attribute
  // Note: Pattern expects `column_name TYPE ZEROFILL` without display width
  zerofillColumn: `
CREATE TABLE orders (
  id INT PRIMARY KEY,
  order_num INT ZEROFILL
);`,

  // FLOAT/DOUBLE precision
  floatPrecision: `
CREATE TABLE measurements (
  id INT PRIMARY KEY,
  value FLOAT(10,2),
  precise_value DOUBLE(15,5)
);`,

  // INT display width
  intDisplayWidth: `
CREATE TABLE items (
  id INT(11) PRIMARY KEY,
  quantity SMALLINT(6),
  count BIGINT(20)
);`,

  // Reserved keywords as identifiers
  reservedKeyword: `
CREATE TABLE manual (
  id INT PRIMARY KEY,
  parallel INT,
  qualify VARCHAR(100)
);`,

  // Reserved keyword as column
  reservedKeywordColumn: `
CREATE TABLE test (
  id INT PRIMARY KEY,
  manual INT,
  tablesample VARCHAR(100)
);`,

  // Removed functions
  removedFunctions: `
CREATE VIEW user_view AS
SELECT id, PASSWORD('test') as pwd, ENCRYPT('data') as enc
FROM users;`,

  // SQL_CALC_FOUND_ROWS
  sqlCalcFoundRows: `
SELECT SQL_CALC_FOUND_ROWS * FROM users WHERE status = 'active' LIMIT 10;`,

  // GROUP BY ASC/DESC
  groupByAscDesc: `
SELECT category, COUNT(*)
FROM products
GROUP BY category DESC;`,

  // BLOB/TEXT with default
  blobWithDefault: `
CREATE TABLE documents (
  id INT PRIMARY KEY,
  content TEXT DEFAULT 'empty'
);`,

  // FTS table prefix
  ftsTablePrefix: `
CREATE TABLE FTS_test_table (
  id INT PRIMARY KEY,
  content TEXT
);`,

  // Foreign key name too long
  longFkName: `
CREATE TABLE child_table (
  id INT PRIMARY KEY,
  parent_id INT,
  CONSTRAINT this_is_a_very_long_foreign_key_name_that_exceeds_the_sixty_four_character_limit FOREIGN KEY (parent_id) REFERENCES parent_table(id)
);`,

  // mysql schema conflict
  mysqlSchemaConflict: `
CREATE TABLE mysql.columns (
  id INT PRIMARY KEY
);`,

  // Generated column with changed functions
  generatedColumn: `
CREATE TABLE computed (
  id INT PRIMARY KEY,
  a INT,
  b INT,
  c INT GENERATED ALWAYS AS (IF(a > b, a, b)) STORED
);`,

  // Dollar sign table name
  dollarSignName: `
CREATE TABLE $test_table (
  id INT PRIMARY KEY
);`,

  // Non-native partitioning
  nonNativePartition: `
CREATE TABLE partitioned_myisam (
  id INT PRIMARY KEY,
  data VARCHAR(100)
) ENGINE=MyISAM
PARTITION BY RANGE (id) (
  PARTITION p0 VALUES LESS THAN (100),
  PARTITION p1 VALUES LESS THAN (200)
);`,

  // InnoDB old row format
  oldRowFormat: `
CREATE TABLE compact_table (
  id INT PRIMARY KEY
) ENGINE=InnoDB ROW_FORMAT=COMPACT;`,

  // Trailing space in table name
  trailingSpace: `
CREATE TABLE \`test_table \` (
  id INT PRIMARY KEY
);`,

  // GEOMETRYCOLLECTION type
  oldGeometryType: `
CREATE TABLE spatial_data (
  id INT PRIMARY KEY,
  geom GEOMETRYCOLLECTION
);`
};

// ============================================================================
// SQL FIXTURES - Data Detection (INSERT statements)
// ============================================================================

export const DATA_FIXTURES = {
  // Zero date
  zeroDate: `
CREATE TABLE events (
  id INT PRIMARY KEY,
  event_date DATE
);
INSERT INTO events (id, event_date) VALUES (1, '0000-00-00');`,

  // Zero datetime
  zeroDateTime: `
CREATE TABLE logs (
  id INT PRIMARY KEY,
  created_at DATETIME
);
INSERT INTO logs (id, created_at) VALUES (1, '0000-00-00 00:00:00');`,

  // ENUM with empty value
  enumEmptyValue: `
CREATE TABLE users (
  id INT PRIMARY KEY,
  status ENUM('active', 'inactive', 'pending')
);
INSERT INTO users (id, status) VALUES (1, '');`,

  // 4-byte UTF-8 characters (emoji)
  fourByteUtf8: `
CREATE TABLE messages (
  id INT PRIMARY KEY,
  content VARCHAR(255)
);
INSERT INTO messages (id, content) VALUES (1, 'Hello 😀 World');`,

  // NULL byte in data
  nullByte: `
CREATE TABLE binary_data (
  id INT PRIMARY KEY,
  data VARCHAR(255)
);
INSERT INTO binary_data (id, data) VALUES (1, 'test\\0data');`
};

// ============================================================================
// SQL FIXTURES - Authentication & Privileges
// ============================================================================

export const AUTH_FIXTURES = {
  // mysql_native_password
  mysqlNativePassword: `
CREATE USER 'app_user'@'%' IDENTIFIED WITH mysql_native_password BY 'password123';`,

  // sha256_password
  sha256Password: `
CREATE USER 'secure_user'@'localhost' IDENTIFIED WITH sha256_password BY 'securepass';`,

  // authentication_fido
  authenticationFido: `
CREATE USER 'fido_user'@'%' IDENTIFIED WITH authentication_fido;`,

  // ALTER USER with mysql_native_password
  alterUserNativePassword: `
ALTER USER 'old_user'@'%' IDENTIFIED WITH mysql_native_password BY 'newpassword';`,

  // SUPER privilege
  superPrivilege: `
GRANT SUPER ON *.* TO 'admin_user'@'%';`,

  // Multiple privileges including SUPER
  multiplePrivileges: `
GRANT SELECT, INSERT, UPDATE, SUPER, DELETE ON mydb.* TO 'power_user'@'localhost';`
};

// ============================================================================
// CONFIG FIXTURES
// ============================================================================

export const CONFIG_FIXTURES = {
  // Removed system variables
  removedSysVars: `
[mysqld]
expire_logs_days=7
default_authentication_plugin=mysql_native_password
innodb_log_file_size=256M
avoid_temporal_upgrade=ON`,

  // With hyphen (should also be detected)
  removedSysVarsHyphen: `
[mysqld]
expire-logs-days=7
master-info-repository=TABLE`,

  // Obsolete SQL modes
  obsoleteSqlMode: `
[mysqld]
sql_mode=STRICT_TRANS_TABLES,NO_ZERO_DATE,MAXDB,ORACLE`,

  // Changed defaults
  changedDefaults: `
[mysqld]
innodb_adaptive_hash_index=ON
innodb_change_buffering=all
replica_parallel_workers=0`,

  // default_authentication_plugin (removed in 8.4)
  defaultAuthPlugin: `
[mysqld]
default_authentication_plugin=mysql_native_password`
};

// ============================================================================
// TSV FIXTURES
// ============================================================================

export const TSV_FIXTURES = {
  // Normal data
  normalData: `id\tname\tage
1\tJohn\t30
2\tJane\t25`,

  // 4-byte UTF-8 in TSV
  fourByteUtf8: `id\tname\tmessage
1\tUser1\tHello 🎉 Party
2\tUser2\tTest 👍 Good`
};

// ============================================================================
// JSON FIXTURES (MySQL Shell metadata)
// ============================================================================

export const JSON_FIXTURES = {
  // utf8 charset in metadata
  utf8Metadata: JSON.stringify({
    options: {
      defaultCharacterSet: 'utf8'
    }
  }),

  // utf8mb3 charset in metadata
  utf8mb3Metadata: JSON.stringify({
    options: {
      defaultCharacterSet: 'utf8mb3'
    }
  }),

  // utf8mb4 charset (OK)
  utf8mb4Metadata: JSON.stringify({
    options: {
      defaultCharacterSet: 'utf8mb4'
    }
  })
};

// ============================================================================
// EXPECTED RESULTS HELPERS
// ============================================================================

export interface ExpectedIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
}

export function expectIssuesToInclude(issues: Issue[], expected: ExpectedIssue[]): void {
  for (const exp of expected) {
    const found = issues.find(i => i.id === exp.id);
    if (!found) {
      throw new Error(`Expected issue '${exp.id}' not found in results`);
    }
    if (found.severity !== exp.severity) {
      throw new Error(`Issue '${exp.id}' has severity '${found.severity}', expected '${exp.severity}'`);
    }
    if (found.category !== exp.category) {
      throw new Error(`Issue '${exp.id}' has category '${found.category}', expected '${exp.category}'`);
    }
  }
}

export function expectNoIssues(issues: Issue[], excludeIds: string[] = []): void {
  const unexpected = issues.filter(i => !excludeIds.includes(i.id));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected issues found: ${unexpected.map(i => i.id).join(', ')}`);
  }
}
