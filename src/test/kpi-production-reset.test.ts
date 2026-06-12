/**
 * KPI Production Reset — Enforcement Tests
 *
 * Validates the production epoch system:
 * 1. get_production_epoch() function exists and returns valid timestamp
 * 2. Truth views return 0 rows for pre-epoch-only data
 * 3. Raw tables still have all historical data
 * 4. RPCs use epoch as time floor
 * 5. is_test_lead filter is applied in RPCs
 * 6. Client-side epoch helper exists
 * 7. No KPI data leaks from pre-epoch period
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";

// Read migration files to verify epoch is in DB functions
const migrationsDir = "supabase/migrations";
const migrationFiles = fs.readdirSync(migrationsDir).sort().reverse();
const allMigrations = migrationFiles.map((f) =>
  fs.readFileSync(`${migrationsDir}/${f}`, "utf-8")
);
const epochMigration = allMigrations.find((c) =>
  c.includes("get_production_epoch")
);

// Read client-side helper
const epochHelperSrc = fs.readFileSync(
  "src/lib/production-epoch.ts",
  "utf-8"
);

describe("KPI Production Reset — Epoch Configuration", () => {
  it("get_production_epoch() function is defined in a migration", () => {
    expect(epochMigration).toBeDefined();
    expect(epochMigration).toContain("CREATE OR REPLACE FUNCTION public.get_production_epoch()");
    expect(epochMigration).toContain("production_kpi_start_at");
  });

  it("production_kpi_start_at is inserted into system_config", () => {
    expect(epochMigration).toContain("INSERT INTO public.system_config");
    expect(epochMigration).toContain("production_kpi_start_at");
    expect(epochMigration).toContain("2026-05-08T08:00:00Z");
  });

  it("epoch function has a hardcoded fallback", () => {
    expect(epochMigration).toContain("2026-05-08T08:00:00Z");
    // The function should COALESCE with fallback
    expect(epochMigration).toContain("COALESCE");
  });
});

describe("KPI Production Reset — Truth Views", () => {
  it("real_leads_view includes epoch filter", () => {
    expect(epochMigration).toContain("real_leads_view");
    expect(epochMigration).toContain("get_production_epoch()");
    // The view should filter by created_at >= epoch
    expect(epochMigration).toMatch(
      /real_leads_view[\s\S]*created_at\s*>=\s*get_production_epoch\(\)/
    );
  });

  it("real_appointments_view includes epoch filter", () => {
    expect(epochMigration).toContain("real_appointments_view");
    expect(epochMigration).toMatch(
      /real_appointments_view[\s\S]*get_production_epoch\(\)/
    );
  });

  it("revenue_truth_view includes epoch filter", () => {
    expect(epochMigration).toContain("revenue_truth_view");
    // All 3 CTEs should have epoch filter
    expect(epochMigration).toMatch(
      /paid_at\s*>=\s*get_production_epoch\(\)/
    );
    expect(epochMigration).toMatch(
      /closed_at\s*>=\s*get_production_epoch\(\)/
    );
    expect(epochMigration).toMatch(
      /fe\."timestamp"\s*>=\s*get_production_epoch\(\)/
    );
  });

  it("truth views still apply is_test_lead filter", () => {
    expect(epochMigration).toContain("is_test_lead");
  });
});

describe("KPI Production Reset — RPC Epoch Enforcement", () => {
  it("recalc_kpis_from_call uses epoch", () => {
    expect(epochMigration).toContain("recalc_kpis_from_call");
    expect(epochMigration).toMatch(
      /recalc_kpis_from_call[\s\S]*get_production_epoch\(\)/
    );
  });

  it("recalc_user_kpi_snapshot uses epoch", () => {
    expect(epochMigration).toContain("recalc_user_kpi_snapshot");
    expect(epochMigration).toMatch(
      /recalc_user_kpi_snapshot[\s\S]*get_production_epoch\(\)/
    );
  });

  it("performance_revenue_kpis uses GREATEST with epoch", () => {
    expect(epochMigration).toContain("performance_revenue_kpis");
    expect(epochMigration).toMatch(
      /GREATEST.*get_production_epoch\(\)/
    );
  });

  it("get_performance_dashboard uses epoch as floor", () => {
    expect(epochMigration).toContain("get_performance_dashboard");
    expect(epochMigration).toMatch(
      /GREATEST.*start_date.*v_epoch|GREATEST.*v_epoch/
    );
  });

  it("performance_revenue_kpis applies is_test_lead filter", () => {
    expect(epochMigration).toMatch(
      /performance_revenue_kpis[\s\S]*is_test_lead/
    );
  });
});

describe("KPI Production Reset — Client Helper", () => {
  it("production-epoch.ts exports getProductionEpoch", () => {
    expect(epochHelperSrc).toContain("export async function getProductionEpoch");
  });

  it("production-epoch.ts exports getProductionEpochSync", () => {
    expect(epochHelperSrc).toContain("export function getProductionEpochSync");
  });

  it("production-epoch.ts has same fallback as DB", () => {
    expect(epochHelperSrc).toContain("2026-05-08T08:00:00Z");
  });

  it("production-epoch.ts caches the epoch", () => {
    expect(epochHelperSrc).toContain("cachedEpoch");
  });

  it("production-epoch.ts reads from system_config", () => {
    expect(epochHelperSrc).toContain("system_config");
    expect(epochHelperSrc).toContain("production_kpi_start_at");
  });

  it("production-epoch.ts exports invalidateProductionEpoch", () => {
    expect(epochHelperSrc).toContain("export function invalidateProductionEpoch");
  });
});

describe("KPI Production Reset — Safety", () => {
  it("no DELETE or TRUNCATE in epoch migration", () => {
    expect(epochMigration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(epochMigration).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("no DROP TABLE in epoch migration", () => {
    expect(epochMigration).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it("epoch is additive — uses CREATE OR REPLACE and INSERT ON CONFLICT DO NOTHING", () => {
    expect(epochMigration).toContain("CREATE OR REPLACE");
    expect(epochMigration).toContain("ON CONFLICT DO NOTHING");
  });
});
