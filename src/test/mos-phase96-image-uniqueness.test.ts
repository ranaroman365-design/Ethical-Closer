/**
 * Phase 9.6B — Image-uniqueness HARD test.
 *
 * Enforces that the visible Human-Proof sections render unique CDN URLs
 * with no empty slots. Runs in CI/Vitest → build fails on violation.
 *
 * Surface under test = the deterministic fallback URL of every visible
 * proof slot (the URL rendered when sticky bucket is `control` or missing).
 * Sticky-bucket variants live inside the same slot's asset pool, so the
 * fallback baseline is the strongest invariant to lock down.
 *
 * Beruf row is NOT in this set — it is a hardcoded static asset that
 * deliberately bypasses A/B. It's enumerated separately below.
 */
import { describe, expect, it } from "vitest";
import berufDiscovery from "@/assets/lp-proof-p94/beruf-discovery.jpg.asset.json";
import {
  computeProofUniquenessReport,
  resolveFallbackUrl,
  type ProofImageBinding,
} from "@/lib/mos-image-uniqueness";

const VISIBLE_AB_SLOTS = [
  "mos_hero_human_proof",
  "mos_training_proof",
  "mos_community_proof",
  "mos_graduate_proof",
  "mos_certification_proof",
  "mos_transformation_proof",
] as const;

describe("Phase 9.6B — image uniqueness (hard fail)", () => {
  it("every visible proof slot has a non-empty fallback URL", () => {
    for (const slot of VISIBLE_AB_SLOTS) {
      const url = resolveFallbackUrl(slot);
      expect(url, `slot ${slot} has empty fallback URL`).toBeTruthy();
    }
    expect(berufDiscovery.url).toBeTruthy();
  });

  it("no duplicate URLs across simultaneously visible proof sections", () => {
    const bindings: ProofImageBinding[] = [
      // Beruf is the hardcoded static image (not part of A/B).
      {
        slot: "static_beruf_discovery",
        variant: "static",
        url: berufDiscovery.url,
      },
      ...VISIBLE_AB_SLOTS.map((slot) => ({
        slot,
        variant: "fallback",
        url: resolveFallbackUrl(slot),
      })),
    ];

    const report = computeProofUniquenessReport(bindings);

    expect(
      report.duplicates,
      `duplicate proof URLs detected: ${JSON.stringify(report.duplicates)}`,
    ).toEqual([]);
    expect(
      report.empties,
      `empty proof slots detected: ${JSON.stringify(report.empties)}`,
    ).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("computeProofUniquenessReport correctly flags violations", () => {
    const dup = computeProofUniquenessReport([
      { slot: "a", variant: "x", url: "/same.jpg" },
      { slot: "b", variant: "y", url: "/same.jpg" },
      { slot: "c", variant: "z", url: null },
    ]);
    expect(dup.ok).toBe(false);
    expect(dup.duplicates).toHaveLength(1);
    expect(dup.duplicates[0].slots.sort()).toEqual(["a", "b"]);
    expect(dup.empties).toEqual(["c"]);
  });
});
