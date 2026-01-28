/**
 * MySQL Table Schema Parser
 * Parses CREATE TABLE statements to extract structured schema information
 */

import type { TableInfo, ColumnInfo, IndexInfo, ForeignKeyInfo, PartitionInfo } from '../types';

/**
 * Parse a CREATE TABLE statement into structured TableInfo
 */
export function parseCreateTable(sql: string): TableInfo | null {
  // Normalize SQL
  const trimmedSql = sql.trim();

  // Match table name first
  const nameMatch = trimmedSql.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|(\w+))/i
  );

  if (!nameMatch) {
    return null;
  }

  const tableName = nameMatch[1] || nameMatch[2];

  // Find the table body between first ( and matching )
  const bodyStart = trimmedSql.indexOf('(', nameMatch.index! + nameMatch[0].length);
  if (bodyStart === -1) {
    return null;
  }

  // Find matching closing parenthesis
  let depth = 1;
  let bodyEnd = bodyStart + 1;
  while (bodyEnd < trimmedSql.length && depth > 0) {
    if (trimmedSql[bodyEnd] === '(') depth++;
    if (trimmedSql[bodyEnd] === ')') depth--;
    bodyEnd++;
  }

  if (depth !== 0) {
    return null;
  }

  const tableBody = trimmedSql.substring(bodyStart + 1, bodyEnd - 1);
  const tableOptions = trimmedSql.substring(bodyEnd).trim();

  const table: TableInfo = {
    name: tableName,
    columns: parseColumns(tableBody),
    indexes: parseIndexes(tableBody),
    foreignKeys: parseForeignKeys(tableBody),
    partitions: parsePartitions(tableOptions)
  };

  // Parse table options (ENGINE, CHARSET, COLLATION)
  const engineMatch = tableOptions.match(/ENGINE\s*=\s*(\w+)/i);
  if (engineMatch) {
    table.engine = engineMatch[1];
  }

  const charsetMatch = tableOptions.match(/(?:DEFAULT\s+)?CHARSET\s*=\s*(\w+)/i);
  if (charsetMatch) {
    table.charset = charsetMatch[1];
  }

  const collationMatch = tableOptions.match(/COLLATE\s*=\s*(\w+)/i);
  if (collationMatch) {
    table.collation = collationMatch[1];
  }

  // Parse table-level TABLESPACE (before PARTITION BY clause)
  const tablespaceMatch = tableOptions.match(/TABLESPACE\s*=?\s*[`'"]*(\w+)[`'"]*/i);
  if (tablespaceMatch) {
    table.tablespace = tablespaceMatch[1];
  }

  return table;
}

/**
 * Parse column definitions from CREATE TABLE body
 */
function parseColumns(tableBody: string): ColumnInfo[] {
  const columns: ColumnInfo[] = [];

  // Split by commas, but be careful with nested parentheses (ENUM, SET, etc.)
  const lines = splitTableDefinitions(tableBody);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip constraint definitions (PRIMARY KEY, FOREIGN KEY, KEY, INDEX, etc.)
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|KEY|INDEX|UNIQUE|CONSTRAINT|CHECK)/i.test(trimmed)) {
      continue;
    }

    const column = parseColumnDefinition(trimmed);
    if (column) {
      columns.push(column);
    }
  }

  return columns;
}

/**
 * Parse a single column definition
 */
function parseColumnDefinition(definition: string): ColumnInfo | null {
  // Match: `column_name` TYPE [NOT NULL] [DEFAULT value] [AUTO_INCREMENT] [GENERATED ...]
  // First, extract column name
  const nameMatch = definition.match(/^(?:`([^`]+)`|(\w+))\s+/);
  if (!nameMatch) {
    return null;
  }

  const columnName = nameMatch[1] || nameMatch[2];
  const rest = definition.substring(nameMatch[0].length);

  // Extract type (with parentheses and modifiers)
  const typeMatch = rest.match(/^([A-Z]+(?:\([^)]+\))?(?:\s+(?:UNSIGNED|ZEROFILL|BINARY))?)/i);
  if (!typeMatch) {
    return null;
  }

  const column: ColumnInfo = {
    name: columnName,
    type: typeMatch[1].trim(),
    nullable: !/NOT\s+NULL/i.test(definition)
  };

  // Extract DEFAULT value
  const defaultMatch = definition.match(/DEFAULT\s+('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\w+|\([^)]+\))/i);
  if (defaultMatch) {
    column.default = defaultMatch[1].replace(/^['"]|['"]$/g, '');
  }

  // Extract EXTRA info (AUTO_INCREMENT, ON UPDATE, etc.)
  const extras: string[] = [];
  if (/AUTO_INCREMENT/i.test(definition)) {
    extras.push('AUTO_INCREMENT');
  }
  if (/ON\s+UPDATE\s+CURRENT_TIMESTAMP/i.test(definition)) {
    extras.push('ON UPDATE CURRENT_TIMESTAMP');
  }
  if (extras.length > 0) {
    column.extra = extras.join(' ');
  }

  // Extract CHARACTER SET
  const charsetMatch = definition.match(/CHARACTER\s+SET\s+(\w+)/i);
  if (charsetMatch) {
    column.charset = charsetMatch[1];
  }

  // Extract COLLATE
  const collateMatch = definition.match(/COLLATE\s+(\w+)/i);
  if (collateMatch) {
    column.collation = collateMatch[1];
  }

  // Extract GENERATED column - handle nested parentheses
  const generatedStartMatch = definition.match(/(?:GENERATED\s+ALWAYS\s+)?AS\s+\(/i);
  if (generatedStartMatch) {
    const startIndex = generatedStartMatch.index! + generatedStartMatch[0].length;
    let depth = 1;
    let endIndex = startIndex;

    // Find matching closing parenthesis
    while (endIndex < definition.length && depth > 0) {
      if (definition[endIndex] === '(') depth++;
      if (definition[endIndex] === ')') depth--;
      endIndex++;
    }

    if (depth === 0) {
      const expression = definition.substring(startIndex, endIndex - 1).trim();
      const afterExpr = definition.substring(endIndex).trim();
      const storedMatch = afterExpr.match(/^(VIRTUAL|STORED)/i);

      column.generated = {
        expression,
        stored: storedMatch?.[1]?.toUpperCase() === 'STORED'
      };
    }
  }

  return column;
}

/**
 * Parse index definitions (PRIMARY KEY, KEY, UNIQUE, etc.)
 */
function parseIndexes(tableBody: string): IndexInfo[] {
  const indexes: IndexInfo[] = [];
  const lines = splitTableDefinitions(tableBody);

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for inline PRIMARY KEY in column definition (e.g., `id INT PRIMARY KEY`)
    // This matches column definitions that end with PRIMARY KEY
    const inlinePrimaryMatch = trimmed.match(/^(?:`([^`]+)`|(\w+))\s+\w+[^,]*\bPRIMARY\s+KEY\b/i);
    if (inlinePrimaryMatch && !/^PRIMARY\s+KEY/i.test(trimmed)) {
      const columnName = inlinePrimaryMatch[1] || inlinePrimaryMatch[2];
      indexes.push({
        name: 'PRIMARY',
        columns: [columnName],
        unique: true,
        type: 'PRIMARY'
      });
      continue;
    }

    // PRIMARY KEY (explicit constraint definition)
    const primaryMatch = trimmed.match(/PRIMARY\s+KEY\s*\(/i);
    if (primaryMatch) {
      // Find column list with nested parens handling
      const startPos = primaryMatch.index! + primaryMatch[0].length;
      let depth = 1;
      let endPos = startPos;
      while (endPos < trimmed.length && depth > 0) {
        if (trimmed[endPos] === '(') depth++;
        if (trimmed[endPos] === ')') depth--;
        endPos++;
      }
      const columnsList = trimmed.substring(startPos, endPos - 1);

      const { columns, prefixLengths } = parseIndexColumns(columnsList);
      const index: IndexInfo = {
        name: 'PRIMARY',
        columns,
        unique: true,
        type: 'PRIMARY'
      };
      if (prefixLengths && prefixLengths.length > 0) {
        index.prefixLengths = prefixLengths;
      }
      indexes.push(index);
      continue;
    }

    // UNIQUE KEY
    const uniqueMatch = trimmed.match(/UNIQUE\s+(?:KEY|INDEX)?\s*(?:`([^`]+)`|(\w+))?\s*\(/i);
    if (uniqueMatch) {
      const indexName = uniqueMatch[1] || uniqueMatch[2] || 'unique_key';
      // Find column list with nested parens handling
      const startPos = uniqueMatch.index! + uniqueMatch[0].length;
      let depth = 1;
      let endPos = startPos;
      while (endPos < trimmed.length && depth > 0) {
        if (trimmed[endPos] === '(') depth++;
        if (trimmed[endPos] === ')') depth--;
        endPos++;
      }
      const columnsList = trimmed.substring(startPos, endPos - 1);

      const { columns, prefixLengths } = parseIndexColumns(columnsList);
      const index: IndexInfo = {
        name: indexName,
        columns,
        unique: true
      };
      if (prefixLengths && prefixLengths.length > 0) {
        index.prefixLengths = prefixLengths;
      }
      indexes.push(index);
      continue;
    }

    // Regular KEY/INDEX
    const keyMatch = trimmed.match(/(?:KEY|INDEX)\s+(?:`([^`]+)`|(\w+))\s*\(/i);
    if (keyMatch) {
      const indexName = keyMatch[1] || keyMatch[2];
      // Find the column list - need to handle nested parentheses
      const startPos = keyMatch.index! + keyMatch[0].length;
      let depth = 1;
      let endPos = startPos;
      while (endPos < trimmed.length && depth > 0) {
        if (trimmed[endPos] === '(') depth++;
        if (trimmed[endPos] === ')') depth--;
        endPos++;
      }
      const columnsList = trimmed.substring(startPos, endPos - 1);

      const { columns, prefixLengths } = parseIndexColumns(columnsList);
      const index: IndexInfo = {
        name: indexName,
        columns,
        unique: false
      };
      if (prefixLengths && prefixLengths.length > 0) {
        index.prefixLengths = prefixLengths;
      }
      indexes.push(index);
      continue;
    }
  }

  return indexes;
}

/**
 * Parse index column list (handles prefix lengths like `column(10)`)
 */
function parseIndexColumns(columnsStr: string): { columns: string[]; prefixLengths?: number[] } {
  const columns: string[] = [];
  const prefixLengths: number[] = [];

  const parts = columnsStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    // Match column name with optional prefix length: `col` or col or `col`(10) or col(10)
    const match = trimmed.match(/(?:`([^`]+)`|(\w+))(?:\((\d+)\))?/);
    if (match) {
      columns.push(match[1] || match[2]);
      if (match[3]) {
        prefixLengths.push(parseInt(match[3], 10));
      }
    }
  }

  return prefixLengths.length > 0 ? { columns, prefixLengths } : { columns };
}

/**
 * Parse FOREIGN KEY constraints
 */
function parseForeignKeys(tableBody: string): ForeignKeyInfo[] {
  const foreignKeys: ForeignKeyInfo[] = [];
  const lines = splitTableDefinitions(tableBody);

  for (const line of lines) {
    const trimmed = line.trim();

    // CONSTRAINT `fk_name` FOREIGN KEY (`col1`) REFERENCES `table` (`col2`) [ON DELETE ...] [ON UPDATE ...]
    const fkMatch = trimmed.match(
      /(?:CONSTRAINT\s+(?:`([^`]+)`|(\w+))\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(?:`([^`]+)`|(\w+))\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION|SET\s+DEFAULT))?(?:\s+ON\s+UPDATE\s+(CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION|SET\s+DEFAULT))?/i
    );

    if (fkMatch) {
      const fkName = fkMatch[1] || fkMatch[2] || `fk_${fkMatch[4] || fkMatch[5]}`;
      const columns = fkMatch[3].split(',').map(c => c.trim().replace(/`/g, ''));
      const refTable = fkMatch[4] || fkMatch[5];
      const refColumns = fkMatch[6].split(',').map(c => c.trim().replace(/`/g, ''));

      foreignKeys.push({
        name: fkName,
        columns,
        refTable,
        refColumns,
        onDelete: fkMatch[7],
        onUpdate: fkMatch[8]
      });
    }
  }

  return foreignKeys;
}

/**
 * Parse PARTITION definitions
 */
function parsePartitions(tableOptions: string): PartitionInfo[] | undefined {
  // Match PARTITION BY clause - handle both COLUMNS() and regular expression
  const partitionMatch = tableOptions.match(/PARTITION\s+BY\s+(RANGE|LIST|HASH|KEY)(?:\s+COLUMNS)?\s*\(([^)]+(?:\([^)]*\))?)\)([\s\S]*)/i);
  if (!partitionMatch) {
    return undefined;
  }

  const partitionType = partitionMatch[1].toUpperCase();
  const expression = partitionMatch[2].trim();
  const partitionDefs = partitionMatch[3] || '';

  const partitions: PartitionInfo[] = [];

  // For HASH and KEY partitioning, check for "PARTITIONS N" syntax
  if (partitionType === 'HASH' || partitionType === 'KEY') {
    const partitionsCountMatch = partitionDefs.match(/PARTITIONS\s+(\d+)/i);
    if (partitionsCountMatch) {
      const count = parseInt(partitionsCountMatch[1], 10);
      // Create synthetic partition entries for HASH/KEY partitioning
      for (let i = 0; i < count; i++) {
        partitions.push({
          name: `p${i}`,
          type: partitionType,
          expression,
          description: `HASH partition ${i}`
        });
      }
      return partitions;
    }
  }

  // Match individual partition definitions
  // Handle both "VALUES LESS THAN" (RANGE) and "VALUES IN" (LIST)
  // Also capture optional TABLESPACE clause after VALUES
  // End can be comma (,) or whitespace/closing paren for last partition
  const partitionPattern = /PARTITION\s+(?:`([^`]+)`|(\w+))\s+VALUES\s+(?:LESS\s+THAN|IN)\s*\(([^)]*(?:\([^)]*\))?[^)]*)\)(?:\s+TABLESPACE\s*=?\s*[`'"]*(\w+)[`'"]*)?/gi;
  const matches = partitionDefs.matchAll(partitionPattern);

  for (const match of matches) {
    const partitionName = match[1] || match[2];
    const description = match[3].trim();
    const tablespace = match[4]; // Optional TABLESPACE

    const partition: PartitionInfo = {
      name: partitionName,
      type: partitionType,
      expression,
      description
    };

    if (tablespace) {
      partition.tablespace = tablespace;
    }

    partitions.push(partition);
  }

  return partitions.length > 0 ? partitions : undefined;
}

/**
 * Split table body into individual definitions (columns, constraints, etc.)
 * Handles nested parentheses properly
 */
function splitTableDefinitions(tableBody: string): string[] {
  const definitions: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < tableBody.length; i++) {
    const char = tableBody[i];

    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      if (current.trim()) {
        definitions.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  // Don't forget the last one
  if (current.trim()) {
    definitions.push(current.trim());
  }

  return definitions;
}
