/**
 * Rollback Generator
 *
 * Generates rollback SQL for fix operations.
 * Classifies each fix's reversibility.
 */

import type { Reversibility } from '../domain/issue-taxonomy';
import type { FixOption } from '../domain/fix-option';
import type { Issue } from '../types';
import { resolveFixOption } from './fix-resolver';

export interface RollbackEntry {
  /** Original fix SQL */
  fixSQL: string;
  /** Rollback SQL (null if manual_only) */
  rollbackSQL: string | null;
  /** Reversibility classification */
  reversibility: Reversibility;
  /** Warning message for partially_reversible or manual_only */
  warning?: string;
}

/**
 * Generate rollback info for an issue's recommended fix option.
 */
export function generateRollbackEntry(issue: Issue): RollbackEntry | null {
  // Use the same option resolution as plan-generator to ensure consistency
  const fixOption = resolveFixOption(issue.fixOptions);

  if (fixOption) {
    return rollbackFromFixOption(fixOption);
  }

  // Fallback: use existing fixQuery
  if (issue.fixQuery) {
    return {
      fixSQL: issue.fixQuery,
      rollbackSQL: null,
      reversibility: 'manual_only',
      warning: '자동 rollback이 제공되지 않습니다. 백업에서 복원하세요.',
    };
  }

  return null;
}

function rollbackFromFixOption(option: FixOption): RollbackEntry {
  const result: RollbackEntry = {
    fixSQL: option.sqlTemplate ?? '',
    rollbackSQL: option.rollbackTemplate ?? null,
    reversibility: option.reversibility,
  };

  switch (option.reversibility) {
    case 'partially_reversible':
      result.warning = 'BACKUP REQUIRED: 완전한 롤백이 보장되지 않습니다. 실행 전 반드시 백업하세요.';
      break;
    case 'manual_only':
      result.warning = '자동 rollback이 불가능합니다. 백업에서 수동 복원이 필요합니다.';
      break;
  }

  return result;
}
