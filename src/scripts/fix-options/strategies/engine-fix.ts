/**
 * Engine Fix Strategies
 * Handles: myisam_engine, deprecated_engine
 */

import type { FixOption } from '../../domain/fix-option';
import type { Issue } from '../../types';
import { escapeIdentifier } from '../../security/sql-escape';

export function generateEngineFixOptions(issue: Issue): FixOption[] {
  const table = issue.tableName ?? 'unknown';
  const currentEngine = issue.matchedText ?? 'MyISAM';
  const escapedTable = escapeIdentifier(table);

  const options: FixOption[] = [];

  // Option A: Convert to InnoDB
  options.push({
    strategy: 'engine_convert',
    label: 'InnoDB로 변환',
    description: `${currentEngine} 엔진을 InnoDB로 변환합니다. 트랜잭션 지원, 행 수준 잠금 등 향상.`,
    sqlTemplate: `ALTER TABLE ${escapedTable} ENGINE=InnoDB;`,
    isRecommended: false,
    effort: 'medium',
    risk: 'medium',
    impact: '대용량 테이블의 경우 변환에 시간 소요. FULLTEXT 인덱스 동작이 약간 다를 수 있음.',
    reversibility: 'reversible',
    rollbackTemplate: `ALTER TABLE ${escapedTable} ENGINE=${currentEngine};`,
  });

  // Option B: Skip (keep current engine)
  options.push({
    strategy: 'skip',
    label: `${currentEngine} 유지`,
    description: `현재 엔진을 유지합니다.`,
    sqlTemplate: null,
    isRecommended: false,
    effort: 'low',
    risk: 'medium',
    impact: '기능적 제한 (트랜잭션 미지원 등)은 유지. 향후 버전에서 제거될 수 있음.',
    reversibility: 'reversible',
  });

  return options;
}
