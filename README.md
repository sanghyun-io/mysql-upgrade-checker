# MySQL 8.0 → 8.4 Upgrade Compatibility Checker

> [한국어 문서](./README.ko.md) | English

A comprehensive web-based static analysis tool that detects compatibility issues before upgrading from MySQL 8.0 to 8.4. Implements checks equivalent to MySQL Shell's `util.checkForServerUpgrade()` function.

![MySQL Upgrade Checker](https://img.shields.io/badge/MySQL-8.0→8.4-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![No Server Required](https://img.shields.io/badge/server-not%20required-brightgreen)
![Tests](https://img.shields.io/badge/tests-334%20passed-brightgreen)

## Live Demo

👉 **[https://sanghyun-io.github.io/mysql-upgrade-checker](https://sanghyun-io.github.io/mysql-upgrade-checker)**

---

## Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Compatibility Checks](#-compatibility-checks)
- [How to Use](#-how-to-use)
- [Report Export](#-report-export)
- [Server Query Support](#-server-query-support)
- [Architecture](#-architecture)
- [Validation Process](#-validation-process)
- [Development](#-development)
- [Security & Privacy](#-security--privacy)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **67 Compatibility Rules** | Comprehensive checks covering all major MySQL 8.4 breaking changes |
| **MySQL Shell Compatible** | Implements equivalent checks to `util.checkForServerUpgrade()` |
| **Static Analysis** | Analyze dump files without connecting to a live database |
| **Auto-Fix Generation** | Generate executable SQL queries to fix detected issues |
| **Multi-Format Export** | Export reports in JSON, CSV, or MySQL Shell format |

### Key Highlights

- 🔍 **Schema Analysis** - Detect deprecated data types, charsets, storage engines, and syntax
- 📊 **Data Integrity Check** - Find invalid dates, ENUM issues, character encoding problems
- 🔐 **Authentication Audit** - Identify deprecated auth plugins and privilege issues
- 🔧 **Executable Fix Queries** - One-click copy or bulk download of fix SQL
- 🔒 **100% Client-Side** - No data sent to external servers, works offline
- 📁 **mysqlsh Dump Support** - Automatically analyze multi-file dumps

---

## 🚀 Quick Start

### Online Usage (Recommended)

No installation required. Open in your browser:

👉 **[https://sanghyun-io.github.io/mysql-upgrade-checker](https://sanghyun-io.github.io/mysql-upgrade-checker)**

### Local Installation

```bash
# Clone repository
git clone https://github.com/sanghyun-io/mysql-upgrade-checker.git
cd mysql-upgrade-checker

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

---

## 🔍 Compatibility Checks

This tool implements **67 compatibility rules** across 7 categories, covering all major MySQL 8.4 breaking changes.

### 1. Removed System Variables

Detects system variables removed in MySQL 8.4 that will cause server startup failures.

| Variable | Status | Impact |
|----------|--------|--------|
| `default_authentication_plugin` | Removed | Server won't start |
| `expire_logs_days` | Removed | Use `binlog_expire_logs_seconds` |
| `master_info_repository` | Removed | Use default TABLE storage |
| `relay_log_info_repository` | Removed | Use default TABLE storage |
| `innodb_log_file_size` | Removed | Use `innodb_redo_log_capacity` |
| `transaction_write_set_extraction` | Removed | Default enabled |
| + 42 more variables | Removed | See [full list](./docs/removed-variables.md) |

### 2. Changed Default Values

Identifies system variables with changed defaults that may affect application behavior.

| Variable | Old Default | New Default | Notes |
|----------|-------------|-------------|-------|
| `replica_parallel_workers` | 0 | 4 | Parallel replication enabled |
| `innodb_adaptive_hash_index` | ON | OFF | Performance tuning change |
| `innodb_flush_method` | fsync | O_DIRECT | I/O optimization |
| `innodb_io_capacity` | 200 | 10000 | SSD-optimized default |
| `innodb_change_buffering` | all | none | Simplified change buffer |

### 3. Authentication & Privileges

| Check | Severity | Description |
|-------|----------|-------------|
| `mysql_native_password` | ERROR | Disabled by default in 8.4, must be explicitly enabled |
| `sha256_password` | WARNING | Deprecated, migrate to `caching_sha2_password` |
| `authentication_fido` | ERROR | Completely removed in 8.4 |
| `SUPER` privilege | WARNING | Replaced by granular dynamic privileges |
| Invalid privileges | ERROR | Removed privileges that will cause errors |

### 4. Schema Compatibility

| Check | Severity | Description |
|-------|----------|-------------|
| `utf8` charset | WARNING | Alias changed from utf8mb3 to utf8mb4 |
| `utf8mb3` explicit | WARNING | Deprecated, migrate to utf8mb4 |
| `latin1` charset | INFO | Consider migrating to utf8mb4 |
| `YEAR(2)` | ERROR | Removed, auto-converted to YEAR(4) |
| `ZEROFILL` | WARNING | Deprecated since 8.0.17 |
| `FLOAT(M,D)` | WARNING | Precision syntax deprecated |
| `INT(N)` display width | INFO | Display width deprecated |
| `SQL_CALC_FOUND_ROWS` | WARNING | Deprecated, use `COUNT(*)` |
| `GROUP BY ASC/DESC` | ERROR | Removed syntax |
| Reserved keywords | ERROR | New reserved words: MANUAL, PARALLEL, QUALIFY, TABLESAMPLE |

### 5. Storage Engine

| Check | Severity | Description |
|-------|----------|-------------|
| MyISAM tables | WARNING | Migrate to InnoDB for better performance |
| Deprecated engines | WARNING | BLACKHOLE, FEDERATED, ARCHIVE considerations |
| Non-native partitioning | ERROR | Use native InnoDB partitioning |
| Shared tablespaces | WARNING | Move partitioned tables to file-per-table |

### 6. Data Integrity

| Check | Severity | Description |
|-------|----------|-------------|
| `0000-00-00` dates | ERROR | Invalid in `NO_ZERO_DATE` mode (default) |
| `0000-00-00 00:00:00` | ERROR | Invalid datetime values |
| Empty ENUM values | ERROR | Causes issues in strict mode |
| ENUM numeric index | WARNING | Using index instead of value |
| 4-byte UTF-8 chars | WARNING | Cannot store in utf8mb3 (emojis, etc.) |
| NULL bytes in data | ERROR | Contains `\0` characters |
| TIMESTAMP range | ERROR | Outside 1970-2038 range |

### 7. Naming & Syntax

| Check | Severity | Description |
|-------|----------|-------------|
| Reserved keyword usage | ERROR | Table/column names using new reserved words |
| Dollar sign names | WARNING | `$` in identifiers deprecated |
| Invalid 5.7 names | ERROR | Names with trailing spaces or control chars |
| FTS in tablename | WARNING | "FTS" prefix reserved for fulltext |
| FK name length | ERROR | Foreign key names > 64 chars |

---

## 📖 How to Use

### Step 1: Prepare Dump Files

Create a dump using MySQL Shell:

```bash
# Full instance dump
mysqlsh --uri user@host:3306 -- util dump-instance /path/to/dump \
  --threads=4 \
  --compression=none

# Single schema dump
mysqlsh --uri user@host:3306 -- util dump-schemas mydb \
  --outputUrl=/path/to/dump \
  --compression=none
```

Or use mysqldump:

```bash
mysqldump -u user -p --databases mydb > dump.sql
```

### Step 2: Upload and Analyze

1. Open the [web application](https://sanghyun-io.github.io/mysql-upgrade-checker)
2. Click **"📁 Select Folder"** or drag & drop files
3. Click **"🔍 Start Analysis"**
4. Wait for analysis to complete

### Step 3: Review Results

Results are organized by category with severity indicators:

- 🔴 **ERROR** - Must fix before upgrade
- 🟡 **WARNING** - Should review and fix
- 🔵 **INFO** - Optional improvements

### Step 4: Export and Fix

- **Copy individual fixes** using the 📋 button
- **Download all fixes** as a SQL file
- **Export report** in JSON, CSV, or MySQL Shell format

---

## 📊 Report Export

### Export Formats

| Format | Use Case |
|--------|----------|
| **JSON** | Integration with CI/CD pipelines, programmatic processing |
| **CSV** | Spreadsheet analysis, tracking, documentation |
| **MySQL Shell** | Compatibility with existing MySQL Shell workflows |

### MySQL Shell Format Example

```
The MySQL server at /path/to/dump, version 8.0.37, will now be checked for compatibility issues for upgrade to MySQL 8.4...

1) Removed system variables

  Error: The following system variables are removed in MySQL 8.4:
    - default_authentication_plugin
    - expire_logs_days
  More information: https://dev.mysql.com/doc/refman/8.4/en/added-deprecated-removed.html

2) Usage of mysql_native_password authentication plugin

  Warning: The following users are using mysql_native_password:
    - 'app_user'@'%'
  More information: https://dev.mysql.com/doc/refman/8.4/en/caching-sha2-password.html

Errors:   2
Warnings: 5
Notices:  3
```

---

## 🖥️ Server Query Support

Some checks require live server access. The tool provides ready-to-execute SQL queries:

### Available Server Checks

| Check | Query Purpose |
|-------|---------------|
| System Variable Defaults | Check current values vs. new 8.4 defaults |
| Authentication Plugins | List users with deprecated auth methods |
| Circular Directory References | Detect tablespace path issues |
| User Statistics | Authentication method distribution |

### How to Use

1. Navigate to the **"Server Query"** tab
2. Copy the provided SQL query
3. Execute on your MySQL server
4. Paste results back into the tool
5. View analysis results

---

## 🏗️ Architecture

### Project Structure

```
mysql-upgrade-checker/
├── src/
│   ├── index.html              # Main HTML
│   ├── styles/
│   │   └── main.css            # Stylesheet
│   └── scripts/
│       ├── main.ts             # Entry point
│       ├── analyzer.ts         # File analysis engine
│       ├── types.ts            # TypeScript definitions
│       ├── constants.ts        # MySQL 8.4 compatibility data
│       ├── ui.ts               # UI rendering
│       ├── report.ts           # Report export
│       ├── rules/              # Compatibility rules (modular)
│       │   ├── index.ts        # Rule aggregation
│       │   ├── auth.ts         # Authentication rules
│       │   ├── data.ts         # Data integrity rules
│       │   ├── naming.ts       # Naming & keyword rules
│       │   ├── privilege.ts    # Privilege rules
│       │   ├── schema.ts       # Schema rules
│       │   ├── storage.ts      # Storage engine rules
│       │   └── sysvar.ts       # System variable rules
│       └── parsers/            # SQL parsers
│           ├── table-parser.ts # CREATE TABLE parser
│           ├── user-parser.ts  # CREATE USER/GRANT parser
│           └── server-result-parser.ts
├── dist/                       # Build output
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Tech Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** | Type-safe development |
| **Vite** | Fast build and HMR |
| **Vitest** | Unit testing (334 tests) |
| **Vanilla JS/CSS** | No framework dependencies |
| **File API** | Client-side file reading |
| **Blob API** | File download generation |

### Data Flow

```
File Selection
      ↓
FileAnalyzer.analyzeFiles()
      ↓
┌─────────────────────────────────────┐
│  2-Pass Analysis                    │
│  ├── Pass 1: Collect table indexes  │
│  ├── Pass 2: Full analysis          │
│  └── Pass 2.5: FK validation        │
└─────────────────────────────────────┘
      ↓
Rule Pattern Matching (67 rules)
      ↓
Issue Generation
      ↓
UIManager.displayResults()
      ↓
Report Export (JSON/CSV/MySQL Shell)
```

**2-Pass Analysis** enables cross-file validation:
- Foreign key references are validated against actual PRIMARY KEY/UNIQUE indexes
- ENUM element lengths are checked with specific value reporting

---

## 📋 Validation Process

For detailed documentation on the validation process, including:

- **2-Pass Analysis Architecture** - How metadata collection and cross-validation work
- **13 Cross-Validation Patterns** - UTF-8 character validation, index size calculation, FK reference checks, and more
- **Rule-Based Pattern Matching** - How 67 compatibility rules are applied
- **File Type Processing** - SQL, config, TSV, and metadata file handling

See the complete documentation: **[Validation Process Documentation](./docs/VALIDATION_PROCESS.md)**

---

## 💻 Development

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Commands

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Run tests
npm run test:run

# TypeScript check
npx tsc --noEmit

# Production build
npm run build

# Preview production build
npm run preview
```

### Running Tests

```bash
# Run all tests
npm run test:run

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test
```

### Adding New Rules

1. Add constants to `constants.ts` if needed
2. Create rule in appropriate file under `rules/`
3. Follow the `CompatibilityRule` interface:

```typescript
{
  id: 'unique_rule_id',
  type: 'schema' | 'data' | 'config' | 'privilege' | 'query',
  category: 'removedSysVars' | 'newDefaultVars' | 'reservedKeywords' |
            'authentication' | 'invalidPrivileges' | 'invalidObjects' |
            'dataIntegrity',
  pattern: /regex/gi,  // or detectInData/detectInConfig function
  severity: 'error' | 'warning' | 'info',
  title: 'Human readable title',
  description: 'Detailed description',
  suggestion: 'How to fix',
  mysqlShellCheckId: 'equivalentMySQLShellCheck',
  generateFixQuery: (context) => 'SQL fix query'
}
```

4. Add tests in `__tests__/rules.test.ts`

---

## 🔒 Security & Privacy

| Aspect | Implementation |
|--------|----------------|
| **Data Processing** | 100% client-side, in-browser |
| **Network** | No data sent to external servers |
| **Offline Support** | Works without internet (local installation) |
| **File Handling** | Files read via File API, never uploaded |
| **No Tracking** | No analytics, cookies, or telemetry |

Your database dump files never leave your browser.

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Ways to Contribute

1. **Report Bugs** - Open an issue with reproduction steps
2. **Request Features** - Suggest new compatibility checks
3. **Submit PRs** - Code improvements, new rules, documentation
4. **Improve Docs** - README, inline comments, examples

### Before Submitting PR

1. Ensure TypeScript check passes (`npx tsc --noEmit`)
2. Ensure all tests pass (`npm run test:run`)
3. Verify build succeeds (`npm run build`)
4. Test with actual mysqlsh dumps

### Commit Convention

```
feat: add new compatibility rule for X
fix: correct false positive in Y detection
docs: update README with Z
test: add tests for W
refactor: improve rule modularization
```

---

## 📝 License

MIT License - Free to use, modify, and distribute.

---

## 🔗 Related Resources

- [MySQL 8.4 Release Notes](https://dev.mysql.com/doc/relnotes/mysql/8.4/en/)
- [MySQL Shell checkForServerUpgrade()](https://dev.mysql.com/doc/mysql-shell/8.4/en/mysql-shell-utilities-upgrade.html)
- [MySQL 8.4 Deprecated Features](https://dev.mysql.com/doc/refman/8.4/en/mysql-nutshell.html)
- [MySQL 8.4 Removed Features](https://dev.mysql.com/doc/refman/8.4/en/added-deprecated-removed.html)

---

## 📞 Support

For issues or questions:

- **GitHub Issues**: [Report a bug or request a feature](https://github.com/sanghyun-io/mysql-upgrade-checker/issues)
- **Discussions**: [Ask questions or share ideas](https://github.com/sanghyun-io/mysql-upgrade-checker/discussions)

---

**⚠️ Disclaimer:** This tool detects major compatibility issues through static analysis. Always perform thorough testing in a staging environment before upgrading production databases. Some checks require live server queries for complete accuracy.
