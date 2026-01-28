/**
 * MySQL User and Privilege Parser
 * Parses CREATE USER and GRANT statements
 */

import type { UserInfo } from '../types';

/**
 * Parse a CREATE USER statement into UserInfo
 */
export function parseCreateUser(sql: string): UserInfo | null {
  // Match CREATE USER statement
  const match = sql.match(
    /CREATE\s+USER\s+(?:IF\s+NOT\s+EXISTS\s+)?['"]?([^'"@\s]+)['"]?(?:@['"]?([^'";\s]+)['"]?)?\s*([^;]*)/i
  );

  if (!match) {
    return null;
  }

  const user = match[1];
  const host = match[2] || '%';
  const options = match[3] || '';

  const userInfo: UserInfo = {
    user,
    host,
    privileges: []
  };

  // Extract authentication plugin
  const authMatch = options.match(/IDENTIFIED\s+WITH\s+['"]?(\w+)['"]?/i);
  if (authMatch) {
    userInfo.authPlugin = authMatch[1];
  }

  return userInfo;
}

/**
 * Parse an ALTER USER statement
 */
export function parseAlterUser(sql: string): UserInfo | null {
  const match = sql.match(
    /ALTER\s+USER\s+(?:IF\s+EXISTS\s+)?['"]?([^'"@\s]+)['"]?(?:@['"]?([^'";\s]+)['"]?)?\s*([^;]*)/i
  );

  if (!match) {
    return null;
  }

  const user = match[1];
  const host = match[2] || '%';
  const options = match[3] || '';

  const userInfo: UserInfo = {
    user,
    host,
    privileges: []
  };

  // Extract authentication plugin
  const authMatch = options.match(/IDENTIFIED\s+WITH\s+['"]?(\w+)['"]?/i);
  if (authMatch) {
    userInfo.authPlugin = authMatch[1];
  }

  return userInfo;
}

/**
 * Parse a GRANT statement to extract user and privileges
 */
export function parseGrant(sql: string): { user: string; host: string; privileges: string[] } | null {
  // Match GRANT statement
  const match = sql.match(
    /GRANT\s+((?:[\w\s,*()]+(?:\s+ON\s+)?)+?)\s+ON\s+(?:(?:TABLE|FUNCTION|PROCEDURE)\s+)?(?:[*]|[\w*.]+)\s+TO\s+['"]?([^'"@\s]+)['"]?(?:@['"]?([^'";\s]+)['"]?)?/i
  );

  if (!match) {
    return null;
  }

  const privilegesStr = match[1].replace(/\s+ON\s*$/, '');
  const user = match[2];
  const host = match[3] || '%';

  // Parse privileges
  const privileges = parsePrivilegeList(privilegesStr);

  return {
    user,
    host,
    privileges
  };
}

/**
 * Parse privilege list from GRANT statement
 */
function parsePrivilegeList(privilegesStr: string): string[] {
  // Handle ALL PRIVILEGES
  if (/ALL\s+PRIVILEGES?/i.test(privilegesStr)) {
    return ['ALL PRIVILEGES'];
  }

  // Split by comma and clean up
  const privileges = privilegesStr
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      // Handle privileges with column lists: SELECT (col1, col2)
      const match = p.match(/^(\w+)(?:\s*\([^)]+\))?/);
      return match ? match[1].toUpperCase() : p.toUpperCase();
    });

  return privileges;
}

/**
 * Parse REVOKE statement
 */
export function parseRevoke(sql: string): { user: string; host: string; privileges: string[] } | null {
  const match = sql.match(
    /REVOKE\s+((?:[\w\s,*()]+(?:\s+ON\s+)?)+?)\s+ON\s+(?:(?:TABLE|FUNCTION|PROCEDURE)\s+)?(?:[*]|[\w*.]+)\s+FROM\s+['"]?([^'"@\s]+)['"]?(?:@['"]?([^'";\s]+)['"]?)?/i
  );

  if (!match) {
    return null;
  }

  const privilegesStr = match[1].replace(/\s+ON\s*$/, '');
  const user = match[2];
  const host = match[3] || '%';

  const privileges = parsePrivilegeList(privilegesStr);

  return {
    user,
    host,
    privileges
  };
}

/**
 * Extract all user information from SQL content
 */
export function extractUsers(sqlContent: string): UserInfo[] {
  const users = new Map<string, UserInfo>();

  // Extract CREATE USER statements
  const createUserPattern = /CREATE\s+USER\s+(?:IF\s+NOT\s+EXISTS\s+)?['"]?([^'"@\s]+)['"]?(?:@['"]?([^'";\s]+)['"]?)?\s*([^;]*);/gi;
  const createMatches = sqlContent.matchAll(createUserPattern);

  for (const match of createMatches) {
    const userInfo = parseCreateUser(match[0]);
    if (userInfo) {
      const key = `${userInfo.user}@${userInfo.host}`;
      users.set(key, userInfo);
    }
  }

  // Extract GRANT statements and add privileges
  const grantPattern = /GRANT\s+.+?\s+TO\s+['"]?([^'"@\s]+)['"]?(?:@['"]?([^'";\s]+)['"]?)?[^;]*;/gi;
  const grantMatches = sqlContent.matchAll(grantPattern);

  for (const match of grantMatches) {
    const grantInfo = parseGrant(match[0]);
    if (grantInfo) {
      const key = `${grantInfo.user}@${grantInfo.host}`;
      const existing = users.get(key);

      if (existing) {
        // Add privileges to existing user
        existing.privileges.push(...grantInfo.privileges);
      } else {
        // Create new user entry with privileges
        users.set(key, {
          user: grantInfo.user,
          host: grantInfo.host,
          privileges: grantInfo.privileges
        });
      }
    }
  }

  return Array.from(users.values());
}
