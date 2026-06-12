import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("Phase 2 Revenue Truth Migration — Acceptance Tests", () => {
  const bClassFiles = [
    { name: "DirectorOverview", path: "../components/director/DirectorOverview.tsx" },
    { name: "RevenueIntelligence", path: "../pages/members/RevenueIntelligence.tsx" },
    { name: "PartnerDashboard", path: "../components/members/PartnerDashboard.tsx" },
    { name: "FunnelKpiDashboard", path: "../components/admin/FunnelKpiDashboard.tsx" },
    { name: "ConversionIntelligence", path: "../pages/admin/ConversionIntelligence.tsx" },
    { name: "AssignmentIntelligence", path: "../pages/members/AssignmentIntelligence.tsx" },
  ];

  // T1: No confirmed revenue KPI uses leads.deal_value directly for aggregation
  for (const f of bClassFiles) {
    it(`T1: ${f.name} does not use deal_value for confirmed revenue aggregation`, () => {
      const src = read(f.path);
      // Should not have: .reduce(...deal_value...) for revenue (except pipeline/display)
      // Check that calls table is queried for revenue
      if (f.name !== "ConversionIntelligence") {
        expect(src).toContain("calls");
      }
      // Should not have the old pattern of summing deal_value as revenue
      const lines = src.split("\n");
      for (const line of lines) {
        // Skip type definitions, display-only, and comments
        if (line.includes("type ") || line.includes("interface ") || line.includes("//") || line.includes("Pipeline")) continue;
        if (line.includes("deal_value") && line.includes("reduce") && !line.includes("Pipeline") && !line.includes("sub-component")) {
          // This is a revenue aggregation using deal_value — should not exist
          expect(line).not.toMatch(/reduce.*deal_value/);
        }
      }
    });
  }

  // T2: Confirmed revenue equals calls.revenue closed_won
  it("T2: DirectorOverview uses revByCloser from calls for team revenue", () => {
    const src = read("../components/director/DirectorOverview.tsx");
    expect(src).toContain("revByCloser");
    expect(src).toContain("closed_won");
  });

  it("T2: RevenueIntelligence uses totalConfirmedRevenue from calls", () => {
    const src = read("../pages/members/RevenueIntelligence.tsx");
    expect(src).toContain("totalConfirmedRevenue");
    expect(src).toContain("callsRevByCloser");
  });

  it("T2: FunnelKpiDashboard queries calls for revenue", () => {
    const src = read("../components/admin/FunnelKpiDashboard.tsx");
    expect(src).toContain("callsRes");
    expect(src).toContain("closed_won");
  });

  it("T2: PartnerDashboard uses calls for revenue", () => {
    const src = read("../components/members/PartnerDashboard.tsx");
    expect(src).toContain("callsData");
    expect(src).toContain("Confirmed Revenue");
  });

  it("T2: ConversionIntelligence uses confirmedRevByLead from calls", () => {
    const src = read("../pages/admin/ConversionIntelligence.tsx");
    expect(src).toContain("confirmedRevByLead");
    expect(src).toContain("lead_id");
  });

  // T3: Pipeline value still uses deal_value but is not labelled as revenue
  it("T3: RevenueIntelligence source perf uses pipelineValue not revenue", () => {
    const src = read("../pages/members/RevenueIntelligence.tsx");
    expect(src).toContain("pipelineValue");
  });

  // T5: Existing deal entry flows still work (CallOutcomeModal unchanged)
  it("T5: CallOutcomeModal still uses deal_value for input", () => {
    const src = read("../components/daily-execution/CallOutcomeModal.tsx");
    expect(src).toContain("deal_value");
  });
});
