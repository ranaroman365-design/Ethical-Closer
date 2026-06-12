/**
 * MOS CRO additive layer — regression tests (T1–T15).
 *
 * Validates only the additive primitives. Existing systems (CRM, GHL,
 * Lead Capture, Pixel, CAPI, Attribution, Booking, Calendly, Winner
 * Engine, Confidence Engine) are out of scope and must not be touched.
 */
import { describe, it, expect } from "vitest";
import {
  computeDevelopmentScore,
  computePlacementIntentScore,
  decideMosRouting,
  DEV_SCORE_REDIRECT_THRESHOLD,
  PLACEMENT_INTENT_REDIRECT_THRESHOLD,
} from "@/lib/mos-development-score";
import {
  MOS_CRO_SLOTS,
  MOS_LP_FIRST_WIN,
  MOS_LP_MICRO_TRUST,
  MOS_LP_RISK_REDUCER,
  MOS_LP_CTA_STYLE,
  MOS_LP_STICKY_CTA,
  MOS_QUIZ_ENTRY_MODE,
  MOS_Q1_VISUAL,
  MOS_PROGRESS_SYSTEM,
  MOS_COMPLETION_BOOSTER,
  MOS_LEAD_COMMITMENT_LINE,
} from "@/lib/mos-cro-slots";

describe("MOS CRO — additive scoring", () => {
  it("development score is 0..100", () => {
    expect(computeDevelopmentScore({})).toBe(0);
    expect(
      computeDevelopmentScore({
        A: "A_ready_with_plan",
        B: "B_long_term_results",
        C: "C_use_support",
      }),
    ).toBeGreaterThanOrEqual(95);
  });

  it("placement intent score is 0..100", () => {
    expect(computePlacementIntentScore({}, null)).toBe(0);
    const high = computePlacementIntentScore(
      { A: "A_direct_placement", B: "B_direct_placement", C: "C_seek_placement" },
      "job_seeker",
    );
    expect(high).toBe(100);
  });

  it("dev clusters always stay in MOS", () => {
    for (const c of ["new_starter", "experienced_growth", "trained_underperformer"] as const) {
      const d = decideMosRouting(c, { A: "A_direct_placement", B: "B_direct_placement", C: "C_seek_placement" });
      expect(d.kind).toBe("stay");
    }
  });

  it("redirect only when placement HIGH AND dev LOW AND cluster low-fit", () => {
    const d = decideMosRouting("job_seeker", {
      A: "A_direct_placement",
      B: "B_direct_placement",
      C: "C_seek_placement",
    });
    expect(d.kind).toBe("redirect_globalcloser");
  });

  it("client_seeker with high dev stays", () => {
    const d = decideMosRouting("client_seeker", {
      A: "A_ready_with_plan",
      B: "B_long_term_results",
      C: "C_use_support",
    });
    expect(d.kind).toBe("stay");
  });

  it("thresholds are sane", () => {
    expect(DEV_SCORE_REDIRECT_THRESHOLD).toBeGreaterThan(0);
    expect(PLACEMENT_INTENT_REDIRECT_THRESHOLD).toBeGreaterThan(DEV_SCORE_REDIRECT_THRESHOLD);
  });
});

describe("MOS CRO — slot registry (T15: all slots visible)", () => {
  it("registers all additive slots (incl. Phase 9 LP optimization)", () => {
    expect(MOS_CRO_SLOTS).toHaveLength(27);
  });


  it("each slot has unique id and at least 2 variants", () => {
    const ids = new Set<string>();
    for (const s of MOS_CRO_SLOTS) {
      expect(ids.has(s.slot)).toBe(false);
      ids.add(s.slot);
      expect(s.variants.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("expected slot identifiers exist", () => {
    expect(MOS_LP_FIRST_WIN.slot).toBe("mos_lp_first_win");
    expect(MOS_LP_MICRO_TRUST.slot).toBe("mos_lp_micro_trust");
    expect(MOS_LP_RISK_REDUCER.slot).toBe("mos_lp_risk_reducer");
    expect(MOS_LP_CTA_STYLE.slot).toBe("mos_lp_cta_style");
    expect(MOS_LP_STICKY_CTA.slot).toBe("mos_lp_sticky_cta");
    expect(MOS_QUIZ_ENTRY_MODE.slot).toBe("mos_quiz_entry_mode");
    expect(MOS_Q1_VISUAL.slot).toBe("mos_q1_visual");
    expect(MOS_PROGRESS_SYSTEM.slot).toBe("mos_progress_system");
    expect(MOS_COMPLETION_BOOSTER.slot).toBe("mos_completion_booster");
    expect(MOS_LEAD_COMMITMENT_LINE.slot).toBe("mos_lead_commitment_line");
  });

  it("LP first win has 4 variants per brief", () => {
    expect(MOS_LP_FIRST_WIN.variants).toHaveLength(4);
  });
});
