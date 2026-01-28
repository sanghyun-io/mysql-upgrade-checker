# Validation Process Documentation

> **Version**: 1.0
> **Last Updated**: 2026-01-28
> **Related**: [README.md](../README.md) | [한국어 버전](./VALIDATION_PROCESS.ko.md)

This document provides a comprehensive explanation of the validation process used by MySQL Upgrade Compatibility Checker.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [2-Pass Analysis Process](#2-2-pass-analysis-process)
3. [Cross-Validation Patterns](#3-cross-validation-patterns)
4. [Rule-Based Pattern Matching](#4-rule-based-pattern-matching)
5. [File Type Processing](#5-file-type-processing)
6. [Issue Generation](#6-issue-generation)

---

## 1. Architecture Overview

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         File Selection                                   │
│                    (Folder / Drag & Drop)                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FileAnalyzer.analyzeFiles()                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Pass 1: Metadata Collection                                      │  │
│  │  - Table schema parsing (columns, indexes, charset, partitions)   │  │
│  │  - FULLTEXT index collection                                      │  │
│  │  - ZEROFILL column mapping                                        │  │
│  │  - ENUM definition extraction                                     │  │
│  │  - Foreign key reference collection                               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                                    ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Pass 2: Full Analysis                                            │  │
│  │  - Rule pattern matching (67 rules)                               │  │
│  │  - Cross-file validation                                          │  │
│  │  - Data integrity checks                                          │  │
│  │  - INSERT data validation against schema                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│                                    ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Pass 2.5: Post-Analysis Validation                               │  │
│  │  - FK reference index validation                                  │  │
│  │  - Orphaned object detection                                      │  │
│  │  - FTS table prefix context validation                            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Issue Generation                                 │
│              (Severity: ERROR / WARNING / INFO)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    UIManager.displayResults()                           │
│                  Report Export (JSON/CSV/MySQL Shell)                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `FileAnalyzer` | `analyzer.ts` | Main analysis engine, orchestrates 2-pass analysis |
| `TableParser` | `parsers/table-parser.ts` | Parses CREATE TABLE statements into structured data |
| `UserParser` | `parsers/user-parser.ts` | Parses CREATE USER and GRANT statements |
| `CompatibilityRules` | `rules/*.ts` | 67 rules organized by category |
| `Constants` | `constants.ts` | MySQL 8.4 compatibility reference data |

---

## 2. 2-Pass Analysis Process

### Why 2-Pass?

Single-pass analysis cannot validate cross-file dependencies. For example:
- A foreign key in `orders.sql` references `users.id` - we need to know if `users.id` has a PRIMARY KEY
- INSERT data in `data.sql` may contain 4-byte UTF-8 characters - we need to know the table's charset first

### Pass 1: Metadata Collection

During Pass 1, the analyzer collects structural information without generating issues.

```typescript
// Collected metadata structures
private tableInfoMap: Map<string, TableInfo>;        // Table schemas
private tableIndexMap: Map<string, TableIndexInfo>;  // Index information
private tablesWithFulltextIndex: Set<string>;        // Tables with FULLTEXT
private zerofillColumns: Map<string, ZerofillColumnInfo>; // ZEROFILL columns
private enumDefinitions: Map<string, string[]>;      // ENUM values per column
```

#### What Pass 1 Collects

| Data | Source | Used For |
|------|--------|----------|
| Table charset/collation | `CREATE TABLE ... CHARSET=` | 4-byte UTF-8 validation |
| Column definitions | Column list in CREATE TABLE | ZEROFILL, ENUM extraction |
| Index information | PRIMARY KEY, UNIQUE, KEY | FK reference validation |
| Partition definitions | `PARTITION BY ...` | Non-native partition check |
| FULLTEXT indexes | `FULLTEXT KEY/INDEX` | FTS prefix validation |
| Foreign key definitions | `CONSTRAINT ... FOREIGN KEY` | FK name length, reference check |

### Pass 2: Full Analysis

Pass 2 performs the actual validation using collected metadata.

```typescript
async analyzeFiles(files: File[]): Promise<AnalysisResults> {
  // Pass 1: Collect metadata
  for (const file of sqlFiles) {
    await this.collectTableMetadata(file);
  }

  // Pass 2: Full analysis with cross-validation
  for (const file of allFiles) {
    await this.analyzeFile(file);  // Uses collected metadata
  }

  // Pass 2.5: Post-analysis validation
  this.validateForeignKeyReferences();
  this.validateOrphanedObjects();
  this.validateFTSTablePrefixes();

  return this.results;
}
```

### Pass 2.5: Post-Analysis Validation

After all files are analyzed, additional validations that require complete metadata:

1. **FK Reference Validation**: Check if referenced columns have proper indexes
2. **Orphaned Objects**: Detect VIEWs referencing non-existent tables
3. **FTS Prefix**: Validate tables with `FTS_` prefix against FULLTEXT index presence

---

## 3. Cross-Validation Patterns

The analyzer implements 13 cross-validation patterns that require context from multiple sources.

### 3.1 UTF-8 + 4-Byte Character Validation

**Purpose**: Detect 4-byte UTF-8 characters (emojis, etc.) in tables using utf8mb3

**Process**:
```
Pass 1: Collect table charset → tableInfoMap
Pass 2: Parse INSERT → Check if charset is utf8/utf8mb3 → Scan for 4-byte chars
```

**Detection Logic**:
```typescript
// 4-byte UTF-8 detection regex
const fourByteUtf8Pattern = /[\u{10000}-\u{10FFFF}]/u;

// Only flag if table uses utf8mb3
if (tableInfo.charset === 'utf8' || tableInfo.charset === 'utf8mb3') {
  if (fourByteUtf8Pattern.test(insertValue)) {
    // Issue: 4-byte character in utf8mb3 table
  }
}
```

### 3.2 Index Size Calculation

**Purpose**: Detect indexes exceeding 3072-byte limit based on charset

**Process**:
```
Pass 1: Collect column definitions with charset
Pass 2: Calculate index size = column_length × bytes_per_char
```

**Byte multipliers**:
| Charset | Bytes per Character |
|---------|---------------------|
| utf8mb4 | 4 |
| utf8mb3/utf8 | 3 |
| latin1 | 1 |
| binary | 1 |
| Other | 4 (conservative) |

### 3.3 Non-Native Partitioning Detection

**Purpose**: Detect partitioned tables not using native InnoDB partitioning

**Process**:
```
Pass 1: Parse partition definitions with engine info
Pass 2: Check if partition uses non-InnoDB engine
```

**Example Detection**:
```sql
-- This will be flagged
CREATE TABLE sales (
  id INT,
  sale_date DATE
) ENGINE=MyISAM
PARTITION BY RANGE (YEAR(sale_date)) (
  PARTITION p2023 VALUES LESS THAN (2024),
  PARTITION p2024 VALUES LESS THAN (2025)
);
```

### 3.4 Generated Column Function Detection

**Purpose**: Detect generated columns using functions deprecated or changed in 8.4

**Process**:
```
Pass 1: Extract generated column expressions
Pass 2: Match against deprecated function patterns
```

**Monitored Functions**:
- `PASSWORD()` - Removed
- `ENCRYPT()` - Removed
- `DES_ENCRYPT()` / `DES_DECRYPT()` - Removed
- Functions with changed behavior in 8.4

### 3.5 Reserved Keyword Conflict Detection

**Purpose**: Detect identifiers using MySQL 8.4 reserved keywords

**Keywords Added in 8.4**:
```typescript
const NEW_RESERVED_KEYWORDS_84 = [
  'MANUAL', 'PARALLEL', 'QUALIFY', 'TABLESAMPLE'
];
```

**Detection Scope**:
- Table names
- Column names
- Index names
- Stored procedure/function names

### 3.6 FK Constraint Name Length Check

**Purpose**: Detect foreign key names exceeding 64 characters

**Process**:
```
Pass 1: Extract FK constraint names
Pass 2: Check length > 64 characters
```

**Example**:
```sql
-- This will be flagged (name > 64 chars)
ALTER TABLE orders ADD CONSTRAINT
  fk_orders_customers_customer_id_references_customers_customer_id_primary_key
  FOREIGN KEY (customer_id) REFERENCES customers(id);
```

### 3.7 Orphaned Objects Detection

**Purpose**: Detect VIEWs referencing tables that don't exist in the dump

**Process**:
```
Pass 1: Collect all table names
Pass 2.5: Parse VIEW definitions → Check referenced tables exist
```

**Limitations**:
- Cannot detect references to tables in other schemas
- Cannot validate complex subqueries

### 3.8 Latin1 + Non-ASCII Data Validation

**Purpose**: Detect non-ASCII data in latin1 tables that may have encoding issues

**Process**:
```
Pass 1: Collect tables with latin1 charset
Pass 2: Scan INSERT data for non-ASCII characters (> 0x7F)
```

### 3.9 ENUM Empty Value + Definition Validation

**Purpose**: Detect empty string values in ENUM columns

**Process**:
```
Pass 1: Extract ENUM definitions per column
Pass 2: Detect INSERT with empty string ('') for ENUM columns
```

**Detection**:
```typescript
// Detect empty ENUM in column definition
const emptyEnumPattern = /[,\(]\s*['"]['"]/i;  // Matches ('', ...) or (..., '')

// Detect empty value in INSERT
if (enumValues.includes('') || insertValue === '') {
  // Issue: Empty ENUM value
}
```

### 3.10 Shared Tablespace Partition Check

**Purpose**: Detect partitioned tables in shared (non-file-per-table) tablespaces

**Process**:
```
Pass 1: Parse TABLESPACE clause at table and partition level
Pass 2: Flag partitions in shared tablespaces
```

**Example**:
```sql
-- This will be flagged
CREATE TABLE orders (...)
PARTITION BY HASH(id) PARTITIONS 4
TABLESPACE shared_ts;  -- Shared tablespace
```

### 3.11 FTS Table Prefix Context Validation

**Purpose**: Detect tables with `FTS_` prefix that aren't InnoDB internal FTS tables

**Process**:
```
Pass 1: Collect tables with FULLTEXT indexes
Pass 2.5: Check tables starting with 'FTS_'
        → If not InnoDB internal pattern, flag as potential conflict
```

**InnoDB Internal FTS Pattern**:
```typescript
// InnoDB internal FTS tables follow this pattern
const internalFtsPattern = /^FTS_[0-9A-Fa-f]{16}_/i;
// Example: FTS_0000000000000001_DELETED
```

### 3.12 ZEROFILL Data Dependency Check

**Purpose**: Detect INSERT data that relies on ZEROFILL padding

**Process**:
```
Pass 1: Collect ZEROFILL columns with display width
Pass 2: Parse INSERT values → Check if length < display width
```

**Example**:
```sql
CREATE TABLE products (
  code INT(5) ZEROFILL  -- Display width: 5
);

INSERT INTO products (code) VALUES (42);
-- Value '42' has length 2, would be displayed as '00042'
-- This is flagged because ZEROFILL is deprecated
```

### 3.13 Authentication Plugin Constant Utilization

**Purpose**: Comprehensive auth plugin status checking using centralized constants

**Constant Structure**:
```typescript
const AUTH_PLUGINS = {
  disabled: ['mysql_native_password'],           // Disabled by default in 8.4
  removed: ['authentication_fido'],              // Completely removed
  deprecated: ['sha256_password'],               // Deprecated
  recommended: 'caching_sha2_password'           // Recommended alternative
};
```

---

## 4. Rule-Based Pattern Matching

### Rule Structure

Each rule follows the `CompatibilityRule` interface:

```typescript
interface CompatibilityRule {
  id: string;                    // Unique identifier
  type: RuleType;                // schema | data | config | privilege | query
  category: RuleCategory;        // Grouping category
  pattern?: RegExp;              // Regex for detection
  detectInData?: Function;       // Custom data detection
  detectInConfig?: Function;     // Custom config detection
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  suggestion: string;
  mysqlShellCheckId?: string;    // Equivalent MySQL Shell check
  docLink?: string;              // Documentation URL
  generateFixQuery?: Function;   // Auto-fix SQL generator
}
```

### Rule Categories

| Category | Count | Examples |
|----------|-------|----------|
| `removedSysVars` | 48 | default_authentication_plugin, expire_logs_days |
| `newDefaultVars` | 5 | replica_parallel_workers, innodb_adaptive_hash_index |
| `authentication` | 9 | mysql_native_password, sha256_password |
| `reservedKeywords` | 6 | MANUAL, PARALLEL, QUALIFY, TABLESAMPLE |
| `invalidPrivileges` | 3 | SUPER privilege, removed grants |
| `invalidObjects` | 15 | utf8mb3, ZEROFILL, deprecated engines |
| `dataIntegrity` | 8 | zero dates, empty ENUM, NULL bytes |

### Pattern Matching Process

```typescript
for (const rule of compatibilityRules) {
  if (rule.pattern) {
    const matches = content.matchAll(rule.pattern);
    for (const match of matches) {
      this.addIssue({
        id: rule.id,
        severity: rule.severity,
        title: rule.title,
        // ... additional context
      });
    }
  }
}
```

---

## 5. File Type Processing

### Supported File Types

| Extension | Processor | Checks Performed |
|-----------|-----------|------------------|
| `.sql` | `analyzeSQLFile()` | Schema, data, grants, queries |
| `.cnf`, `.ini` | `analyzeConfigFile()` | System variables |
| `.tsv`, `.txt` | `analyzeTSVData()` | 4-byte UTF-8, data integrity |
| `@.json` | `analyzeMysqlShellMetadata()` | Charset, version info |

### SQL File Processing

```typescript
async analyzeSQLFile(content: string, fileName: string) {
  // 1. CREATE TABLE statements
  const createTableMatches = content.matchAll(/CREATE\s+TABLE[^;]+;/gi);
  for (const match of createTableMatches) {
    const tableInfo = TableParser.parse(match[0]);
    this.validateTable(tableInfo, fileName);
  }

  // 2. INSERT statements (with schema context)
  const insertMatches = content.matchAll(/INSERT\s+INTO[^;]+;/gi);
  for (const match of insertMatches) {
    this.validateInsertData(match[0], fileName);
  }

  // 3. CREATE USER / GRANT statements
  this.validateUserStatements(content, fileName);

  // 4. Pattern-based rule matching
  this.applyRules(content, fileName);
}
```

### Config File Processing

```typescript
analyzeConfigFile(content: string, fileName: string) {
  // Parse INI format
  const lines = content.split('\n');
  let currentSection = '';

  for (const line of lines) {
    if (line.match(/^\[(.+)\]$/)) {
      currentSection = RegExp.$1;
    } else if (line.includes('=')) {
      const [key, value] = line.split('=');
      this.validateConfigVariable(key.trim(), value.trim(), fileName);
    }
  }
}
```

---

## 6. Issue Generation

### Issue Structure

```typescript
interface Issue {
  id: string;              // Rule ID that generated this issue
  severity: Severity;      // error | warning | info
  title: string;           // Human-readable title
  description: string;     // Detailed explanation
  fileName: string;        // Source file
  lineNumber?: number;     // Line in source file
  code?: string;           // Relevant code snippet
  suggestion: string;      // How to fix
  fixQuery?: string;       // Auto-generated fix SQL
  docLink?: string;        // Documentation URL
}
```

### Severity Levels

| Level | Meaning | Action Required |
|-------|---------|-----------------|
| **ERROR** | Breaking change | Must fix before upgrade |
| **WARNING** | Deprecated/risky | Should fix, may cause issues |
| **INFO** | Informational | Optional improvement |

### Fix Query Generation

Many rules include automatic fix query generation:

```typescript
{
  id: 'mysql_native_password',
  // ...
  generateFixQuery: (context) => {
    if (context.userName) {
      return `ALTER USER '${context.userName}'@'%' IDENTIFIED WITH caching_sha2_password BY 'new_password';`;
    }
    return null;
  }
}
```

---

## Appendix: Validation Flow Diagrams

### INSERT Data Validation Flow

```
INSERT INTO users (id, name, emoji) VALUES (1, 'John', '😀');
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 1. Extract table name: 'users'          │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 2. Lookup tableInfoMap['users']         │
│    → charset: 'utf8mb3'                 │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 3. Parse column values                  │
│    → emoji column: '😀'                 │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 4. Check: is '😀' 4-byte UTF-8?         │
│    → YES (U+1F600)                      │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 5. charset == 'utf8mb3'?                │
│    → YES → Generate WARNING             │
└─────────────────────────────────────────┘
```

### FK Reference Validation Flow

```
CONSTRAINT `fk_order_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 1. Store pending FK check:              │
│    - Table: orders                      │
│    - Ref Table: users                   │
│    - Ref Column: id                     │
└─────────────────────────────────────────┘
                      │
        (After all files processed)
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 2. Lookup tableIndexMap['users']        │
│    → primaryKey: ['id']                 │
│    → uniqueIndexes: [...]               │
└─────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────┐
│ 3. Check: does 'id' have PK or UNIQUE?  │
│    → YES → No issue                     │
│    → NO  → Generate WARNING             │
└─────────────────────────────────────────┘
```

---

## Related Documentation

- [README.md](../README.md) - Project overview and usage
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [constants.ts](../src/scripts/constants.ts) - MySQL 8.4 compatibility data

---

*Last updated: 2026-01-28*
