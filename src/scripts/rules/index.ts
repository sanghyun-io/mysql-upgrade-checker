/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules
 * Barrel export for all rule modules
 * Based on MySQL Shell util.checkForServerUpgrade() official 47 checks
 * Reference: https://dev.mysql.com/doc/mysql-shell/8.4/en/mysql-shell-utilities-upgrade.html
 */

import type { CompatibilityRule } from '../types';

// Import all rule modules
import { removedSysVarsRules, newDefaultVarsRules } from './sysvar';
import { reservedKeywordsRules } from './naming';
import { authenticationRules } from './auth';
import { invalidPrivilegesRules } from './privilege';
import { storageEngineRules } from './storage';
import { invalidObjectsRules } from './schema';
import { dataIntegrityRules } from './data';

// ============================================================================
// EXPORT: Combined Rules Array
// ============================================================================
export const compatibilityRules: CompatibilityRule[] = [
  ...removedSysVarsRules,
  ...newDefaultVarsRules,
  ...reservedKeywordsRules,
  ...authenticationRules,
  ...invalidPrivilegesRules,
  ...storageEngineRules,
  ...invalidObjectsRules,
  ...dataIntegrityRules
];

// ============================================================================
// EXPORT: Rules by Category (for UI grouping)
// ============================================================================
export const rulesByCategory = {
  removedSysVars: removedSysVarsRules,
  newDefaultVars: newDefaultVarsRules,
  reservedKeywords: reservedKeywordsRules,
  authentication: authenticationRules,
  invalidPrivileges: invalidPrivilegesRules,
  invalidObjects: [...storageEngineRules, ...invalidObjectsRules],
  dataIntegrity: dataIntegrityRules
};

// ============================================================================
// EXPORT: Rule count for display
// ============================================================================
export const TOTAL_RULE_COUNT = compatibilityRules.length;

// Re-export utility functions for convenience
export { buildWordBoundaryPattern, escapeRegex } from './utils';
