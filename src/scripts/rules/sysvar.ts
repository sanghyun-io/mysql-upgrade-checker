/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules - System Variables
 * Covers: removedSysVars, newDefaultVars
 */

import type { CompatibilityRule } from '../types';
import { REMOVED_SYS_VARS_84, SYS_VARS_NEW_DEFAULTS_84 } from '../constants';
import { buildWordBoundaryPattern, escapeRegex } from './utils';

// ============================================================================
// 1. REMOVED SYSTEM VARIABLES RULES
// ============================================================================
export const removedSysVarsRules: CompatibilityRule[] = [
  {
    id: 'removed_sys_var',
    type: 'config',
    category: 'removedSysVars',
    pattern: buildWordBoundaryPattern(REMOVED_SYS_VARS_84),
    severity: 'error',
    title: '제거된 시스템 변수 사용',
    description: 'MySQL 8.4에서 제거된 시스템 변수를 사용하고 있습니다. 서버 시작 시 오류가 발생합니다.',
    suggestion: '해당 변수를 설정 파일에서 제거하거나 대체 변수를 사용하세요.',
    mysqlShellCheckId: 'removedSysVars',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/added-deprecated-removed.html',
    generateFixQuery: (context) => {
      if (context.variableName) {
        return `-- 설정 파일(my.cnf)에서 다음 변수를 제거하세요:\n-- ${context.variableName}`;
      }
      return null;
    }
  }
];

// ============================================================================
// 2. NEW DEFAULT VALUES RULES
// ============================================================================

// 2.1 Generate rules for all system variables with new defaults
const sysVarsNewDefaultsRules: CompatibilityRule[] = Object.entries(SYS_VARS_NEW_DEFAULTS_84).map(
  ([varName, [oldDefault, newDefault, description]]) => {
    // Escape old default value for regex if it's a string
    const oldDefaultStr = String(oldDefault);
    const escapedOldDefault = escapeRegex(oldDefaultStr);

    return {
      id: `sys_var_new_default_${varName}`,
      type: 'config' as const,
      category: 'newDefaultVars' as const,
      pattern: new RegExp(`${escapeRegex(varName)}\\s*=\\s*${escapedOldDefault}\\b`, 'gi'),
      severity: 'warning' as const,
      title: `${varName} 기본값 변경`,
      description: `MySQL 8.4에서 ${varName} 기본값이 ${oldDefaultStr}에서 ${newDefault}로 변경되었습니다. (${description})`,
      suggestion: `명시적으로 ${oldDefaultStr}로 설정하면 8.4에서도 동일하게 동작합니다. 새로운 기본값으로 변경을 고려하세요.`,
      mysqlShellCheckId: 'sysVarsNewDefaults'
    };
  }
);

export const newDefaultVarsRules: CompatibilityRule[] = [
  // 2.1 System Variables with Changed Defaults
  ...sysVarsNewDefaultsRules,
  // 2.2 Zero Dates
  {
    id: 'invalid_date_zero',
    type: 'data',
    category: 'newDefaultVars',
    severity: 'error',
    title: '잘못된 날짜 값: 0000-00-00',
    description: 'MySQL 8.0부터 NO_ZERO_DATE SQL 모드가 기본 활성화되어 0000-00-00 날짜를 허용하지 않습니다.',
    suggestion: 'NULL 또는 유효한 날짜로 변경해야 합니다.',
    mysqlShellCheckId: 'zeroDates',
    detectInData: (value) => /['"]0000-00-00/.test(value),
    generateFixQuery: (context) => {
      if (context.tableName && context.columnName) {
        return [
          `-- 0000-00-00 값을 NULL로 변경`,
          `UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = NULL WHERE \`${context.columnName}\` = '0000-00-00';`,
          ``,
          `-- 또는 특정 날짜로 변경 (예: 1970-01-01)`,
          `-- UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = '1970-01-01' WHERE \`${context.columnName}\` = '0000-00-00';`
        ].join('\n');
      }
      return null;
    }
  },
  {
    id: 'invalid_datetime_zero',
    type: 'data',
    category: 'newDefaultVars',
    severity: 'error',
    title: '잘못된 날짜시간 값: 0000-00-00 00:00:00',
    description: 'MySQL 8.0부터 NO_ZERO_DATE SQL 모드가 기본 활성화되어 0000-00-00 00:00:00을 허용하지 않습니다.',
    suggestion: 'NULL 또는 유효한 날짜시간으로 변경해야 합니다.',
    mysqlShellCheckId: 'zeroDates',
    detectInData: (value) => /['"]0000-00-00 00:00:00/.test(value),
    generateFixQuery: (context) => {
      if (context.tableName && context.columnName) {
        return [
          `-- 0000-00-00 00:00:00 값을 NULL로 변경`,
          `UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = NULL WHERE \`${context.columnName}\` = '0000-00-00 00:00:00';`,
          ``,
          `-- 또는 특정 날짜시간으로 변경 (예: 1970-01-01 00:00:00)`,
          `-- UPDATE \`${context.tableName}\` SET \`${context.columnName}\` = '1970-01-01 00:00:00' WHERE \`${context.columnName}\` = '0000-00-00 00:00:00';`
        ].join('\n');
      }
      return null;
    }
  }
];
