/**
 * MOS Ultra-Fast Sprint — additive regression tests.
 *
 * Verifies:
 *   • new slot defs exist with control + ≥4 variants
 *   • new copy maps cover every non-control variant
 *   • low-signal archive helper triggers per spec (Teil F)
 *   • Winner Engine surface untouched (slot defs follow AbSlotDef shape)
 */
import { describe, it, expect } from "vitest";
import {
  MOS_LP_ABOVE_FOLD_V2,
  MOS_LP_CTA_V2,
  MOS_LP_REMOVE_FRICTION,
  MOS_Q1_ULTRA_FAST,
  MOS_Q1_MICRO_COMMITMENT,
  MOS_PROGRESS_FAST,
  LP_ABOVE_FOLD_V2_COPY,
  LP_CTA_V2_COPY,
  LP_REMOVE_FRICTION_COPY,
  Q1_MICRO_COMMITMENT_COPY,
  PROGRESS_FAST_COPY,
  LOW_SIGNAL_ARCHIVE,
} from "@/lib/mos-cro-slots";
import { isLowSignalSlot, slotArchiveStatus } from "@/lib/mos-low-signal-archive";

const ALL = [
  MOS_LP_ABOVE_FOLD_V2,
  MOS_LP_CTA_V2,
  MOS_LP_REMOVE_FRICTION,
  MOS_Q1_ULTRA_FAST,
  MOS_Q1_MICRO_COMMITMENT,
  MOS_PROGRESS_FAST,
] as const;

describe("MOS Ultra-Fast — slot definitions", () => {
  it("each new slot has control + ≥4 variants", () => {
    for (const s of ALL) {
      expect(s.variants.find((v) => v.id === "control")).toBeTruthy();
      expect(s.variants.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("each new variant has a copy entry (LP headline)", () => {
    for (const v of MOS_LP_ABOVE_FOLD_V2.variants) {
      expect(v.id in LP_ABOVE_FOLD_V2_COPY).toBe(true);
    }
  });

  it("each new variant has a copy entry (LP CTA + friction)", () => {
    for (const v of MOS_LP_CTA_V2.variants) expect(v.id in LP_CTA_V2_COPY).toBe(true);
    for (const v of MOS_LP_REMOVE_FRICTION.variants) expect(v.id in LP_REMOVE_FRICTION_COPY).toBe(true);
  });

  it("each new variant has a copy entry (Q1 micro-commitment + progress)", () => {
    for (const v of MOS_Q1_MICRO_COMMITMENT.variants)
      expect(v.id in Q1_MICRO_COMMITMENT_COPY).toBe(true);
    for (const v of MOS_PROGRESS_FAST.variants)
      expect(v.id in PROGRESS_FAST_COPY).toBe(true);
  });
});

describe("MOS Ultra-Fast — low-signal archive (Teil F)", () => {
  const now = new Date("2026-06-30T00:00:00Z");
  const old = new Date("2026-06-01T00:00:00Z"); // 29 days back

  it("flags low-signal slots older than 14d", () => {
    const s = { slot: "x", firstSeenAt: old, exposures: 12, leads: 0, bookings: 0 };
    expect(isLowSignalSlot(s, now)).toBe(true);
    expect(slotArchiveStatus(s, now)).toBe("archived_low_signal");
  });

  it("keeps slots active with any lead or booking", () => {
    const a = { slot: "y", firstSeenAt: old, exposures: 50, leads: 1, bookings: 0 };
    const b = { slot: "z", firstSeenAt: old, exposures: 5, leads: 0, bookings: 1 };
    expect(isLowSignalSlot(a, now)).toBe(false);
    expect(isLowSignalSlot(b, now)).toBe(false);
  });

  it("keeps slots active with ≥100 exposures", () => {
    const s = { slot: "k", firstSeenAt: old, exposures: 100, leads: 0, bookings: 0 };
    expect(isLowSignalSlot(s, now)).toBe(false);
  });

  it("keeps young slots active even if otherwise low-signal", () => {
    const young = new Date("2026-06-25T00:00:00Z");
    const s = { slot: "k", firstSeenAt: young, exposures: 1, leads: 0, bookings: 0 };
    expect(isLowSignalSlot(s, now)).toBe(false);
  });

  it("threshold constants are sane", () => {
    expect(LOW_SIGNAL_ARCHIVE.minAgeDays).toBe(14);
    expect(LOW_SIGNAL_ARCHIVE.maxExposures).toBe(100);
  });
});
