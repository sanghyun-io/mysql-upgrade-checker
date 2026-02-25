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
 * Escapes embedded single quotes by doubling them.
 *
 * @example
 * escapeStringValue("O'Brien")  // => "'O''Brien'"
 * escapeStringValue('normal')   // => "'normal'"
 */
export function escapeStringValue(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}
