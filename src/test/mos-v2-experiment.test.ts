/**
 * MOS LP V2 experiment — invariants & isolation guards.
 *
 * These tests are static (no JSDOM render) — they assert that the
 * additive A/B layer for /masterofsales does NOT touch any of the
 * locked surfaces (quiz, booking, tracking, CRM, attribution, pixel,
 * CAPI, funnel logic, allocator core, DB schema).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/MasterOfSales.tsx"), "utf8");
const HERO_V2 = readFileSync(
  resolve(ROOT, "src/components/masterofsales/HeroMosV2.tsx"),
  "utf8",
);
const PREVIEW = readFileSync(
  resolve(ROOT, "src/pages/admin/MosAbPreview.tsx"),
  "utf8",
);
const APP = readFileSync(resolve(ROOT, "src/App.tsx"), "utf8");

describe("MOS LP V2 — A/B experiment", () => {
  it("defines a sticky mos_hero_lp slot with two equal-weight variants", () => {
    expect(PAGE).toMatch(/MOS_HERO_SLOT\s*=\s*\{[\s\S]*?slot:\s*"mos_hero_lp"/);
    expect(PAGE).toMatch(/id:\s*"mos_v1",\s*baseWeight:\s*0\.5/);
    expect(PAGE).toMatch(/id:\s*"mos_v2",\s*baseWeight:\s*0\.5/);
  });

  it("supports the ?mos=v1|v2 force-override and persists it in sessionStorage", () => {
    expect(PAGE).toMatch(/readForcedMosHeroVariant/);
    expect(PAGE).toMatch(/searchParams\.get\("mos"\)/);
    expect(PAGE).toMatch(/sessionStorage\.setItem\("etc:mos_force_variant"/);
  });

  it("emits experiment_exposure exactly once per session — never for forced sessions", () => {
    expect(PAGE).toMatch(/exposure_fired_\$\{MOS_HERO_SLOT\.slot\}_v1/);
    // Forced sessions short-circuit BEFORE the exposure event is fired.
    expect(PAGE).toMatch(/if\s*\(isMosHeroForced\)\s*return;[\s\S]*?trackFunnelEvent\("experiment_exposure"/);
  });

  it("V2 hero re-uses the parent's CTA href + handler — quiz/booking untouched", () => {
    expect(HERO_V2).toMatch(/heroHref:\s*string/);
    expect(HERO_V2).toMatch(/onCtaClick:\s*\(\)\s*=>\s*void/);
    expect(HERO_V2).toMatch(/to=\{heroHref\}/);
    expect(HERO_V2).toMatch(/onClick=\{onCtaClick\}/);
    // V2 must NOT define its own /apply or /booking targets as string literals.
    expect(HERO_V2).not.toMatch(/["'`]\/apply\/quiz/);
    expect(HERO_V2).not.toMatch(/["'`]\/booking/);
  });

  it("V2 hero uses canonical data-mos-section=\"hero\" so SectionViewTracker fires identically", () => {
    expect(HERO_V2).toMatch(/data-mos-section="hero"/);
    expect(HERO_V2).toMatch(/data-hero-variant="mos_v2"/);
  });

  it("MasterOfSales renders ONLY V2 when bucket = mos_v2 (no double-hero)", () => {
    expect(PAGE).toMatch(/\{isMosV2 && \(\s*<HeroMosV2/);
    expect(PAGE).toMatch(/\{!isMosV2 && \(/);
  });

  it("does NOT introduce any new tracking, CRM, attribution or DB surfaces", () => {
    const forbidden = [
      /supabase\.\w+\(/,
      /new Supabase/,
      /["'`]\/apply\/quiz/, // hero V2 itself must not own the quiz URL as a string literal
      /\bfetch\(/,
      /\bfbq\(/,
      /trackFunnelEvent\(/,
    ];
    for (const re of forbidden) {
      expect(re.test(HERO_V2), `HeroMosV2 must not contain ${re}`).toBe(false);
    }
  });

  it("admin preview is registered at /preview/mos-ab and admin-only", () => {
    expect(APP).toMatch(/MosAbPreview\s*=\s*lazy/);
    expect(APP).toMatch(/path="\/preview\/mos-ab"[\s\S]*?requireAdmin[\s\S]*?MosAbPreview/);
  });

  it("preview never hits the live funnel (no live tracking imports, no allocator)", () => {
    expect(PREVIEW).not.toMatch(/trackFunnelEvent/);
    expect(PREVIEW).not.toMatch(/getAbSlot|useAbSlot|useAbWeights/);
    expect(PREVIEW).not.toMatch(/forwardTrackingParams/);
    // Live deep-links use the force param so rollup excludes them.
    expect(PREVIEW).toMatch(/\/masterofsales\?mos=v1/);
    expect(PREVIEW).toMatch(/\/masterofsales\?mos=v2/);
  });

  it("existing locked surfaces remain untouched in MasterOfSales", () => {
    // Canonical quiz path constant unchanged.
    expect(PAGE).toMatch(/MEN_QUIZ_PATH = "\/apply\/quiz\?aud=men"/);
    // Master-Funnel-ID + funnel_view session guard unchanged.
    expect(PAGE).toMatch(/FUNNEL_VIEW_SESSION_KEY = "mos_funnel_view_fired_v1"/);
    expect(PAGE).toMatch(/ensureMasterFunnelId/);
    // Existing hero CTA mirror events still wired.
    expect(PAGE).toMatch(/MASTEROFSALES_HERO_CTA_CLICK/);
    expect(PAGE).toMatch(/MASTER_QUIZ_STARTED/);
  });
});
