/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules - Reserved Keywords & Naming
 * Covers: reservedKeywords
 */

import type { CompatibilityRule } from '../types';
import { NEW_RESERVED_KEYWORDS_84 } from '../constants';

// ============================================================================
// RESERVED KEYWORDS RULES
// ============================================================================
export const reservedKeywordsRules: CompatibilityRule[] = [
  {
    id: 'reserved_keyword_84',
    type: 'schema',
    category: 'reservedKeywords',
    pattern: new RegExp(
      `(?:CREATE\\s+TABLE|ALTER\\s+TABLE|CREATE\\s+(?:UNIQUE\\s+)?INDEX)\\s+\`?(${NEW_RESERVED_KEYWORDS_84.join('|')})\`?\\b`,
      'gi'
    ),
    severity: 'error',
    title: 'MySQL 8.4 신규 예약어 사용',
    description: `객체 이름이 MySQL 8.4의 신규 예약어(${NEW_RESERVED_KEYWORDS_84.join(', ')})와 충돌합니다.`,
    suggestion: '객체 이름을 백틱(`)으로 감싸거나 다른 이름으로 변경하세요.',
    mysqlShellCheckId: 'reservedKeywords',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/keywords.html'
  },
  {
    id: 'reserved_keyword_column',
    type: 'schema',
    category: 'reservedKeywords',
    pattern: new RegExp(
      `\`?(${NEW_RESERVED_KEYWORDS_84.join('|')})\`?\\s+(?:INT|VARCHAR|TEXT|CHAR|DECIMAL|FLOAT|DOUBLE|DATE|TIME|DATETIME|TIMESTAMP|BLOB|ENUM|SET|BOOLEAN|BOOL|TINYINT|SMALLINT|MEDIUMINT|BIGINT)`,
      'gi'
    ),
    severity: 'error',
    title: 'MySQL 8.4 신규 예약어 컬럼명',
    description: `컬럼 이름이 MySQL 8.4의 신규 예약어(${NEW_RESERVED_KEYWORDS_84.join(', ')})와 충돌합니다.`,
    suggestion: '컬럼 이름을 백틱(`)으로 감싸거나 다른 이름으로 변경하세요.',
    mysqlShellCheckId: 'reservedKeywords'
  },
  {
    id: 'routine_syntax_keyword',
    type: 'schema',
    category: 'reservedKeywords',
    pattern: new RegExp(
      `(?:CREATE\\s+(?:PROCEDURE|FUNCTION))\\s+\`?(${NEW_RESERVED_KEYWORDS_84.join('|')})\`?\\s*\\(`,
      'gi'
    ),
    severity: 'error',
    title: '루틴 이름 예약어 충돌',
    description: '저장 프로시저 또는 함수 이름이 예약어와 충돌합니다.',
    suggestion: '루틴 이름을 백틱(`)으로 감싸거나 다른 이름으로 변경하세요.',
    mysqlShellCheckId: 'routineSyntax'
  },
  // Invalid 5.7 identifier patterns
  {
    id: 'invalid_57_name_dollar_start',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /(?:CREATE\s+(?:TABLE|DATABASE|VIEW|PROCEDURE|FUNCTION))\s+`?\$\w+`?/gi,
    severity: 'error',
    title: '$ 기호로 시작하는 식별자',
    description: 'MySQL 5.7에서는 허용되었지만 8.0+에서는 식별자가 $ 기호로 시작할 수 없습니다.',
    suggestion: '식별자 이름을 변경하거나 $ 기호를 제거하세요.',
    mysqlShellCheckId: 'invalid57Names',
    docLink: 'https://dev.mysql.com/doc/refman/8.4/en/identifiers.html'
  },
  {
    id: 'invalid_57_name_multiple_dots',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /(?:CREATE\s+(?:TABLE|DATABASE|VIEW))\s+`?[\w.]*\.\.[\w.]*`?/gi,
    severity: 'error',
    title: '연속된 점(..)을 포함하는 식별자',
    description: '식별자 이름에 연속된 점(..)이 포함되어 있습니다. 이는 유효하지 않은 이름입니다.',
    suggestion: '연속된 점을 제거하거나 식별자 이름을 변경하세요.',
    mysqlShellCheckId: 'invalid57Names'
  },
  {
    id: 'invalid_57_name_trailing_space',
    type: 'schema',
    category: 'invalidObjects',
    pattern: /(?:CREATE\s+(?:TABLE|DATABASE|VIEW))\s+`[^`]+\s+`/gi,
    severity: 'error',
    title: '후행 공백을 포함하는 식별자',
    description: '식별자 이름 끝에 공백이 포함되어 있습니다. 이는 유효하지 않은 이름입니다.',
    suggestion: '후행 공백을 제거하세요.',
    mysqlShellCheckId: 'invalid57Names'
  }
];
