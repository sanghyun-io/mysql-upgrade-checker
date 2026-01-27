export type Severity = 'error' | 'warning' | 'info';

export type RuleType = 'schema' | 'data' | 'query';

export interface CompatibilityRule {
  id: string;
  type: RuleType;
  pattern?: RegExp;
  severity: Severity;
  title: string;
  description: string;
  suggestion: string;
  detectInData?: (value: string, columnType?: string) => boolean;
  generateFixQuery?: (context: FixQueryContext) => string | null;
}

export interface FixQueryContext {
  code?: string;
  tableName?: string;
  columnName?: string;
  columnType?: string;
  enumValues?: string[];
}

export interface Issue {
  id: string;
  type: RuleType;
  severity: Severity;
  title: string;
  description: string;
  suggestion: string;
  location?: string;
  code?: string;
  matchedText?: string;
  dataSample?: string;
  tableName?: string;
  columnName?: string;
  columnType?: string;
  enumValues?: string[];
  fixQuery?: string | null;
}

export interface AnalysisResults {
  issues: Issue[];
  stats: {
    safe: number;
    error: number;
    warning: number;
    info: number;
  };
  metadata?: {
    totalFiles: number;
    analyzedAt: string;
  };
}

export interface TableSchema {
  [columnName: string]: string;
}

export interface TableSchemas {
  [tableName: string]: TableSchema;
}
