/**
 * Server Query Result Parser
 * Parses MySQL server query results in TSV or JSON format
 */

export interface ServerQueryResult {
  columns: string[];
  rows: Record<string, string | number | null>[];
}

/**
 * Parse tab-separated values (TSV) format
 * Expected format: Header line followed by data rows
 */
export function parseTabSeparatedResult(text: string): ServerQueryResult {
  const lines = text.split('\n').filter(line => line.trim());

  if (lines.length === 0) {
    return { columns: [], rows: [] };
  }

  // First line is header
  const columns = lines[0].split('\t').map(col => col.trim());

  // Parse data rows
  const rows: Record<string, string | number | null>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row: Record<string, string | number | null> = {};

    columns.forEach((col, idx) => {
      const value = values[idx]?.trim();

      // Handle NULL
      if (!value || value === 'NULL') {
        row[col] = null;
      }
      // Try to parse as number
      else if (!isNaN(Number(value))) {
        row[col] = Number(value);
      }
      // String value
      else {
        row[col] = value;
      }
    });

    rows.push(row);
  }

  return { columns, rows };
}

/**
 * Parse JSON format
 * Expected format: Array of objects or {columns, rows} structure
 */
export function parseJsonResult(text: string): ServerQueryResult {
  try {
    const data = JSON.parse(text);

    // Format 1: {columns: [...], rows: [...]}
    if (data.columns && Array.isArray(data.columns) && data.rows && Array.isArray(data.rows)) {
      return {
        columns: data.columns,
        rows: data.rows
      };
    }

    // Format 2: Array of objects [{col1: val1, col2: val2}, ...]
    if (Array.isArray(data) && data.length > 0) {
      const columns = Object.keys(data[0]);
      return {
        columns,
        rows: data
      };
    }

    // Empty result
    return { columns: [], rows: [] };
  } catch (error) {
    throw new Error('Invalid JSON format');
  }
}

/**
 * Auto-detect format and parse server query result
 */
export function parseServerResult(text: string): ServerQueryResult {
  const trimmed = text.trim();

  // Try JSON first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return parseJsonResult(trimmed);
    } catch {
      // Fall through to TSV parsing
    }
  }

  // Try TSV
  return parseTabSeparatedResult(trimmed);
}
