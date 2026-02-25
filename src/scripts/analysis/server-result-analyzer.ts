/**
 * Server Result Analyzer
 *
 * Analyzes MySQL server query results and converts them to Issue format.
 * Handles VERSION, SHOW VARIABLES, SHOW GRANTS, SHOW PROCESSLIST results.
 *
 * Graceful degradation: parsing failures are converted to error issues, never crash.
 */

import type { Issue, Severity } from '../types';
import { REMOVED_SYS_VARS_84, AUTH_PLUGINS } from '../constants';
import { parseServerResult, type ServerQueryResult } from '../parsers/server-result-parser';

// Convert array to Set for O(1) lookup instead of O(N) per-row linear scan
const REMOVED_SYS_VARS_SET = new Set<string>(REMOVED_SYS_VARS_84);

/** Normalize a row's keys to lowercase for case-insensitive access */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    normalized[key.toLowerCase()] = row[key];
  }
  return normalized;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Analyze raw server query result text and produce issues.
 * Auto-detects the query type from column names or content patterns.
 *
 * Supports combined result sets produced by COMBINED_SERVER_CHECK_QUERY
 * which emit a `check_type` column alongside type-specific columns.
 */
export function analyzeServerResult(rawText: string): Issue[] {
  if (!rawText || !rawText.trim()) {
    return [{
      id: 'server_empty_result',
      type: 'config' as const,
      category: 'invalidObjects' as const,
      severity: 'warning' as const,
      title: '서버 쿼리 결과가 비어있음',
      description: '업로드한 파일에 분석 가능한 데이터가 없습니다. 서버 쿼리를 다시 실행해 주세요.',
      suggestion: 'Server Query 탭의 쿼리를 실행한 결과를 복사하여 붙여넣기 해주세요.',
    }];
  }

  let parsed: ServerQueryResult;
  try {
    parsed = parseServerResult(rawText);
  } catch {
    return [makeParseErrorIssue('서버 쿼리 결과를 파싱할 수 없습니다. TSV 또는 JSON 형식인지 확인하세요.')];
  }

  if (parsed.columns.length === 0) {
    return [makeParseErrorIssue('서버 쿼리 결과를 파싱할 수 없습니다. TSV 또는 JSON 형식인지 확인하세요.')];
  }

  if (parsed.rows.length === 0) {
    return [{
      id: 'server_no_data',
      type: 'config' as const,
      category: 'invalidObjects' as const,
      severity: 'warning' as const,
      title: '서버 쿼리 결과에 데이터 없음',
      description: '파싱은 성공했으나 데이터 행이 없습니다.',
      suggestion: '쿼리 결과에 데이터가 포함되어 있는지 확인해 주세요.',
    }];
  }

  // Auto-detect result type from columns
  const colNames = parsed.columns.map(c => c.toLowerCase());

  // COMBINED_SERVER_CHECK_QUERY result — rows have a `check_type` discriminator
  // e.g. check_type='user_auth', check_type='sys_vars', etc.
  if (colNames.includes('check_type')) {
    return analyzeCombinedResult(parsed);
  }

  // VERSION() result
  if (colNames.some(c => c.includes('version'))) {
    return analyzeVersionResult(parsed);
  }

  // SHOW VARIABLES result
  // Accepts both VARIABLE_NAME/VARIABLE_VALUE (performance_schema format)
  // and Variable_name/Value (SHOW VARIABLES output format)
  if (colNames.includes('variable_name') && (colNames.includes('variable_value') || colNames.includes('value'))) {
    return analyzeVariablesResult(parsed);
  }

  // User auth plugin result — columns user_name / auth_plugin
  if (colNames.includes('user_name') && colNames.includes('auth_plugin')) {
    return analyzeUserAuthResult(parsed);
  }

  // SHOW GRANTS result (single column with GRANT text)
  if (colNames.some(c => c.includes('grants'))) {
    return analyzeGrantsResult(parsed);
  }

  // SHOW PROCESSLIST result
  if (colNames.includes('id') && colNames.includes('command') && colNames.includes('time')) {
    return analyzeProcesslistResult(parsed);
  }

  // table size query (table_schema + size columns)
  if (colNames.includes('table_schema') && colNames.some(c => c.includes('size'))) {
    return analyzeTableSizeResult(parsed);
  }

  // Unknown format - no issues to generate
  return [];
}

/**
 * Parse a MySQL version string into components.
 * Handles formats: "8.0.35", "8.0.35-0ubuntu0.20.04.1", "8.4.0-commercial"
 *
 * Returns null for MariaDB version strings — callers should check
 * isMariaDB() separately when a null result is unexpected.
 */
export function parseVersion(versionStr: string): { major: number; minor: number; patch: number } | null {
  // MariaDB version strings (e.g. "10.11.6-MariaDB") must not be interpreted
  // as MySQL version numbers — return null so callers handle them explicitly.
  if (versionStr.toLowerCase().includes('mariadb')) {
    return null;
  }
  const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Returns true when the raw version string identifies a MariaDB server.
 */
export function isMariaDB(versionStr: string): boolean {
  return versionStr.toLowerCase().includes('mariadb');
}

// ============================================================================
// Analyzers
// ============================================================================

function analyzeVersionResult(result: ServerQueryResult): Issue[] {
  const issues: Issue[] = [];
  const versionCol = result.columns.find(c => c.toLowerCase().includes('version'));
  if (!versionCol) return issues;

  const versionStr = String(result.rows[0]?.[versionCol] ?? '');

  // Detect MariaDB before any further parsing — this tool targets MySQL only.
  if (isMariaDB(versionStr)) {
    issues.push(makeIssue(
      'server_mariadb_detected',
      'warning',
      'MariaDB 감지',
      `이 도구는 MySQL 8.0 → 8.4 업그레이드 전용입니다. MariaDB는 지원하지 않습니다. (감지된 버전: ${versionStr})`,
      'MySQL 서버의 VERSION() 결과를 사용하세요.',
    ));
    return issues;
  }

  const version = parseVersion(versionStr);

  if (!version) {
    issues.push(makeIssue(
      'server_version_parse_error',
      'warning',
      '버전 파싱 실패',
      `MySQL 버전 문자열을 파싱할 수 없습니다: ${versionStr}`,
      '올바른 MySQL 버전 형식(X.Y.Z)인지 확인하세요.',
    ));
    return issues;
  }

  // Check if already 8.4+
  if (version.major > 8 || (version.major === 8 && version.minor >= 4)) {
    issues.push(makeIssue(
      'server_version_already_target',
      'info',
      '이미 대상 버전',
      `현재 MySQL ${versionStr}은(는) 이미 8.4 이상입니다.`,
      '업그레이드가 필요하지 않을 수 있습니다.',
    ));
    return issues;
  }

  // Check if below 8.0
  if (version.major < 8) {
    issues.push(makeIssue(
      'server_version_too_old',
      'error',
      'MySQL 8.0 미만 버전',
      `현재 MySQL ${versionStr}입니다. 8.4로 직접 업그레이드할 수 없습니다.`,
      '먼저 MySQL 8.0으로 업그레이드한 후 8.4로 업그레이드하세요.',
    ));
    return issues;
  }

  // MySQL 8.0.x - compatible for upgrade
  issues.push(makeIssue(
    'server_version_compatible',
    'info',
    'MySQL 버전 확인 완료',
    `현재 MySQL ${versionStr}입니다. 8.4로 업그레이드할 수 있습니다.`,
    '업그레이드 전 모든 이슈를 해결하세요.',
  ));

  // Warn if 8.0 but below recommended minimum (8.0.25+)
  if (version.major === 8 && version.minor === 0 && version.patch < 25) {
    issues.push(makeIssue(
      'server_version_old_patch',
      'warning',
      'MySQL 8.0 패치 버전이 낮음',
      `MySQL ${versionStr}은(는) 8.0.25 미만입니다. 최신 8.0 패치로 먼저 업데이트하는 것을 권장합니다.`,
      'MySQL 8.0의 최신 패치로 업데이트 후 8.4 업그레이드를 진행하세요.',
    ));
  }

  return issues;
}

function analyzeVariablesResult(result: ServerQueryResult): Issue[] {
  const issues: Issue[] = [];

  for (const row of result.rows) {
    const nrow = normalizeRow(row);
    const varName = String(nrow['variable_name'] ?? '').toLowerCase();
    const varValue = String(nrow['variable_value'] ?? nrow['value'] ?? '');

    // Check against removed variables
    if (REMOVED_SYS_VARS_SET.has(varName)) {
      issues.push(makeIssue(
        'server_removed_variable',
        'error',
        `제거된 시스템 변수: ${varName}`,
        `시스템 변수 '${varName}'은(는) MySQL 8.4에서 제거되었습니다. 현재 값: ${varValue}`,
        `my.cnf에서 '${varName}'을(를) 제거하세요.`,
        varName,
      ));
    }

    // Check deprecated sql_mode values
    if (varName === 'sql_mode' && varValue.includes('NO_AUTO_CREATE_USER')) {
      issues.push(makeIssue(
        'server_deprecated_sql_mode',
        'warning',
        '더 이상 사용되지 않는 sql_mode 값',
        `sql_mode에 'NO_AUTO_CREATE_USER'가 포함되어 있습니다. MySQL 8.0에서 이미 제거된 값입니다.`,
        'sql_mode에서 NO_AUTO_CREATE_USER를 제거하세요.',
        'sql_mode',
      ));
    }
  }

  return issues;
}

function analyzeGrantsResult(result: ServerQueryResult): Issue[] {
  const issues: Issue[] = [];
  const grantsCol = result.columns.find(c => c.toLowerCase().includes('grants'));
  if (!grantsCol) return issues;

  for (const row of result.rows) {
    const grant = String(row[grantsCol] ?? '');

    // Check for removed privileges
    if (/\bSUPER\b/i.test(grant) && !/REQUIRE\s+SUPER/i.test(grant)) {
      issues.push(makeIssue(
        'server_super_privilege',
        'warning',
        'SUPER 권한 사용 감지',
        `GRANT 문에 SUPER 권한이 포함되어 있습니다: ${grant.substring(0, 100)}`,
        'SUPER 대신 적절한 동적 권한(SYSTEM_VARIABLES_ADMIN, CONNECTION_ADMIN 등)을 사용하세요.',
      ));
    }

    // Check for FILE privilege (security concern for upgrade)
    if (/\bFILE\b/i.test(grant)) {
      issues.push(makeIssue(
        'server_file_privilege',
        'info',
        'FILE 권한 사용 감지',
        `GRANT 문에 FILE 권한이 포함되어 있습니다.`,
        '업그레이드 후 FILE 권한이 여전히 필요한지 확인하세요.',
      ));
    }
  }

  return issues;
}

function analyzeProcesslistResult(result: ServerQueryResult): Issue[] {
  const issues: Issue[] = [];

  const longRunning = result.rows.filter(row => {
    const nrow = normalizeRow(row);
    const time = Number(nrow['time'] ?? 0);
    const command = String(nrow['command'] ?? '').toLowerCase();
    return time > 300 && command !== 'sleep' && command !== 'daemon';
  });

  if (longRunning.length > 0) {
    issues.push(makeIssue(
      'server_long_running_queries',
      'warning',
      `장시간 실행 중인 쿼리 ${longRunning.length}개 감지`,
      `5분 이상 실행 중인 쿼리가 ${longRunning.length}개 있습니다. 마이그레이션 전에 완료되었는지 확인하세요.`,
      '마이그레이션 전 장시간 쿼리를 완료하거나 종료하세요.',
    ));
  }

  const activeConnections = result.rows.filter(row => {
    const nrow = normalizeRow(row);
    const command = String(nrow['command'] ?? '').toLowerCase();
    return command !== 'sleep' && command !== 'daemon';
  });

  if (activeConnections.length > 20) {
    issues.push(makeIssue(
      'server_high_connections',
      'info',
      `활성 연결 ${activeConnections.length}개`,
      `현재 ${activeConnections.length}개의 활성 연결이 있습니다. 마이그레이션 시 연결을 최소화하세요.`,
      '유지보수 창에서 연결을 최소화한 상태로 마이그레이션하세요.',
    ));
  }

  return issues;
}

/**
 * Analyze a result set with columns: user_name, auth_plugin (and optionally host).
 * This format is produced by direct mysql.user queries.
 */
function analyzeUserAuthResult(result: ServerQueryResult): Issue[] {
  const issues: Issue[] = [];

  for (const row of result.rows) {
    const nrow = normalizeRow(row);
    const userName = String(nrow['user_name'] ?? nrow['user'] ?? '');
    const host = String(nrow['host'] ?? '%');
    const authPlugin = String(nrow['auth_plugin'] ?? nrow['plugin'] ?? '');

    if (!userName || !authPlugin) continue;

    const userHost = `${userName}@${host}`;

    if (AUTH_PLUGINS.disabled.includes(authPlugin as typeof AUTH_PLUGINS.disabled[number])) {
      issues.push({
        ...makeIssue(
          authPlugin, // Use the plugin name as issue ID (e.g., 'mysql_native_password')
          'error',
          `비활성화된 인증 플러그인: ${authPlugin}`,
          `사용자 '${userHost}'가 MySQL 8.4에서 기본 비활성화된 '${authPlugin}' 플러그인을 사용합니다.`,
          `ALTER USER '${userName}'@'${host}' IDENTIFIED WITH caching_sha2_password BY '<new_password>'; 를 실행하세요.`,
          authPlugin,
        ),
        userName: userHost,
      });
    } else if ((AUTH_PLUGINS.removed as readonly string[]).includes(authPlugin)) {
      issues.push({
        ...makeIssue(
          authPlugin, // Use the plugin name as issue ID (e.g., 'authentication_fido')
          'error',
          `제거된 인증 플러그인: ${authPlugin}`,
          `사용자 '${userHost}'가 MySQL 8.4에서 제거된 '${authPlugin}' 플러그인을 사용합니다.`,
          `ALTER USER '${userName}'@'${host}' IDENTIFIED WITH caching_sha2_password BY '<new_password>'; 를 실행하세요.`,
          authPlugin,
        ),
        userName: userHost,
      });
    } else if (AUTH_PLUGINS.deprecated.includes(authPlugin as typeof AUTH_PLUGINS.deprecated[number])) {
      issues.push({
        ...makeIssue(
          authPlugin, // Use the plugin name as issue ID (e.g., 'sha256_password')
          'warning',
          `폐기 예정 인증 플러그인: ${authPlugin}`,
          `사용자 '${userHost}'가 폐기 예정인 '${authPlugin}' 플러그인을 사용합니다.`,
          `ALTER USER '${userName}'@'${host}' IDENTIFIED WITH caching_sha2_password BY '<new_password>'; 로 마이그레이션하세요.`,
          authPlugin,
        ),
        userName: userHost,
      });
    }
  }

  return issues;
}

/**
 * Analyze a combined result set that contains a `check_type` discriminator column.
 * This format is produced by COMBINED_SERVER_CHECK_QUERY in constants.ts.
 *
 * Supported check_type values:
 *   - 'user_auth'   → user_name, auth_plugin columns  → analyzeUserAuthResult
 *   - 'sys_vars'    → var_name, var_value columns      → analyzeVariablesResult (remapped)
 */
function analyzeCombinedResult(result: ServerQueryResult): Issue[] {
  const issues: Issue[] = [];

  // Group rows by check_type
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of result.rows) {
    const nrow = normalizeRow(row);
    const checkType = String(nrow['check_type'] ?? '').toLowerCase();
    if (!checkType) continue;
    if (!groups.has(checkType)) groups.set(checkType, []);
    groups.get(checkType)!.push(nrow);
  }

  for (const [checkType, rows] of groups) {
    if (checkType === 'user_auth') {
      // Rows have: user_name, host, auth_plugin
      const subResult: ServerQueryResult = {
        columns: ['user_name', 'host', 'auth_plugin'],
        rows: rows as ServerQueryResult['rows'],
      };
      issues.push(...analyzeUserAuthResult(subResult));

    } else if (checkType === 'sys_vars') {
      // Rows have: var_name, var_value — remap to variable_name/variable_value
      const remappedRows: ServerQueryResult['rows'] = rows.map(r => ({
        variable_name: r['var_name'] as string | number | null,
        variable_value: r['var_value'] as string | number | null,
      }));
      const subResult: ServerQueryResult = {
        columns: ['variable_name', 'variable_value'],
        rows: remappedRows,
      };
      issues.push(...analyzeVariablesResult(subResult));
    }
    // Other check_type values (tablespace_files, table_engines, routines, triggers)
    // are informational and do not currently generate upgrade issues.
  }

  return issues;
}

function analyzeTableSizeResult(result: ServerQueryResult): Issue[] {
  const issues: Issue[] = [];
  const sizeCol = result.columns.find(c => c.toLowerCase().includes('size'));
  if (!sizeCol) return issues;
  const sizeKey = sizeCol.toLowerCase();

  const largeSchemas = result.rows.filter(row => {
    const nrow = normalizeRow(row);
    const size = Number(nrow[sizeKey] ?? 0);
    return size > 1024; // > 1GB
  });

  if (largeSchemas.length > 0) {
    const details = largeSchemas.map(row => {
      const nrow = normalizeRow(row);
      return `${nrow['table_schema']}: ${nrow[sizeKey]}MB`;
    }).join(', ');

    issues.push(makeIssue(
      'server_large_schemas',
      'info',
      `대용량 스키마 ${largeSchemas.length}개 감지`,
      `1GB 이상의 스키마: ${details}. ALTER TABLE 작업 시 추가 디스크 공간이 필요합니다.`,
      '충분한 디스크 공간을 확보한 후 마이그레이션을 진행하세요.',
    ));
  }

  return issues;
}

// ============================================================================
// Helpers
// ============================================================================

function makeIssue(
  id: string,
  severity: Severity,
  title: string,
  description: string,
  suggestion: string,
  variableName?: string,
): Issue {
  return {
    id,
    type: 'config',
    category: id.startsWith('server_removed') ? 'removedSysVars' : 'invalidObjects',
    severity,
    title,
    description,
    suggestion,
    ...(variableName ? { variableName } : {}),
  };
}

function makeParseErrorIssue(message: string): Issue {
  return {
    id: 'server_result_parse_error',
    type: 'config',
    category: 'invalidObjects',
    severity: 'warning',
    title: '서버 결과 파싱 오류',
    description: message,
    suggestion: 'TSV 또는 JSON 형식의 쿼리 결과를 입력하세요.',
  };
}
