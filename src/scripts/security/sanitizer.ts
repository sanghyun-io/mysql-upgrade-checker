/**
 * Sanitizer - Security utilities for rendering untrusted content.
 *
 * All untrusted values (SQL from user input, server query results, file names)
 * MUST be passed through escapeHtml() before insertion into DOM or HTML strings.
 *
 * This module is pure (no DOM dependency) so it works in both browser and test environments.
 */

/** HTML entity map for the 5 critical characters */
const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const HTML_ESCAPE_RE = /[&<>"']/g;

/**
 * Escape HTML special characters to prevent XSS.
 * Converts &, <, >, ", ' to their HTML entity equivalents.
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(HTML_ESCAPE_RE, (char) => HTML_ENTITY_MAP[char] || char);
}

/**
 * Strip all HTML tags from a string.
 * Use when you need plain text output from potentially HTML-contaminated input.
 */
export function stripHtmlTags(input: string): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize a SQL string for safe display in HTML.
 * Escapes HTML entities but preserves SQL formatting (newlines, spaces).
 */
export function sanitizeSqlForDisplay(sql: string): string {
  return escapeHtml(sql);
}

/**
 * Generate a Content-Security-Policy meta tag for standalone HTML reports.
 * Restricts inline scripts and external resource loading.
 */
export function generateCSPMetaTag(): string {
  return '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:;">';
}

/**
 * Sanitize a filename to prevent path traversal and special character injection.
 * Allows alphanumeric, hyphens, underscores, dots, and spaces.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'unnamed';
  // Remove path separators and null bytes
  const cleaned = filename.replace(/[\\/:\0]/g, '');
  // Only allow safe characters
  const safe = cleaned.replace(/[^a-zA-Z0-9가-힣\-_. ]/g, '_');
  // Prevent directory traversal
  return safe.replace(/\.{2,}/g, '.').trim() || 'unnamed';
}
