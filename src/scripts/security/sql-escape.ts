/**
 * SQL Escape Utilities
 *
 * Provides safe escaping for MySQL identifiers (table names, column names,
 * user names) and string values embedded in SQL templates.
 *
 * All untrusted identifier values MUST be passed through escapeIdentifier()
 * before embedding in SQL strings to prevent SQL injection via malicious
 * dump files.
 */

/**
 * Escape a MySQL identifier (table, column, database, user name) for safe SQL embedding.
 * Wraps the identifier in backticks and escapes any embedded backticks by doubling them.
 *
 * @example
 * escapeIdentifier('users')           // => '`users`'
 * escapeIdentifier('my`table')        // => '`my``table`'
 * escapeIdentifier('users; DROP TABLE') // => '`users; DROP TABLE`'
 */
export function escapeIdentifier(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`';
}

/**
 * Escape a string value for SQL (single-quote delimited).
 * Implements full MySQL string literal escaping per the MySQL manual:
 * https://dev.mysql.com/doc/refman/8.0/en/string-literals.html
 *
 * Escapes (in order):
 *  1. Backslashes (must come first to avoid double-escaping subsequent replacements)
 *  2. Single quotes
 *  3. Null byte (\0)
 *  4. Newline (\n)
 *  5. Carriage return (\r)
 *  6. Ctrl+Z / EOF on Windows (\x1a → \Z)
 *
 * @example
 * escapeStringValue("O'Brien")       // => "'O\\'Brien'"
 * escapeStringValue('normal')        // => "'normal'"
 * escapeStringValue('test\\host')    // => "'test\\\\host'"
 */
export function escapeStringValue(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')    // backslash first (before other replacements)
    .replace(/'/g, "\\'")      // single quote
    .replace(/\0/g, '\\0')    // null byte
    .replace(/\n/g, '\\n')    // newline
    .replace(/\r/g, '\\r')    // carriage return
    .replace(/\x1a/g, '\\Z'); // Ctrl+Z (EOF on Windows)
  return "'" + escaped + "'";
}
