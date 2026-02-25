/**
 * Error Model Tests - Verify error hierarchy and properties.
 */

import { describe, it, expect } from 'vitest';
import {
  UpgradeCheckerError,
  ParseError,
  AnalysisError,
  RenderError,
  WorkerError,
} from '../errors';

describe('UpgradeCheckerError', () => {
  it('should create with code, message, and recoverable flag', () => {
    const err = new UpgradeCheckerError('TEST_ERROR', 'test message', true);
    expect(err.code).toBe('TEST_ERROR');
    expect(err.message).toBe('test message');
    expect(err.recoverable).toBe(true);
    expect(err.name).toBe('UpgradeCheckerError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ParseError', () => {
  it('should default to recoverable', () => {
    const err = new ParseError('malformed SQL');
    expect(err.code).toBe('PARSE_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.name).toBe('ParseError');
    expect(err).toBeInstanceOf(UpgradeCheckerError);
  });

  it('should allow non-recoverable', () => {
    const err = new ParseError('fatal parse failure', false);
    expect(err.recoverable).toBe(false);
  });
});

describe('AnalysisError', () => {
  it('should default to recoverable', () => {
    const err = new AnalysisError('FK cycle detected');
    expect(err.code).toBe('ANALYSIS_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.name).toBe('AnalysisError');
    expect(err).toBeInstanceOf(UpgradeCheckerError);
  });
});

describe('RenderError', () => {
  it('should default to recoverable', () => {
    const err = new RenderError('SVG generation failed');
    expect(err.code).toBe('RENDER_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.name).toBe('RenderError');
    expect(err).toBeInstanceOf(UpgradeCheckerError);
  });
});

describe('WorkerError', () => {
  it('should default to non-recoverable', () => {
    const err = new WorkerError('Worker crashed');
    expect(err.code).toBe('WORKER_ERROR');
    expect(err.recoverable).toBe(false);
    expect(err.name).toBe('WorkerError');
    expect(err).toBeInstanceOf(UpgradeCheckerError);
  });
});
