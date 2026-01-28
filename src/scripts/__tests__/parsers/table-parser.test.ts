/**
 * Tests for table-parser.ts
 */

import { describe, it, expect } from 'vitest';
import { parseCreateTable } from '../../parsers/table-parser';

describe('parseCreateTable', () => {
  it('should parse a simple table', () => {
    const sql = `
      CREATE TABLE users (
        id INT PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    const table = parseCreateTable(sql);

    expect(table).not.toBeNull();
    expect(table?.name).toBe('users');
    expect(table?.engine).toBe('InnoDB');
    expect(table?.charset).toBe('utf8mb4');
    expect(table?.columns).toHaveLength(3);
  });

  it('should parse column with backticks', () => {
    const sql = `
      CREATE TABLE \`orders\` (
        \`order_id\` INT,
        \`user_id\` INT
      );
    `;

    const table = parseCreateTable(sql);

    expect(table).not.toBeNull();
    expect(table?.name).toBe('orders');
    expect(table?.columns[0].name).toBe('order_id');
    expect(table?.columns[1].name).toBe('user_id');
  });

  it('should parse column types correctly', () => {
    const sql = `
      CREATE TABLE products (
        id INT,
        name VARCHAR(100),
        price DECIMAL(10,2),
        description TEXT,
        created_at TIMESTAMP
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.columns[0].type).toBe('INT');
    expect(table?.columns[1].type).toBe('VARCHAR(100)');
    expect(table?.columns[2].type).toBe('DECIMAL(10,2)');
    expect(table?.columns[3].type).toBe('TEXT');
    expect(table?.columns[4].type).toBe('TIMESTAMP');
  });

  it('should parse nullable columns', () => {
    const sql = `
      CREATE TABLE test (
        id INT NOT NULL,
        name VARCHAR(100),
        email VARCHAR(255) NULL
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.columns[0].nullable).toBe(false);
    expect(table?.columns[1].nullable).toBe(true);
    expect(table?.columns[2].nullable).toBe(true);
  });

  it('should parse default values', () => {
    const sql = `
      CREATE TABLE test (
        id INT DEFAULT 0,
        name VARCHAR(100) DEFAULT 'unknown',
        status ENUM('active','inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.columns[0].default).toBe('0');
    expect(table?.columns[1].default).toBe('unknown');
    expect(table?.columns[2].default).toBe('active');
    expect(table?.columns[3].default).toBe('CURRENT_TIMESTAMP');
  });

  it('should parse AUTO_INCREMENT', () => {
    const sql = `
      CREATE TABLE test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100)
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.columns[0].extra).toContain('AUTO_INCREMENT');
  });

  it('should parse CHARACTER SET and COLLATE', () => {
    const sql = `
      CREATE TABLE test (
        name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.columns[0].charset).toBe('utf8mb4');
    expect(table?.columns[0].collation).toBe('utf8mb4_unicode_ci');
  });

  it('should parse GENERATED columns', () => {
    const sql = `
      CREATE TABLE test (
        price DECIMAL(10,2),
        tax DECIMAL(10,2) GENERATED ALWAYS AS (price * 0.1) STORED,
        total DECIMAL(10,2) AS (price + tax) VIRTUAL
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.columns[1].generated).toBeDefined();
    expect(table?.columns[1].generated?.expression).toBe('price * 0.1');
    expect(table?.columns[1].generated?.stored).toBe(true);

    expect(table?.columns[2].generated).toBeDefined();
    expect(table?.columns[2].generated?.stored).toBe(false);
  });

  it('should parse PRIMARY KEY', () => {
    const sql = `
      CREATE TABLE test (
        id INT,
        PRIMARY KEY (id)
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.indexes).toHaveLength(1);
    expect(table?.indexes[0].name).toBe('PRIMARY');
    expect(table?.indexes[0].unique).toBe(true);
    expect(table?.indexes[0].columns).toEqual(['id']);
  });

  it('should parse composite PRIMARY KEY', () => {
    const sql = `
      CREATE TABLE test (
        user_id INT,
        product_id INT,
        PRIMARY KEY (user_id, product_id)
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.indexes[0].columns).toEqual(['user_id', 'product_id']);
  });

  it('should parse UNIQUE KEY', () => {
    const sql = `
      CREATE TABLE test (
        id INT,
        email VARCHAR(255),
        UNIQUE KEY email_unique (email)
      );
    `;

    const table = parseCreateTable(sql);

    const uniqueIndex = table?.indexes.find(idx => idx.name === 'email_unique');
    expect(uniqueIndex).toBeDefined();
    expect(uniqueIndex?.unique).toBe(true);
    expect(uniqueIndex?.columns).toEqual(['email']);
  });

  it('should parse regular KEY', () => {
    const sql = `
      CREATE TABLE test (
        id INT,
        name VARCHAR(100),
        KEY name_idx (name)
      );
    `;

    const table = parseCreateTable(sql);

    const index = table?.indexes.find(idx => idx.name === 'name_idx');
    expect(index).toBeDefined();
    expect(index?.unique).toBe(false);
    expect(index?.columns).toEqual(['name']);
  });

  it('should parse index with prefix length', () => {
    const sql = `
      CREATE TABLE test (
        id INT,
        description TEXT,
        KEY desc_idx (description(100))
      );
    `;

    const table = parseCreateTable(sql);

    const index = table?.indexes.find(idx => idx.name === 'desc_idx');
    expect(index?.columns).toEqual(['description']);
    expect(index?.prefixLengths).toEqual([100]);
  });

  it('should parse FOREIGN KEY', () => {
    const sql = `
      CREATE TABLE orders (
        id INT,
        user_id INT,
        CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.foreignKeys).toHaveLength(1);
    expect(table?.foreignKeys[0].name).toBe('fk_user');
    expect(table?.foreignKeys[0].columns).toEqual(['user_id']);
    expect(table?.foreignKeys[0].refTable).toBe('users');
    expect(table?.foreignKeys[0].refColumns).toEqual(['id']);
    expect(table?.foreignKeys[0].onDelete).toBe('CASCADE');
    expect(table?.foreignKeys[0].onUpdate).toBe('RESTRICT');
  });

  it('should parse PARTITION BY RANGE', () => {
    const sql = `
      CREATE TABLE sales (
        id INT,
        sale_date DATE
      )
      PARTITION BY RANGE (YEAR(sale_date)) (
        PARTITION p2020 VALUES LESS THAN (2021),
        PARTITION p2021 VALUES LESS THAN (2022),
        PARTITION p2022 VALUES LESS THAN (2023)
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.partitions).toBeDefined();
    expect(table?.partitions).toHaveLength(3);
    expect(table?.partitions?.[0].name).toBe('p2020');
    expect(table?.partitions?.[0].type).toBe('RANGE');
  });

  it('should parse PARTITION BY LIST', () => {
    const sql = `
      CREATE TABLE employees (
        id INT,
        department VARCHAR(50)
      )
      PARTITION BY LIST COLUMNS(department) (
        PARTITION p_sales VALUES IN ('Sales', 'Marketing'),
        PARTITION p_tech VALUES IN ('Engineering', 'IT')
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.partitions).toBeDefined();
    expect(table?.partitions?.[0].type).toBe('LIST');
  });

  it('should handle ENUM type', () => {
    const sql = `
      CREATE TABLE test (
        status ENUM('active', 'inactive', 'pending')
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.columns[0].type).toContain('ENUM');
  });

  it('should handle IF NOT EXISTS', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id INT
      );
    `;

    const table = parseCreateTable(sql);

    expect(table?.name).toBe('users');
  });

  it('should return null for invalid SQL', () => {
    const sql = 'SELECT * FROM users;';

    const table = parseCreateTable(sql);

    expect(table).toBeNull();
  });

  it('should parse complex real-world table', () => {
    const sql = `
      CREATE TABLE \`user_profiles\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT UNSIGNED NOT NULL,
        \`first_name\` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        \`last_name\` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        \`email\` VARCHAR(255) NOT NULL,
        \`bio\` TEXT,
        \`avatar_url\` VARCHAR(500),
        \`status\` ENUM('active','inactive','suspended') DEFAULT 'active',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`email_unique\` (\`email\`),
        KEY \`user_id_idx\` (\`user_id\`),
        KEY \`status_idx\` (\`status\`),
        CONSTRAINT \`fk_user_profiles_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    const table = parseCreateTable(sql);

    expect(table).not.toBeNull();
    expect(table?.name).toBe('user_profiles');
    expect(table?.engine).toBe('InnoDB');
    expect(table?.charset).toBe('utf8mb4');
    expect(table?.collation).toBe('utf8mb4_unicode_ci');
    expect(table?.columns).toHaveLength(10);
    expect(table?.indexes).toHaveLength(4);
    expect(table?.foreignKeys).toHaveLength(1);
  });
});
