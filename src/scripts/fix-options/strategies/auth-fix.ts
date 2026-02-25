/**
 * Auth Fix Strategies
 * Handles: mysql_native_password, sha256_password, authentication_fido
 */

import type { FixOption } from '../../domain/fix-option';
import type { Issue } from '../../types';

export function generateAuthFixOptions(issue: Issue): FixOption[] {
  const userName = issue.userName ?? 'unknown';

  const options: FixOption[] = [];

  if (issue.id === 'mysql_native_password') {
    options.push({
      strategy: 'auth_change',
      label: 'caching_sha2_password로 전환',
      description: `mysql_native_password에서 caching_sha2_password로 전환합니다. MySQL 8.4 기본 인증 플러그인.`,
      sqlTemplate: `ALTER USER '${userName}'@'%' IDENTIFIED WITH caching_sha2_password BY 'NEW_PASSWORD_HERE';`,
      isRecommended: false,
      effort: 'medium',
      risk: 'medium',
      impact: '클라이언트가 caching_sha2_password를 지원해야 함. PHP < 7.4, Python MySQL Connector < 8.0 등 구버전 주의.',
      reversibility: 'reversible',
      rollbackTemplate: `ALTER USER '${userName}'@'%' IDENTIFIED WITH mysql_native_password BY 'PASSWORD_HERE';`,
    });

    options.push({
      strategy: 'skip',
      label: '현재 인증 유지',
      description: `mysql_native_password를 유지합니다. MySQL 8.4에서 deprecated이지만 아직 동작합니다.`,
      sqlTemplate: null,
      isRecommended: false,
      effort: 'low',
      risk: 'medium',
      impact: 'Deprecated 경고가 계속 발생. 향후 제거 예정.',
      reversibility: 'reversible',
    });
  } else if (issue.id === 'sha256_password') {
    options.push({
      strategy: 'auth_change',
      label: 'caching_sha2_password로 전환',
      description: `sha256_password에서 caching_sha2_password로 전환합니다. 동일한 보안 수준에 캐싱으로 성능 향상.`,
      sqlTemplate: `ALTER USER '${userName}'@'%' IDENTIFIED WITH caching_sha2_password BY 'NEW_PASSWORD_HERE';`,
      isRecommended: false,
      effort: 'low',
      risk: 'low',
      impact: 'caching_sha2_password는 sha256_password의 상위 호환.',
      reversibility: 'reversible',
      rollbackTemplate: `ALTER USER '${userName}'@'%' IDENTIFIED WITH sha256_password BY 'PASSWORD_HERE';`,
    });
  } else if (issue.id === 'authentication_fido') {
    options.push({
      strategy: 'auth_change',
      label: 'authentication_webauthn으로 전환',
      description: `authentication_fido에서 authentication_webauthn으로 전환합니다 (FIDO2/WebAuthn 표준).`,
      sqlTemplate: `ALTER USER '${userName}'@'%' IDENTIFIED WITH authentication_webauthn;`,
      isRecommended: false,
      effort: 'medium',
      risk: 'low',
      impact: 'WebAuthn 호환 키가 필요합니다.',
      reversibility: 'reversible',
      rollbackTemplate: `ALTER USER '${userName}'@'%' IDENTIFIED WITH authentication_fido;`,
    });
  }

  return options;
}
