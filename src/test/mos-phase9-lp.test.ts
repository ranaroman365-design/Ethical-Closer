/**
 * Phase 9 — LP→Quiz Start optimization regression tests.
 *
 * Validates the additive primitives only. No CRM/booking/quiz/routing
 * touched. Each new slot must:
 *   - exist in MOS_CRO_SLOTS
 *   - default to a `control` variant that renders nothing
 *   - have copy strings free of forbidden vocabulary
 *   - be mapped to a psychology theme in EXPERIMENT_THEME_MAP
 */
import { describe, it, expect } from "vitest";
import {
  MOS_CRO_SLOTS,
  MOS_LP_PSYCHOLOGY_HEADLINE,
  MOS_LP_PSYCHOLOGY_SUBLINE,
  MOS_LP_CTA_PSYCHOLOGY,
  MOS_LP_MICRO_TRUST_INLINE,
  MOS_LP_TRUST_BLOCK_POSITION,
  MOS_LP_SCROLL_PROGRESS,
  MOS_LP_COMPETING_CTA_SUPPRESS,
  LP_PSYCHOLOGY_HEADLINE_COPY,
  LP_PSYCHOLOGY_SUBLINE_COPY,
  LP_CTA_PSYCHOLOGY_COPY,
  LP_MICRO_TRUST_INLINE_COPY,
} from "@/lib/mos-cro-slots";
import {
  EXPERIMENT_THEME_MAP,
  themesForVariant,
} from "@/lib/cro/audience-intelligence";

const PHASE9_SLOTS = [
  MOS_LP_PSYCHOLOGY_HEADLINE,
  MOS_LP_PSYCHOLOGY_SUBLINE,
  MOS_LP_CTA_PSYCHOLOGY,
  MOS_LP_MICRO_TRUST_INLINE,
  MOS_LP_TRUST_BLOCK_POSITION,
  MOS_LP_SCROLL_PROGRESS,
  MOS_LP_COMPETING_CTA_SUPPRESS,
] as const;

const FORBIDDEN = [
  /million/i,
  /reich werden/i,
  /passives einkommen/i,
  /freiheit garantiert/i,
  /finanzielle freiheit/i,
  // Phase 9.1 — lifestyle / wealth fantasy
  /lamborghini/i,
  /\blaptop\b/i,
  /\bstrand\b/i,
  /\b10k\b/i,
  /\b20k\b/i,
  /\bluxus\b/i,
  /schnell reich/i,
  /passive[sn]?\s+einkommen/i,
];

// Phase 9.1 — audience-aligned variant IDs that MUST be wired.
const PHASE9_1_VARIANTS: Record<string, string[]> = {
  mos_lp_psychology_headline: [
    "competence",
    "professional",
    "market_reality",
    "career_competence",
  ],
  mos_lp_psychology_subline: [
    "skill_fit",
    "growth_no_shortcut",
    "performance_standard",
  ],
  mos_lp_cta_psychology: [
    "eignung_pruefen",
    "eignungstest",
    "passt_zu_mir",
    "karriere_potenzial",
    "faehigkeiten_test",
  ],
  mos_lp_micro_trust_inline: ["D_competence_focus", "E_performance_line"],
};

const WINNING_THEMES = new Set([
  "performance",
  "achievement",
  "status",
  "competence",
  "career",
  "professionalism",
  "mastery",
]);

describe("Phase 9 — LP optimization slots", () => {
  it("all 7 new slots are registered", () => {
    for (const s of PHASE9_SLOTS) {
      expect(MOS_CRO_SLOTS.find((x) => x.slot === s.slot)).toBeDefined();
    }
  });

  it("every new slot has a control variant (default = no-op)", () => {
    for (const s of PHASE9_SLOTS) {
      expect(s.variants.some((v) => v.id === "control")).toBe(true);
    }
  });

  it("copy maps return null for control", () => {
    expect(LP_PSYCHOLOGY_HEADLINE_COPY.control).toBeNull();
    expect(LP_PSYCHOLOGY_SUBLINE_COPY.control).toBeNull();
    expect(LP_CTA_PSYCHOLOGY_COPY.control).toBeNull();
    expect(LP_MICRO_TRUST_INLINE_COPY.control).toBeNull();
  });

  it("copy does not contain forbidden vocabulary", () => {
    const allCopy = [
      ...Object.values(LP_PSYCHOLOGY_HEADLINE_COPY),
      ...Object.values(LP_PSYCHOLOGY_SUBLINE_COPY),
      ...Object.values(LP_CTA_PSYCHOLOGY_COPY),
      ...Object.values(LP_MICRO_TRUST_INLINE_COPY),
    ].filter((x): x is string => typeof x === "string");
    for (const c of allCopy) {
      for (const pat of FORBIDDEN) {
        expect(pat.test(c)).toBe(false);
      }
    }
  });

  it("non-control variants map to at least one psychology theme", () => {
    for (const s of PHASE9_SLOTS) {
      for (const v of s.variants) {
        if (v.id === "control") continue;
        expect(themesForVariant(s.slot, v.id).length).toBeGreaterThan(0);
      }
    }
  });

  it("EXPERIMENT_THEME_MAP carries Phase 9 entries", () => {
    const phase9 = EXPERIMENT_THEME_MAP.filter((e) =>
      PHASE9_SLOTS.some((s) => s.slot === e.test_name),
    );
    expect(phase9.length).toBeGreaterThanOrEqual(15);
  });

  // ── Phase 9.1 — audience-aligned variants ──────────────────────────
  it("Phase 9.1 — all audience variant IDs are registered on their slots", () => {
    for (const [slotName, variantIds] of Object.entries(PHASE9_1_VARIANTS)) {
      const slot = MOS_CRO_SLOTS.find((x) => x.slot === slotName);
      expect(slot, `slot ${slotName} missing`).toBeDefined();
      for (const id of variantIds) {
        expect(
          slot!.variants.some((v) => v.id === id),
          `variant ${slotName}/${id} missing`,
        ).toBe(true);
      }
    }
  });

  it("Phase 9.1 — every audience variant has copy", () => {
    const maps: Record<string, Record<string, string | null>> = {
      mos_lp_psychology_headline: LP_PSYCHOLOGY_HEADLINE_COPY,
      mos_lp_psychology_subline: LP_PSYCHOLOGY_SUBLINE_COPY,
      mos_lp_cta_psychology: LP_CTA_PSYCHOLOGY_COPY,
      mos_lp_micro_trust_inline: LP_MICRO_TRUST_INLINE_COPY,
    };
    for (const [slotName, ids] of Object.entries(PHASE9_1_VARIANTS)) {
      for (const id of ids) {
        const copy = maps[slotName][id];
        expect(typeof copy).toBe("string");
        expect((copy as string).length).toBeGreaterThan(0);
      }
    }
  });

  it("Phase 9.1 — every audience variant maps to at least one winning theme", () => {
    for (const [slotName, ids] of Object.entries(PHASE9_1_VARIANTS)) {
      for (const id of ids) {
        const themes = themesForVariant(slotName, id);
        expect(themes.length).toBeGreaterThan(0);
        expect(themes.some((t) => WINNING_THEMES.has(t))).toBe(true);
      }
    }
  });
});
