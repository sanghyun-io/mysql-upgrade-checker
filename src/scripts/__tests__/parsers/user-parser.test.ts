/**
 * Tests for user-parser.ts
 */

import { describe, it, expect } from 'vitest';
import {
  parseCreateUser,
  parseAlterUser,
  parseGrant,
  parseRevoke,
  extractUsers
} from '../../parsers/user-parser';

describe('parseCreateUser', () => {
  it('should parse simple CREATE USER', () => {
    const sql = "CREATE USER 'testuser'@'localhost';";

    const user = parseCreateUser(sql);

    expect(user).not.toBeNull();
    expect(user?.user).toBe('testuser');
    expect(user?.host).toBe('localhost');
    expect(user?.privileges).toEqual([]);
  });

  it('should parse CREATE USER with % host', () => {
    const sql = "CREATE USER 'testuser'@'%';";

    const user = parseCreateUser(sql);

    expect(user?.host).toBe('%');
  });

  it('should parse CREATE USER without host (defaults to %)', () => {
    const sql = "CREATE USER 'testuser';";

    const user = parseCreateUser(sql);

    expect(user?.host).toBe('%');
  });

  it('should parse CREATE USER with authentication plugin', () => {
    const sql = "CREATE USER 'testuser'@'localhost' IDENTIFIED WITH mysql_native_password BY 'password';";

    const user = parseCreateUser(sql);

    expect(user?.authPlugin).toBe('mysql_native_password');
  });

  it('should parse CREATE USER with caching_sha2_password', () => {
    const sql = "CREATE USER 'newuser'@'%' IDENTIFIED WITH caching_sha2_password BY 'securepass';";

    const user = parseCreateUser(sql);

    expect(user?.authPlugin).toBe('caching_sha2_password');
  });

  it('should parse CREATE USER IF NOT EXISTS', () => {
    const sql = "CREATE USER IF NOT EXISTS 'testuser'@'localhost';";

    const user = parseCreateUser(sql);

    expect(user).not.toBeNull();
    expect(user?.user).toBe('testuser');
  });

  it('should return null for invalid SQL', () => {
    const sql = 'SELECT * FROM users;';

    const user = parseCreateUser(sql);

    expect(user).toBeNull();
  });
});

describe('parseAlterUser', () => {
  it('should parse ALTER USER', () => {
    const sql = "ALTER USER 'testuser'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'newpass';";

    const user = parseAlterUser(sql);

    expect(user).not.toBeNull();
    expect(user?.user).toBe('testuser');
    expect(user?.host).toBe('localhost');
    expect(user?.authPlugin).toBe('caching_sha2_password');
  });

  it('should parse ALTER USER IF EXISTS', () => {
    const sql = "ALTER USER IF EXISTS 'testuser'@'%';";

    const user = parseAlterUser(sql);

    expect(user).not.toBeNull();
    expect(user?.user).toBe('testuser');
  });
});

describe('parseGrant', () => {
  it('should parse simple GRANT', () => {
    const sql = "GRANT SELECT ON database.* TO 'user'@'localhost';";

    const grant = parseGrant(sql);

    expect(grant).not.toBeNull();
    expect(grant?.user).toBe('user');
    expect(grant?.host).toBe('localhost');
    expect(grant?.privileges).toContain('SELECT');
  });

  it('should parse GRANT with multiple privileges', () => {
    const sql = "GRANT SELECT, INSERT, UPDATE, DELETE ON mydb.* TO 'webapp'@'%';";

    const grant = parseGrant(sql);

    expect(grant?.privileges).toEqual(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
  });

  it('should parse GRANT ALL PRIVILEGES', () => {
    const sql = "GRANT ALL PRIVILEGES ON *.* TO 'admin'@'localhost';";

    const grant = parseGrant(sql);

    expect(grant?.privileges).toEqual(['ALL PRIVILEGES']);
  });

  it('should parse GRANT with column privileges', () => {
    const sql = "GRANT SELECT (id, name), UPDATE (name) ON mydb.users TO 'user'@'localhost';";

    const grant = parseGrant(sql);

    expect(grant?.privileges).toContain('SELECT');
    expect(grant?.privileges).toContain('UPDATE');
  });

  it('should parse GRANT on specific table', () => {
    const sql = "GRANT SELECT ON mydb.users TO 'readonly'@'%';";

    const grant = parseGrant(sql);

    expect(grant?.user).toBe('readonly');
    expect(grant?.privileges).toContain('SELECT');
  });

  it('should parse GRANT without host (defaults to %)', () => {
    const sql = "GRANT SELECT ON mydb.* TO 'user';";

    const grant = parseGrant(sql);

    expect(grant?.host).toBe('%');
  });

  it('should handle SUPER privilege', () => {
    const sql = "GRANT SUPER ON *.* TO 'admin'@'localhost';";

    const grant = parseGrant(sql);

    expect(grant?.privileges).toContain('SUPER');
  });

  it('should return null for invalid SQL', () => {
    const sql = 'CREATE TABLE test (id INT);';

    const grant = parseGrant(sql);

    expect(grant).toBeNull();
  });
});

describe('parseRevoke', () => {
  it('should parse REVOKE', () => {
    const sql = "REVOKE SELECT ON database.* FROM 'user'@'localhost';";

    const revoke = parseRevoke(sql);

    expect(revoke).not.toBeNull();
    expect(revoke?.user).toBe('user');
    expect(revoke?.host).toBe('localhost');
    expect(revoke?.privileges).toContain('SELECT');
  });

  it('should parse REVOKE with multiple privileges', () => {
    const sql = "REVOKE INSERT, UPDATE, DELETE ON mydb.* FROM 'user'@'%';";

    const revoke = parseRevoke(sql);

    expect(revoke?.privileges).toEqual(['INSERT', 'UPDATE', 'DELETE']);
  });

  it('should parse REVOKE ALL PRIVILEGES', () => {
    const sql = "REVOKE ALL PRIVILEGES ON *.* FROM 'user'@'localhost';";

    const revoke = parseRevoke(sql);

    expect(revoke?.privileges).toEqual(['ALL PRIVILEGES']);
  });
});

describe('extractUsers', () => {
  it('should extract users from CREATE USER statements', () => {
    const sql = `
      CREATE USER 'user1'@'localhost' IDENTIFIED WITH mysql_native_password BY 'pass1';
      CREATE USER 'user2'@'%' IDENTIFIED WITH caching_sha2_password BY 'pass2';
    `;

    const users = extractUsers(sql);

    expect(users).toHaveLength(2);
    expect(users[0].user).toBe('user1');
    expect(users[1].user).toBe('user2');
  });

  it('should combine CREATE USER and GRANT statements', () => {
    const sql = `
      CREATE USER 'webapp'@'localhost';
      GRANT SELECT, INSERT ON mydb.* TO 'webapp'@'localhost';
      GRANT UPDATE ON mydb.users TO 'webapp'@'localhost';
    `;

    const users = extractUsers(sql);

    expect(users).toHaveLength(1);
    expect(users[0].user).toBe('webapp');
    expect(users[0].privileges).toContain('SELECT');
    expect(users[0].privileges).toContain('INSERT');
    expect(users[0].privileges).toContain('UPDATE');
  });

  it('should create user from GRANT if no CREATE USER', () => {
    const sql = `
      GRANT ALL PRIVILEGES ON *.* TO 'admin'@'localhost';
    `;

    const users = extractUsers(sql);

    expect(users).toHaveLength(1);
    expect(users[0].user).toBe('admin');
    expect(users[0].privileges).toContain('ALL PRIVILEGES');
  });

  it('should handle multiple users with different hosts', () => {
    const sql = `
      CREATE USER 'user'@'localhost';
      CREATE USER 'user'@'%';
      GRANT SELECT ON mydb.* TO 'user'@'localhost';
      GRANT INSERT ON mydb.* TO 'user'@'%';
    `;

    const users = extractUsers(sql);

    expect(users).toHaveLength(2);

    const localUser = users.find(u => u.host === 'localhost');
    const remoteUser = users.find(u => u.host === '%');

    expect(localUser?.privileges).toContain('SELECT');
    expect(remoteUser?.privileges).toContain('INSERT');
  });

  it('should handle real-world mysqldump output', () => {
    const sql = `
      CREATE USER IF NOT EXISTS 'readonly'@'%' IDENTIFIED WITH 'mysql_native_password' AS '*HASH';
      GRANT USAGE ON *.* TO 'readonly'@'%';
      GRANT SELECT ON \`mydb\`.* TO 'readonly'@'%';

      CREATE USER IF NOT EXISTS 'admin'@'localhost' IDENTIFIED WITH 'caching_sha2_password';
      GRANT ALL PRIVILEGES ON *.* TO 'admin'@'localhost' WITH GRANT OPTION;
    `;

    const users = extractUsers(sql);

    expect(users).toHaveLength(2);

    const readonly = users.find(u => u.user === 'readonly');
    const admin = users.find(u => u.user === 'admin');

    expect(readonly?.authPlugin).toBe('mysql_native_password');
    expect(admin?.authPlugin).toBe('caching_sha2_password');
    expect(admin?.privileges).toContain('ALL PRIVILEGES');
  });

  it('should handle empty or invalid SQL', () => {
    const sql = 'SELECT * FROM users;';

    const users = extractUsers(sql);

    expect(users).toHaveLength(0);
  });
});
