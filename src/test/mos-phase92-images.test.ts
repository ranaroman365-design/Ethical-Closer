/**
 * Phase 9.2 — Competence Proof Image A/B layer regression tests.
 *
 * Pure additive coverage:
 *   - All 7 image slots registered with `control` default.
 *   - Every non-control variant has a copy entry with non-empty alt.
 *   - Image copy/alt text contains no forbidden lifestyle/wealth vocabulary.
 *   - MOS_IMAGE_SLOT_IDS enumerates all 7 slot names.
 */
import { describe, it, expect } from "vitest";
import {
  MOS_IMAGE_SLOTS,
  MOS_IMAGE_SLOT_IDS,
  MOS_IMAGE_SLOT_COPY,
  MOS_LP_HERO_IMAGE,
  MOS_LP_TRAINING_IMAGE,
  MOS_LP_COMMUNITY_IMAGE,
  MOS_LP_CERTIFICATION_IMAGE,
  MOS_LP_CALL_SIMULATION_IMAGE,
  MOS_LP_GRADUATE_IMAGE,
  MOS_LP_TRANSFORMATION_IMAGE,
} from "@/lib/mos-image-slots";

const REQUIRED_SLOTS = [
  "mos_lp_hero_image",
  "mos_lp_training_image",
  "mos_lp_community_image",
  "mos_lp_certification_image",
  "mos_lp_call_simulation_image",
  "mos_lp_graduate_image",
  "mos_lp_transformation_image",
];

const FORBIDDEN = [
  /lamborghini/i,
  /\blaptop am strand\b/i,
  /\bstrand\b/i,
  /\b10k\b/i,
  /\b20k\b/i,
  /\bluxus\b/i,
  /schnell reich/i,
  /passives einkommen/i,
  /finanzielle freiheit/i,
  /reich werden/i,
  /\bguru\b/i,
];

describe("Phase 9.2 — Competence Proof Image slots", () => {
  it("all 7 image slots are registered", () => {
    for (const s of REQUIRED_SLOTS) {
      expect(MOS_IMAGE_SLOT_IDS).toContain(s);
      expect(MOS_IMAGE_SLOTS.find((x) => x.slot === s)).toBeDefined();
    }
  });

  it("every slot has a control variant", () => {
    for (const def of MOS_IMAGE_SLOTS) {
      expect(def.variants.some((v) => v.id === "control")).toBe(true);
    }
  });

  it("every slot has at least one non-control variant", () => {
    for (const def of MOS_IMAGE_SLOTS) {
      expect(def.variants.filter((v) => v.id !== "control").length).toBeGreaterThan(0);
    }
  });

  it("copy map returns null for control", () => {
    for (const def of MOS_IMAGE_SLOTS) {
      expect(MOS_IMAGE_SLOT_COPY[def.slot]?.control).toBeNull();
    }
  });

  it("every non-control variant has a copy entry with non-empty alt", () => {
    for (const def of MOS_IMAGE_SLOTS) {
      for (const v of def.variants) {
        if (v.id === "control") continue;
        const copy = MOS_IMAGE_SLOT_COPY[def.slot]?.[v.id];
        expect(copy, `${def.slot}/${v.id} missing copy`).toBeTruthy();
        expect(copy!.alt.length).toBeGreaterThan(0);
      }
    }
  });

  it("image alt text + captions do not contain forbidden vocabulary", () => {
    for (const def of MOS_IMAGE_SLOTS) {
      for (const v of def.variants) {
        if (v.id === "control") continue;
        const copy = MOS_IMAGE_SLOT_COPY[def.slot]?.[v.id];
        if (!copy) continue;
        const txt = `${copy.alt} ${copy.caption ?? ""}`;
        for (const pat of FORBIDDEN) {
          expect(
            pat.test(txt),
            `${def.slot}/${v.id} matched forbidden ${pat}: "${txt}"`,
          ).toBe(false);
        }
      }
    }
  });

  it("exports the canonical slot defs", () => {
    expect(MOS_LP_HERO_IMAGE.slot).toBe("mos_lp_hero_image");
    expect(MOS_LP_TRAINING_IMAGE.slot).toBe("mos_lp_training_image");
    expect(MOS_LP_COMMUNITY_IMAGE.slot).toBe("mos_lp_community_image");
    expect(MOS_LP_CERTIFICATION_IMAGE.slot).toBe("mos_lp_certification_image");
    expect(MOS_LP_CALL_SIMULATION_IMAGE.slot).toBe("mos_lp_call_simulation_image");
    expect(MOS_LP_GRADUATE_IMAGE.slot).toBe("mos_lp_graduate_image");
    expect(MOS_LP_TRANSFORMATION_IMAGE.slot).toBe("mos_lp_transformation_image");
  });
});
