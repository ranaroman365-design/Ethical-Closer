/**
 * E2E Regression Suite — Performance Operating System
 * ====================================================
 * Verifies after every change:
 *   1. Route configuration (all performance routes registered)
 *   2. Auth guards (ProtectedRoute, AccessDenied, L6+ gates)
 *   3. Sidebar navigation links (all performance nav items present)
 *   4. PerformanceShell tab structure (revenue/talent/intelligence)
 *   5. Component contracts (imports, exports, key props)
 *   6. Cross-dashboard consistency (filters, KPIs, scoping)
 *
 * Pure source-level tests — no DB, no browser, runs in <1s.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, "..", rel), "utf-8");

// ═══════════════════════════════════════════════════════════════════
// 1. ROUTE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

describe("Route configuration", () => {
  const app = read("App.tsx");

  it("registers PerformanceShell at /members/performance", () => {
    expect(app).toMatch(/path="performance".*PerformanceShell/s);
  });

  it("registers Revenue tab (ConversionIntelligence) at performance/revenue", () => {
    expect(app).toMatch(/path="revenue".*ConversionIntelligence/);
  });

  it("registers Talent tab (PerformanceOverview) at performance/talent", () => {
    expect(app).toMatch(/path="talent".*PerformanceOverview/);
  });

  it("registers Intelligence tab (IntelligenceControl) at performance/intelligence", () => {
    expect(app).toMatch(/path="intelligence".*IntelligenceControl/);
  });

  it("has default index route for /members/performance", () => {
    expect(app).toMatch(/<Route index element=\{<ConversionIntelligence/);
  });

  it("legacy routes still work (standalone)", () => {
    expect(app).toContain('path="admin/conversion-intelligence"');
    expect(app).toContain('path="admin/intelligence-control"');
    expect(app).toContain('path="admin/performance"');
    expect(app).toContain('path="dashboard/performance"');
  });

  it("lazy-loads all performance components", () => {
    expect(app).toMatch(/lazy\(\(\) => import\("\.\/pages\/admin\/ConversionIntelligence"\)\)/);
    expect(app).toMatch(/lazy\(\(\) => import\("\.\/pages\/admin\/IntelligenceControl"\)\)/);
    expect(app).toMatch(/lazy\(\(\) => import\("\.\/pages\/admin\/PerformanceOverview"\)\)/);
    expect(app).toMatch(/lazy\(\(\) => import\("\.\/components\/performance\/PerformanceShell"\)\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. AUTH GUARDS
// ═══════════════════════════════════════════════════════════════════

describe("Auth guards — Performance Shell", () => {
  const app = read("App.tsx");

  it("PerformanceShell is wrapped in ProtectedRoute", () => {
    expect(app).toMatch(/<ProtectedRoute><PerformanceShell/);
  });

  it("legacy conversion-intelligence requires admin", () => {
    expect(app).toMatch(/requireAdmin><ConversionIntelligence/);
  });
});

describe("Auth guards — Component-level access control", () => {
  it("ConversionIntelligence: L6+ gate with AccessDenied", () => {
    const src = read("pages/admin/ConversionIntelligence.tsx");
    expect(src).toContain("useAuth");
    expect(src).toContain("getLevelForStage");
    expect(src).toContain("AccessDenied");
    expect(src).toMatch(/effectiveLevel\s*<\s*6/);
  });

  it("PerformanceOverview: L6+ gate with AccessDenied", () => {
    const src = read("pages/admin/PerformanceOverview.tsx");
    expect(src).toContain("useAuth");
    expect(src).toContain("getLevelForStage");
    expect(src).toContain("AccessDenied");
    expect(src).toMatch(/effectiveLevel\s*<\s*6/);
  });

  it("IntelligenceControl: L6+ gate with AccessDenied", () => {
    const src = read("pages/admin/IntelligenceControl.tsx");
    expect(src).toContain("useAuth");
    expect(src).toContain("getLevelForStage");
    expect(src).toContain("AccessDenied");
    expect(src).toMatch(/level\s*>=\s*6/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. SIDEBAR NAVIGATION
// ═══════════════════════════════════════════════════════════════════

describe("Sidebar navigation", () => {
  const sidebar = read("components/members/MembersSidebar.tsx");

  it("has PERFORMANCE section label", () => {
    expect(sidebar).toContain("PERFORMANCE");
  });

  it("links to /members/performance (unified shell)", () => {
    expect(sidebar).toContain('to="/members/performance"');
  });

  it("has Team Control link", () => {
    expect(sidebar).toContain("Team Control");
  });

  it("has Team Coach link", () => {
    expect(sidebar).toContain("Team Coach");
  });

  it("PERFORMANCE section visible for L6+", () => {
    // The section block is gated — check for L6/admin visibility comment or logic
    expect(sidebar).toMatch(/L6.*Senior Closer|sichtbar.*L6/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. PERFORMANCE SHELL STRUCTURE
// ═══════════════════════════════════════════════════════════════════

describe("PerformanceShell structure", () => {
  const shell = read("components/performance/PerformanceShell.tsx");

  it("exports default component", () => {
    expect(shell).toMatch(/export default/);
  });

  it("renders 3 tabs: revenue, talent, intelligence", () => {
    expect(shell).toContain("Revenue Flow");
    expect(shell).toContain("Talent Flow");
    expect(shell).toContain("Intelligence Control");
    expect(shell).toContain("PERFORMANCE_ROUTES");
  });

  it("uses PerformanceFiltersContext", () => {
    expect(shell).toContain("PerformanceFiltersContext");
  });

  it("renders Outlet for nested routes", () => {
    expect(shell).toContain("Outlet");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. CROSS-DASHBOARD CONSISTENCY
// ═══════════════════════════════════════════════════════════════════

describe("Cross-dashboard consistency", () => {
  const revenue = read("pages/admin/ConversionIntelligence.tsx");
  const talent = read("pages/admin/PerformanceOverview.tsx");
  const intel = read("pages/admin/IntelligenceControl.tsx");

  it("all 3 dashboards use useOptionalPerformanceFilters", () => {
    expect(revenue).toContain("useOptionalPerformanceFilters");
    expect(talent).toContain("useOptionalPerformanceFilters");
    expect(intel).toContain("useOptionalPerformanceFilters");
  });

  it("all 3 dashboards support 24h range", () => {
    // Revenue: WINDOWS includes 1
    expect(revenue).toContain("1, 7, 30, 90");
    // Talent: maps "24h" → 1
    expect(talent).toContain('"24h" ? 1');
    // Intelligence: RANGE_DAYS maps "24h": 1
    expect(intel).toContain('"24h": 1');
  });

  it("all 3 dashboards import CrossNavCta", () => {
    expect(revenue).toContain("CrossNavCta");
    expect(talent).toContain("CrossNavCta");
    expect(intel).toContain("CrossNavCta");
  });

  it("revenue formula consistent: deal_value * 100", () => {
    expect(revenue).toMatch(/deal_value\s*\?\?\s*0\)\s*\*\s*100/);
    expect(intel).toMatch(/deal_value\s*\?\?\s*0\)\s*\*\s*100/);
  });

  it("closed definition consistent: outcome=won OR payment_status=paid", () => {
    for (const src of [revenue, intel]) {
      expect(src).toContain('outcome === "won"');
      expect(src).toContain('payment_status === "paid"');
    }
  });

  it("all 3 dashboards detect nesting via shellFilters", () => {
    for (const src of [revenue, talent, intel]) {
      expect(src).toMatch(/nested\s*=\s*!!shellFilters/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. SCOPE / TEAM FILTERING
// ═══════════════════════════════════════════════════════════════════

describe("Scope filtering consistency", () => {
  it("Talent Flow: L6 scoped via scopeUserId, L7+/admin sees all", () => {
    const src = read("pages/admin/PerformanceOverview.tsx");
    expect(src).toContain("scopeUserId");
    expect(src).toMatch(/isAdminLike\s*\|\|\s*effectiveLevel\s*>=\s*7/);
  });

  it("Intelligence Control: L6 leads filtered by setter_id/closer_id", () => {
    const src = read("pages/admin/IntelligenceControl.tsx");
    expect(src).toContain("setter_id.eq.");
    expect(src).toContain("closer_id.eq.");
  });

  it("Revenue Flow: team loading at L6+", () => {
    const src = read("pages/admin/ConversionIntelligence.tsx");
    expect(src).toMatch(/effectiveLevel\s*>=\s*6/);
    expect(src).toContain("get_team_member_ids");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. COMPONENT EXPORTS (prevent accidental deletion)
// ═══════════════════════════════════════════════════════════════════

describe("Critical component exports exist", () => {
  const defaultExports = [
    "pages/admin/ConversionIntelligence.tsx",
    "pages/admin/PerformanceOverview.tsx",
    "pages/admin/IntelligenceControl.tsx",
    "components/performance/PerformanceShell.tsx",
  ];

  for (const f of defaultExports) {
    it(`${f} exists and has default export`, () => {
      const src = read(f);
      expect(src).toMatch(/export default/);
    });
  }

  it("CrossNavCta exists and has named export", () => {
    const src = read("components/performance/CrossNavCta.tsx");
    expect(src).toMatch(/export function CrossNavCta/);
  });

  it("PerformanceFiltersContext exists and exports provider + hooks", () => {
    const src = read("contexts/PerformanceFiltersContext.tsx");
    expect(src).toContain("PerformanceFiltersProvider");
    expect(src).toContain("usePerformanceFilters");
    expect(src).toContain("useOptionalPerformanceFilters");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. FILTER CONTEXT CONTRACT
// ═══════════════════════════════════════════════════════════════════

describe("PerformanceFiltersContext contract", () => {
  const ctx = read("contexts/PerformanceFiltersContext.tsx");

  it("exports useOptionalPerformanceFilters", () => {
    expect(ctx).toContain("useOptionalPerformanceFilters");
  });

  it("supports range, funnel, operator, level filters", () => {
    expect(ctx).toContain("range");
    expect(ctx).toContain("funnel");
    expect(ctx).toContain("operator");
    expect(ctx).toContain("level");
  });

  it("persists to sessionStorage with correct key", () => {
    expect(ctx).toContain("etc:perf:filters");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. LOGIN FLOW CONTRACT
// ═══════════════════════════════════════════════════════════════════

describe("Login flow", () => {
  const app = read("App.tsx");

  it("Login page imported eagerly (not lazy)", () => {
    expect(app).toMatch(/import Login from "\.\/pages\/members\/Login"/);
  });

  it("ProtectedRoute imported eagerly", () => {
    expect(app).toMatch(/import ProtectedRoute from/);
  });

  it("Login component exists with auth form", () => {
    const login = read("pages/members/Login.tsx");
    expect(login).toContain("signIn");
    expect(login).toMatch(/email|E-Mail/i);
    expect(login).toMatch(/password|Passwort/i);
  });

  it("AuthProvider wraps the app", () => {
    expect(app).toContain("AuthProvider");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. NO REGRESSION MARKERS
// ═══════════════════════════════════════════════════════════════════

describe("No-regression markers", () => {
  it("canonical-roles.ts exports roleLabel", () => {
    const src = read("lib/canonical-roles.ts");
    expect(src).toContain("export");
    expect(src).toContain("roleLabel");
  });

  it("Talent Flow uses roleLabel (not hardcoded role strings)", () => {
    const src = read("pages/admin/PerformanceOverview.tsx");
    expect(src).toContain("roleLabel");
  });

  it("No hardcoded 'Operator' in external-facing UI labels", () => {
    const talent = read("pages/admin/PerformanceOverview.tsx");
    // Should use roleLabel, not hardcode "Operator" in user-facing text
    // Internal comments/code are fine, but UI strings must use canonical labels
    const uiStrings = talent.match(/"Operator"/g) ?? [];
    // Allow in comments and internal code, flag if more than 2 occurrences
    expect(uiStrings.length).toBeLessThanOrEqual(2);
  });

  it("useKpiDashboard polling at 60s (not 30s)", () => {
    const src = read("hooks/useKpiDashboard.ts");
    expect(src).toContain("60_000");
    expect(src).not.toContain("30_000");
  });
});
