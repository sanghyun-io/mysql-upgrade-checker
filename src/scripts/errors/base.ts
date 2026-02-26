/**
 * Error Model - Unified error hierarchy for mysql-upgrade-checker.
 *
 * All module-specific errors extend UpgradeCheckerError.
 * The `recoverable` flag indicates whether the application can continue
 * after this error (e.g., skip a malformed file) or must stop.
 */

export class UpgradeCheckerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'UpgradeCheckerError';
  }
}

/**
 * SQL dump or config file parsing failed.
 * Usually recoverable (skip the problematic section/file).
 */
export class ParseError extends UpgradeCheckerError {
  constructor(message: string, recoverable = true) {
    super('PARSE_ERROR', message, recoverable);
    this.name = 'ParseError';
  }
}

/**
 * Analysis logic error (e.g., FK graph cycle that can't be resolved).
 * Usually recoverable (produce partial results).
 */
export class AnalysisError extends UpgradeCheckerError {
  constructor(message: string, recoverable = true) {
    super('ANALYSIS_ERROR', message, recoverable);
    this.name = 'AnalysisError';
  }
}

/**
 * Rendering/report generation error.
 * Usually recoverable (show error message in UI).
 */
export class RenderError extends UpgradeCheckerError {
  constructor(message: string, recoverable = true) {
    super('RENDER_ERROR', message, recoverable);
    this.name = 'RenderError';
  }
}

/**
 * Web Worker communication or execution error.
 * May or may not be recoverable depending on the operation.
 */
export class WorkerError extends UpgradeCheckerError {
  constructor(message: string, recoverable = false) {
    super('WORKER_ERROR', message, recoverable);
    this.name = 'WorkerError';
  }
}
