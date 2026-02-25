/**
 * Security Tests - XSS payload fixtures and sanitizer validation.
 */

import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  stripHtmlTags,
  sanitizeSqlForDisplay,
  generateCSPMetaTag,
  sanitizeFilename,
} from '../security/sanitizer';

describe('escapeHtml', () => {
  it('should escape basic HTML entities', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#x27;');
  });

  it('should escape multiple entities in a string', () => {
    expect(escapeHtml('<div class="test">')).toBe('&lt;div class=&quot;test&quot;&gt;');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should return empty string for falsy input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(escapeHtml(null as any)).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(escapeHtml(undefined as any)).toBe('');
  });

  it('should not modify safe strings', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('ALTER TABLE users')).toBe('ALTER TABLE users');
  });

  // XSS payload fixtures
  it('should neutralize script injection', () => {
    const payload = '<script>alert(1)</script>';
    const result = escapeHtml(payload);
    expect(result).not.toContain('<script>');
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('should neutralize img onerror injection', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const result = escapeHtml(payload);
    expect(result).not.toContain('<img');
    expect(result).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('should neutralize event handler injection', () => {
    const payload = '" onmouseover="alert(1)"';
    const result = escapeHtml(payload);
    expect(result).not.toContain('" onmouseover');
    expect(result).toBe('&quot; onmouseover=&quot;alert(1)&quot;');
  });

  it('should neutralize nested injection', () => {
    const payload = '<<script>script>alert(1)<</script>/script>';
    const result = escapeHtml(payload);
    expect(result).not.toContain('<script>');
  });

  it('should handle HTML entity encoding attack', () => {
    const payload = '&lt;script&gt;alert(1)&lt;/script&gt;';
    const result = escapeHtml(payload);
    // Double-encoding: & becomes &amp;, so &lt; becomes &amp;lt;
    expect(result).toBe('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;');
  });

  it('should handle unicode escape attempts', () => {
    const payload = '\u003Cscript\u003Ealert(1)\u003C/script\u003E';
    // \u003C is <, \u003E is >
    const result = escapeHtml(payload);
    expect(result).not.toContain('<script>');
  });

  it('should handle SQL within HTML context', () => {
    const payload = "'; DROP TABLE users; --";
    const result = escapeHtml(payload);
    expect(result).toBe('&#x27;; DROP TABLE users; --');
  });
});

describe('stripHtmlTags', () => {
  it('should remove all HTML tags', () => {
    expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello');
    expect(stripHtmlTags('<div class="x"><span>test</span></div>')).toBe('test');
  });

  it('should handle empty string', () => {
    expect(stripHtmlTags('')).toBe('');
  });

  it('should handle string with no tags', () => {
    expect(stripHtmlTags('plain text')).toBe('plain text');
  });

  it('should handle self-closing tags', () => {
    expect(stripHtmlTags('line<br/>break')).toBe('linebreak');
  });
});

describe('sanitizeSqlForDisplay', () => {
  it('should escape SQL containing HTML-like content', () => {
    const sql = "ALTER TABLE `<script>` MODIFY col VARCHAR(255);";
    const result = sanitizeSqlForDisplay(sql);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('should preserve SQL formatting', () => {
    const sql = "SELECT * FROM users WHERE id = 1;";
    expect(sanitizeSqlForDisplay(sql)).toBe(sql);
  });
});

describe('generateCSPMetaTag', () => {
  it('should generate a valid CSP meta tag', () => {
    const tag = generateCSPMetaTag();
    expect(tag).toContain('Content-Security-Policy');
    expect(tag).toContain("default-src 'none'");
    expect(tag).toContain("style-src 'unsafe-inline'");
  });
});

describe('sanitizeFilename', () => {
  it('should allow safe filenames', () => {
    expect(sanitizeFilename('report.html')).toBe('report.html');
    expect(sanitizeFilename('my-report_2024.sql')).toBe('my-report_2024.sql');
  });

  it('should handle empty string', () => {
    expect(sanitizeFilename('')).toBe('unnamed');
  });

  it('should remove path separators', () => {
    expect(sanitizeFilename('../../../etc/passwd')).not.toContain('/');
    expect(sanitizeFilename('..\\..\\windows\\system32')).not.toContain('\\');
  });

  it('should prevent directory traversal', () => {
    const result = sanitizeFilename('../../malicious.txt');
    expect(result).not.toContain('..');
  });

  it('should remove null bytes', () => {
    expect(sanitizeFilename('file\0.txt')).toBe('file.txt');
  });

  it('should replace unsafe characters', () => {
    expect(sanitizeFilename('file<>|:.txt')).not.toContain('<');
    expect(sanitizeFilename('file<>|:.txt')).not.toContain('>');
  });

  it('should allow Korean characters', () => {
    const result = sanitizeFilename('보고서.html');
    expect(result).toContain('보고서');
  });
});
