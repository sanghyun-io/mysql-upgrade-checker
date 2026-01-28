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
// 2-PASS ANALYSIS FIXTURES (FK Validation & ENUM Length)
// ============================================================================

export const TWO_PASS_FIXTURES = {
  // FK referencing PRIMARY KEY - should NOT produce warning
  fkWithPrimaryKey: {
    parent: `
CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(100)
);`,
    child: `
CREATE TABLE orders (
  id INT PRIMARY KEY,
  user_id INT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`
  },

  // FK referencing UNIQUE index - should NOT produce warning
  fkWithUniqueIndex: {
    parent: `
CREATE TABLE categories (
  id INT,
  code VARCHAR(50),
  name VARCHAR(100),
  UNIQUE KEY idx_code (code)
);`,
    child: `
CREATE TABLE products (
  id INT PRIMARY KEY,
  category_code VARCHAR(50),
  FOREIGN KEY (category_code) REFERENCES categories(code)
);`
  },

  // FK referencing non-indexed column - should produce ERROR
  fkWithoutIndex: {
    parent: `
CREATE TABLE departments (
  id INT PRIMARY KEY,
  dept_code VARCHAR(10),
  name VARCHAR(100),
  KEY idx_name (name)
);`,
    child: `
CREATE TABLE employees (
  id INT PRIMARY KEY,
  dept_code VARCHAR(10),
  FOREIGN KEY (dept_code) REFERENCES departments(dept_code)
);`
  },

  // ENUM with element exceeding 255 chars - should produce ERROR
  enumTooLong: `
CREATE TABLE status_codes (
  id INT PRIMARY KEY,
  status ENUM('active', 'inactive', '${'x'.repeat(260)}')
);`,

  // ENUM with normal elements - should NOT produce warning
  enumNormal: `
CREATE TABLE user_types (
  id INT PRIMARY KEY,
  type ENUM('admin', 'user', 'guest', 'moderator')
);`,

  // UTF-8 charset with 4-byte data - should produce warning
  utf8With4ByteChars: {
    schema: `
CREATE TABLE messages_utf8 (
  id INT PRIMARY KEY,
  content VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;`,
    data: `
INSERT INTO messages_utf8 (id, content) VALUES (1, 'Hello 😀 World');`
  },

  // utf8mb4 charset with 4-byte data - should NOT produce warning
  utf8mb4With4ByteChars: {
    schema: `
CREATE TABLE messages_utf8mb4 (
  id INT PRIMARY KEY,
  content VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
    data: `
INSERT INTO messages_utf8mb4 (id, content) VALUES (1, 'Hello 😀 World');`
  },

  // utf8mb3 explicit charset with 4-byte data - should produce warning
  utf8mb3With4ByteChars: {
    schema: `
CREATE TABLE messages_utf8mb3 (
  id INT PRIMARY KEY,
  content VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;`,
    data: `
INSERT INTO messages_utf8mb3 (id, content) VALUES (1, 'Hello 🎉 Party');`
  },

  // Index too large with utf8mb4 (VARCHAR(800)*4 = 3200 bytes > 3072)
  indexTooLargeUtf8mb4: `
CREATE TABLE large_index_utf8mb4 (
  id INT PRIMARY KEY,
  long_text VARCHAR(800),
  INDEX idx_long_text (long_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  // Index within limit with utf8mb4 (VARCHAR(768)*4 = 3072 bytes = 3072 max)
  indexWithinLimitUtf8mb4: `
CREATE TABLE valid_index_utf8mb4 (
  id INT PRIMARY KEY,
  medium_text VARCHAR(768),
  INDEX idx_medium_text (medium_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  // Index within limit with utf8mb3 (VARCHAR(800)*3 = 2400 bytes < 3072)
  indexWithinLimitUtf8mb3: `
CREATE TABLE valid_index_utf8mb3 (
  id INT PRIMARY KEY,
  long_text VARCHAR(800),
  INDEX idx_long_text (long_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;`,

  // Index within limit with latin1 (VARCHAR(2000)*1 = 2000 bytes < 3072)
  indexWithinLimitLatin1: `
CREATE TABLE valid_index_latin1 (
  id INT PRIMARY KEY,
  very_long_text VARCHAR(2000),
  INDEX idx_very_long (very_long_text)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,

  // Composite index too large
  compositeIndexTooLarge: `
CREATE TABLE composite_large (
  id INT PRIMARY KEY,
  col1 VARCHAR(400),
  col2 VARCHAR(400),
  INDEX idx_composite (col1, col2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

  // Non-native partitioning with MyISAM engine - should produce warning
  nonNativePartitionMyISAM: `
CREATE TABLE partitioned_myisam (
  id INT,
  name VARCHAR(100),
  created_date DATE
) ENGINE=MyISAM
PARTITION BY RANGE (YEAR(created_date)) (
  PARTITION p2020 VALUES LESS THAN (2021),
  PARTITION p2021 VALUES LESS THAN (2022),
  PARTITION p2022 VALUES LESS THAN MAXVALUE
);`,

  // Native partitioning with InnoDB - should NOT produce warning
  nativePartitionInnoDB: `
CREATE TABLE partitioned_innodb (
  id INT,
  name VARCHAR(100),
  created_date DATE
) ENGINE=InnoDB
PARTITION BY RANGE (YEAR(created_date)) (
  PARTITION p2020 VALUES LESS THAN (2021),
  PARTITION p2021 VALUES LESS THAN (2022),
  PARTITION p2022 VALUES LESS THAN MAXVALUE
);`,

  // Non-native partitioning with CSV engine
  nonNativePartitionCSV: `
CREATE TABLE partitioned_csv (
  id INT NOT NULL,
  name VARCHAR(100) NOT NULL
) ENGINE=CSV
PARTITION BY HASH(id) PARTITIONS 4;`,

  // Generated column with changed function IF - should produce warning
  generatedColumnWithIF: `
CREATE TABLE calculated (
  id INT PRIMARY KEY,
  a INT,
  b INT,
  max_val INT GENERATED ALWAYS AS (IF(a > b, a, b)) STORED
);`,

  // Generated column with COALESCE - should produce warning
  generatedColumnWithCoalesce: `
CREATE TABLE defaults_table (
  id INT PRIMARY KEY,
  value1 INT,
  value2 INT,
  result INT GENERATED ALWAYS AS (COALESCE(value1, value2, 0)) VIRTUAL
);`,

  // Generated column with multiple changed functions
  generatedColumnMultipleFuncs: `
CREATE TABLE complex_calc (
  id INT PRIMARY KEY,
  a INT,
  b INT,
  c INT,
  result INT GENERATED ALWAYS AS (GREATEST(LEAST(a, b), IFNULL(c, 0))) STORED
);`,

  // Generated column with normal function (no changed functions) - should NOT produce warning
  generatedColumnNormal: `
CREATE TABLE simple_calc (
  id INT PRIMARY KEY,
  a INT,
  b INT,
  sum_val INT GENERATED ALWAYS AS (a + b) STORED,
  concat_val VARCHAR(100) GENERATED ALWAYS AS (CONCAT('val_', CAST(a AS CHAR))) VIRTUAL
);`,

  // Reserved keyword as table name - should produce error
  reservedKeywordTable: `
CREATE TABLE manual (
  id INT PRIMARY KEY,
  name VARCHAR(100)
);`,

  // Reserved keyword as column name - should produce error
  reservedKeywordColumn: `
CREATE TABLE users (
  id INT PRIMARY KEY,
  parallel INT,
  qualify VARCHAR(100)
);`,

  // Normal table name (not reserved) - should NOT produce error
  normalTableName: `
CREATE TABLE normal_table (
  id INT PRIMARY KEY,
  data VARCHAR(100)
);`,

  // FK name exceeding 64 characters - should produce error
  fkNameTooLong: `
CREATE TABLE parent (
  id INT PRIMARY KEY
);
CREATE TABLE child (
  id INT PRIMARY KEY,
  parent_id INT,
  CONSTRAINT this_is_a_very_long_foreign_key_name_that_exceeds_the_sixty_four_character_limit_by_far FOREIGN KEY (parent_id) REFERENCES parent(id)
);`,

  // FK name within 64 characters - should NOT produce error
  fkNameNormal: `
CREATE TABLE parent (
  id INT PRIMARY KEY
);
CREATE TABLE child (
  id INT PRIMARY KEY,
  parent_id INT,
  CONSTRAINT fk_child_parent FOREIGN KEY (parent_id) REFERENCES parent(id)
);`,

  // VIEW referencing missing table - should produce warning
  viewOrphanedReference: `
CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(100)
);
CREATE VIEW user_orders AS
SELECT u.id, u.name, o.order_date
FROM users u
JOIN orders o ON u.id = o.user_id;`,

  // VIEW referencing existing table - should NOT produce warning
  viewValidReference: `
CREATE TABLE products (
  id INT PRIMARY KEY,
  name VARCHAR(100)
);
CREATE TABLE categories (
  id INT PRIMARY KEY,
  name VARCHAR(100)
);
CREATE VIEW product_categories AS
SELECT p.name AS product, c.name AS category
FROM products p
JOIN categories c ON p.id = c.id;`,

  // Latin1 table with non-ASCII data - should produce warning
  latin1WithNonAscii: {
    schema: `
CREATE TABLE legacy_customers (
  id INT PRIMARY KEY,
  name VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
    data: `
INSERT INTO legacy_customers (id, name) VALUES (1, 'José García');`
  },

  // Latin1 table with ASCII-only data - should NOT produce warning
  latin1WithAsciiOnly: {
    schema: `
CREATE TABLE ascii_only (
  id INT PRIMARY KEY,
  name VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;`,
    data: `
INSERT INTO ascii_only (id, name) VALUES (1, 'John Smith');`
  },

  // UTF8MB4 table with non-ASCII data - should NOT produce warning
  utf8mb4WithNonAscii: {
    schema: `
CREATE TABLE modern_customers (
  id INT PRIMARY KEY,
  name VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
    data: `
INSERT INTO modern_customers (id, name) VALUES (1, 'José García');`
  },

  // ENUM with empty value inserted but not defined - should produce warning
  enumEmptyNotDefined: `
CREATE TABLE user_status (
  id INT PRIMARY KEY,
  status ENUM('active', 'inactive', 'pending')
);
INSERT INTO user_status (id, status) VALUES (1, 'active');
INSERT INTO user_status (id, status) VALUES (2, '');`,

  // ENUM with empty value inserted and defined - should NOT produce warning
  enumEmptyDefined: `
CREATE TABLE user_status_with_empty (
  id INT PRIMARY KEY,
  status ENUM('', 'active', 'inactive', 'pending')
);
INSERT INTO user_status_with_empty (id, status) VALUES (1, 'active');
INSERT INTO user_status_with_empty (id, status) VALUES (2, '');`,

  // ENUM without any empty value inserted - should NOT produce warning
  enumNoEmpty: `
CREATE TABLE user_status_no_empty (
  id INT PRIMARY KEY,
  status ENUM('active', 'inactive', 'pending')
);
INSERT INTO user_status_no_empty (id, status) VALUES (1, 'active');
INSERT INTO user_status_no_empty (id, status) VALUES (2, 'pending');`
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
