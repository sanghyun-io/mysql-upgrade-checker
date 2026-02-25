/**
 * Plan Renderer
 *
 * Renders a MigrationPlan into Markdown and SQL formats.
 * All untrusted content is sanitized via escapeHtml.
 */

import { escapeHtml, sanitizeSqlForDisplay, generateCSPMetaTag, sanitizeSQLComment } from '../security/sanitizer';
import type { MigrationPlan, MigrationPhase, PlanStep, PlanSummary } from './plan-generator';

// ============================================================================
// Markdown Renderer
// ============================================================================

/**
 * Render a MigrationPlan as a Markdown string.
 */
export function renderPlanAsMarkdown(plan: MigrationPlan): string {
  const lines: string[] = [];

  lines.push('# MySQL Upgrade Migration Plan');
  lines.push('');
  lines.push(`> Generated: ${escapeHtml(plan.generatedAt)}`);
  lines.push(`> Total Issues: ${plan.totalIssues} | Fixable: ${plan.fixableIssues}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(renderSummaryMarkdown(plan.summary));
  lines.push('');

  // Phases
  for (const phase of plan.phases) {
    lines.push(renderPhaseMarkdown(phase));
    lines.push('');
  }

  return lines.join('\n');
}

function renderSummaryMarkdown(summary: PlanSummary): string {
  const lines: string[] = [];

  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Tables Affected | ${summary.tablesAffected} |`);
  lines.push(`| Reversible Fixes | ${summary.reversibleCount} |`);
  lines.push(`| Partially Reversible | ${summary.partiallyReversibleCount} |`);
  lines.push(`| Manual Only | ${summary.manualOnlyCount} |`);
  lines.push(`| Cyclic Dependencies | ${summary.hasCyclicDependencies ? 'Yes' : 'No'} |`);
  lines.push(`| FK Disable Required | ${summary.needsFKDisable ? 'Yes' : 'No'} |`);

  return lines.join('\n');
}

function renderPhaseMarkdown(phase: MigrationPhase): string {
  const lines: string[] = [];

  lines.push(`## ${escapeHtml(phase.title)}`);
  lines.push('');
  lines.push(escapeHtml(phase.description));
  lines.push('');

  if (phase.steps.length === 0) {
    lines.push('*No steps in this phase.*');
    return lines.join('\n');
  }

  for (const step of phase.steps) {
    lines.push(renderStepMarkdown(step));
    lines.push('');
  }

  return lines.join('\n');
}

function renderStepMarkdown(step: PlanStep): string {
  const lines: string[] = [];
  const icon = getStepIcon(step);
  const requiredBadge = step.required ? ' **[REQUIRED]**' : '';
  const severityBadge = step.severity ? ` \`${step.severity}\`` : '';

  lines.push(`### ${icon} Step ${step.order}: ${escapeHtml(step.title)}${requiredBadge}${severityBadge}`);
  lines.push('');
  lines.push(escapeHtml(step.description));

  if (step.sql) {
    lines.push('');
    lines.push('```sql');
    lines.push(step.sql);
    lines.push('```');
  }

  if (step.rollback) {
    lines.push('');
    lines.push(`**Reversibility**: \`${step.rollback.reversibility}\``);
    if (step.rollback.warning) {
      lines.push(`> ${escapeHtml(step.rollback.warning)}`);
    }
    if (step.rollback.rollbackSQL) {
      lines.push('');
      lines.push('**Rollback SQL:**');
      lines.push('```sql');
      lines.push(step.rollback.rollbackSQL);
      lines.push('```');
    }
  }

  return lines.join('\n');
}

function getStepIcon(step: PlanStep): string {
  switch (step.type) {
    case 'check': return '[CHECK]';
    case 'query': return '[SQL]';
    case 'action': return '[ACTION]';
    case 'info': return '[INFO]';
    default: return '[-]';
  }
}

// ============================================================================
// SQL Script Renderer
// ============================================================================

/**
 * Extract all SQL statements from the plan as a single script.
 * Includes comments with step titles and rollback SQL.
 */
export function renderPlanAsSQL(plan: MigrationPlan): string {
  const lines: string[] = [];

  lines.push('-- ============================================================================');
  lines.push('-- MySQL Upgrade Migration Script');
  lines.push(`-- Generated: ${plan.generatedAt}`);
  lines.push(`-- Total Issues: ${plan.totalIssues} | Fixable: ${plan.fixableIssues}`);
  lines.push('-- ============================================================================');
  lines.push('');

  for (const phase of plan.phases) {
    const sqlSteps = phase.steps.filter(s => s.sql);
    if (sqlSteps.length === 0) continue;

    lines.push(`-- Phase: ${sanitizeSQLComment(phase.title)}`);
    lines.push(`-- ${sanitizeSQLComment(phase.description)}`);
    lines.push('-- ----------------------------------------------------------------------------');
    lines.push('');

    for (const step of sqlSteps) {
      lines.push(`-- Step ${step.order}: ${sanitizeSQLComment(step.title)}`);
      if (step.severity) {
        lines.push(`-- Severity: ${sanitizeSQLComment(step.severity)}`);
      }
      lines.push(step.sql!);
      lines.push('');

      if (step.rollback?.rollbackSQL) {
        lines.push(`-- Rollback for Step ${step.order}:`);
        // Rollback SQL is rendered as commented-out lines; sanitize each line
        // to prevent newline injection from breaking out of comments.
        const rollbackLines = step.rollback.rollbackSQL.split('\n');
        for (const rollbackLine of rollbackLines) {
          lines.push(`-- ${sanitizeSQLComment(rollbackLine)}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// HTML Renderer
// ============================================================================

/**
 * Render a MigrationPlan as a standalone HTML page.
 * Includes CSP meta tag and all content sanitized.
 */
export function renderPlanAsHTML(plan: MigrationPlan): string {
  const lines: string[] = [];

  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="ko">');
  lines.push('<head>');
  lines.push('<meta charset="UTF-8">');
  lines.push(generateCSPMetaTag());
  lines.push('<title>MySQL Upgrade Migration Plan</title>');
  lines.push('<style>');
  lines.push(getHTMLStyles());
  lines.push('</style>');
  lines.push('</head>');
  lines.push('<body>');

  lines.push('<h1>MySQL Upgrade Migration Plan</h1>');
  lines.push(`<p class="meta">Generated: ${escapeHtml(plan.generatedAt)} | Total Issues: ${plan.totalIssues} | Fixable: ${plan.fixableIssues}</p>`);

  // Summary table
  lines.push('<h2>Summary</h2>');
  lines.push(renderSummaryHTML(plan.summary));

  // Phases
  for (const phase of plan.phases) {
    lines.push(renderPhaseHTML(phase));
  }

  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

function renderSummaryHTML(summary: PlanSummary): string {
  return `<table class="summary">
<tr><th>Metric</th><th>Value</th></tr>
<tr><td>Tables Affected</td><td>${summary.tablesAffected}</td></tr>
<tr><td>Reversible Fixes</td><td>${summary.reversibleCount}</td></tr>
<tr><td>Partially Reversible</td><td>${summary.partiallyReversibleCount}</td></tr>
<tr><td>Manual Only</td><td>${summary.manualOnlyCount}</td></tr>
<tr><td>Cyclic Dependencies</td><td>${summary.hasCyclicDependencies ? 'Yes' : 'No'}</td></tr>
<tr><td>FK Disable Required</td><td>${summary.needsFKDisable ? 'Yes' : 'No'}</td></tr>
</table>`;
}

function renderPhaseHTML(phase: MigrationPhase): string {
  const lines: string[] = [];

  lines.push(`<div class="phase">`);
  lines.push(`<h2>${escapeHtml(phase.title)}</h2>`);
  lines.push(`<p class="phase-desc">${escapeHtml(phase.description)}</p>`);

  if (phase.steps.length === 0) {
    lines.push('<p class="empty">No steps in this phase.</p>');
  } else {
    for (const step of phase.steps) {
      lines.push(renderStepHTML(step));
    }
  }

  lines.push('</div>');
  return lines.join('\n');
}

function renderStepHTML(step: PlanStep): string {
  const lines: string[] = [];
  const severityClass = step.severity ? ` severity-${step.severity}` : '';
  const requiredLabel = step.required ? '<span class="badge required">REQUIRED</span>' : '';

  lines.push(`<div class="step${severityClass}">`);
  lines.push(`<h3>Step ${step.order}: ${escapeHtml(step.title)} ${requiredLabel}</h3>`);
  lines.push(`<p>${escapeHtml(step.description)}</p>`);

  if (step.sql) {
    lines.push(`<pre class="sql"><code>${sanitizeSqlForDisplay(step.sql)}</code></pre>`);
  }

  if (step.rollback) {
    lines.push(`<div class="rollback">`);
    lines.push(`<span class="badge reversibility">${escapeHtml(step.rollback.reversibility)}</span>`);
    if (step.rollback.warning) {
      lines.push(`<p class="warning">${escapeHtml(step.rollback.warning)}</p>`);
    }
    if (step.rollback.rollbackSQL) {
      lines.push(`<details><summary>Rollback SQL</summary>`);
      lines.push(`<pre class="sql"><code>${sanitizeSqlForDisplay(step.rollback.rollbackSQL)}</code></pre>`);
      lines.push(`</details>`);
    }
    lines.push('</div>');
  }

  lines.push('</div>');
  return lines.join('\n');
}

function getHTMLStyles(): string {
  return `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #333; }
    h1 { border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; }
    h2 { color: #1e40af; margin-top: 2rem; }
    .meta { color: #6b7280; font-size: 0.9rem; }
    .summary { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    .summary th, .summary td { border: 1px solid #d1d5db; padding: 0.5rem 1rem; text-align: left; }
    .summary th { background: #f3f4f6; }
    .phase { margin: 1.5rem 0; }
    .phase-desc { color: #6b7280; }
    .step { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin: 0.75rem 0; }
    .step.severity-error { border-left: 4px solid #dc2626; }
    .step.severity-warning { border-left: 4px solid #f59e0b; }
    .step.severity-info { border-left: 4px solid #3b82f6; }
    .sql { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .badge.required { background: #fee2e2; color: #dc2626; }
    .badge.reversibility { background: #dbeafe; color: #1e40af; }
    .rollback { margin-top: 0.5rem; padding: 0.5rem; background: #f8fafc; border-radius: 4px; }
    .warning { color: #b45309; font-style: italic; }
    .empty { color: #9ca3af; font-style: italic; }
    details { margin-top: 0.5rem; }
    summary { cursor: pointer; color: #2563eb; }
  `;
}
