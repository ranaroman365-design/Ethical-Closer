import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Execution Dashboard — Contract Tests
 * Validates independence from intelligence engine and correct data sources.
 */

const EXEC_SRC = fs.readFileSync(
  path.resolve(__dirname, "../components/performance/ExecutionDashboard.tsx"),
  "utf-8"
);

const APP_SRC = fs.readFileSync(
  path.resolve(__dirname, "../App.tsx"),
  "utf-8"
);

const SHELL_SRC = fs.readFileSync(
  path.resolve(__dirname, "../components/performance/PerformanceShell.tsx"),
  "utf-8"
);

const CTX_SRC = fs.readFileSync(
  path.resolve(__dirname, "../contexts/PerformanceFiltersContext.tsx"),
  "utf-8"
);

describe("ExecutionDashboard — Independence", () => {
  it("does not import intelligence engine", () => {
    expect(EXEC_SRC).not.toContain("conversion-intelligence-engine");
    expect(EXEC_SRC).not.toContain("computeIntelligenceSnapshot");
    expect(EXEC_SRC).not.toContain("computeFunnelKpis");
  });

  it("does not import canonical decision engine", () => {
    expect(EXEC_SRC).not.toContain("canonical-decision-engine");
    expect(EXEC_SRC).not.toContain("computeCanonicalDecision");
  });

  it("does not import lead scoring", () => {
    expect(EXEC_SRC).not.toContain("lead-scoring");
    expect(EXEC_SRC).not.toContain("deriveLeadQuality");
  });

  it("does not use deal_value for revenue computation", () => {
    // Exclude comments — only check non-comment lines
    const codeLines = EXEC_SRC.split("\n").filter(l => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
    const codeOnly = codeLines.join("\n");
    expect(codeOnly).not.toContain("deal_value");
  });

  it("uses calls.revenue as data source", () => {
    expect(EXEC_SRC).toContain("revenue");
    expect(EXEC_SRC).toContain('from("calls")');
  });

  it("queries appointments for today", () => {
    expect(EXEC_SRC).toContain('from("appointments")');
    expect(EXEC_SRC).toContain("starts_at");
  });
});

describe("ExecutionDashboard — Route registration", () => {
  it("route /members/performance/execution exists in App.tsx", () => {
    expect(APP_SRC).toContain('path="execution"');
    expect(APP_SRC).toContain("ExecutionDashboard");
  });

  it("/members/performance index now renders ExecutionDashboard", () => {
    // The index route should render ExecutionDashboard
    expect(APP_SRC).toMatch(/<Route index element=\{<ExecutionDashboard/);
  });

  it("execution tab exists in PerformanceShell", () => {
    expect(SHELL_SRC).toContain('"execution"');
    expect(SHELL_SRC).toContain("Execution");
  });

  it("execution route registered in PerformanceFiltersContext", () => {
    expect(CTX_SRC).toContain("/members/performance/execution");
    expect(CTX_SRC).toContain('"execution"');
  });
});

describe("ExecutionDashboard — Tab navigation", () => {
  it("PerformanceShell has 5 tabs: execution, revenue, talent, intelligence, l6", () => {
    const tabKeys = ["execution", "revenue", "talent", "intelligence", "l6"];
    for (const key of tabKeys) {
      expect(SHELL_SRC).toContain(`key: "${key}"`);
    }
  });

  it("activeTab detects /execution path", () => {
    expect(SHELL_SRC).toContain('pathname.includes("/execution")');
    expect(SHELL_SRC).toContain('return "execution"');
  });
});
