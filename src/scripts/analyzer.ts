/**
 * MySQL 8.0 → 8.4 Upgrade Checker - File Analyzer
 * Analyzes SQL files, config files, and data files for compatibility issues
 */

import type {
  AnalysisResults,
  Issue,
  TableSchemas,
  ConfigSection,
  AnalysisProgress,
  TableInfo,
  TableIndexInfo,
  TableIndexMap,
  PendingFKCheck,
  TableCharsetInfo,
  TableCharsetMap,
  ColumnCharsetInfo
} from './types';
import { compatibilityRules } from './rules';
import { REMOVED_SYS_VARS_84, SYS_VARS_NEW_DEFAULTS_84 } from './constants';
import { parseCreateTable } from './parsers/table-parser';
import { extractUsers } from './parsers/user-parser';

// Callback types for real-time updates
export type OnIssueCallback = (issue: Issue) => void;
export type OnProgressCallback = (progress: AnalysisProgress) => void;

export class FileAnalyzer {
  private results: AnalysisResults = {
    issues: [],
    stats: { safe: 0, error: 0, warning: 0, info: 0 },
    categoryStats: {
      removedSysVars: 0,
      newDefaultVars: 0,
      reservedKeywords: 0,
      authentication: 0,
      invalidPrivileges: 0,
      invalidObjects: 0,
      dataIntegrity: 0
    }
  };

  // Callbacks for real-time updates
  private onIssue: OnIssueCallback | null = null;
  private onProgress: OnProgressCallback | null = null;

  // 2-Pass analysis: table index map for FK reference validation
  private tableIndexMap: TableIndexMap = new Map();
  private pendingFKChecks: PendingFKCheck[] = [];

  // 2-Pass analysis: table charset map for 4-byte UTF-8 cross-validation
  private tableCharsetMap: TableCharsetMap = new Map();

  // Files content cache for 2-pass analysis
  private fileContentsCache: Map<string, string> = new Map();

  // Set callbacks for real-time updates
  setCallbacks(onIssue: OnIssueCallback | null, onProgress: OnProgressCallback | null): void {
    this.onIssue = onIssue;
    this.onProgress = onProgress;
  }

  // Yield to UI thread for responsiveness
  private yieldToUI(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 5));
  }

  async analyzeFiles(files: File[]): Promise<AnalysisResults> {
    this.results = {
      issues: [],
      stats: { safe: 0, error: 0, warning: 0, info: 0 },
      categoryStats: {
        removedSysVars: 0,
        newDefaultVars: 0,
        reservedKeywords: 0,
        authentication: 0,
        invalidPrivileges: 0,
        invalidObjects: 0,
        dataIntegrity: 0
      },
      metadata: {
        totalFiles: files.length,
        analyzedAt: new Date().toISOString(),
        fileTypes: {
          sql: 0,
          tsv: 0,
          json: 0,
          config: 0
        }
      }
    };

    // Reset 2-pass analysis state
    this.tableIndexMap.clear();
    this.tableCharsetMap.clear();
    this.pendingFKChecks = [];
    this.fileContentsCache.clear();

    // ========================================================================
    // PASS 1: Collect table index and charset information from all SQL files
    // ========================================================================
    for (const file of files) {
      if (file.name.endsWith('.sql')) {
        const content = await this.readFileContent(file);
        this.fileContentsCache.set(file.name, content);
        this.collectTableIndexes(content, file.name);
        this.collectTableCharsets(content, file.name);
      }
    }

    // ========================================================================
    // PASS 2: Full analysis with FK validation capability
    // ========================================================================
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileType = this.detectFileType(file.name);

      // Notify progress
      if (this.onProgress) {
        this.onProgress({
          currentFile: file.name,
          currentFileIndex: i,
          totalFiles: files.length,
          fileType,
          phase: fileType === 'skip' ? 'skipped' : 'analyzing'
        });
      }

      // Yield to UI for responsiveness
      await this.yieldToUI();

      await this.analyzeFile(file);

      // Notify progress complete
      if (this.onProgress) {
        this.onProgress({
          currentFile: file.name,
          currentFileIndex: i,
          totalFiles: files.length,
          fileType,
          phase: 'complete'
        });
      }
    }

    // ========================================================================
    // PASS 2.5: Validate FK references using collected table index info
    // ========================================================================
    this.validateForeignKeyReferences();

    // Clean up cache
    this.fileContentsCache.clear();

    return this.results;
  }

  private detectFileType(fileName: string): string {
    if (
      fileName.startsWith('load-progress') ||
      fileName.startsWith('dump-progress') ||
      fileName === '@.done.json'
    ) {
      return 'skip';
    }
    if (fileName.toLowerCase().endsWith('.cnf') || fileName.toLowerCase().endsWith('.ini')) {
      return 'config';
    }
    if (fileName.endsWith('.sql')) return 'sql';
    if (fileName.endsWith('.json') && fileName.includes('@.')) return 'json';
    if (fileName.endsWith('.tsv') || fileName.endsWith('.txt')) return 'tsv';
    return 'unknown';
  }

  private async analyzeFile(file: File): Promise<void> {
    // Use cached content for SQL files (from Pass 1), otherwise read fresh
    const content = this.fileContentsCache.get(file.name) ?? await this.readFileContent(file);
    const fileName = file.name;
    const lowerName = fileName.toLowerCase();

    // Skip mysqlsh dump progress files
    if (
      fileName.startsWith('load-progress') ||
      fileName.startsWith('dump-progress') ||
      fileName === '@.done.json'
    ) {
      return;
    }

    // MySQL config files (.cnf, .ini, my.cnf)
    if (lowerName.endsWith('.cnf') || lowerName.endsWith('.ini') || lowerName === 'my.cnf') {
      this.results.metadata!.fileTypes!.config++;
      await this.analyzeConfigFile(content, fileName);
      return;
    }

    // mysqlsh dump metadata files
    if (fileName.endsWith('.json') && fileName.includes('@.')) {
      this.results.metadata!.fileTypes!.json++;
      await this.analyzeMysqlShellMetadata(content, fileName);
      return;
    }

    // SQL files
    if (fileName.endsWith('.sql')) {
      this.results.metadata!.fileTypes!.sql++;
      await this.analyzeSQLFile(content, fileName);
      return;
    }

    // TSV/TXT data files
    if (fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
      this.results.metadata!.fileTypes!.tsv++;
      await this.analyzeTSVData(content, fileName);
      return;
    }
  }

  private readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  // ==========================================================================
  // CONFIG FILE ANALYSIS (.cnf, .ini)
  // ==========================================================================
  private async analyzeConfigFile(content: string, fileName: string): Promise<void> {
    const sections = this.parseConfigFile(content);

    for (const section of sections) {
      // Check each variable against removed system variables
      for (const [key, value] of Object.entries(section.variables)) {
        const normalizedKey = key.replace(/-/g, '_').toLowerCase();

        // Check for removed system variables
        if (REMOVED_SYS_VARS_84.some(v => v.toLowerCase() === normalizedKey)) {
          const rule = compatibilityRules.find(r => r.id === 'removed_sys_var');
          if (rule) {
            this.addIssue({
              ...rule,
              location: `${fileName} [${section.name}]`,
              code: `${key} = ${value}`,
              variableName: key,
              configSection: section.name,
              fixQuery: rule.generateFixQuery?.({ variableName: key }) || null
            });
          }
        }

        // Check for obsolete SQL modes in sql_mode setting
        if (normalizedKey === 'sql_mode') {
          const rule = compatibilityRules.find(r => r.id === 'obsolete_sql_mode');
          if (rule && rule.pattern?.test(`sql_mode=${value}`)) {
            this.addIssue({
              ...rule,
              location: `${fileName} [${section.name}]`,
              code: `${key} = ${value}`,
              configSection: section.name
            });
          }
        }

        // Check for default_authentication_plugin
        if (normalizedKey === 'default_authentication_plugin') {
          const rule = compatibilityRules.find(r => r.id === 'default_authentication_plugin_var');
          if (rule) {
            this.addIssue({
              ...rule,
              location: `${fileName} [${section.name}]`,
              code: `${key} = ${value}`,
              configSection: section.name,
              fixQuery: rule.generateFixQuery?.({}) || null
            });
          }
        }
      }
    }
  }

  private parseConfigFile(content: string): ConfigSection[] {
    const sections: ConfigSection[] = [];
    let currentSection: ConfigSection = { name: 'global', variables: {} };

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      // Section header [mysqld], [mysql], etc.
      const sectionMatch = trimmed.match(/^\[(\w+)\]$/);
      if (sectionMatch) {
        if (Object.keys(currentSection.variables).length > 0) {
          sections.push(currentSection);
        }
        currentSection = { name: sectionMatch[1], variables: {} };
        continue;
      }

      // Variable assignment: key=value or key = value
      const varMatch = trimmed.match(/^([^=]+?)\s*=\s*(.*)$/);
      if (varMatch) {
        const key = varMatch[1].trim();
        const value = varMatch[2].trim().replace(/^["']|["']$/g, '');
        currentSection.variables[key] = value;
      }
    }

    // Don't forget the last section
    if (Object.keys(currentSection.variables).length > 0) {
      sections.push(currentSection);
    }

    return sections;
  }

  // ==========================================================================
  // MYSQL SHELL METADATA ANALYSIS
  // ==========================================================================
  private async analyzeMysqlShellMetadata(content: string, fileName: string): Promise<void> {
    try {
      const metadata = JSON.parse(content);

      if (metadata.options && metadata.options.defaultCharacterSet) {
        const charset = metadata.options.defaultCharacterSet;
        if (charset === 'utf8' || charset === 'utf8mb3') {
          const rule = compatibilityRules.find((r) => r.id === 'utf8_charset');
          if (rule) {
            this.addIssue({
              ...rule,
              location: fileName,
              code: `defaultCharacterSet: "${charset}"`
            });
          }
        }
      }
    } catch (e) {
      console.error('Error parsing metadata:', e);
    }
  }

  // ==========================================================================
  // SQL FILE ANALYSIS
  // ==========================================================================
  private async analyzeSQLFile(content: string, fileName: string): Promise<void> {
    // Schema and query rules (pattern-based)
    this.analyzeWithPatternRules(content, fileName);

    // Advanced table schema analysis
    this.analyzeTableSchema(content, fileName);

    // Advanced user statement analysis
    this.analyzeUserStatements(content, fileName);

    // GRANT statement analysis (legacy)
    this.analyzeGrantStatements(content, fileName);

    // CREATE USER statement analysis (legacy)
    this.analyzeCreateUserStatements(content, fileName);

    // INSERT statement data analysis
    this.analyzeInsertStatements(content, fileName);
  }

  private analyzeWithPatternRules(content: string, fileName: string): void {
    const patternRules = compatibilityRules.filter(
      (rule) => rule.pattern && (rule.type === 'schema' || rule.type === 'query')
    );

    for (const rule of patternRules) {
      if (!rule.pattern) continue;

      // Reset regex lastIndex for global patterns
      rule.pattern.lastIndex = 0;
      const matches = content.matchAll(rule.pattern);
      const seen = new Set<string>();

      for (const match of matches) {
        const context = this.extractContext(content, match.index || 0, 300);
        const key = `${rule.id}-${context}`;

        if (!seen.has(key)) {
          seen.add(key);

          const issue: Issue = {
            ...rule,
            location: fileName,
            code: context,
            matchedText: match[0]
          };

          // Generate fix query if available
          if (rule.generateFixQuery) {
            issue.fixQuery = rule.generateFixQuery({ code: context });
          }

          this.addIssue(issue);
        }
      }
    }
  }

  // ==========================================================================
  // GRANT STATEMENT ANALYSIS
  // ==========================================================================
  private analyzeGrantStatements(content: string, fileName: string): void {
    // Match GRANT statements
    const grantPattern = /GRANT\s+([^;]+?)\s+TO\s+['"]?([^'"@\s]+)['"]?(?:@['"]?([^'";\s]+)['"]?)?/gi;
    const matches = content.matchAll(grantPattern);

    for (const match of matches) {
      const privileges = match[1];
      const userName = match[2];
      // const host = match[3] || '%';  // Available for future use

      // Check for SUPER privilege
      if (/\bSUPER\b/i.test(privileges)) {
        const rule = compatibilityRules.find(r => r.id === 'super_privilege');
        if (rule) {
          this.addIssue({
            ...rule,
            location: fileName,
            code: match[0],
            userName: userName,
            privilege: 'SUPER',
            fixQuery: rule.generateFixQuery?.({ userName }) || null
          });
        }
      }
    }
  }

  // ==========================================================================
  // CREATE USER STATEMENT ANALYSIS
  // ==========================================================================
  private analyzeCreateUserStatements(content: string, fileName: string): void {
    // Match CREATE USER statements
    const createUserPattern = /CREATE\s+USER\s+(?:IF\s+NOT\s+EXISTS\s+)?['"]?([^'"@\s]+)['"]?(?:@['"]?([^'";\s]+)['"]?)?\s*([^;]*)/gi;
    const matches = content.matchAll(createUserPattern);

    for (const match of matches) {
      const userName = match[1];
      const userOptions = match[3] || '';

      // Check for mysql_native_password
      if (/mysql_native_password/i.test(userOptions)) {
        const rule = compatibilityRules.find(r => r.id === 'mysql_native_password');
        if (rule) {
          this.addIssue({
            ...rule,
            location: fileName,
            code: match[0].substring(0, 200),
            userName: userName,
            fixQuery: rule.generateFixQuery?.({ userName }) || null
          });
        }
      }

      // Check for sha256_password
      if (/sha256_password/i.test(userOptions)) {
        const rule = compatibilityRules.find(r => r.id === 'sha256_password');
        if (rule) {
          this.addIssue({
            ...rule,
            location: fileName,
            code: match[0].substring(0, 200),
            userName: userName
          });
        }
      }

      // Check for authentication_fido
      if (/authentication_fido/i.test(userOptions)) {
        const rule = compatibilityRules.find(r => r.id === 'authentication_fido');
        if (rule) {
          this.addIssue({
            ...rule,
            location: fileName,
            code: match[0].substring(0, 200),
            userName: userName
          });
        }
      }
    }

    // Also check ALTER USER statements
    const alterUserPattern = /ALTER\s+USER\s+['"]?([^'"@\s]+)['"]?(?:@['"]?([^'";\s]+)['"]?)?\s*([^;]*)/gi;
    const alterMatches = content.matchAll(alterUserPattern);

    for (const match of alterMatches) {
      const userName = match[1];
      const userOptions = match[3] || '';

      if (/mysql_native_password/i.test(userOptions)) {
        const rule = compatibilityRules.find(r => r.id === 'mysql_native_password');
        if (rule) {
          this.addIssue({
            ...rule,
            location: fileName,
            code: match[0].substring(0, 200),
            userName: userName,
            fixQuery: rule.generateFixQuery?.({ userName }) || null
          });
        }
      }
    }
  }

  // ==========================================================================
  // INSERT STATEMENT DATA ANALYSIS
  // ==========================================================================
  private analyzeInsertStatements(content: string, fileName: string): void {
    const tableSchemas = this.extractTableSchemas(content);

    const insertPattern = /INSERT INTO\s+`?(\w+)`?\s+(?:\(([^)]+)\)\s+)?VALUES\s*(\([^;]+\));?/gi;
    const matches = content.matchAll(insertPattern);

    for (const match of matches) {
      const tableName = match[1];
      const columnsStr = match[2];
      const valuesStr = match[3];

      const columns = columnsStr
        ? columnsStr.split(',').map((c) => c.trim().replace(/`/g, ''))
        : [];
      const schema = tableSchemas[tableName] || {};

      // 0000-00-00 date check
      if (/['"]0000-00-00(?:\s+00:00:00)?['"]/i.test(valuesStr)) {
        const dateMatch = valuesStr.match(/['"]0000-00-00(\s+00:00:00)?['"]/i);
        if (dateMatch) {
          const isDateTime = dateMatch[1] !== undefined;
          const rule = compatibilityRules.find((r) =>
            r.id === (isDateTime ? 'invalid_datetime_zero' : 'invalid_date_zero')
          );

          if (rule) {
            const columnIndex = this.estimateColumnIndex(valuesStr, dateMatch[0]);
            const columnName = columns[columnIndex] || 'unknown';

            this.addIssue({
              ...rule,
              location: `${fileName} - Table: ${tableName}`,
              code: valuesStr.substring(0, 200) + '...',
              tableName: tableName,
              columnName: columnName,
              fixQuery: rule.generateFixQuery?.({ tableName, columnName }) || null
            });
          }
        }
      }

      // ENUM empty value check
      for (let i = 0; i < columns.length; i++) {
        const columnName = columns[i];
        const columnType = schema[columnName];

        if (columnType && /ENUM/i.test(columnType)) {
          if (/[,\(]['"]['"]/i.test(valuesStr)) {
            const rule = compatibilityRules.find((r) => r.id === 'enum_empty_value');
            if (rule) {
              const enumValues = this.extractEnumValues(columnType);

              this.addIssue({
                ...rule,
                location: `${fileName} - Table: ${tableName}, Column: ${columnName}`,
                code: valuesStr.substring(0, 200) + '...',
                tableName: tableName,
                columnName: columnName,
                columnType: columnType,
                enumValues: enumValues,
                fixQuery:
                  rule.generateFixQuery?.({
                    tableName,
                    columnName,
                    columnType,
                    enumValues
                  }) || null
              });
            }
          }
        }
      }

      // 4-byte UTF-8 character check - only warn if table doesn't support utf8mb4
      const has4ByteChars = /[\u{10000}-\u{10FFFF}]/u.test(valuesStr);
      if (has4ByteChars && !this.supports4ByteUtf8(tableName)) {
        const rule = compatibilityRules.find((r) => r.id === 'data_4byte_chars');
        if (rule) {
          // Get table charset info for better error message
          const charsetInfo = this.tableCharsetMap.get(tableName.toLowerCase());
          const currentCharset = charsetInfo?.tableCharset || 'unknown';

          this.addIssue({
            ...rule,
            location: `${fileName} - Table: ${tableName}`,
            code: valuesStr.substring(0, 200) + '...',
            description: `테이블 '${tableName}'에 4바이트 UTF-8 문자(이모지 등)가 포함되어 있으나, 현재 문자셋(${currentCharset})은 4바이트 문자를 지원하지 않습니다.`,
            tableName: tableName,
            fixQuery: rule.generateFixQuery?.({ tableName }) || null
          });
        }
      }

      // NULL byte check
      if (valuesStr.includes('\\0') || valuesStr.includes('\x00')) {
        const rule = compatibilityRules.find((r) => r.id === 'data_null_byte');
        if (rule) {
          this.addIssue({
            ...rule,
            location: `${fileName} - Table: ${tableName}`,
            code: valuesStr.substring(0, 200) + '...',
            tableName: tableName,
            fixQuery:
              rule.generateFixQuery?.({ tableName, columnName: 'affected_column' }) || null
          });
        }
      }
    }
  }

  // ==========================================================================
  // TSV DATA FILE ANALYSIS
  // ==========================================================================
  private async analyzeTSVData(content: string, fileName: string): Promise<void> {
    const lines = content.split('\n');
    const tableName = fileName.replace(/\.tsv$|\.txt$/, '').split('@')[0];

    let lineNum = 0;
    for (const line of lines.slice(0, 1000)) {
      lineNum++;

      // 4-byte character check - only warn if table doesn't support utf8mb4
      if (/[\u{10000}-\u{10FFFF}]/u.test(line) && !this.supports4ByteUtf8(tableName)) {
        // Get table charset info for better error message
        const charsetInfo = this.tableCharsetMap.get(tableName.toLowerCase());
        const currentCharset = charsetInfo?.tableCharset || 'unknown';

        this.addIssue({
          id: 'data_4byte_chars',
          type: 'data',
          category: 'dataIntegrity',
          severity: 'warning',
          title: '4바이트 UTF-8 문자 발견 (데이터)',
          description: `테이블 '${tableName}'의 TSV 데이터에 4바이트 UTF-8 문자(이모지 등)가 포함되어 있으나, 현재 문자셋(${currentCharset})은 4바이트 문자를 지원하지 않습니다.`,
          suggestion: '테이블 문자셋을 utf8mb4로 설정해야 합니다.',
          location: `${fileName}:${lineNum}`,
          code: line.substring(0, 100) + '...',
          dataSample: line,
          tableName: tableName
        });
        break;
      }
    }
  }

  // ==========================================================================
  // ADVANCED SCHEMA ANALYSIS
  // ==========================================================================

  /**
   * Analyze table schema using structured parsing
   */
  private analyzeTableSchema(sql: string, fileName: string): void {
    // Extract CREATE TABLE statements
    const createTablePattern = /CREATE TABLE[\s\S]+?;/gi;
    const matches = sql.matchAll(createTablePattern);

    for (const match of matches) {
      const table = parseCreateTable(match[0]);
      if (table) {
        // Check table engine compatibility
        this.checkTableEngine(table, fileName);

        // Check column types
        this.checkColumns(table, fileName);

        // Check partitions
        if (table.partitions && table.partitions.length > 0) {
          this.checkPartitions(table, fileName);
        }

        // Collect FK references for 2-pass validation
        if (table.foreignKeys && table.foreignKeys.length > 0) {
          this.collectForeignKeyReferences(table, fileName);
        }

        // Check ENUM element lengths with specific values
        this.checkEnumElementLengths(table, fileName);

        // Check index sizes with accurate charset-based calculation
        this.checkIndexSizes(table, fileName);
      }
    }
  }

  /**
   * Analyze user statements using structured parsing
   */
  private analyzeUserStatements(content: string, fileName: string): void {
    const users = extractUsers(content);

    for (const user of users) {
      // Check authentication plugin
      if (user.authPlugin) {
        if (user.authPlugin === 'mysql_native_password') {
          const rule = compatibilityRules.find(r => r.id === 'mysql_native_password');
          if (rule) {
            this.addIssue({
              ...rule,
              location: fileName,
              userName: `${user.user}@${user.host}`,
              code: `IDENTIFIED WITH ${user.authPlugin}`,
              fixQuery: rule.generateFixQuery?.({ userName: user.user }) || null
            });
          }
        } else if (user.authPlugin === 'sha256_password') {
          const rule = compatibilityRules.find(r => r.id === 'sha256_password');
          if (rule) {
            this.addIssue({
              ...rule,
              location: fileName,
              userName: `${user.user}@${user.host}`,
              code: `IDENTIFIED WITH ${user.authPlugin}`
            });
          }
        }
      }

      // Check privileges
      for (const privilege of user.privileges) {
        if (privilege === 'SUPER') {
          const rule = compatibilityRules.find(r => r.id === 'super_privilege');
          if (rule) {
            this.addIssue({
              ...rule,
              location: fileName,
              userName: `${user.user}@${user.host}`,
              privilege: 'SUPER',
              fixQuery: rule.generateFixQuery?.({ userName: user.user }) || null
            });
          }
        }
      }
    }
  }

  /**
   * Check table engine compatibility
   */
  private checkTableEngine(table: TableInfo, fileName: string): void {
    if (!table.engine) {
      return;
    }

    const engine = table.engine.toUpperCase();

    // Check for removed or deprecated engines
    const deprecatedEngines = ['ISAM', 'BERKELEYDB', 'BDB'];
    if (deprecatedEngines.includes(engine)) {
      this.addIssue({
        id: 'deprecated_engine',
        type: 'schema',
        category: 'invalidObjects',
        severity: 'error',
        title: '제거된 스토리지 엔진 사용',
        description: `테이블 ${table.name}이(가) 제거된 스토리지 엔진 ${engine}을(를) 사용합니다.`,
        suggestion: 'InnoDB 엔진으로 변경하세요.',
        location: fileName,
        tableName: table.name,
        code: `ENGINE=${engine}`,
        fixQuery: `ALTER TABLE \`${table.name}\` ENGINE=InnoDB;`
      });
    }

    // Check charset compatibility
    if (table.charset) {
      const charset = table.charset.toLowerCase();
      if (charset === 'utf8' || charset === 'utf8mb3') {
        const rule = compatibilityRules.find(r => r.id === 'utf8_charset');
        if (rule) {
          this.addIssue({
            ...rule,
            location: fileName,
            tableName: table.name,
            code: `CHARSET=${table.charset}`,
            fixQuery: `ALTER TABLE \`${table.name}\` CONVERT TO CHARACTER SET utf8mb4;`
          });
        }
      }
    }
  }

  /**
   * Check column types and properties
   */
  private checkColumns(table: TableInfo, fileName: string): void {
    for (const column of table.columns) {
      const columnType = column.type.toUpperCase();

      // Check for deprecated data types
      if (columnType.startsWith('YEAR(2)')) {
        this.addIssue({
          id: 'year_2_digit',
          type: 'schema',
          category: 'invalidObjects',
          severity: 'error',
          title: '2자리 YEAR 타입 사용',
          description: `컬럼 ${table.name}.${column.name}이(가) 2자리 YEAR 타입을 사용합니다.`,
          suggestion: 'YEAR(4) 또는 SMALLINT로 변경하세요.',
          location: fileName,
          tableName: table.name,
          columnName: column.name,
          columnType: column.type,
          code: `${column.name} ${column.type}`,
          fixQuery: `ALTER TABLE \`${table.name}\` MODIFY COLUMN \`${column.name}\` YEAR(4);`
        });
      }

      // Check for zero dates in DEFAULT
      if (column.default === '0000-00-00' || column.default === '0000-00-00 00:00:00') {
        const rule = compatibilityRules.find(r => r.id === 'invalid_date_zero');
        if (rule) {
          this.addIssue({
            ...rule,
            location: fileName,
            tableName: table.name,
            columnName: column.name,
            code: `${column.name} DEFAULT '${column.default}'`,
            fixQuery: `ALTER TABLE \`${table.name}\` MODIFY COLUMN \`${column.name}\` ${column.type} DEFAULT NULL;`
          });
        }
      }

      // Check column charset
      if (column.charset) {
        const charset = column.charset.toLowerCase();
        if (charset === 'utf8' || charset === 'utf8mb3') {
          const rule = compatibilityRules.find(r => r.id === 'utf8_charset');
          if (rule) {
            this.addIssue({
              ...rule,
              location: fileName,
              tableName: table.name,
              columnName: column.name,
              code: `${column.name} CHARACTER SET ${column.charset}`,
              fixQuery: `ALTER TABLE \`${table.name}\` MODIFY COLUMN \`${column.name}\` ${column.type} CHARACTER SET utf8mb4;`
            });
          }
        }
      }
    }
  }

  /**
   * Check partition compatibility
   */
  private checkPartitions(table: TableInfo, fileName: string): void {
    if (!table.partitions || table.partitions.length === 0) {
      return;
    }

    // Check if table engine is non-native partitioning engine
    const NON_NATIVE_ENGINES = ['MYISAM', 'MERGE', 'CSV'];
    if (table.engine && NON_NATIVE_ENGINES.includes(table.engine.toUpperCase())) {
      this.addIssue({
        id: 'non_native_partition_parsed',
        type: 'schema',
        category: 'invalidObjects',
        severity: 'warning',
        title: '비네이티브 파티셔닝 엔진',
        description: `테이블 '${table.name}'이(가) ${table.engine} 엔진으로 파티셔닝되어 있습니다. ${NON_NATIVE_ENGINES.join(', ')} 엔진의 파티셔닝은 deprecated되었습니다.`,
        suggestion: 'InnoDB 엔진으로 변경한 후 파티셔닝을 사용하세요.',
        location: fileName,
        tableName: table.name,
        code: `ENGINE=${table.engine}, PARTITION BY ${table.partitions[0]?.type || 'UNKNOWN'}`,
        mysqlShellCheckId: 'nonNativePartitioning',
        docLink: 'https://dev.mysql.com/doc/refman/8.4/en/partitioning-limitations.html',
        fixQuery: `ALTER TABLE \`${table.name}\` ENGINE=InnoDB;`
      });
    }

    for (const partition of table.partitions) {
      // Check for deprecated partition features
      if (partition.type === 'LINEAR HASH' || partition.type === 'LINEAR KEY') {
        this.addIssue({
          id: 'linear_partition',
          type: 'schema',
          category: 'invalidObjects',
          severity: 'warning',
          title: 'LINEAR 파티션 사용',
          description: `테이블 ${table.name}이(가) LINEAR 파티션을 사용합니다.`,
          suggestion: '파티션 방식 검토를 권장합니다.',
          location: fileName,
          tableName: table.name,
          code: `PARTITION BY ${partition.type}`,
          docLink: 'https://dev.mysql.com/doc/refman/8.4/en/partitioning.html'
        });
      }
    }
  }

  /**
   * Check ENUM/SET element lengths - reports specific values exceeding 255 characters
   */
  private checkEnumElementLengths(table: TableInfo, fileName: string): void {
    const MAX_ENUM_LENGTH = 255;

    for (const column of table.columns) {
      const columnType = column.type.toUpperCase();

      // Check ENUM types
      if (columnType.startsWith('ENUM')) {
        const enumValues = this.extractEnumValues(column.type);

        for (const value of enumValues) {
          if (value.length > MAX_ENUM_LENGTH) {
            // Truncate long value for display
            const displayValue = value.length > 50
              ? value.substring(0, 47) + '...'
              : value;

            this.addIssue({
              id: 'enum_element_length_exceeded',
              type: 'schema',
              category: 'invalidObjects',
              severity: 'error',
              title: 'ENUM 요소 길이 초과',
              description: `${table.name}.${column.name} 컬럼의 ENUM 값 '${displayValue}'가 ${value.length}자입니다 (최대 ${MAX_ENUM_LENGTH}자).`,
              suggestion: 'ENUM 요소 길이를 255자 이내로 줄이세요.',
              location: fileName,
              tableName: table.name,
              columnName: column.name,
              columnType: column.type,
              enumValues: enumValues,
              code: `${column.name} ${column.type.substring(0, 100)}${column.type.length > 100 ? '...' : ''}`,
              mysqlShellCheckId: 'enumSetElementLength'
            });
          }
        }
      }

      // Check SET types similarly
      if (columnType.startsWith('SET')) {
        const setValues = this.extractSetValues(column.type);

        for (const value of setValues) {
          if (value.length > MAX_ENUM_LENGTH) {
            const displayValue = value.length > 50
              ? value.substring(0, 47) + '...'
              : value;

            this.addIssue({
              id: 'set_element_length_exceeded',
              type: 'schema',
              category: 'invalidObjects',
              severity: 'error',
              title: 'SET 요소 길이 초과',
              description: `${table.name}.${column.name} 컬럼의 SET 값 '${displayValue}'가 ${value.length}자입니다 (최대 ${MAX_ENUM_LENGTH}자).`,
              suggestion: 'SET 요소 길이를 255자 이내로 줄이세요.',
              location: fileName,
              tableName: table.name,
              columnName: column.name,
              columnType: column.type,
              code: `${column.name} ${column.type.substring(0, 100)}${column.type.length > 100 ? '...' : ''}`,
              mysqlShellCheckId: 'enumSetElementLength'
            });
          }
        }
      }
    }
  }

  /**
   * Extract SET values from SET type definition
   */
  private extractSetValues(setType: string): string[] {
    const match = setType.match(/SET\s*\(([^)]+)\)/i);
    if (match) {
      return match[1].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
    }
    return [];
  }

  // ==========================================================================
  // 2-PASS ANALYSIS: TABLE INDEX COLLECTION & FK VALIDATION
  // ==========================================================================

  /**
   * Pass 1: Collect table index information from SQL content
   * Extracts PRIMARY KEY and UNIQUE indexes for FK reference validation
   */
  private collectTableIndexes(content: string, _fileName: string): void {
    const createTablePattern = /CREATE TABLE[\s\S]+?;/gi;
    const matches = content.matchAll(createTablePattern);

    for (const match of matches) {
      const table = parseCreateTable(match[0]);
      if (!table) continue;

      const tableInfo: TableIndexInfo = {
        tableName: table.name,
        primaryKey: undefined,
        uniqueIndexes: [],
        regularIndexes: []
      };

      // Extract indexes from parsed table
      for (const index of table.indexes) {
        if (index.type === 'PRIMARY' || index.name === 'PRIMARY') {
          tableInfo.primaryKey = index.columns;
        } else if (index.unique) {
          tableInfo.uniqueIndexes.push({
            name: index.name,
            columns: index.columns
          });
        } else {
          tableInfo.regularIndexes.push({
            name: index.name,
            columns: index.columns
          });
        }
      }

      // Store with table name as key (lowercase for case-insensitive matching)
      this.tableIndexMap.set(table.name.toLowerCase(), tableInfo);
    }
  }

  /**
   * Pass 1: Collect table charset information from SQL content
   * Used for 4-byte UTF-8 cross-validation
   */
  private collectTableCharsets(content: string, _fileName: string): void {
    const createTablePattern = /CREATE TABLE[\s\S]+?;/gi;
    const matches = content.matchAll(createTablePattern);

    for (const match of matches) {
      const table = parseCreateTable(match[0]);
      if (!table) continue;

      const charsetInfo: TableCharsetInfo = {
        tableName: table.name,
        tableCharset: table.charset?.toLowerCase(),
        tableCollation: table.collation?.toLowerCase(),
        columns: new Map()
      };

      // Collect column charset info
      for (const column of table.columns) {
        const colCharsetInfo: ColumnCharsetInfo = {
          charset: column.charset?.toLowerCase(),
          collation: column.collation?.toLowerCase(),
          type: column.type,
          maxLength: this.extractColumnLength(column.type)
        };
        charsetInfo.columns.set(column.name.toLowerCase(), colCharsetInfo);
      }

      // Store with table name as key (lowercase for case-insensitive matching)
      this.tableCharsetMap.set(table.name.toLowerCase(), charsetInfo);
    }
  }

  /**
   * Check if a table or column uses utf8mb4 charset
   * Returns true if the charset supports 4-byte UTF-8 characters
   */
  private supports4ByteUtf8(tableName: string, columnName?: string): boolean {
    const tableKey = tableName.toLowerCase();
    const charsetInfo = this.tableCharsetMap.get(tableKey);

    if (!charsetInfo) {
      // Table not found in charset map - assume it might have issues
      return false;
    }

    if (columnName) {
      const colKey = columnName.toLowerCase();
      const colInfo = charsetInfo.columns.get(colKey);

      if (colInfo?.charset) {
        // Column has explicit charset
        return colInfo.charset === 'utf8mb4';
      }
    }

    // Fall back to table charset
    if (charsetInfo.tableCharset) {
      return charsetInfo.tableCharset === 'utf8mb4';
    }

    // No charset info - assume potential issue
    return false;
  }

  /**
   * Extract the length from a column type definition (e.g., VARCHAR(255) -> 255)
   */
  private extractColumnLength(columnType: string): number | undefined {
    const match = columnType.match(/(?:VARCHAR|CHAR|VARBINARY|BINARY)\s*\((\d+)\)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return undefined;
  }

  /**
   * Get the byte multiplier for a charset
   * utf8mb4 = 4 bytes per character
   * utf8/utf8mb3 = 3 bytes per character
   * latin1 = 1 byte per character
   */
  private getCharsetByteMultiplier(charset?: string): number {
    if (!charset) return 4; // Default to utf8mb4 (most conservative)
    const lowerCharset = charset.toLowerCase();
    if (lowerCharset === 'utf8mb4') return 4;
    if (lowerCharset === 'utf8' || lowerCharset === 'utf8mb3') return 3;
    if (lowerCharset === 'latin1' || lowerCharset === 'ascii') return 1;
    if (lowerCharset === 'ucs2' || lowerCharset === 'utf16') return 2;
    if (lowerCharset === 'utf32') return 4;
    return 4; // Default to 4 for unknown charsets (conservative)
  }

  /**
   * Calculate index key size for a table's index
   * InnoDB max index key size: 3072 bytes (with innodb_large_prefix=ON, which is default in 8.0+)
   */
  private calculateIndexKeySize(
    tableName: string,
    indexColumns: string[],
    prefixLengths?: number[]
  ): { totalBytes: number; columnDetails: Array<{ column: string; bytes: number }> } {
    const tableKey = tableName.toLowerCase();
    const charsetInfo = this.tableCharsetMap.get(tableKey);
    const columnDetails: Array<{ column: string; bytes: number }> = [];
    let totalBytes = 0;

    for (let i = 0; i < indexColumns.length; i++) {
      const colName = indexColumns[i];
      const colKey = colName.toLowerCase();
      const prefixLength = prefixLengths?.[i];

      let columnBytes = 0;

      if (charsetInfo) {
        const colInfo = charsetInfo.columns.get(colKey);

        if (colInfo) {
          // Determine charset (column charset > table charset > default)
          const charset = colInfo.charset || charsetInfo.tableCharset || 'utf8mb4';
          const byteMultiplier = this.getCharsetByteMultiplier(charset);

          // Calculate bytes
          if (colInfo.maxLength !== undefined) {
            // VARCHAR/CHAR type
            const effectiveLength = prefixLength !== undefined
              ? Math.min(prefixLength, colInfo.maxLength)
              : colInfo.maxLength;
            columnBytes = effectiveLength * byteMultiplier;
          } else {
            // Non-string types (INT, DATE, etc.) - estimate based on type
            columnBytes = this.estimateTypeSize(colInfo.type);
          }
        }
      }

      // If no info found, use conservative estimate
      if (columnBytes === 0) {
        columnBytes = prefixLength !== undefined ? prefixLength * 4 : 255 * 4;
      }

      columnDetails.push({ column: colName, bytes: columnBytes });
      totalBytes += columnBytes;
    }

    return { totalBytes, columnDetails };
  }

  /**
   * Estimate the byte size of a column type
   */
  private estimateTypeSize(columnType: string): number {
    const type = columnType.toUpperCase();

    // Integer types
    if (type.includes('TINYINT')) return 1;
    if (type.includes('SMALLINT')) return 2;
    if (type.includes('MEDIUMINT')) return 3;
    if (type.includes('BIGINT')) return 8;
    if (type.includes('INT')) return 4;

    // Floating point
    if (type.includes('FLOAT')) return 4;
    if (type.includes('DOUBLE') || type.includes('REAL')) return 8;
    if (type.includes('DECIMAL') || type.includes('NUMERIC')) {
      // DECIMAL(M,D) uses approximately M/2 bytes
      const match = type.match(/DECIMAL\s*\((\d+)/i);
      if (match) return Math.ceil(parseInt(match[1], 10) / 2) + 2;
      return 10;
    }

    // Date/Time types
    if (type.includes('DATE')) return 3;
    if (type.includes('TIME')) return 3;
    if (type.includes('DATETIME')) return 8;
    if (type.includes('TIMESTAMP')) return 4;
    if (type.includes('YEAR')) return 1;

    // Binary/Blob
    if (type.includes('BINARY') || type.includes('VARBINARY')) {
      const match = type.match(/(?:VAR)?BINARY\s*\((\d+)\)/i);
      if (match) return parseInt(match[1], 10);
      return 255;
    }

    // Default for unknown types
    return 8;
  }

  /**
   * Check index sizes for all tables and report issues
   * Called during Pass 2 schema analysis
   */
  private checkIndexSizes(table: TableInfo, fileName: string): void {
    const MAX_INDEX_KEY_SIZE = 3072;

    for (const index of table.indexes) {
      const { totalBytes, columnDetails } = this.calculateIndexKeySize(
        table.name,
        index.columns,
        index.prefixLengths
      );

      if (totalBytes > MAX_INDEX_KEY_SIZE) {
        const detailsStr = columnDetails
          .map(d => `${d.column}(${d.bytes}bytes)`)
          .join(' + ');

        this.addIssue({
          id: 'index_too_large_calculated',
          type: 'schema',
          category: 'invalidObjects',
          severity: 'error',
          title: '인덱스 키 크기 초과',
          description: `테이블 '${table.name}'의 인덱스 '${index.name}'의 키 크기가 ${totalBytes}바이트로, 최대 허용 크기(${MAX_INDEX_KEY_SIZE}바이트)를 초과합니다. [${detailsStr}]`,
          suggestion: '프리픽스 인덱스를 사용하거나 컬럼 크기를 줄이세요.',
          location: fileName,
          tableName: table.name,
          code: `INDEX ${index.name} (${index.columns.join(', ')})`,
          mysqlShellCheckId: 'indexTooLarge',
          fixQuery: this.generatePrefixIndexFix(table.name, index.name, index.columns, columnDetails)
        });
      }
    }
  }

  /**
   * Generate a fix query for oversized index using prefix
   */
  private generatePrefixIndexFix(
    tableName: string,
    indexName: string,
    _columns: string[],
    columnDetails: Array<{ column: string; bytes: number }>
  ): string {
    // Calculate suggested prefix lengths to fit within 3072 bytes
    const MAX_INDEX_KEY_SIZE = 3072;
    const totalBytes = columnDetails.reduce((sum, d) => sum + d.bytes, 0);
    const ratio = MAX_INDEX_KEY_SIZE / totalBytes * 0.9; // 90% to be safe

    const prefixedColumns = columnDetails.map(d => {
      // Only add prefix for string columns (large bytes typically mean string)
      if (d.bytes > 100) {
        const suggestedPrefix = Math.floor(d.bytes * ratio / 4); // Assuming utf8mb4
        return `\`${d.column}\`(${Math.min(suggestedPrefix, 191)})`;
      }
      return `\`${d.column}\``;
    });

    return `ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\`, ADD INDEX \`${indexName}\` (${prefixedColumns.join(', ')});`;
  }

  /**
   * Collect FK references from SQL content and add to pending checks
   */
  private collectForeignKeyReferences(table: TableInfo, fileName: string): void {
    for (const fk of table.foreignKeys) {
      this.pendingFKChecks.push({
        issueId: `fk_${table.name}_${fk.name}`,
        sourceTable: table.name,
        sourceColumns: fk.columns,
        refTable: fk.refTable,
        refColumns: fk.refColumns,
        location: fileName,
        code: `FOREIGN KEY (${fk.columns.join(', ')}) REFERENCES ${fk.refTable}(${fk.refColumns.join(', ')})`
      });
    }
  }

  /**
   * Pass 2.5: Validate FK references against collected table indexes
   * Only adds issues for FKs that reference columns without proper indexes
   */
  private validateForeignKeyReferences(): void {
    for (const fkCheck of this.pendingFKChecks) {
      const refTableKey = fkCheck.refTable.toLowerCase();
      const refTableInfo = this.tableIndexMap.get(refTableKey);

      if (!refTableInfo) {
        // Referenced table not found in dump - add info-level notice
        this.addIssue({
          id: 'fk_ref_table_not_found',
          type: 'schema',
          category: 'invalidObjects',
          severity: 'info',
          title: '외래키 참조 테이블 미발견',
          description: `${fkCheck.sourceTable}의 외래키가 참조하는 테이블 '${fkCheck.refTable}'이 덤프에 포함되어 있지 않습니다.`,
          suggestion: '참조 테이블이 다른 스키마에 있거나 덤프에 포함되지 않았을 수 있습니다.',
          location: fkCheck.location,
          tableName: fkCheck.sourceTable,
          code: fkCheck.code,
          mysqlShellCheckId: 'foreignKeyReferences'
        });
        continue;
      }

      // Check if referenced columns have a proper index (PRIMARY KEY or UNIQUE)
      const hasProperIndex = this.hasProperIndexOnColumns(refTableInfo, fkCheck.refColumns);

      if (!hasProperIndex) {
        // Referenced columns don't have PRIMARY KEY or UNIQUE index - this is an error
        this.addIssue({
          id: 'fk_non_unique_ref',
          type: 'schema',
          category: 'invalidObjects',
          severity: 'error',
          title: '외래키 참조 인덱스 누락',
          description: `${fkCheck.sourceTable}의 외래키가 ${fkCheck.refTable}.${fkCheck.refColumns.join(', ')}을(를) 참조하지만, 해당 컬럼에 PRIMARY KEY 또는 UNIQUE 인덱스가 없습니다.`,
          suggestion: `참조 대상 테이블에 UNIQUE 인덱스를 추가하세요.`,
          location: fkCheck.location,
          tableName: fkCheck.sourceTable,
          code: fkCheck.code,
          mysqlShellCheckId: 'foreignKeyReferences',
          fixQuery: `ALTER TABLE \`${fkCheck.refTable}\` ADD UNIQUE INDEX \`idx_${fkCheck.refColumns.join('_')}\` (\`${fkCheck.refColumns.join('`, `')}\`);`
        });
      }
      // If hasProperIndex is true, no issue is added - the FK is valid
    }
  }

  /**
   * Check if the referenced columns have a PRIMARY KEY or UNIQUE index
   * The index must be on exactly the referenced columns (as prefix)
   */
  private hasProperIndexOnColumns(tableInfo: TableIndexInfo, refColumns: string[]): boolean {
    const refColsLower = refColumns.map(c => c.toLowerCase());

    // Check PRIMARY KEY
    if (tableInfo.primaryKey) {
      const pkColsLower = tableInfo.primaryKey.map(c => c.toLowerCase());
      if (this.isIndexPrefixMatch(pkColsLower, refColsLower)) {
        return true;
      }
    }

    // Check UNIQUE indexes
    for (const uniqueIndex of tableInfo.uniqueIndexes) {
      const indexColsLower = uniqueIndex.columns.map(c => c.toLowerCase());
      if (this.isIndexPrefixMatch(indexColsLower, refColsLower)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if index columns match or are a prefix of referenced columns
   * FK can reference a prefix of a composite index
   */
  private isIndexPrefixMatch(indexCols: string[], refCols: string[]): boolean {
    if (refCols.length > indexCols.length) {
      return false;
    }

    for (let i = 0; i < refCols.length; i++) {
      if (indexCols[i] !== refCols[i]) {
        return false;
      }
    }

    return true;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================
  private extractTableSchemas(content: string): TableSchemas {
    const schemas: TableSchemas = {};
    const createTablePattern = /CREATE TABLE\s+`?(\w+)`?\s+\(([^;]+)\)/gi;
    const matches = content.matchAll(createTablePattern);

    for (const match of matches) {
      const tableName = match[1];
      const columnsStr = match[2];
      schemas[tableName] = {};

      const columnPattern = /`?(\w+)`?\s+(ENUM\([^)]+\)|[A-Z]+(?:\([^)]+\))?)/gi;
      const columnMatches = columnsStr.matchAll(columnPattern);

      for (const colMatch of columnMatches) {
        schemas[tableName][colMatch[1]] = colMatch[2];
      }
    }

    return schemas;
  }

  private extractEnumValues(enumType: string): string[] {
    const match = enumType.match(/ENUM\s*\(([^)]+)\)/i);
    if (match) {
      return match[1].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
    }
    return [];
  }

  private estimateColumnIndex(valuesStr: string, targetValue: string): number {
    const values = valuesStr.split(',');
    for (let i = 0; i < values.length; i++) {
      if (values[i].includes(targetValue)) {
        return i;
      }
    }
    return 0;
  }

  private addIssue(issue: Issue): void {
    const isDuplicate = this.results.issues.some(
      (existing) =>
        existing.id === issue.id &&
        existing.location === issue.location &&
        existing.code === issue.code
    );

    if (!isDuplicate) {
      this.results.issues.push(issue);
      this.results.stats[issue.severity]++;

      // Update category stats
      if (this.results.categoryStats && issue.category) {
        this.results.categoryStats[issue.category]++;
      }

      // Call callback for real-time display
      if (this.onIssue) {
        this.onIssue(issue);
      }
    }
  }

  private extractContext(content: string, position: number, length: number): string {
    let start = Math.max(0, position - length / 2);
    let end = Math.min(content.length, position + length / 2);

    // Try to find better start boundary (statement keyword or line start)
    if (start > 0) {
      // Look for SQL statement keywords before the start position
      const searchStart = Math.max(0, start - 100);
      const beforeText = content.substring(searchStart, start + 50);
      const keywordMatch = beforeText.match(/(?:^|\n|;)\s*(CREATE|ALTER|INSERT|UPDATE|DELETE|GRANT|SET|CALL|PREPARE)\s/gi);
      if (keywordMatch) {
        // Find the last keyword match position
        const lastMatch = keywordMatch[keywordMatch.length - 1];
        const keywordPos = beforeText.lastIndexOf(lastMatch);
        if (keywordPos >= 0) {
          const newStart = searchStart + keywordPos;
          // Only use if it's not too far back
          if (newStart >= start - 150) {
            start = newStart;
            // Skip leading newline/semicolon
            while (start < position && (content[start] === '\n' || content[start] === ';' || content[start] === ' ')) {
              start++;
            }
          }
        }
      } else {
        // Fall back to finding nearest newline
        const newlinePos = content.lastIndexOf('\n', start);
        if (newlinePos >= 0 && newlinePos >= start - 50) {
          start = newlinePos + 1;
        }
      }
    }

    // Try to find better end boundary
    if (end < content.length) {
      // Look for statement end (;) or newline after end position
      const semicolonPos = content.indexOf(';', end - 20);
      const newlinePos = content.indexOf('\n', end);
      if (semicolonPos >= 0 && semicolonPos <= end + 50) {
        end = semicolonPos + 1;
      } else if (newlinePos >= 0 && newlinePos <= end + 30) {
        end = newlinePos;
      }
    }

    let context = content.substring(start, end);

    // Add ellipsis markers if truncated
    const wasStartTruncated = start > 0;
    const wasEndTruncated = end < content.length;

    context = context.trim();

    if (wasStartTruncated && !context.startsWith('CREATE') && !context.startsWith('ALTER') &&
        !context.startsWith('INSERT') && !context.startsWith('GRANT') && !context.startsWith('SET')) {
      context = '...' + context;
    }
    if (wasEndTruncated && !context.endsWith(';')) {
      context = context + '...';
    }

    return context;
  }

  // ==========================================================================
  // SERVER QUERY RESULT ANALYSIS
  // ==========================================================================

  /**
   * Analyze server query result based on check ID
   */
  analyzeServerQueryResult(checkId: string, result: { columns: string[]; rows: Record<string, string | number | null>[] }): Issue[] {
    switch (checkId) {
      case 'checkSysVarDefaults':
        return this.analyzeSysVarDefaults(result);
      case 'authMethodUsage':
      case 'deprecatedDefaultAuth':
      case 'pluginUsage':
        return this.analyzeUserAuthPlugins(result);
      default:
        return [];
    }
  }

  /**
   * Analyze user authentication plugins from server query result
   */
  analyzeUserAuthPlugins(result: { columns: string[]; rows: Record<string, string | number | null>[] }): Issue[] {
    const issues: Issue[] = [];

    for (const row of result.rows) {
      const userName = row.User || row.user_name || row.user;
      const host = row.Host || row.host;
      const plugin = row.plugin || row.auth_plugin;

      if (!userName || !plugin) continue;

      const userHost = `${userName}@${host}`;

      // Check for mysql_native_password
      if (plugin === 'mysql_native_password') {
        const rule = compatibilityRules.find(r => r.id === 'mysql_native_password');
        if (rule) {
          issues.push({
            ...rule,
            location: `mysql.user: ${userHost}`,
            code: `IDENTIFIED WITH ${plugin}`,
            userName: String(userName),
            fixQuery: rule.generateFixQuery?.({ userName: String(userName) }) || null
          });
        }
      }

      // Check for sha256_password
      if (plugin === 'sha256_password') {
        const rule = compatibilityRules.find(r => r.id === 'sha256_password');
        if (rule) {
          issues.push({
            ...rule,
            location: `mysql.user: ${userHost}`,
            code: `IDENTIFIED WITH ${plugin}`,
            userName: String(userName)
          });
        }
      }

      // Check for authentication_fido
      if (plugin && String(plugin).includes('authentication_fido')) {
        const rule = compatibilityRules.find(r => r.id === 'authentication_fido');
        if (rule) {
          issues.push({
            ...rule,
            location: `mysql.user: ${userHost}`,
            code: `IDENTIFIED WITH ${plugin}`,
            userName: String(userName)
          });
        }
      }
    }

    return issues;
  }

  /**
   * Analyze system variable default values from server query result
   */
  analyzeSysVarDefaults(result: { columns: string[]; rows: Record<string, string | number | null>[] }): Issue[] {
    const issues: Issue[] = [];

    for (const row of result.rows) {
      const varName = String(row.VARIABLE_NAME || row.variable_name || '');
      const varValue = row.VARIABLE_VALUE || row.variable_value;

      if (!varName || varValue === null) continue;

      // Check if this variable has a new default in 8.4
      const varConfig = SYS_VARS_NEW_DEFAULTS_84[varName as keyof typeof SYS_VARS_NEW_DEFAULTS_84];
      if (!varConfig) continue;

      const [oldDefault, newDefault, _description] = varConfig;
      const currentValue = String(varValue);

      // If current value matches old default, it will change after upgrade
      const matchesOldDefault =
        (oldDefault === null && currentValue === '') ||
        String(oldDefault).toLowerCase() === currentValue.toLowerCase();

      if (matchesOldDefault) {
        issues.push({
          id: 'sysvar_new_default',
          type: 'config',
          category: 'newDefaultVars',
          severity: 'warning',
          title: `${varName} 기본값 변경`,
          description: `시스템 변수 '${varName}'의 현재 값이 8.0 기본값(${oldDefault})입니다. 8.4 업그레이드 후 기본값이 ${newDefault}로 변경됩니다.`,
          suggestion: `업그레이드 후 동작 변경을 원하지 않는다면, 설정 파일에 명시적으로 '${varName} = ${oldDefault}'를 추가하세요.`,
          location: 'performance_schema.global_variables',
          variableName: varName,
          code: `${varName} = ${currentValue} (8.0 default: ${oldDefault}, 8.4 default: ${newDefault})`,
          mysqlShellCheckId: 'sysVarsNewDefaults'
        });
      }
    }

    return issues;
  }
}
