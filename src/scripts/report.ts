/**
 * MySQL 8.0 → 8.4 Upgrade Checker - Report Export
 * Generates MySQL Shell compatible reports and export formats
 */

import type { Issue, RuleCategory, AnalysisResults } from './types';

// ============================================================================
// MySQL Shell Compatible Report Format
// ============================================================================

export interface MySQLShellReport {
  serverAddress: string;
  serverVersion: string;
  targetVersion: string;
  timestamp: string;
  detectedProblems: MySQLShellCheck[];
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    notices: number;
  };
}

export interface MySQLShellCheck {
  id: string;
  title: string;
  status: 'OK' | 'WARNING' | 'ERROR' | 'NOTICE';
  description: string;
  detectedProblems: MySQLShellProblem[];
}

export interface MySQLShellProblem {
  level: 'Error' | 'Warning' | 'Notice';
  dbObject: string;
  description: string;
}

/**
 * Generate MySQL Shell compatible report
 */
export function generateMySQLShellReport(
  issues: Issue[],
  metadata?: { totalFiles?: number; analyzedAt?: string }
): MySQLShellReport {
  const timestamp = metadata?.analyzedAt || new Date().toISOString();

  // Group issues by MySQL Shell check ID
  const checkGroups = new Map<string, Issue[]>();

  issues.forEach((issue) => {
    const checkId = issue.mysqlShellCheckId || 'other';
    if (!checkGroups.has(checkId)) {
      checkGroups.set(checkId, []);
    }
    checkGroups.get(checkId)!.push(issue);
  });

  // Create checks
  const detectedProblems: MySQLShellCheck[] = [];

  checkGroups.forEach((groupIssues, checkId) => {
    const firstIssue = groupIssues[0];
    const status =
      groupIssues.some(i => i.severity === 'error') ? 'ERROR' :
      groupIssues.some(i => i.severity === 'warning') ? 'WARNING' : 'NOTICE';

    const check: MySQLShellCheck = {
      id: checkId,
      title: firstIssue.title,
      status,
      description: firstIssue.description,
      detectedProblems: groupIssues.map((issue) => ({
        level: issue.severity === 'error' ? 'Error' : issue.severity === 'warning' ? 'Warning' : 'Notice',
        dbObject: issue.location || issue.tableName || issue.objectName || 'Unknown',
        description: issue.suggestion
      }))
    };

    detectedProblems.push(check);
  });

  // Calculate summary
  const summary = {
    totalIssues: issues.length,
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    notices: issues.filter(i => i.severity === 'info').length
  };

  return {
    serverAddress: 'dump-file-analysis',
    serverVersion: '8.0.x',
    targetVersion: '8.4',
    timestamp,
    detectedProblems,
    summary
  };
}

/**
 * Generate CSV format report
 */
export function generateCSVReport(issues: Issue[]): string {
  const headers = [
    'Category',
    'Severity',
    'Title',
    'Description',
    'Location',
    'Code',
    'Suggestion',
    'MySQL Shell Check ID'
  ];

  const rows = issues.map((issue) => [
    issue.category || '',
    issue.severity,
    issue.title,
    issue.description,
    issue.location || '',
    issue.code ? issue.code.replace(/"/g, '""') : '',
    issue.suggestion,
    issue.mysqlShellCheckId || ''
  ]);

  // CSV escaping
  const escapeCSV = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csvLines = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(','))
  ];

  return csvLines.join('\n');
}

/**
 * Generate JSON format report (detailed)
 */
export function generateJSONReport(results: AnalysisResults): string {
  return JSON.stringify(results, null, 2);
}

/**
 * Generate SQL fix queries file
 */
export function generateFixQueriesSQL(issues: Issue[]): string {
  const fixableIssues = issues.filter(i => i.fixQuery);

  if (fixableIssues.length === 0) {
    return '-- No automatic fixes available\n';
  }

  const lines: string[] = [
    '-- MySQL 8.0 → 8.4 Upgrade Fix Queries',
    '-- Generated: ' + new Date().toISOString(),
    '-- Total fixes: ' + fixableIssues.length,
    '',
    '-- WARNING: Review these queries carefully before executing!',
    '-- Backup your data before running any modifications.',
    '',
    'START TRANSACTION;',
    ''
  ];

  // Group by category
  const categoryGroups = new Map<RuleCategory, Issue[]>();
  fixableIssues.forEach((issue) => {
    const category = issue.category || 'invalidObjects';
    if (!categoryGroups.has(category)) {
      categoryGroups.set(category, []);
    }
    categoryGroups.get(category)!.push(issue);
  });

  categoryGroups.forEach((categoryIssues, category) => {
    const categoryLabel = getCategoryLabel(category);
    lines.push('-- ============================================================================');
    lines.push(`-- ${categoryLabel}`);
    lines.push('-- ============================================================================');
    lines.push('');

    categoryIssues.forEach((issue, index) => {
      lines.push(`-- Fix ${index + 1}: ${issue.title}`);
      if (issue.location) {
        lines.push(`-- Location: ${issue.location}`);
      }
      lines.push(issue.fixQuery!);
      lines.push('');
    });
  });

  lines.push('-- Review the changes above, then commit or rollback:');
  lines.push('-- COMMIT;');
  lines.push('-- ROLLBACK;');

  return lines.join('\n');
}

/**
 * Get category label
 */
function getCategoryLabel(category: RuleCategory): string {
  const labels: Record<RuleCategory, string> = {
    removedSysVars: 'Removed System Variables',
    newDefaultVars: 'New Default Values',
    reservedKeywords: 'Reserved Keywords',
    authentication: 'Authentication',
    invalidPrivileges: 'Invalid Privileges',
    invalidObjects: 'Invalid Objects',
    dataIntegrity: 'Data Integrity'
  };
  return labels[category] || category;
}

/**
 * Download file to browser
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
