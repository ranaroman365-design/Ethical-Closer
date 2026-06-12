/**
 * Real Proof + First-Win Smoke Tests für /masterofsales.
 *
 * Statisch (kein JSDOM-Render): Compliance & Wiring-Checks.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/MasterOfSales.tsx"), "utf8");
const PROOF = readFileSync(
  resolve(ROOT, "src/components/masterofsales/RealTransformationProofBlock.tsx"),
  "utf8",
);
const FIRSTWIN = readFileSync(
  resolve(ROOT, "src/components/masterofsales/FirstWinMechanismBlock.tsx"),
  "utf8",
);

describe("MasterOfSales — Real Proof + First-Win", () => {
  it("T12/T13: keine Fake-Proofs / Garantien / Geldversprechen", () => {
    const forbidden = [
      /\bgarantiert\b/i,
      /\bGarantie\b/,
      /\bPlacement\b/i,
      /\bJob sicher\b/i,
      /\b10\s?k\b/i,
      /€\s*\d/,
      /\$\s*\d/,
      /\bLambo/i,
    ];
    const all = PROOF + FIRSTWIN;
    for (const re of forbidden) {
      expect(re.test(all), `forbidden phrase matched: ${re}`).toBe(false);
    }
  });

  it("T4/T5/T6: FirstWin-CTA bleibt im Männer-Quiz mit source=masterofsales", () => {
    expect(FIRSTWIN).toMatch(
      /\/apply\/quiz\?aud=men&source=masterofsales-first_win/,
    );
    expect(FIRSTWIN).not.toMatch(/source=apply/);
    expect(FIRSTWIN).not.toMatch(/\/booking-men/);
  });

  it("T10: alle 4 neuen A/B-Slots haben genau 2 Varianten", () => {
    const slots = [
      "PROOF_ASSET_POSITION_SLOT",
      "FIRST_WIN_ANGLE_SLOT",
      "PROOF_MESSAGE_SLOT",
      "FIRST_WIN_CTA_SLOT",
    ];
    for (const name of slots) {
      const re = new RegExp(
        `${name}\\s*=\\s*\\{[\\s\\S]*?variants:\\s*\\[([\\s\\S]*?)\\]`,
        "m",
      );
      const m = PAGE.match(re);
      expect(m, `slot ${name} not found`).toBeTruthy();
      const count = (m![1].match(/baseWeight:/g) ?? []).length;
      expect(count, `${name} should have exactly 2 variants`).toBe(2);
    }
  });

  it("T9: neue Events sind verdrahtet & sessionStorage-guarded", () => {
    expect(PROOF).toMatch(/trackFunnelEvent\("MASTER_REAL_PROOF_VIEW"/);
    expect(FIRSTWIN).toMatch(/trackFunnelEvent\("MASTER_FIRST_WIN_VIEW"/);
    expect(FIRSTWIN).toMatch(/trackFunnelEvent\("MASTER_FIRST_WIN_CLICK"/);
    // sessionStorage guards present
    for (const src of [PROOF, FIRSTWIN]) {
      expect(src).toMatch(/sessionStorage\.getItem/);
      expect(src).toMatch(/sessionStorage\.setItem/);
    }
  });

  it("T1: neue Sections sind in der Page-Komposition referenziert", () => {
    expect(PAGE).toMatch(/<RealTransformationProofBlock\b/);
    expect(PAGE).toMatch(/<FirstWinMechanismBlock\b/);
  });

  it("T8: bestehende Events / Slots nicht entfernt", () => {
    expect(PAGE).toMatch(/MASTER_HERO_CTA/);
    expect(PAGE).toMatch(/MASTER_QUIZ_START/);
    expect(PAGE).toMatch(/MASTER_QUIZ_STARTED/);
    expect(PAGE).toMatch(/VALUE_STACK_ORDER_SLOT/);
    expect(PAGE).toMatch(/RISK_REVERSAL_POSITION_SLOT/);
    expect(PAGE).toMatch(/SOCIAL_PROOF_POSITION_SLOT/);
  });
});
