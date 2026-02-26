/**
 * Fix Resolver
 *
 * Shared logic for selecting which FixOption to use for execution and rollback.
 * Both plan-generator and rollback-generator must use this function so that
 * the executed SQL and the rollback SQL always correspond to the same option.
 */

import type { FixOption } from '../domain/fix-option';

/**
 * Resolve the fix option that will be used for SQL execution and rollback.
 *
 * Resolution order:
 * 1. Recommended option that has a sqlTemplate
 * 2. First option that has a sqlTemplate (fallback)
 * 3. undefined if no option has a sqlTemplate
 *
 * Using this function in both plan-generator and rollback-generator guarantees
 * that the execution SQL and rollback SQL are always generated from the same
 * FixOption, preventing mismatches.
 */
export function resolveFixOption(fixOptions: FixOption[] | undefined): FixOption | undefined {
  if (!fixOptions || fixOptions.length === 0) {
    return undefined;
  }

  // 1. Try recommended option with SQL
  const recommended = fixOptions.find(o => o.isRecommended && o.sqlTemplate);
  if (recommended) return recommended;

  // 2. Fallback: first option with SQL
  const withSql = fixOptions.find(o => o.sqlTemplate);
  return withSql;
}
