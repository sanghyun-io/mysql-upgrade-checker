/**
 * Report Module
 *
 * Barrel export for readiness report generation.
 */

export { calculateReadiness, scoreToRiskLevel } from './readiness-score';
export type { ReadinessResult, RiskLevel, CategoryBreakdown, FixSummary, PreflightStatus } from './readiness-score';

export { renderReadinessHTML, renderReadinessMarkdown } from './readiness-renderer';
