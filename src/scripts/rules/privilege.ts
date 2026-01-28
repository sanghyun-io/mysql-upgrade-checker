/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules - Privileges
 * Covers: invalidPrivileges
 */

import type { CompatibilityRule } from '../types';
import { REMOVED_PRIVILEGES_84, SUPER_REPLACEMENT_PRIVILEGES } from '../constants';

// ============================================================================
// INVALID PRIVILEGES RULES
// ============================================================================
export const invalidPrivilegesRules: CompatibilityRule[] = [
  {
    id: 'super_privilege',
    type: 'privilege',
    category: 'invalidPrivileges',
    pattern: /GRANT\s+.*\bSUPER\b/gi,
    severity: 'warning',
    title: 'SUPER 권한 사용',
    description: 'SUPER 권한은 세분화된 동적 권한으로 대체되었습니다.',
    suggestion: '필요한 동적 권한(SYSTEM_VARIABLES_ADMIN, BINLOG_ADMIN 등)으로 변경하세요.',
    mysqlShellCheckId: 'invalidPrivileges',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/privileges-provided.html#privileges-provided-dynamic',
    generateFixQuery: (context) => {
      if (context.userName) {
        return [
          `-- SUPER 권한을 동적 권한으로 대체`,
          `REVOKE SUPER ON *.* FROM '${context.userName}'@'%';`,
          ``,
          `-- 필요한 권한만 부여 (예시)`,
          `-- GRANT SYSTEM_VARIABLES_ADMIN ON *.* TO '${context.userName}'@'%';`,
          `-- GRANT CONNECTION_ADMIN ON *.* TO '${context.userName}'@'%';`
        ].join('\n');
      }
      return null;
    }
  },
  {
    id: 'removed_privilege_84',
    type: 'privilege',
    category: 'invalidPrivileges',
    pattern: /GRANT\s+[^;]*\bSUPER\b/gi,
    severity: 'error',
    title: '제거된 권한 사용',
    description: `다음 권한은 MySQL 8.4에서 제거되었습니다: ${REMOVED_PRIVILEGES_84.join(', ')}`,
    suggestion: '동적 권한으로 대체해야 합니다.',
    mysqlShellCheckId: 'invalidPrivileges',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/privileges-provided.html',
    generateFixQuery: (context) => {
      if (context.userName) {
        return [
          `-- SUPER 권한 제거 및 동적 권한으로 대체`,
          `REVOKE SUPER ON *.* FROM '${context.userName}'@'%';`,
          `GRANT SYSTEM_VARIABLES_ADMIN, BINLOG_ADMIN ON *.* TO '${context.userName}'@'%';`
        ].join('\n');
      }
      return null;
    }
  },
  {
    id: 'super_privilege_replacement',
    type: 'privilege',
    category: 'invalidPrivileges',
    pattern: /GRANT\s+[^;]*\bSUPER\b/gi,
    severity: 'warning',
    title: 'SUPER 권한을 동적 권한으로 교체',
    description: `SUPER 권한은 다음의 세분화된 동적 권한으로 대체되었습니다: ${SUPER_REPLACEMENT_PRIVILEGES.slice(0, 5).join(', ')} 등 ${SUPER_REPLACEMENT_PRIVILEGES.length}개`,
    suggestion: '사용 사례에 맞는 적절한 동적 권한만 부여하세요.',
    mysqlShellCheckId: 'invalidPrivileges',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/privileges-provided.html#privileges-provided-dynamic',
    generateFixQuery: (context) => {
      if (context.userName) {
        return [
          `-- SUPER 권한 대체 동적 권한 목록:`,
          `-- ${SUPER_REPLACEMENT_PRIVILEGES.join(', ')}`,
          ``,
          `-- 예시: 일반적인 관리 권한 부여`,
          `REVOKE SUPER ON *.* FROM '${context.userName}'@'%';`,
          `GRANT SYSTEM_VARIABLES_ADMIN, CONNECTION_ADMIN, REPLICATION_SLAVE_ADMIN ON *.* TO '${context.userName}'@'%';`
        ].join('\n');
      }
      return null;
    }
  }
];
