/**
 * Data Consistency Tests
 * ---------------------
 * Verifies that all performance dashboard queries use correct columns,
 * limits, polling intervals, KPI formulas, and access thresholds.
 * No DB calls — pure source-level contract tests.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

// ─── Intelligence Control ───────────────────────────────────────────────────

describe("IntelligenceControl query contracts", () => {
  const src = readSrc("pages/admin/IntelligenceControl.tsx");

  it("leads query selects only required columns (no name, no created_at, no funnel_id)", () => {
    const match = src.match(/from\("leads"\)\.select\("([^"]+)"\)/);
    expect(match).toBeTruthy();
    const cols = match![1].split(",");
    expect(cols).not.toContain("name");
    expect(cols).not.toContain("created_at");
    expect(cols).not.toContain("funnel_id");
    expect(cols).not.toContain("total_calls_booked");
    // Must include KPI-critical columns
    expect(cols).toContain("has_booking");
    expect(cols).toContain("outcome");
    expect(cols).toContain("deal_value");
    expect(cols).toContain("payment_status");
    expect(cols).toContain("no_show_flag");
    expect(cols).toContain("total_calls_attended");
  });

  it("leads query limit ≤ 2000", () => {
    const match = src.match(/from\("leads"\).*?\.limit\((\d+)\)/s);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBeLessThanOrEqual(2000);
  });

  it("message_library_send_log selects only channel,status", () => {
    const match = src.match(/from\("message_library_send_log"\)\.select\("([^"]+)"\)/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe("channel,status");
  });

  it("message_performance_events selects only channel,event_type", () => {
    const match = src.match(/from\("message_performance_events"\)\.select\("([^"]+)"\)/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe("channel,event_type");
  });

  it("message queries limit ≤ 1500", () => {
    const sendMatch = src.match(/from\("message_library_send_log"\).*?\.limit\((\d+)\)/s);
    const perfMatch = src.match(/from\("message_performance_events"\).*?\.limit\((\d+)\)/s);
    expect(Number(sendMatch![1])).toBeLessThanOrEqual(1500);
    expect(Number(perfMatch![1])).toBeLessThanOrEqual(1500);
  });

  it("level_message_jobs limit ≤ 1000", () => {
    const match = src.match(/from\("level_message_jobs"\).*?\.limit\((\d+)\)/s);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBeLessThanOrEqual(1000);
  });

  it("lifecycle_touchpoint_jobs selects step_id,status,funnel_key (no created_at)", () => {
    const match = src.match(/from\("lifecycle_touchpoint_jobs"\)\.select\("([^"]+)"\)/);
    expect(match).toBeTruthy();
    expect(match![1]).not.toContain("created_at");
    expect(match![1]).toContain("step_id");
    expect(match![1]).toContain("status");
  });

  it("access gate at level >= 6", () => {
    expect(src).toContain("level >= 6");
    expect(src).toContain("AccessDenied");
  });

  it("has L6 scope filtering on leads query (setter_id/closer_id)", () => {
    expect(src).toContain("setter_id.eq.");
    expect(src).toContain("closer_id.eq.");
  });

  it("revenue formula uses deal_value * 100", () => {
    expect(src).toMatch(/deal_value\s*\?\?\s*0\)\s*\*\s*100/);
  });

  it("closed definition: outcome=won OR payment_status=paid", () => {
    expect(src).toContain('l.outcome === "won"');
    expect(src).toContain('l.payment_status === "paid"');
  });

  it("RANGE_DAYS maps 24h→1, 7d→7, 30d→30, 90d→90", () => {
    expect(src).toContain('"24h": 1');
    expect(src).toContain('"7d": 7');
    expect(src).toContain('"30d": 30');
    expect(src).toContain('"90d": 90');
  });
});

// ─── ConversionIntelligence ─────────────────────────────────────────────────

describe("ConversionIntelligence query contracts", () => {
  const src = readSrc("pages/admin/ConversionIntelligence.tsx");

  it("uses useAuth (not raw supabase.auth.getUser)", () => {
    expect(src).toContain("useAuth");
    expect(src).not.toMatch(/supabase\.auth\.getUser/);
  });

  it("imports and uses getLevelForStage", () => {
    expect(src).toContain("getLevelForStage");
  });

  it("has AccessDenied for unauthorized users", () => {
    expect(src).toContain("AccessDenied");
    expect(src).toMatch(/effectiveLevel\s*<\s*6.*AccessDenied/s);
  });

  it("leads query limit ≤ 2000", () => {
    const match = src.match(/from\("leads"\)[\s\S]*?\.limit\((\d+)\)/);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBeLessThanOrEqual(2000);
  });

  it("revenue formula uses deal_value * 100", () => {
    expect(src).toMatch(/deal_value\s*\?\?\s*0\)\s*\*\s*100/);
  });

  it("supports 24h window (windowDays = 1)", () => {
    expect(src).toContain("1, 7, 30, 90");
  });
});

// ─── PerformanceOverview (Talent Flow) ──────────────────────────────────────

describe("PerformanceOverview (Talent Flow) contracts", () => {
  const src = readSrc("pages/admin/PerformanceOverview.tsx");

  it("uses useAuth + getLevelForStage + roleLabel", () => {
    expect(src).toContain("useAuth");
    expect(src).toContain("getLevelForStage");
    expect(src).toContain("roleLabel");
  });

  it("access gate at effectiveLevel < 6", () => {
    expect(src).toMatch(/effectiveLevel\s*<\s*6.*AccessDenied/s);
  });

  it("range mapping: 24h→1, 7d→7, 90d→90, default→30", () => {
    expect(src).toContain('"24h" ? 1');
    expect(src).toContain('"7d" ? 7');
    expect(src).toContain('"90d" ? 90');
  });

  it("L6 scope: scopeUserId set for non-admin, non-L7+", () => {
    expect(src).toContain("scopeUserId");
    expect(src).toMatch(/effectiveLevel\s*>=\s*7/);
  });
});

// ─── Polling intervals ─────────────────────────────────────────────────────

describe("Polling interval contracts", () => {
  it("useKpiDashboard polls at 60s (not 30s)", () => {
    const src = readSrc("hooks/useKpiDashboard.ts");
    expect(src).toContain("60_000");
    expect(src).not.toContain("30_000");
  });

  it("usePerformanceDashboard polls at 5min", () => {
    const src = readSrc("hooks/usePerformanceDashboard.ts");
    expect(src).toContain("5 * 60 * 1000");
  });

  it("useOperatorComparison polls at 5min", () => {
    const src = readSrc("hooks/useOperatorComparison.ts");
    expect(src).toContain("5 * 60 * 1000");
  });
});
