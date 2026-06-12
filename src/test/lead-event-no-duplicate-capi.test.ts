/**
 * Regression guard — Lead event must fire EXACTLY once per browser AND once
 * per CAPI per successful lead save.
 *
 * Root cause history: `LeadCaptureGate.tsx` previously called both
 *   - trackPixelEvent("LEAD_CAPTURED", …)   // auto-mirrors browser + CAPI
 *   - sendCapiEvent({ event_name: "Lead" }) // explicit second CAPI fire
 * → Meta received 2 CAPI Lead events with identical event_id.
 * → Meta Pixel Helper flagged "Lead 2× mit identischen Daten".
 *
 * Same duplicate pattern existed for HighQualityLead.
 *
 * These tests fail if anyone re-adds an explicit `sendCapiEvent({event_name:"Lead"...})`
 * or `sendCapiEvent({event_name:"HighQualityLead"...})` in LeadCaptureGate.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  resolve(__dirname, "../components/funnel/LeadCaptureGate.tsx"),
  "utf8",
);

describe("LeadCaptureGate — no duplicate CAPI Lead", () => {
  it("does NOT call sendCapiEvent({event_name:'Lead'}) — trackPixelEvent already mirrors", () => {
    const hasExplicitLeadCapi =
      /sendCapiEvent\s*\(\s*\{[\s\S]*?event_name\s*:\s*["']Lead["']/.test(SRC);
    expect(
      hasExplicitLeadCapi,
      "LeadCaptureGate must not emit a second CAPI Lead — trackPixelEvent already mirrors via CAPI_MIRROR_NAMES.",
    ).toBe(false);
  });

  it("does NOT call sendCapiEvent({event_name:'HighQualityLead'}) — trackPixelEvent already mirrors", () => {
    const hasExplicitHqlCapi =
      /sendCapiEvent\s*\(\s*\{[\s\S]*?event_name\s*:\s*["']HighQualityLead["']/.test(
        SRC,
      );
    expect(
      hasExplicitHqlCapi,
      "LeadCaptureGate must not emit a second CAPI HighQualityLead — trackPixelEvent already mirrors.",
    ).toBe(false);
  });

  it("fires exactly ONE trackPixelEvent('LEAD_CAPTURED', …)", () => {
    const matches = SRC.match(/trackPixelEvent\(\s*["']LEAD_CAPTURED["']/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("fires exactly ONE trackPixelEvent('HIGH_QUALITY_LEAD', …)", () => {
    const matches =
      SRC.match(/trackPixelEvent\(\s*["']HIGH_QUALITY_LEAD["']/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("Lead event_id is shared (single buildEventId('Lead', leadId) call)", () => {
    const matches = SRC.match(/buildEventId\(\s*["']Lead["']/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
