/**
 * Readiness Report Renderer
 *
 * Generates HTML and Markdown readiness reports.
 * All untrusted content is sanitized.
 */

import { escapeHtml, generateCSPMetaTag } from '../security/sanitizer';
import { CATEGORY_LABELS } from '../types';
import type { ReadinessResult, RiskLevel, CategoryBreakdown } from './readiness-score';

// ============================================================================
// HTML Renderer
// ============================================================================

/**
 * Render a standalone HTML readiness report.
 */
export function renderReadinessHTML(result: ReadinessResult, generatedAt: string): string {
  const lines: string[] = [];

  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="ko">');
  lines.push('<head>');
  lines.push('<meta charset="UTF-8">');
  lines.push(generateCSPMetaTag());
  lines.push('<title>MySQL Migration Readiness Report</title>');
  lines.push('<style>');
  lines.push(getStyles());
  lines.push('</style>');
  lines.push('</head>');
  lines.push('<body>');

  // Header
  lines.push('<h1>MySQL Migration Readiness Report</h1>');
  lines.push(`<p class="meta">Generated: ${escapeHtml(generatedAt)}</p>`);

  // Score section
  lines.push(renderScoreSection(result));

  // Disclaimer
  lines.push(`<div class="disclaimer">${escapeHtml(result.disclaimer)}</div>`);

  // Category breakdown
  lines.push(renderCategorySection(result.categoryBreakdown));

  // Fix summary
  lines.push(renderFixSummarySection(result));

  // Pre-flight status
  lines.push(renderPreflightSection(result));

  // Priority issues
  lines.push(renderPrioritySection(result));

  lines.push('</body>');
  lines.push('</html>');
  return lines.join('\n');
}

// ============================================================================
// Markdown Renderer
// ============================================================================

/**
 * Render readiness report as Markdown.
 */
export function renderReadinessMarkdown(result: ReadinessResult, generatedAt: string): string {
  const lines: string[] = [];
  const riskEmoji = getRiskEmoji(result.riskLevel);

  lines.push('# MySQL Migration Readiness Report');
  lines.push('');
  lines.push(`> Generated: ${generatedAt}`);
  lines.push('');

  // Score
  lines.push(`## Readiness Score: ${result.score}/100 ${riskEmoji}`);
  lines.push('');
  lines.push(`**Risk Level**: ${result.riskLevel.toUpperCase()}`);
  lines.push('');
  lines.push(`> ${result.disclaimer}`);
  lines.push('');

  // Category breakdown
  lines.push('## Category Breakdown');
  lines.push('');
  lines.push('| Category | Error | Warning | Info | Total |');
  lines.push('|----------|:-----:|:-------:|:----:|:-----:|');
  for (const cat of result.categoryBreakdown) {
    const label = CATEGORY_LABELS[cat.category] ?? cat.category;
    lines.push(`| ${escapeHtml(label)} | ${cat.errorCount} | ${cat.warningCount} | ${cat.infoCount} | ${cat.total} |`);
  }
  lines.push('');

  // Fix summary
  lines.push('## Fix Strategy Summary');
  lines.push('');
  lines.push(`- Auto-fixable: ${result.fixSummary.autoFixable}`);
  lines.push(`- Manual only: ${result.fixSummary.manualOnly}`);
  lines.push(`- Effort: Low(${result.fixSummary.effortDistribution.low}) / Medium(${result.fixSummary.effortDistribution.medium}) / High(${result.fixSummary.effortDistribution.high})`);
  lines.push('');

  // Pre-flight
  lines.push('## Pre-flight Status');
  lines.push('');
  const pf = result.preflightStatus;
  lines.push(`- Completed: ${pf.completed}/${pf.total}`);
  lines.push(`- Required: ${pf.requiredCompleted}/${pf.requiredTotal}`);
  lines.push(`- All Required Passed: ${pf.allRequiredPassed ? 'Yes' : '**No**'}`);
  lines.push('');

  // Priority issues
  if (result.priorityIssues.length > 0) {
    lines.push('## Top Priority Issues');
    lines.push('');
    for (let i = 0; i < result.priorityIssues.length; i++) {
      const issue = result.priorityIssues[i];
      lines.push(`${i + 1}. **[${issue.severity.toUpperCase()}]** ${escapeHtml(issue.title)}${issue.tableName ? ` (${escapeHtml(issue.tableName)})` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// HTML Section Renderers
// ============================================================================

function renderScoreSection(result: ReadinessResult): string {
  const color = getRiskColor(result.riskLevel);
  const percentage = result.score;

  return `<div class="score-section">
  <div class="score-gauge">
    <div class="score-circle" style="background: conic-gradient(${color} ${percentage * 3.6}deg, #e5e7eb ${percentage * 3.6}deg)">
      <div class="score-inner">
        <span class="score-number">${result.score}</span>
        <span class="score-label">/100</span>
      </div>
    </div>
  </div>
  <div class="risk-badge risk-${result.riskLevel}">${result.riskLevel.toUpperCase()}</div>
</div>`;
}

function renderCategorySection(breakdown: CategoryBreakdown[]): string {
  if (breakdown.length === 0) {
    return '<h2>Category Breakdown</h2><p class="empty">No issues found.</p>';
  }

  const maxTotal = Math.max(...breakdown.map(c => c.total), 1);

  const rows = breakdown.map(cat => {
    const label = CATEGORY_LABELS[cat.category] ?? cat.category;
    const errorBar = cat.errorCount > 0 ? `<span class="bar bar-error" style="width: ${(cat.errorCount / maxTotal) * 100}%">${cat.errorCount}</span>` : '';
    const warnBar = cat.warningCount > 0 ? `<span class="bar bar-warning" style="width: ${(cat.warningCount / maxTotal) * 100}%">${cat.warningCount}</span>` : '';
    const infoBar = cat.infoCount > 0 ? `<span class="bar bar-info" style="width: ${(cat.infoCount / maxTotal) * 100}%">${cat.infoCount}</span>` : '';

    return `<tr>
      <td>${escapeHtml(label)}</td>
      <td class="bar-cell">${errorBar}${warnBar}${infoBar}</td>
      <td class="count">${cat.total}</td>
    </tr>`;
  }).join('\n');

  return `<h2>Category Breakdown</h2>
<table class="category-table">
<tr><th>Category</th><th>Distribution</th><th>Total</th></tr>
${rows}
</table>`;
}

function renderFixSummarySection(result: ReadinessResult): string {
  const fs = result.fixSummary;
  return `<h2>Fix Strategy Summary</h2>
<div class="fix-summary">
  <div class="fix-stat"><span class="fix-number">${fs.autoFixable}</span><span class="fix-label">Auto-fixable</span></div>
  <div class="fix-stat"><span class="fix-number">${fs.manualOnly}</span><span class="fix-label">Manual only</span></div>
  <div class="fix-stat"><span class="fix-number">${fs.effortDistribution.low}</span><span class="fix-label">Low effort</span></div>
  <div class="fix-stat"><span class="fix-number">${fs.effortDistribution.medium}</span><span class="fix-label">Medium effort</span></div>
  <div class="fix-stat"><span class="fix-number">${fs.effortDistribution.high}</span><span class="fix-label">High effort</span></div>
</div>`;
}

function renderPreflightSection(result: ReadinessResult): string {
  const pf = result.preflightStatus;
  const statusClass = pf.allRequiredPassed ? 'preflight-ok' : 'preflight-warn';

  return `<h2>Pre-flight Status</h2>
<div class="preflight ${statusClass}">
  <p>Completed: ${pf.completed}/${pf.total} | Required: ${pf.requiredCompleted}/${pf.requiredTotal}</p>
  ${!pf.allRequiredPassed ? '<p class="warning">Required pre-flight checks incomplete. Complete them before migration.</p>' : ''}
</div>`;
}

function renderPrioritySection(result: ReadinessResult): string {
  if (result.priorityIssues.length === 0) {
    return '<h2>Top Priority Issues</h2><p class="empty">No issues to resolve.</p>';
  }

  const items = result.priorityIssues.map((issue) => {
    const badge = `<span class="severity-badge severity-${issue.severity}">${issue.severity.toUpperCase()}</span>`;
    const table = issue.tableName ? ` <span class="table-name">(${escapeHtml(issue.tableName)})</span>` : '';
    return `<li>${badge} ${escapeHtml(issue.title)}${table}</li>`;
  }).join('\n');

  return `<h2>Top Priority Issues</h2>
<ol class="priority-list">${items}</ol>`;
}

// ============================================================================
// Style Helpers
// ============================================================================

function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'low': return '#22c55e';
    case 'medium': return '#f59e0b';
    case 'high': return '#f97316';
    case 'critical': return '#dc2626';
  }
}

function getRiskEmoji(level: RiskLevel): string {
  switch (level) {
    case 'low': return '[LOW]';
    case 'medium': return '[MEDIUM]';
    case 'high': return '[HIGH]';
    case 'critical': return '[CRITICAL]';
  }
}

function getStyles(): string {
  return `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #333; }
    h1 { border-bottom: 2px solid #2563eb; padding-bottom: 0.5rem; }
    h2 { color: #1e40af; margin-top: 2rem; }
    .meta { color: #6b7280; font-size: 0.9rem; }
    .score-section { display: flex; align-items: center; gap: 2rem; margin: 2rem 0; }
    .score-gauge { width: 150px; height: 150px; }
    .score-circle { width: 150px; height: 150px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .score-inner { width: 110px; height: 110px; border-radius: 50%; background: white; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .score-number { font-size: 2.5rem; font-weight: bold; color: #1e293b; }
    .score-label { font-size: 0.9rem; color: #64748b; }
    .risk-badge { padding: 0.5rem 1.5rem; border-radius: 8px; font-weight: bold; font-size: 1.2rem; color: white; }
    .risk-low { background: #22c55e; }
    .risk-medium { background: #f59e0b; }
    .risk-high { background: #f97316; }
    .risk-critical { background: #dc2626; }
    .disclaimer { background: #fefce8; border: 1px solid #fbbf24; border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.85rem; color: #92400e; margin: 1rem 0; }
    .category-table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    .category-table th, .category-table td { border: 1px solid #d1d5db; padding: 0.5rem; text-align: left; }
    .category-table th { background: #f3f4f6; }
    .bar-cell { min-width: 200px; }
    .bar { display: inline-block; height: 20px; min-width: 20px; text-align: center; color: white; font-size: 0.75rem; line-height: 20px; }
    .bar-error { background: #dc2626; }
    .bar-warning { background: #f59e0b; }
    .bar-info { background: #3b82f6; }
    .count { text-align: center; font-weight: bold; }
    .fix-summary { display: flex; gap: 1.5rem; flex-wrap: wrap; margin: 1rem 0; }
    .fix-stat { text-align: center; padding: 1rem; background: #f8fafc; border-radius: 8px; min-width: 100px; }
    .fix-number { display: block; font-size: 2rem; font-weight: bold; color: #1e293b; }
    .fix-label { display: block; font-size: 0.8rem; color: #64748b; margin-top: 0.25rem; }
    .preflight { padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .preflight-ok { background: #f0fdf4; border: 1px solid #22c55e; }
    .preflight-warn { background: #fef2f2; border: 1px solid #dc2626; }
    .warning { color: #dc2626; font-weight: 500; }
    .severity-badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 3px; font-size: 0.7rem; font-weight: bold; color: white; }
    .severity-error { background: #dc2626; }
    .severity-warning { background: #f59e0b; }
    .severity-info { background: #3b82f6; }
    .table-name { color: #6b7280; font-size: 0.9rem; }
    .priority-list { padding-left: 1.5rem; }
    .priority-list li { margin: 0.5rem 0; }
    .empty { color: #9ca3af; font-style: italic; }
    @media print { body { max-width: 100%; } .score-section { page-break-inside: avoid; } }
  `;
}
