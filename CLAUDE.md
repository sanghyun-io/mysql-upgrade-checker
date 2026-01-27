# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # TypeScript check + Vite production build
npm run preview      # Preview production build
npx tsc --noEmit     # TypeScript type check only
```

## Project Overview

MySQL 8.0 → 8.4 Upgrade Compatibility Checker - a client-side web tool that analyzes mysqlsh dump files to detect compatibility issues before upgrading MySQL. All processing happens in the browser with no server required.

## Architecture

### Core Data Flow

```
File Selection → FileAnalyzer.analyzeFiles() → CompatibilityRules matching → UIManager.displayResults()
```

### Key Files

| File | Purpose |
|------|---------|
| `src/scripts/main.ts` | Entry point, tab navigation, global event handlers |
| `src/scripts/analyzer.ts` | `FileAnalyzer` class - parses SQL/TSV/JSON/config files and runs compatibility checks |
| `src/scripts/rules.ts` | `compatibilityRules` array - 47 rules based on MySQL Shell's `checkForServerUpgrade()` |
| `src/scripts/constants.ts` | Reference data: removed variables, reserved keywords, deprecated features |
| `src/scripts/types.ts` | TypeScript interfaces for rules, issues, and analysis results |
| `src/scripts/ui.ts` | `UIManager` class - renders results grouped by category |
| `src/scripts/toast.ts` | `ToastManager` class - non-intrusive notifications |
| `src/scripts/errorReporter.ts` | GitHub Issue/Email error reporting |

### Type System

- `CompatibilityRule`: Defines a check with `pattern` (RegExp), `detectInData()`, or `detectInConfig()` functions
- `Issue`: Detected problem with location, code context, and optional `fixQuery`
- `RuleCategory`: Groups rules into 7 categories (removedSysVars, authentication, invalidObjects, etc.)

### Rule Categories

Rules are organized into categories matching MySQL Shell output:
1. `removedSysVars` - Removed system variables
2. `newDefaultVars` - Changed default values (including zero dates)
3. `reservedKeywords` - New reserved keywords
4. `authentication` - Auth plugin issues
5. `invalidPrivileges` - Deprecated privileges
6. `invalidObjects` - Schema/data type issues
7. `dataIntegrity` - Data value problems

### Analysis Process

`FileAnalyzer` processes files by extension:
- `.cnf/.ini` → `analyzeConfigFile()` - parses INI sections
- `.sql` → `analyzeSQLFile()` - pattern matching + GRANT/CREATE USER parsing + INSERT data analysis
- `.tsv/.txt` → `analyzeTSVData()` - checks for 4-byte UTF-8 characters
- `@.json` → `analyzeMysqlShellMetadata()` - checks charset settings

## Vite Configuration

- `base: '/mysql-upgrade-checker/'` - GitHub Pages subpath
- `root: 'src'` - Source files in src/
- `outDir: '../dist'` - Build output

## Deployment

GitHub Actions를 통한 자동 배포 (GitHub Pages).

| 항목 | 내용 |
|------|------|
| 워크플로우 파일 | `.github/workflows/deploy.yml` |
| 트리거 | `main` 브랜치 push 또는 수동 실행 |
| 빌드 환경 | Node.js 20, Ubuntu |
| 배포 대상 | `dist/` 폴더 → GitHub Pages |

**배포 프로세스:**
1. `main` 브랜치에 push
2. GitHub Actions가 자동으로 `npm ci` → `npm run build` 실행
3. `dist/` 폴더를 GitHub Pages에 업로드
4. 약 1-2분 후 배포 완료

**수동 배포:**
GitHub 저장소 → Actions 탭 → "Deploy to GitHub Pages" → "Run workflow" 버튼

**Live site:** https://sanghyun-io.github.io/mysql-upgrade-checker/

## Adding New Rules

1. Add constants to `constants.ts` if needed (e.g., new removed variables)
2. Create rule in `rules.ts` with:
   - Unique `id`
   - `type`: schema/data/query/config/privilege
   - `category`: one of the 7 RuleCategories
   - `pattern`: RegExp for detection (or `detectInData`/`detectInConfig` functions)
   - `generateFixQuery`: optional function returning SQL fix
3. Rules are automatically included via `compatibilityRules` export
