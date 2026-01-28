/**
 * MySQL 8.0 → 8.4 Upgrade Checker Type Definitions
 * Based on MySQL Shell util.checkForServerUpgrade() official 47 checks
 */

// ============================================================================
// SEVERITY LEVELS
// ============================================================================
export type Severity = 'error' | 'warning' | 'info';

// ============================================================================
// RULE TYPES (original)
// ============================================================================
export type RuleType = 'schema' | 'data' | 'query' | 'config' | 'privilege';

// ============================================================================
// RULE CATEGORIES (matches MySQL Shell categories)
// ============================================================================
export type RuleCategory =
  | 'removedSysVars'      // Removed System Variables
  | 'newDefaultVars'      // New Default Values
  | 'reservedKeywords'    // Reserved Keywords
  | 'authentication'      // Authentication
  | 'invalidPrivileges'   // Invalid Privileges
  | 'invalidObjects'      // Invalid Objects (schema issues)
  | 'dataIntegrity';      // Data Integrity Issues

// Human-readable category labels (Korean)
export const CATEGORY_LABELS: Record<RuleCategory, string> = {
  removedSysVars: '제거된 시스템 변수',
  newDefaultVars: '기본값 변경된 변수',
  reservedKeywords: '예약어 충돌',
  authentication: '인증',
  invalidPrivileges: '제거된 권한',
  invalidObjects: '잘못된 객체',
  dataIntegrity: '데이터 무결성'
};

// Category descriptions
export const CATEGORY_DESCRIPTIONS: Record<RuleCategory, string> = {
  removedSysVars: 'MySQL 8.4에서 제거된 시스템 변수를 사용하는 설정을 감지합니다.',
  newDefaultVars: '기본값이 변경되어 동작이 달라질 수 있는 시스템 변수입니다.',
  reservedKeywords: '새로운 예약어와 충돌하는 테이블, 컬럼, 함수 이름입니다.',
  authentication: '인증 플러그인 및 사용자 계정 관련 호환성 문제입니다.',
  invalidPrivileges: '제거되었거나 변경된 권한을 사용하는 GRANT 문입니다.',
  invalidObjects: '스키마 구조, 데이터 타입, 객체 이름 관련 호환성 문제입니다.',
  dataIntegrity: '데이터 값 자체에 존재하는 호환성 문제입니다.'
};

// Category order for display
export const CATEGORY_ORDER: RuleCategory[] = [
  'invalidObjects',
  'dataIntegrity',
  'removedSysVars',
  'newDefaultVars',
  'reservedKeywords',
  'authentication',
  'invalidPrivileges'
];

// ============================================================================
// FIX QUERY CONTEXT
// ============================================================================
export interface FixQueryContext {
  code?: string;
  tableName?: string;
  columnName?: string;
  columnType?: string;
  enumValues?: string[];
  variableName?: string;
  userName?: string;
  privilege?: string;
  objectName?: string;
  schemaName?: string;
}

// ============================================================================
// COMPATIBILITY RULE DEFINITION
// ============================================================================
export interface CompatibilityRule {
  // Core identification
  id: string;
  type: RuleType;
  category: RuleCategory;

  // Detection
  pattern?: RegExp;
  detectInData?: (value: string, columnType?: string) => boolean;
  detectInConfig?: (key: string, value: string) => boolean;

  // Display
  severity: Severity;
  title: string;
  description: string;
  suggestion: string;

  // MySQL Shell check ID (for reference)
  mysqlShellCheckId?: string;

  // Documentation link
  docLink?: string;

  // Fix query generation
  generateFixQuery?: (context: FixQueryContext) => string | null;
}

// ============================================================================
// DETECTED ISSUE
// ============================================================================
export interface Issue {
  // Core identification (from rule)
  id: string;
  type: RuleType;
  category: RuleCategory;
  severity: Severity;

  // Display (from rule)
  title: string;
  description: string;
  suggestion: string;

  // Location info
  location?: string;
  lineNumber?: number;

  // Code context
  code?: string;
  matchedText?: string;

  // Data context
  dataSample?: string;
  tableName?: string;
  columnName?: string;
  columnType?: string;
  enumValues?: string[];

  // Config context
  variableName?: string;
  configSection?: string;

  // Privilege context
  userName?: string;
  privilege?: string;

  // Object context
  objectName?: string;
  schemaName?: string;

  // Fix
  fixQuery?: string | null;

  // MySQL Shell reference
  mysqlShellCheckId?: string;
  docLink?: string;
}

// ============================================================================
// ANALYSIS RESULTS
// ============================================================================
export interface AnalysisResults {
  issues: Issue[];
  stats: {
    safe: number;
    error: number;
    warning: number;
    info: number;
  };
  // Category-specific counts
  categoryStats?: Record<RuleCategory, number>;
  metadata?: {
    totalFiles: number;
    analyzedAt: string;
    fileTypes?: {
      sql: number;
      tsv: number;
      json: number;
      config: number;
    };
  };
}

// ============================================================================
// TABLE SCHEMA EXTRACTION
// ============================================================================
export interface TableSchema {
  [columnName: string]: string;
}

export interface TableSchemas {
  [tableName: string]: TableSchema;
}

// Extended table info for detailed analysis
export interface TableInfo {
  name: string;
  engine?: string;
  charset?: string;
  collation?: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
  partitions?: PartitionInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  extra?: string;
  charset?: string;
  collation?: string;
  generated?: {
    expression: string;
    stored: boolean;
  };
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  type?: string;
  prefixLengths?: number[];
}

export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface PartitionInfo {
  name: string;
  type: string;
  expression?: string;
  description?: string;
}

// ============================================================================
// TABLE INDEX MAP (for FK reference validation)
// ============================================================================

/**
 * Stores index information for a table used in FK validation
 */
export interface TableIndexInfo {
  tableName: string;
  schemaName?: string;
  primaryKey?: string[];
  uniqueIndexes: Array<{ name: string; columns: string[] }>;
  regularIndexes: Array<{ name: string; columns: string[] }>;
}

// ============================================================================
// TABLE CHARSET MAP (for 4-byte UTF-8 cross-validation)
// ============================================================================

/**
 * Stores charset information for a table and its columns
 */
export interface TableCharsetInfo {
  tableName: string;
  tableCharset?: string;
  tableCollation?: string;
  columns: Map<string, ColumnCharsetInfo>;
}

export interface ColumnCharsetInfo {
  charset?: string;
  collation?: string;
  type: string;
  /** Parsed max length for VARCHAR/CHAR types */
  maxLength?: number;
}

/**
 * Map of table names to their charset information
 */
export type TableCharsetMap = Map<string, TableCharsetInfo>;

/**
 * Map of table names to their index information
 */
export type TableIndexMap = Map<string, TableIndexInfo>;

/**
 * Pending FK check to be validated after collecting all table indexes
 */
export interface PendingFKCheck {
  issueId: string;
  sourceTable: string;
  sourceColumns: string[];
  refTable: string;
  refColumns: string[];
  location: string;
  code: string;
}

// ============================================================================
// USER/PRIVILEGE INFO
// ============================================================================
export interface UserInfo {
  user: string;
  host: string;
  authPlugin?: string;
  privileges: string[];
}

// ============================================================================
// CONFIG FILE INFO
// ============================================================================
export interface ConfigSection {
  name: string;
  variables: Record<string, string>;
}

export interface ConfigFile {
  sections: ConfigSection[];
  rawContent: string;
}

// ============================================================================
// ROUTINE (PROCEDURE/FUNCTION) INFO
// ============================================================================
export interface RoutineInfo {
  name: string;
  type: 'PROCEDURE' | 'FUNCTION';
  schema: string;
  body: string;
  definer?: string;
}

// ============================================================================
// GROUPED ISSUES BY CATEGORY
// ============================================================================
export interface GroupedIssues {
  category: RuleCategory;
  label: string;
  description: string;
  issues: Issue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

// ============================================================================
// REAL-TIME ANALYSIS EVENTS
// ============================================================================

// Analysis progress information
export interface AnalysisProgress {
  currentFile: string;
  currentFileIndex: number;
  totalFiles: number;
  fileType: string;
  phase: 'reading' | 'analyzing' | 'complete' | 'skipped';
}

