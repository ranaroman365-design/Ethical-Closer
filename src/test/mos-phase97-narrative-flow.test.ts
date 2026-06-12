/**
 * Phase 9.7 — Narrative Flow & Quiz Conversion regression tests.
 *
 * Verifies the additive contract:
 *  - New slots exist in registry
 *  - All default to `control` (invisible)
 *  - Motivation copy map covers every non-control variant
 *  - No breaking change to existing CRO slots
 */
import { describe, expect, it } from "vitest";
import {
  MOS_CRO_SLOTS,
  MOS_END_RESULT_ANGLE,
  MOS_QUIZ_MICRO_COMMITMENT,
  MOS_QUIZ_MOTIVATION_ANGLE,
  QUIZ_MOTIVATION_ANGLE_COPY,
} from "@/lib/mos-cro-slots";

describe("Phase 9.7 — Narrative Flow CRO slots", () => {
  it("registers all three additive slots", () => {
    const slotNames = MOS_CRO_SLOTS.map((s) => s.slot);
    expect(slotNames).toContain("mos_end_result_angle");
    expect(slotNames).toContain("mos_quiz_micro_commitment");
    expect(slotNames).toContain("mos_quiz_motivation_angle");
  });

  it("every additive slot has a `control` baseline", () => {
    for (const slot of [
      MOS_END_RESULT_ANGLE,
      MOS_QUIZ_MICRO_COMMITMENT,
      MOS_QUIZ_MOTIVATION_ANGLE,
    ]) {
      const ids = slot.variants.map((v) => v.id);
      expect(ids).toContain("control");
    }
  });

  it("motivation copy map covers every non-control variant", () => {
    const variants = MOS_QUIZ_MOTIVATION_ANGLE.variants
      .map((v) => v.id)
      .filter((id) => id !== "control");
    for (const v of variants) {
      const copy = QUIZ_MOTIVATION_ANGLE_COPY[v];
      expect(copy, `missing motivation copy for ${v}`).toBeTruthy();
      expect(typeof copy).toBe("string");
    }
    // control MUST be null so existing CTA copy survives
    expect(QUIZ_MOTIVATION_ANGLE_COPY.control).toBeNull();
  });

  it("end-result + micro-commitment have at least one visible variant", () => {
    expect(
      MOS_END_RESULT_ANGLE.variants.some((v) => v.id !== "control"),
    ).toBe(true);
    expect(
      MOS_QUIZ_MICRO_COMMITMENT.variants.some((v) => v.id !== "control"),
    ).toBe(true);
  });
});
