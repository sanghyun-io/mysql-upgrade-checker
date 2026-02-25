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
 * Sanitize a string for safe insertion into a SQL line comment (-- ...).
 * Removes newlines and control characters that could break out of a comment
 * and inject executable SQL on subsequent lines.
 *
 * Example attack prevented:
 *   title = "foo\nDROP TABLE users; --"
 *   Without sanitization → "-- foo\nDROP TABLE users; --" (DROP executes!)
 *   With sanitization    → "-- foo DROP TABLE users; --" (stays a comment)
 */
export function sanitizeSQLComment(text: string): string {
  if (!text) return '';
  // Remove newlines and control characters (U+0000–U+001F) that could break
  // out of a single-line SQL comment, replacing them with a space.
  return text.replace(/[\r\n\x00-\x1f]/g, ' ').trim();
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
