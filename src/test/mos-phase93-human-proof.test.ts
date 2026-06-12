import { describe, it, expect } from "vitest";
import {
  MOS_HUMAN_PROOF_SLOTS,
  MOS_HUMAN_PROOF_SLOT_IDS,
  MOS_HUMAN_PROOF_COPY,
  resolveHumanProofImageCopy,
} from "@/lib/mos-human-proof-slots";

/**
 * Phase 9.3 — Human Proof & Visual Trust regression suite.
 *
 * Locks the additive contract:
 *   1. 6 slots registered, each starting with control + ≥1 active variant.
 *   2. Every non-control variant resolves to non-empty src + non-empty alt.
 *   3. No forbidden lifestyle / wealth / lifestyle-money vocabulary leaks
 *      into copy or alt text.
 *   4. No placeholder strings ("Capture folgt", "Coming soon", "TODO",
 *      "Placeholder") appear anywhere in the human-proof copy.
 */

const FORBIDDEN_VOCAB = [
  // wealth / lifestyle
  "lambo",
  "lamborghini",
  "ferrari",
  "porsche",
  "rolex",
  "watch",
  "uhr",
  "luxury",
  "luxus",
  "beach",
  "strand",
  "laptop am",
  "passive",
  "passiv",
  "freedom",
  "freiheit",
  "remote lifestyle",
  // money / hype
  "10k",
  "20k",
  "100k",
  "money",
  "geld stack",
  "cash",
  "rich",
  "reich",
  "high ticket",
  "high-ticket",
  "schnell reich",
];

const FORBIDDEN_PLACEHOLDER = [
  "capture folgt",
  "coming soon",
  "todo",
  "placeholder",
  "lorem ipsum",
];

const EXPECTED_SLOT_IDS = [
  "mos_hero_human_proof",
  "mos_training_proof",
  "mos_community_proof",
  "mos_graduate_proof",
  "mos_certification_proof",
  "mos_transformation_proof",
] as const;

describe("Phase 9.3 — Human Proof slot registry", () => {
  it("registers all 6 required slots", () => {
    for (const id of EXPECTED_SLOT_IDS) {
      expect(MOS_HUMAN_PROOF_SLOT_IDS).toContain(id);
    }
    expect(MOS_HUMAN_PROOF_SLOTS.length).toBe(6);
  });

  it("every slot starts with control + ≥1 active variant", () => {
    for (const def of MOS_HUMAN_PROOF_SLOTS) {
      const ids = def.variants.map((v) => v.id);
      expect(ids[0]).toBe("control");
      expect(ids.length).toBeGreaterThanOrEqual(2);
      // control weight must be present (rollback safety).
      expect(def.variants[0].baseWeight).toBeGreaterThan(0);
    }
  });

  it("every non-control variant resolves to non-empty src + alt", () => {
    for (const def of MOS_HUMAN_PROOF_SLOTS) {
      for (const v of def.variants) {
        const copy = MOS_HUMAN_PROOF_COPY[def.slot]?.[v.id];
        if (v.id === "control") {
          expect(copy).toBeNull();
          continue;
        }
        expect(copy).toBeTruthy();
        expect(copy!.src).toBeTruthy();
        expect(copy!.src.length).toBeGreaterThan(8);
        expect(copy!.alt).toBeTruthy();
        expect(copy!.alt.length).toBeGreaterThan(8);
      }
    }
  });

  it("Phase 9.4 keeps every non-control CDN URL unique across all slots", () => {
    const seen = new Map<string, string>();
    for (const def of MOS_HUMAN_PROOF_SLOTS) {
      for (const v of def.variants) {
        if (v.id === "control") continue;
        const copy = MOS_HUMAN_PROOF_COPY[def.slot]?.[v.id];
        expect(copy?.src, `${def.slot}/${v.id} missing src`).toBeTruthy();
        const previous = seen.get(copy!.src);
        expect(
          previous,
          `Duplicate CDN URL reused by ${previous} and ${def.slot}/${v.id}: ${copy!.src}`,
        ).toBeUndefined();
        seen.set(copy!.src, `${def.slot}/${v.id}`);
      }
    }
    expect(seen.size).toBe(24);
  });

  it("every visible human-proof section resolves to a valid image, including control fallback", () => {
    for (const def of MOS_HUMAN_PROOF_SLOTS) {
      for (const v of def.variants) {
        const copy = resolveHumanProofImageCopy(def.slot, v.id);
        expect(copy, `${def.slot}/${v.id} resolved empty`).toBeTruthy();
        expect(copy!.src, `${def.slot}/${v.id} resolved without src`).toMatch(
          /^(\/__l5e\/assets-v1\/|user-uploads:\/\/)/,
        );
        expect(copy!.alt.length).toBeGreaterThan(8);
      }
    }
  });

  it("community never resolves empty and only uses community-owned variants", () => {
    const allowed = new Set(
      [
        "B_zoom_group",
        "C_live_training_room",
        "D_community_discussion",
        "E_peer_learning",
      ].map((id) => MOS_HUMAN_PROOF_COPY.mos_community_proof[id]?.src),
    );

    for (const v of MOS_HUMAN_PROOF_SLOTS.find((s) => s.slot === "mos_community_proof")!.variants) {
      const copy = resolveHumanProofImageCopy("mos_community_proof", v.id);
      expect(copy?.src, `community ${v.id} resolved empty`).toBeTruthy();
      expect(allowed.has(copy!.src), `community ${v.id} resolved non-community image`).toBe(true);
    }
  });

  it("transformation never reuses a training image", () => {
    const urlsFor = (slot: string) =>
      new Set(
        Object.entries(MOS_HUMAN_PROOF_COPY[slot])
          .filter(([variant]) => variant !== "control")
          .map(([, copy]) => copy?.src)
          .filter(Boolean),
      );
    const training = urlsFor("mos_training_proof");
    const transformation = urlsFor("mos_transformation_proof");

    for (const url of transformation) {
      expect(training.has(url), `transformation reused training image ${url}`).toBe(false);
    }
  });
});

describe("Phase 9.3 — Harm guard on copy vocabulary", () => {
  const allText: string[] = [];
  for (const slot of Object.keys(MOS_HUMAN_PROOF_COPY)) {
    for (const v of Object.keys(MOS_HUMAN_PROOF_COPY[slot])) {
      const c = MOS_HUMAN_PROOF_COPY[slot][v];
      if (!c) continue;
      allText.push(c.alt.toLowerCase());
      if (c.caption) allText.push(c.caption.toLowerCase());
    }
  }

  it("contains no forbidden lifestyle / wealth vocabulary", () => {
    for (const text of allText) {
      for (const term of FORBIDDEN_VOCAB) {
        expect(
          text.includes(term),
          `Forbidden term "${term}" found in: "${text}"`,
        ).toBe(false);
      }
    }
  });

  it("contains no placeholder strings on production copy", () => {
    for (const text of allText) {
      for (const term of FORBIDDEN_PLACEHOLDER) {
        expect(
          text.includes(term),
          `Placeholder string "${term}" found in: "${text}"`,
        ).toBe(false);
      }
    }
  });
});
