import type { AnalysisResults, Issue, TableSchemas, TableSchema } from './types';
import { compatibilityRules } from './rules';

export class FileAnalyzer {
  private results: AnalysisResults = {
    issues: [],
    stats: { safe: 0, error: 0, warning: 0, info: 0 }
  };

  async analyzeFiles(files: File[]): Promise<AnalysisResults> {
    this.results = {
      issues: [],
      stats: { safe: 0, error: 0, warning: 0, info: 0 },
      metadata: {
        totalFiles: files.length,
        analyzedAt: new Date().toISOString()
      }
    };

    for (const file of files) {
      await this.analyzeFile(file);
    }

    return this.results;
  }

  private async analyzeFile(file: File): Promise<void> {
    const content = await this.readFileContent(file);
    const fileName = file.name;

    // mysqlsh dump 진행 상황 파일 건너뛰기
    if (
      fileName.startsWith('load-progress') ||
      fileName.startsWith('dump-progress') ||
      fileName === '@.done.json'
    ) {
      return;
    }

    // mysqlsh dump 메타데이터 파일 처리
    if (fileName.endsWith('.json') && fileName.includes('@.')) {
      await this.analyzeMysqlShellMetadata(content, fileName);
      return;
    }

    // SQL 파일 분석
    if (fileName.endsWith('.sql')) {
      await this.analyzeSQLFile(content, fileName);
      return;
    }

    // TSV 파일
    if (fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
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

  private async analyzeSQLFile(content: string, fileName: string): Promise<void> {
    // 스키마 검사
    compatibilityRules
      .filter((rule) => rule.type === 'schema' || rule.type === 'query')
      .forEach((rule) => {
        if (!rule.pattern) return;

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

            // 수정 쿼리 생성
            if (rule.generateFixQuery) {
              issue.fixQuery = rule.generateFixQuery({ code: context });
            }

            this.addIssue(issue);
          }
        }
      });

    // INSERT 문에서 데이터 검사
    this.analyzeInsertStatements(content, fileName);
  }

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

      // 0000-00-00 날짜 검사
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

      // ENUM 빈 값 검사
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

      // utf8mb4 범위를 벗어나는 문자 검사
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

      // NULL 바이트 검사
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

  private async analyzeTSVData(content: string, fileName: string): Promise<void> {
    const lines = content.split('\n');
    const tableName = fileName.replace(/\.tsv$|\.txt$/, '').split('@')[0];

    let lineNum = 0;
    for (const line of lines.slice(0, 1000)) {
      lineNum++;

      // 4바이트 문자 검사
      if (/[\u{10000}-\u{10FFFF}]/u.test(line)) {
        this.addIssue({
          id: 'data_4byte_chars',
          type: 'data',
          severity: 'warning',
          title: '4바이트 UTF-8 문자 발견 (데이터)',
          description: `TSV 데이터에 이모지 또는 4바이트 UTF-8 문자가 포함되어 있습니다.`,
          suggestion: '테이블 문자셋을 utf8mb4로 설정해야 합니다.',
          location: `${fileName}:${lineNum}`,
          code: line.substring(0, 100) + '...',
          dataSample: line
        });
        break;
      }
    }
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
    }
  }

  private extractContext(content: string, position: number, length: number): string {
    const start = Math.max(0, position - length / 2);
    const end = Math.min(content.length, position + length / 2);
    let context = content.substring(start, end);
    return context.trim();
  }
}
