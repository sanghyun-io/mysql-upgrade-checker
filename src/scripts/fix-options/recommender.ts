/**
 * Auto-Recommendation Engine
 *
 * Selects the best fix option based on issue context (nullable, FK relationships, etc.)
 * Ported from TunnelForge AutoRecommendationEngine logic.
 */

import type { FixOption } from '../domain/fix-option';
import type { Issue } from '../types';

/**
 * Apply auto-recommendation to a list of fix options for an issue.
 * Sets isRecommended=true on the best option.
 * Returns the same array (mutated).
 */
export function applyRecommendation(issue: Issue, options: FixOption[]): FixOption[] {
  if (options.length === 0) return options;

  // Reset all recommendations
  for (const opt of options) opt.isRecommended = false;

  const recommendedIdx = selectRecommendedIndex(issue, options);
  if (recommendedIdx >= 0 && recommendedIdx < options.length) {
    options[recommendedIdx].isRecommended = true;
  }

  return options;
}

function selectRecommendedIndex(issue: Issue, options: FixOption[]): number {
  const issueId = issue.id;

  // === Invalid Date Fix ===
  if (issueId === 'invalid_date_zero' || issueId === 'invalid_datetime_zero') {
    const isNullable = issue.columnContext?.nullable ?? false;
    if (isNullable) {
      // Nullable column → recommend NULL
      return options.findIndex(o => o.strategy === 'date_to_null');
    } else {
      // NOT NULL column → recommend minimum date
      return options.findIndex(o => o.strategy === 'date_to_min');
    }
  }

  // === Charset Fix ===
  if (issueId === 'utf8_charset' || issueId === 'fk_charset_mismatch') {
    const hasFKRelations = (issue.fkContext?.relatedTables?.length ?? 0) > 0;
    if (hasFKRelations) {
      // FK relationships → recommend safe conversion
      return options.findIndex(o => o.strategy === 'collation_fk_safe');
    } else {
      // No FK → recommend simple single conversion
      return options.findIndex(o => o.strategy === 'collation_single');
    }
  }

  // === Engine Fix ===
  if (issueId === 'myisam_engine' || issueId === 'deprecated_engine') {
    return options.findIndex(o => o.strategy === 'engine_convert');
  }

  // === Auth Fix ===
  if (issueId === 'mysql_native_password' || issueId === 'sha256_password' || issueId === 'authentication_fido') {
    return options.findIndex(o => o.strategy === 'auth_change');
  }

  // === Type Fix (FLOAT/DOUBLE precision) ===
  if (issueId === 'float_double_precision') {
    // Recommend keeping FLOAT/DOUBLE (removing precision spec) as the simpler option
    return 0;
  }

  // === Reserved Keywords ===
  if (issueId === 'reserved_keyword_table_parsed' || issueId === 'reserved_keyword_column_parsed') {
    // Recommend rename (executable DDL). Backtick quoting is a coding guideline, not a DDL fix.
    return options.findIndex(o => o.strategy === 'rename');
  }

  // Default: recommend first option
  return 0;
}
