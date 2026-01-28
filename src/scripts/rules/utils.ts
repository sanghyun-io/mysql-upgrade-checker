/**
 * MySQL 8.0 → 8.4 Upgrade Compatibility Rules - Utility Functions
 */

/**
 * Escape special regex characters in a string
 * @param str - String to escape
 * @returns Escaped string safe to use in RegExp
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a word-boundary regex pattern from an array of words
 * @param words - Array of words to match
 * @returns RegExp with word boundaries and case-insensitive flag
 */
export function buildWordBoundaryPattern(words: readonly string[]): RegExp {
  const escaped = words.map(w => escapeRegex(w));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}
