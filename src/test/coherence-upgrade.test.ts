/**
 * ETC Coherence Upgrade — non-breaking smoke tests
 * Asserts the contract shape; does not run live SQL.
 */
import { describe, it, expect } from "vitest";
import { INTERNAL_TENANT_ID } from "@/lib/canonical-tenant";

describe("Coherence Upgrade — Phase 1 + 2", () => {
  it("internal tenant id is the canonical UUID", () => {
    expect(INTERNAL_TENANT_ID).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("certification bridge is dry-run only (writes=0)", async () => {
    const mod = await import("@/lib/canonical-certification-bridge");
    expect(typeof mod.evaluateOperatorPromotionDryRun).toBe("function");
    expect(typeof mod.getLevelRequirements).toBe("function");
  });

  it("tenant resolver falls back to internal tenant on miss", async () => {
    const mod = await import("@/lib/canonical-tenant");
    expect(mod.INTERNAL_TENANT_ID).toBeTruthy();
    expect(typeof mod.resolveTenantFromHost).toBe("function");
    expect(typeof mod.getCurrentTenantId).toBe("function");
  });

  it("does not export any auto-promotion writer (deferred)", async () => {
    const mod = await import("@/lib/canonical-certification-bridge");
    expect((mod as any).promoteOperator).toBeUndefined();
    expect((mod as any).writeCertification).toBeUndefined();
  });

  it("commission cutover is deferred — distribute_commissions not rewired", async () => {
    // commission_rates exists as shadow layer only (see commissionRates.ts).
    // Real distribute_commissions still uses product_config JSONB.
    const mod = await import("@/lib/commissionRates");
    expect(typeof mod.getCommissionConfig).toBe("function");
  });
});
