/**
 * CRO-Lückenschluss WP1 + Prompt 2 — Smoke Tests.
 *
 * Statisch: prüft Wiring von RoadmapManifestBar, inline Masterclass + Quartals-
 * Cap-Blocks am Hero-CTA, Canon-Label "Closer Readiness Call™ starten",
 * Disclaimer-Copy, keine Funnel-Mutation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/MasterOfSales.tsx"), "utf8");
const ROADMAP = readFileSync(
  resolve(ROOT, "src/components/masterofsales/RoadmapManifestBar.tsx"),
  "utf8",
);
const CTA = readFileSync(
  resolve(ROOT, "src/components/masterofsales/MasterOfSalesCtaPair.tsx"),
  "utf8",
);

describe("MasterOfSales CRO Gap Closure (WP1 + Prompt 2)", () => {
  it("RoadmapManifestBar ist in Page-Komposition referenziert", () => {
    expect(PAGE).toMatch(/<RoadmapManifestBar\b/);
    expect(PAGE).toMatch(/import RoadmapManifestBar/);
  });

  it("Hero enthält KEINEN Bewegungs-/Versprechen-Disclaimer mehr", () => {
    expect(PAGE).not.toMatch(/in Bewegung zu kommen/);
    expect(PAGE).not.toMatch(/Versprechen einzulösen/);
  });

  it("Prompt 2 — Canon-CTA-Label überall", () => {
    expect(PAGE).toMatch(/CANONICAL_CTA_LABEL = "Closer Readiness Call™ starten"/);
    expect(CTA).toMatch(/Closer Readiness Call™ starten/);
    expect(CTA).not.toMatch(/Nächsten Schritt ansehen/);
    expect(CTA).not.toMatch(/Potenzial-Analyse starten/);
  });

  it("Prompt 2 — Masterclass-Block oberhalb des Hero-CTAs", () => {
    expect(PAGE).toMatch(/Die Masterclass ist die erste Stufe des Systems/);
    expect(PAGE).toMatch(/90 Minuten\. Dein erstes Gesprächssystem/);
    expect(PAGE).toMatch(/Geld zurück\. Keine Diskussion/);
  });

  it("Prompt 2 — Quartals-Cap-Block unterhalb des Hero-CTAs", () => {
    expect(PAGE).toMatch(/Die Plätze pro Quartal sind begrenzt/);
    expect(PAGE).toMatch(/Wenn sie belegt sind, gibt es eine Warteliste/);
  });

  it("Roadmap-View-Event ist verdrahtet & sessionStorage-guarded", () => {
    expect(ROADMAP).toMatch(/trackFunnelEvent\("MASTER_ROADMAP_VIEW"/);
    expect(ROADMAP).toMatch(/sessionStorage\.getItem/);
    expect(ROADMAP).toMatch(/sessionStorage\.setItem/);
  });

  it("Keine Garantien / € in Roadmap-Section", () => {
    const forbidden = [/\bgarantiert\b/i, /\bGarantie\b/, /€\s*\d/];
    for (const re of forbidden) {
      expect(re.test(ROADMAP), `forbidden: ${re}`).toBe(false);
    }
  });

  it("Roadmap zeigt 9 / 33 / L0–L8 (Creative-Canon)", () => {
    expect(ROADMAP).toMatch(/"9"/);
    expect(ROADMAP).toMatch(/"33"/);
    expect(ROADMAP).toMatch(/L0–L8/);
  });

  it("Funnel unverändert: Routing-Pfad konstant", () => {
    expect(PAGE).toMatch(/MEN_QUIZ_PATH = "\/apply\/quiz\?aud=men"/);
  });
});
