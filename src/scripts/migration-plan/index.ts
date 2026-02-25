/**
 * Migration Plan Module
 *
 * Barrel export for the migration plan generator.
 */

export { generateMigrationPlan } from './plan-generator';
export type { MigrationPlan, MigrationPhase, PlanStep, PlanSummary } from './plan-generator';

export { computeExecutionOrder } from './execution-order';
export type { OrderedFixGroup } from './execution-order';

export { generateRollbackEntry } from './rollback-generator';
export type { RollbackEntry } from './rollback-generator';

export { renderPlanAsMarkdown, renderPlanAsSQL, renderPlanAsHTML } from './plan-renderer';
