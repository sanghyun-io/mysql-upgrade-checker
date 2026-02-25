/**
 * Tests for getPreflightSummary()
 *
 * Verifies that the safety gate (allRequiredPassed) only passes when every
 * required item has status 'passed'.  A required item with status 'skipped'
 * must NOT be treated as satisfied.
 */

import { describe, it, expect } from 'vitest';
import { getPreflightSummary } from '../analysis/preflight';
import type { PreflightItem } from '../analysis/preflight';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  overrides: Partial<PreflightItem> & { id: string },
): PreflightItem {
  return {
    title: overrides.id,
    description: '',
    required: false,
    query: null,
    status: 'pending',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// allRequiredPassed — the safety gate
// ---------------------------------------------------------------------------

describe('getPreflightSummary — allRequiredPassed safety gate', () => {
  it('returns allRequiredPassed=false when a required item is skipped', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'backup', required: true, status: 'skipped' }),
    ];

    const summary = getPreflightSummary(items);

    expect(summary.allRequiredPassed).toBe(false);
  });

  it('returns allRequiredPassed=true when a required item is passed', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'backup', required: true, status: 'passed' }),
    ];

    const summary = getPreflightSummary(items);

    expect(summary.allRequiredPassed).toBe(true);
  });

  it('returns allRequiredPassed=false when a required item is failed', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'backup', required: true, status: 'failed' }),
    ];

    const summary = getPreflightSummary(items);

    expect(summary.allRequiredPassed).toBe(false);
  });

  it('returns allRequiredPassed=false when a required item is pending', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'backup', required: true, status: 'pending' }),
    ];

    const summary = getPreflightSummary(items);

    expect(summary.allRequiredPassed).toBe(false);
  });

  it('does not let a skipped non-required item affect allRequiredPassed', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'required_check', required: true, status: 'passed' }),
      makeItem({ id: 'optional_check', required: false, status: 'skipped' }),
    ];

    const summary = getPreflightSummary(items);

    expect(summary.allRequiredPassed).toBe(true);
  });

  it('returns allRequiredPassed=false when one required item is skipped among several', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'backup', required: true, status: 'passed' }),
      makeItem({ id: 'version', required: true, status: 'skipped' }),
    ];

    const summary = getPreflightSummary(items);

    expect(summary.allRequiredPassed).toBe(false);
  });

  it('returns allRequiredPassed=true when there are no required items', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'optional', required: false, status: 'pending' }),
    ];

    const summary = getPreflightSummary(items);

    expect(summary.allRequiredPassed).toBe(true);
  });

  it('returns allRequiredPassed=true when all required items are passed', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'backup', required: true, status: 'passed' }),
      makeItem({ id: 'version', required: true, status: 'passed' }),
      makeItem({ id: 'disk', required: false, status: 'skipped' }),
    ];

    const summary = getPreflightSummary(items);

    expect(summary.allRequiredPassed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requiredCompleted counter
// ---------------------------------------------------------------------------

describe('getPreflightSummary — requiredCompleted counter', () => {
  it('does not count a skipped required item as requiredCompleted', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'a', required: true, status: 'skipped' }),
      makeItem({ id: 'b', required: true, status: 'passed' }),
    ];

    const summary = getPreflightSummary(items);

    // Only the 'passed' item counts
    expect(summary.requiredCompleted).toBe(1);
    expect(summary.required).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// completed counter (non-required items — skipped still counts here)
// ---------------------------------------------------------------------------

describe('getPreflightSummary — completed counter', () => {
  it('counts skipped items (required or not) in the overall completed tally', () => {
    const items: PreflightItem[] = [
      makeItem({ id: 'a', required: true, status: 'skipped' }),
      makeItem({ id: 'b', required: false, status: 'skipped' }),
      makeItem({ id: 'c', required: false, status: 'passed' }),
      makeItem({ id: 'd', required: false, status: 'pending' }),
    ];

    const summary = getPreflightSummary(items);

    // 'skipped' + 'passed' = 3 items are "done" from a UX perspective
    expect(summary.completed).toBe(3);
    expect(summary.total).toBe(4);
  });
});
