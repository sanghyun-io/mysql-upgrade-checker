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
  UserInfo
} from './types';
import { compatibilityRules } from './rules';
import { REMOVED_SYS_VARS_84, SYS_VARS_NEW_DEFAULTS_84 } from './constants';
import { parseCreateTable } from './parsers/table-parser';
import { parseCreateUser, parseGrant, extractUsers } from './parsers/user-parser';

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
    const content = await this.readFileContent(file);
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

      // 4-byte UTF-8 character check
      const has4ByteChars = /[\u{10000}-\u{10FFFF}]/u.test(valuesStr);
      if (has4ByteChars) {
        const rule = compatibilityRules.find((r) => r.id === 'data_4byte_chars');
        if (rule) {
          this.addIssue({
            ...rule,
            location: `${fileName} - Table: ${tableName}`,
            code: valuesStr.substring(0, 200) + '...',
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

      // 4-byte character check
      if (/[\u{10000}-\u{10FFFF}]/u.test(line)) {
        this.addIssue({
          id: 'data_4byte_chars',
          type: 'data',
          category: 'dataIntegrity',
          severity: 'warning',
          title: '4바이트 UTF-8 문자 발견 (데이터)',
          description: `TSV 데이터에 이모지 또는 4바이트 UTF-8 문자가 포함되어 있습니다.`,
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
    if (!table.partitions) {
      return;
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
    const start = Math.max(0, position - length / 2);
    const end = Math.min(content.length, position + length / 2);
    let context = content.substring(start, end);
    return context.trim();
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

      const [oldDefault, newDefault, description] = varConfig;
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
