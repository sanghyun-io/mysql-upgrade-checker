/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules - Authentication
 * Covers: authentication
 */

import type { CompatibilityRule } from '../types';

// ============================================================================
// AUTHENTICATION RULES
// ============================================================================
export const authenticationRules: CompatibilityRule[] = [
  {
    id: 'mysql_native_password',
    type: 'privilege',
    category: 'authentication',
    pattern: /(?:IDENTIFIED\s+(?:WITH|BY)\s+['"]?mysql_native_password|plugin\s*=\s*['"]?mysql_native_password)/gi,
    severity: 'warning',
    title: 'mysql_native_password 인증 플러그인',
    description: 'MySQL 8.4에서 mysql_native_password는 기본적으로 비활성화됩니다. 명시적으로 활성화해야 사용 가능합니다.',
    suggestion: 'caching_sha2_password로 마이그레이션하거나 mysql_native_password_auto_generate_rsa_keys를 활성화하세요.',
    mysqlShellCheckId: 'authMethodUsage',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/native-pluggable-authentication.html',
    generateFixQuery: (context) => {
      if (context.userName) {
        return `ALTER USER '${context.userName}'@'%' IDENTIFIED WITH caching_sha2_password BY 'new_password';`;
      }
      return null;
    }
  },
  {
    id: 'sha256_password',
    type: 'privilege',
    category: 'authentication',
    pattern: /(?:IDENTIFIED\s+WITH\s+['"]?sha256_password|plugin\s*=\s*['"]?sha256_password)/gi,
    severity: 'warning',
    title: 'sha256_password 인증 플러그인 (deprecated)',
    description: 'sha256_password는 deprecated되었습니다. caching_sha2_password 사용을 권장합니다.',
    suggestion: 'caching_sha2_password로 마이그레이션하세요.',
    mysqlShellCheckId: 'deprecatedDefaultAuth'
  },
  {
    id: 'authentication_fido',
    type: 'privilege',
    category: 'authentication',
    pattern: /(?:IDENTIFIED\s+WITH\s+['"]?authentication_fido|plugin\s*=\s*['"]?authentication_fido)/gi,
    severity: 'error',
    title: 'authentication_fido 플러그인 제거됨',
    description: 'authentication_fido 플러그인은 MySQL 8.4에서 완전히 제거되었습니다.',
    suggestion: 'authentication_webauthn 또는 다른 인증 방법으로 마이그레이션하세요.',
    mysqlShellCheckId: 'pluginUsage'
  },
  {
    id: 'default_authentication_plugin_var',
    type: 'config',
    category: 'authentication',
    pattern: /default_authentication_plugin\s*=/gi,
    severity: 'error',
    title: 'default_authentication_plugin 변수 제거됨',
    description: 'default_authentication_plugin 시스템 변수는 MySQL 8.4에서 제거되었습니다.',
    suggestion: 'authentication_policy 시스템 변수를 대신 사용하세요.',
    mysqlShellCheckId: 'defaultAuthenticationPlugin',
    generateFixQuery: () => {
      return `-- my.cnf에서 default_authentication_plugin 제거 후:\nauthentication_policy=caching_sha2_password`;
    }
  },
  {
    id: 'auth_plugin_disabled',
    type: 'privilege',
    category: 'authentication',
    pattern: /IDENTIFIED\s+(?:BY|WITH)\s+['"]?mysql_native_password['"]?/gi,
    severity: 'warning',
    title: 'mysql_native_password 기본 비활성화',
    description: 'MySQL 8.4에서 mysql_native_password 인증 플러그인은 기본적으로 비활성화되어 있습니다.',
    suggestion: 'caching_sha2_password로 변경하거나 서버 설정에서 mysql_native_password를 명시적으로 활성화하세요.',
    mysqlShellCheckId: 'authMethodUsage',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/native-pluggable-authentication.html',
    generateFixQuery: (context) => {
      if (context.userName) {
        return `ALTER USER '${context.userName}'@'%' IDENTIFIED WITH caching_sha2_password BY 'new_password';`;
      }
      return null;
    }
  },
  {
    id: 'auth_plugin_removed',
    type: 'privilege',
    category: 'authentication',
    pattern: /IDENTIFIED\s+(?:BY|WITH)\s+['"]?authentication_fido(?:_client)?['"]?/gi,
    severity: 'error',
    title: 'authentication_fido 플러그인 완전 제거',
    description: 'MySQL 8.4에서 authentication_fido 및 authentication_fido_client 플러그인이 완전히 제거되었습니다.',
    suggestion: 'authentication_webauthn 또는 다른 인증 플러그인으로 마이그레이션하세요.',
    mysqlShellCheckId: 'pluginUsage',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/webauthn-pluggable-authentication.html',
    generateFixQuery: (context) => {
      if (context.userName) {
        return `ALTER USER '${context.userName}'@'%' IDENTIFIED WITH caching_sha2_password BY 'new_password';`;
      }
      return null;
    }
  }
];
