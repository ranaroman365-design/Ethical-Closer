import { describe, it, expect } from "vitest";
import { validatePhone } from "@/lib/phone-validation";
import * as fs from "fs";
import * as path from "path";

describe("Phase 1 Lead Quality Fix — Regression Tests", () => {
  // T1: RPC without phone must reject (tested via server-side, here we verify client mirror)
  it("T1: validatePhone rejects empty phone", () => {
    const r = validatePhone("");
    expect(r.phone_valid).toBe(false);
    expect(r.phone_quality_status).toBe("missing");
  });

  // T2: Fake numbers rejected
  it("T2: validatePhone rejects fake numbers", () => {
    for (const fake of ["123456789", "000000000", "111111111", "999999999", "654321000"]) {
      const r = validatePhone(fake);
      expect(r.phone_valid).toBe(false);
    }
  });

  // T3: Valid German mobile accepted with phone_valid=true
  it("T3: valid +49 mobile → phone_valid=true, normalized", () => {
    const r = validatePhone("+49 170 1234567");
    expect(r.phone_valid).toBe(true);
    expect(r.phone_quality_status).toBe("valid");
    expect(r.phone_normalized).toBe("+491701234567");
  });

  // T4: AssignmentIntelligence confirmed revenue uses calls.revenue
  it("T4: AssignmentIntelligence uses calls.revenue for confirmed revenue", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../pages/members/AssignmentIntelligence.tsx"),
      "utf-8"
    );
    // Must query calls table for revenue
    expect(src).toContain("calls");
    expect(src).toContain("closedWonRevenue");
    // Must NOT use deal_value for revenue calculation in closer ranking
    expect(src).not.toMatch(/revenue\s*=\s*leads\.filter.*deal_value/);
    // The old TODO comment should be gone
    expect(src).not.toContain("TODO: migrate to calls.revenue");
  });

  // T5: HighQualityLead fires only for phone_valid=true AND lead_quality A/B
  it("T5: HighQualityLead gate logic in LeadCaptureGate", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/funnel/LeadCaptureGate.tsx"),
      "utf-8"
    );
    // Must check phone_valid
    expect(src).toContain("phoneResult.phone_valid");
    // Must check lead quality A or B
    expect(src).toMatch(/leadQuality\s*===\s*["']A["']/);
    expect(src).toMatch(/leadQuality\s*===\s*["']B["']/);
  });

  // T6: HighQualityLead CAPI sends custom event name, not generic "Lead"
  it("T6: CAPI mirror uses 'HighQualityLead' not 'Lead'", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/funnel/LeadCaptureGate.tsx"),
      "utf-8"
    );
    // The CAPI sendCapiEvent call for HighQualityLead should NOT use "Lead" as event_name
    const capiSection = src.slice(src.indexOf("// CAPI mirror"));
    expect(capiSection).toContain("HighQualityLead");
    expect(capiSection).not.toMatch(/event_name:\s*["']Lead["']/);
  });

  // T7: CAPI type includes HighQualityLead
  it("T7: CAPI type supports HighQualityLead", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../lib/meta-capi.ts"),
      "utf-8"
    );
    expect(src).toContain('"HighQualityLead"');
  });

  // T8: CAPI_MIRROR_NAMES includes HighQualityLead
  it("T8: Pixel CAPI mirror list includes HighQualityLead", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../lib/meta-pixel.ts"),
      "utf-8"
    );
    expect(src).toContain('"HighQualityLead"');
  });

  // T9: Phone quality is written atomically (no separate post-update)
  it("T9: LeadCaptureGate does NOT do separate phone quality update", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/funnel/LeadCaptureGate.tsx"),
      "utf-8"
    );
    // Must not have a .update() call to write phone fields separately
    expect(src).not.toContain('.update({');
    expect(src).not.toContain("phone quality update failed");
  });

  // T10: Attribution failure logging
  it("T10: attribution link failure logs reason", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../components/funnel/LeadCaptureGate.tsx"),
      "utf-8"
    );
    expect(src).toContain("ATTRIBUTION_LINK_FAILED");
    expect(src).toContain("no_session_id");
  });
});
