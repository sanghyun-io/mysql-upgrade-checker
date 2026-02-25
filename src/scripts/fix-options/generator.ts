/**
 * Fix Option Generator
 *
 * Central registry that generates multi-option fix strategies for issues.
 * Acts as a service layer: rules emit issue facts, this module produces fix options.
 *
 * Backward compatible: issues with existing generateFixQuery still work.
 * Issues without a specific strategy get their existing fix query wrapped as a single option.
 */

import type { FixOption } from '../domain/fix-option';
import type { Issue } from '../types';
import { generateDateFixOptions } from './strategies/date-fix';
import { generateCharsetFixOptions } from './strategies/charset-fix';
import { generateTypeFixOptions } from './strategies/type-fix';
import { generateEngineFixOptions } from './strategies/engine-fix';
import { generateKeywordFixOptions } from './strategies/keyword-fix';
import { generateAuthFixOptions } from './strategies/auth-fix';
import { applyRecommendation } from './recommender';

/** Map of issue ID patterns to strategy generators */
const STRATEGY_REGISTRY: Array<{
  match: (issueId: string) => boolean;
  generate: (issue: Issue) => FixOption[];
}> = [
  {
    match: (id) => id === 'invalid_date_zero' || id === 'invalid_datetime_zero',
    generate: generateDateFixOptions,
  },
  {
    match: (id) => id === 'utf8_charset' || id === 'fk_charset_mismatch',
    generate: generateCharsetFixOptions,
  },
  {
    match: (id) => id === 'float_double_precision',
    generate: generateTypeFixOptions,
  },
  {
    match: (id) => id === 'myisam_engine' || id === 'deprecated_engine',
    generate: generateEngineFixOptions,
  },
  {
    match: (id) => id === 'reserved_keyword_table_parsed' || id === 'reserved_keyword_column_parsed',
    generate: generateKeywordFixOptions,
  },
  {
    match: (id) => id === 'mysql_native_password' || id === 'sha256_password' || id === 'authentication_fido',
    generate: generateAuthFixOptions,
  },
];

/**
 * Generate fix options for a single issue.
 * If no strategy matches, falls back to wrapping the existing fixQuery.
 */
export function generateFixOptions(issue: Issue): FixOption[] {
  // Try strategy registry first
  for (const entry of STRATEGY_REGISTRY) {
    if (entry.match(issue.id)) {
      const options = entry.generate(issue);
      return applyRecommendation(issue, options);
    }
  }

  // Fallback: wrap existing fixQuery as a single option
  if (issue.fixQuery) {
    return [{
      strategy: 'manual',
      label: '수정 쿼리 실행',
      description: '자동 생성된 수정 쿼리를 실행합니다.',
      sqlTemplate: issue.fixQuery,
      isRecommended: true,
      effort: 'low',
      risk: 'low',
      impact: '단일 fix 쿼리 실행',
      reversibility: 'manual_only',
    }];
  }

  return [];
}

/**
 * Enrich all issues in the results with fix options.
 * Call this after analysis is complete and issues have context (fkContext, columnContext).
 */
export function enrichIssuesWithFixOptions(issues: Issue[]): void {
  for (const issue of issues) {
    if (!issue.fixOptions || issue.fixOptions.length === 0) {
      const options = generateFixOptions(issue);
      if (options.length > 0) {
        issue.fixOptions = options;
      }
    }
  }
}
