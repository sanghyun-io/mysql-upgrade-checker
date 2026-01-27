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
  FileAnalysisResult
} from './types';
import { compatibilityRules } from './rules';
import { REMOVED_SYS_VARS_84 } from './constants';

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

  // Use composition instead of extending EventTarget for better compatibility
  private eventTarget: EventTarget = new EventTarget();

  // Public methods for adding event listeners
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.eventTarget.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.eventTarget.removeEventListener(type, listener);
  }

  // Event emission methods
  private emitIssue(issue: Issue): void {
    this.eventTarget.dispatchEvent(new CustomEvent('issue', { detail: issue }));
  }

  private emitProgress(progress: AnalysisProgress): void {
    this.eventTarget.dispatchEvent(new CustomEvent('progress', { detail: progress }));
  }

  private emitFileComplete(result: FileAnalysisResult): void {
    this.eventTarget.dispatchEvent(new CustomEvent('fileComplete', { detail: result }));
  }

  private emitAnalysisComplete(results: AnalysisResults): void {
    this.eventTarget.dispatchEvent(new CustomEvent('analysisComplete', { detail: results }));
  }

  // Yield to UI thread for responsiveness
  private yieldToUI(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 10));
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
      const issueCountBefore = this.results.issues.length;

      // Emit progress: analyzing
      this.emitProgress({
        currentFile: file.name,
        currentFileIndex: i,
        totalFiles: files.length,
        fileType,
        phase: fileType === 'skip' ? 'skipped' : 'analyzing'
      });

      // Yield to UI for responsiveness
      await this.yieldToUI();

      await this.analyzeFile(file);

      const issuesFound = this.results.issues.length - issueCountBefore;

      // Emit file complete
      this.emitFileComplete({
        fileName: file.name,
        fileType,
        issuesFound,
        skipped: fileType === 'skip'
      });

      // Emit progress: complete
      this.emitProgress({
        currentFile: file.name,
        currentFileIndex: i,
        totalFiles: files.length,
        fileType,
        phase: 'complete'
      });
    }

    // Emit analysis complete
    this.emitAnalysisComplete(this.results);

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

    // GRANT statement analysis
    this.analyzeGrantStatements(content, fileName);

    // CREATE USER statement analysis
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

      // Emit issue event for real-time display
      this.emitIssue(issue);
    }
  }

  private extractContext(content: string, position: number, length: number): string {
    const start = Math.max(0, position - length / 2);
    const end = Math.min(content.length, position + length / 2);
    let context = content.substring(start, end);
    return context.trim();
  }
}
