/**
 * Grand-Slam-Offer Smoke Tests für /masterofsales.
 *
 * Statisch (kein JSDOM-Render): prüft Copy-Compliance und A/B-Slot-Definitionen.
 * Funnel-Guards (CTA-Routing, Eventnamen) bleiben durch bestehende
 * `MasterOfSalesCtaPair` + `MidCta`-Pipelines geschützt.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/MasterOfSales.tsx"), "utf8");
const VALUE = readFileSync(
  resolve(ROOT, "src/components/masterofsales/ValueStackBlock.tsx"),
  "utf8",
);
const RISK = readFileSync(
  resolve(ROOT, "src/components/masterofsales/RiskReversalBlock.tsx"),
  "utf8",
);
const BONUS = readFileSync(
  resolve(ROOT, "src/components/masterofsales/BonusStackBlock.tsx"),
  "utf8",
);
const OUTCOME = readFileSync(
  resolve(ROOT, "src/components/masterofsales/OutcomeTransformationStrip.tsx"),
  "utf8",
);

const ALL = [PAGE, VALUE, RISK, BONUS, OUTCOME].join("\n");

describe("MasterOfSales Grand-Slam Offer — compliance", () => {
  it("T12/T13: keine harten Garantien oder Einkommensversprechen in neuer Copy", () => {
    const forbidden = [
      /\bgarantiert\b/i,
      /\bGarantie\b/,
      /\bJob sicher\b/i,
      /\b10\s?k\b/i,
      /\bjob garantiert\b/i,
    ];
    for (const re of forbidden) {
      expect(
        re.test(VALUE + RISK + BONUS + OUTCOME),
        `forbidden phrase matched: ${re}`,
      ).toBe(false);
    }
  });

  it("T3/T7/T8: alle neuen CTAs gehen durch das Männer-Quiz mit source=masterofsales", () => {
    // Neuer MidCta-Slot 'after_value_stack' nutzt MEN_QUIZ_PATH+source=masterofsales-after_value_stack
    expect(PAGE).toMatch(/slotName="after_value_stack"/);
    // MidCta-Komponente baut href aus MEN_QUIZ_PATH + &source=masterofsales-${slotName}
    expect(PAGE).toMatch(/MEN_QUIZ_PATH = "\/apply\/quiz\?aud=men"/);
    expect(PAGE).toMatch(
      /\$\{MEN_QUIZ_PATH\}&source=masterofsales-\$\{slotName\}/,
    );
  });

  it("T11: neue A/B-Slots haben maximal 2 aktive Varianten", () => {
    const slots = [
      "VALUE_STACK_ORDER_SLOT",
      "RISK_REVERSAL_POSITION_SLOT",
      "SOCIAL_PROOF_POSITION_SLOT",
    ];
    for (const name of slots) {
      const re = new RegExp(
        `${name}\\s*=\\s*\\{[\\s\\S]*?variants:\\s*\\[([\\s\\S]*?)\\]`,
        "m",
      );
      const m = PAGE.match(re);
      expect(m, `slot ${name} not found`).toBeTruthy();
      const variantCount = (m![1].match(/baseWeight:/g) ?? []).length;
      expect(variantCount, `${name} should have exactly 2 variants`).toBe(2);
    }
  });

  it("Tracking: View-Events sind genau einmal pro Komponente verdrahtet", () => {
    expect((VALUE.match(/MASTER_VALUE_STACK_VIEW/g) ?? []).length).toBe(1);
    expect((RISK.match(/MASTER_RISK_REVERSAL_VIEW/g) ?? []).length).toBe(1);
    expect((BONUS.match(/MASTER_BONUS_STACK_VIEW/g) ?? []).length).toBe(1);
  });

  it("T1: alle 4 neuen Sections sind in der Page-Komposition referenziert", () => {
    expect(PAGE).toMatch(/<ValueStackBlock\b/);
    expect(PAGE).toMatch(/<RiskReversalBlock\b/);
    expect(PAGE).toMatch(/<BonusStackBlock\b/);
    expect(PAGE).toMatch(/<OutcomeTransformationStrip\b/);
  });

  it("Brief-Hooks E & F sind im bestehenden HERO_HEADLINE_SLOT registriert", () => {
    expect(PAGE).toMatch(/hook_e_richtung_statt_motivation_punkt/);
    expect(PAGE).toMatch(/hook_f_alltag_brechen/);
  });
});
