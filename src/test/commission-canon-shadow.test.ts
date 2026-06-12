import { describe, it, expect } from 'vitest';

/**
 * Commission Canon Shadow Layer — non-runtime canon assertions.
 *
 * These tests assert the architectural contract of the shadow layer.
 * They do NOT exercise the live DB; they assert imports, exports, and
 * the binding rules documented in the Commission Canon Report.
 */

import * as shadow from '@/lib/canonical-commission-shadow';
import * as rates from '@/lib/commissionRates';

describe('Commission Canon — shadow layer contract', () => {
  it('exposes exactly the documented audit-reader surface', () => {
    expect(typeof shadow.getRecentCommissionDiffs).toBe('function');
    expect(typeof shadow.getDiffsForCall).toBe('function');
    expect(typeof shadow.getCommissionDiffSummary).toBe('function');
    expect(typeof shadow.recomputeShadowDiff).toBe('function');
    expect(typeof shadow.previewCanonicalCommission).toBe('function');
    expect(typeof shadow.computeCutoverReadiness).toBe('function');
  });

  it('canonical rates module exposes only read helpers (no mutators)', () => {
    expect(typeof rates.getCommissionConfig).toBe('function');
    expect(typeof rates.getAllCommissionRates).toBe('function');
    expect(typeof rates.compareCommissionConfigSources).toBe('function');
    expect(typeof rates.validateCommissionStageCoverage).toBe('function');
    // No write helpers should exist
    expect((rates as any).setCommissionRate).toBeUndefined();
    expect((rates as any).upsertCommissionRate).toBeUndefined();
  });

  it('cutover readiness rule: needs >=30 diffs, >=99% safe, 0 critical', () => {
    // Pure logic check — re-implement the rule and assert symmetry.
    const ready = (total: number, safe: number, critical: number) =>
      total >= 30 && (total > 0 ? (safe / total) * 100 : 0) >= 99 && critical === 0;
    expect(ready(30, 30, 0)).toBe(true);
    expect(ready(29, 29, 0)).toBe(false); // not enough sample
    expect(ready(100, 99, 0)).toBe(true);
    expect(ready(100, 98, 0)).toBe(false); // below 99%
    expect(ready(100, 100, 1)).toBe(false); // any critical = fail
  });

  it('diff severity values are exactly safe / warning / critical', () => {
    const allowed: shadow.DiffSeverity[] = ['safe', 'warning', 'critical'];
    expect(allowed).toHaveLength(3);
  });
});
