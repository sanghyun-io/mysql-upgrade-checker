# MySQL 8.0 → 8.4 Upgrade Compatibility Checker

> [한국어 문서](./README.ko.md) | English

A web-based tool to detect schema and data compatibility issues before upgrading from MySQL 8.0 to 8.4.

![MySQL Upgrade Checker](https://img.shields.io/badge/MySQL-8.0→8.4-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![No Server Required](https://img.shields.io/badge/server-not%20required-brightgreen)

## ✨ Key Features

- 🔍 **Schema Compatibility Check** - Detect deprecated data types, charsets, storage engines
- 📊 **Data Integrity Check** - Find invalid dates, empty ENUM values, 4-byte characters
- 🔧 **Executable Fix Queries** - Generate SQL to fix detected issues
- 🔒 **Complete Client-Side Processing** - No data sent to external servers
- 📁 **mysqlsh Dump Support** - Automatically analyze multi-file dumps

## 🚀 Quick Start

### Online Usage (Recommended)

Available on GitHub Pages:

👉 **[https://sanghyun-io.github.io/mysql-upgrade-checker](https://sanghyun-io.github.io/mysql-upgrade-checker)**

### Local Development

```bash
# Clone
git clone https://github.com/sanghyun-io/mysql-upgrade-checker.git
cd mysql-upgrade-checker

# Install dependencies
npm install

# Start dev server with HMR
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📖 How to Use

### 1. Prepare Dump Files

**Using mysqlsh:**

```bash
mysqlsh --uri user@host:3306 -- util dump-instance /path/to/dump \
  --threads=4 \
  --compression=none
```

### 2. Run Analysis

1. Click **"📁 Select Folder"** on the web page
2. Select your mysqlsh dump folder
3. Click **"🔍 Start Analysis"**
4. Review results and download fix queries

### 3. Fix Issues

For each issue in the results:
- 📋 **Copy** button for individual fix queries
- 🔧 **Download All Fix Queries** button for complete SQL file

## 🔍 Checks

### Schema Compatibility

| Check | Severity | Description |
|-------|----------|-------------|
| utf8 charset | WARNING | In MySQL 8.4, utf8 refers to utf8mb4 |
| MyISAM engine | WARNING | InnoDB is recommended |
| YEAR(2) | ERROR | Deprecated, auto-converted to YEAR(4) |
| ZEROFILL | WARNING | Deprecated since MySQL 8.0.17 |
| FLOAT(M,D), DOUBLE(M,D) | WARNING | Deprecated, use DECIMAL |
| INT(N) display width | INFO | Deprecated since MySQL 8.0.17 |
| SQL_CALC_FOUND_ROWS | WARNING | Deprecated since MySQL 8.0.17 |

### Data Integrity

| Check | Severity | Description |
|-------|----------|-------------|
| 0000-00-00 dates | ERROR | Not allowed in NO_ZERO_DATE mode |
| Empty ENUM values | ERROR | Causes issues in strict mode |
| 4-byte UTF-8 chars | WARNING | Cannot be stored in utf8mb3 (emojis, etc.) |
| NULL bytes | ERROR | Contains \0 in data |
| TIMESTAMP out of range | ERROR | Outside 1970~2038 range |

## 💾 Output Example

### Fix Query Example

```sql
-- MySQL 8.0 to 8.4 upgrade fix queries
-- Generated: 2026-01-27T12:00:00.000Z
-- Total 5 fix queries

-- Invalid date value: 0000-00-00
-- Location: users.sql - Table: users
UPDATE `users` SET `created_at` = NULL WHERE `created_at` = '0000-00-00';

-- Empty ENUM value
-- Location: orders.sql - Table: orders, Column: status
UPDATE `orders` SET `status` = 'pending' WHERE `status` = '';

-- utf8 charset usage (utf8mb3)
-- Location: products.sql - Table: products
ALTER TABLE `products` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 🏗️ Tech Stack

- **TypeScript** - Type safety
- **Vite** - Fast build and HMR
- **Vanilla HTML/CSS** - No frameworks
- **Client-Side Processing** - No server required
- **File API** - Local file reading
- **Blob API** - File downloads

## 🔒 Security & Privacy

- ✅ **All processing happens in the browser**
- ✅ **No data sent to external servers**
- ✅ **No network connection required** (for local usage)
- ✅ **Dump files stay local**

## 📋 Supported File Formats

- ✅ `.sql` - Schema and INSERT statements
- ✅ `.tsv` - mysqlsh data files
- ✅ `.json` - mysqlsh metadata (@.json)
- ⏭️ `load-progress*.json` - Automatically skipped

## 🤝 Contributing

Contributions are welcome! You can participate by:

1. Creating issues - Bug reports or feature suggestions
2. Pull Requests - Code improvements or new features
3. Documentation - README, comments, etc.

### Development Setup

**Prerequisites:**
- Node.js 18 or higher
- npm or yarn

**Project Structure:**
```
mysql-upgrade-checker/
├── src/
│   ├── index.html          # Main HTML
│   ├── styles/
│   │   └── main.css        # Stylesheet
│   └── scripts/
│       ├── main.ts         # Main entry point
│       ├── types.ts        # TypeScript type definitions
│       ├── rules.ts        # Compatibility rules
│       ├── analyzer.ts     # File analysis logic
│       └── ui.ts           # UI rendering
├── dist/                   # Build output (auto-generated)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

**Development Workflow:**

```bash
# Clone repository
git clone https://github.com/sanghyun-io/mysql-upgrade-checker.git
cd mysql-upgrade-checker

# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview build
npm run preview
```

**Before Submitting PR:**
1. Ensure TypeScript type check passes
2. Verify build succeeds (`npm run build`)
3. Test with actual mysqlsh dumps

## 📝 License

MIT License - Free to use, modify, and distribute.

## 🙏 Credits

- Based on MySQL official documentation compatibility information
- Supports mysqlsh dump format

## 📞 Contact

For issues or questions, please open an issue at [GitHub Issues](https://github.com/sanghyun-io/mysql-upgrade-checker/issues).

---

**⚠️ Disclaimer:** This tool detects major compatibility issues, but always perform thorough testing in a test environment before upgrading to production.
