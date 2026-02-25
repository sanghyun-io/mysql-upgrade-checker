/**
 * Issue Taxonomy - Single source of truth for issue types, severities, categories, and fix strategies.
 *
 * These types extend (not replace) the existing types in ../types.ts.
 * Existing code continues to use Severity, RuleCategory, etc. as before.
 * New modules (fix-options, migration-plan, etc.) use these domain types.
 */

// Re-export existing severity for convenience
export type { Severity } from '../types';

/**
 * Fix strategy identifiers.
 * Each strategy maps to a specific SQL transformation pattern.
 */
export type FixStrategy =
  | 'date_to_null'
  | 'date_to_min'
  | 'date_to_custom'
  | 'collation_single'
  | 'collation_fk_cascade'
  | 'collation_fk_safe'
  | 'type_change'
  | 'engine_convert'
  | 'rename'
  | 'backtick_quote'
  | 'remove_attribute'
  | 'auth_change'
  | 'manual'
  | 'skip';

/**
 * Reversibility classification for fix operations.
 * Used by rollback-generator to determine what kind of rollback SQL to produce.
 */
export type Reversibility =
  | 'reversible'            // Exact rollback SQL available
  | 'partially_reversible'  // Conditional rollback + BACKUP REQUIRED warning
  | 'manual_only';          // No rollback SQL, manual restore guide only

/**
 * Effort level for a fix operation.
 */
export type EffortLevel = 'low' | 'medium' | 'high';

/**
 * Risk level for a fix operation.
 */
export type RiskLevel = 'low' | 'medium' | 'high';
