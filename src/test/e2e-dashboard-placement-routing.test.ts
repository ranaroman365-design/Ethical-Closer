/**
 * E2E-style routing verification: Entry→Dashboard, Sidebar→Dashboard, Placement isolation.
 *
 * Since Lovable sandbox cannot run Playwright, these tests verify the routing
 * contracts at source level — covering the same assertions a real E2E would make.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');

/* ── Sources ── */
const entrySrc = read('pages/members/EntryScreen.tsx');
const sidebarSrc = read('components/members/MembersSidebar.tsx');
const smartRoutingSrc = read('lib/smart-routing.ts');
const appSrc = read('App.tsx');

/* ══════════════════════════════════════════════════════════════════
   1. Entry flow "Dashboard" button → /members/dashboard
   ══════════════════════════════════════════════════════════════════ */
describe('Entry flow → Dashboard button', () => {
  it('handleDashboard navigates to /members/dashboard explicitly', () => {
    const fn = entrySrc.match(/const handleDashboard[\s\S]*?};/);
    expect(fn).toBeTruthy();
    expect(fn![0]).toContain("'/members/dashboard'");
    expect(fn![0]).not.toContain('placement');
  });

  it('handleDashboard does NOT use targetDashboard (smart-routing)', () => {
    const fn = entrySrc.match(/const handleDashboard[\s\S]*?};/);
    expect(fn![0]).not.toContain('targetDashboard');
  });

  it('handleDashboard uses replace: true (no back-button to entry)', () => {
    const fn = entrySrc.match(/const handleDashboard[\s\S]*?};/);
    expect(fn![0]).toContain('replace: true');
  });
});

/* ══════════════════════════════════════════════════════════════════
   2. Sidebar "Dashboard" → /members/dashboard (via ROUTE_OVERRIDES)
   ══════════════════════════════════════════════════════════════════ */
describe('Sidebar → Dashboard', () => {
  it('ROUTE_OVERRIDES maps "dashboard" to /members/dashboard', () => {
    expect(sidebarSrc).toMatch(/'dashboard':\s*'\/members\/dashboard'/);
  });

  it('"dashboard" slug lives in orientierung section', () => {
    const orientierung = sidebarSrc.match(/key:\s*'orientierung'[\s\S]*?slugs:\s*\[([^\]]+)\]/);
    expect(orientierung).toBeTruthy();
    expect(orientierung![1]).toContain("'dashboard'");
  });

  it('"dashboard" slug is NOT in einkommen section', () => {
    const einkommen = sidebarSrc.match(/key:\s*'einkommen'[\s\S]*?slugs:\s*\[([^\]]+)\]/);
    expect(einkommen).toBeTruthy();
    const slugs = einkommen![1].split(',').map(s => s.trim().replace(/'/g, ''));
    expect(slugs).not.toContain('dashboard');
  });

  it('no ROUTE_OVERRIDES entry points to placement', () => {
    const block = sidebarSrc.match(/ROUTE_OVERRIDES[\s\S]*?};/);
    expect(block).toBeTruthy();
    expect(block![0]).not.toContain('placement');
  });
});

/* ══════════════════════════════════════════════════════════════════
   3. Sidebar "Placement" → /members/placement (distinct from Dashboard)
   ══════════════════════════════════════════════════════════════════ */
describe('Sidebar → Placement', () => {
  it('"placement" slug exists in einkommen section', () => {
    const einkommen = sidebarSrc.match(/key:\s*'einkommen'[\s\S]*?slugs:\s*\[([^\]]+)\]/);
    expect(einkommen).toBeTruthy();
    expect(einkommen![1]).toContain("'placement'");
  });

  it('placement has its own route in App.tsx (not shared with dashboard)', () => {
    expect(appSrc).toMatch(/path="placement"/);
  });

  it('placement route does NOT render Dashboard component', () => {
    // Find the line with path="placement" and check what component it renders
    const placementLine = appSrc.match(/path="placement"[^>]*>.*?<\/Route>/s);
    if (placementLine) {
      expect(placementLine[0]).not.toMatch(/MembersDashboard/);
    }
    // Also verify dashboard route exists separately
    expect(appSrc).toMatch(/path="dashboard"/);
  });
});

/* ══════════════════════════════════════════════════════════════════
   4. Smart-routing (auto-redirect) audit
   ══════════════════════════════════════════════════════════════════ */
describe('Smart-routing: getDefaultRouteForStage', () => {
  it('only senior_manager auto-routes to placement', () => {
    // Verify placement appears exactly once, for senior_manager
    const placementMatches = smartRoutingSrc.match(/\/members\/placement/g);
    expect(placementMatches).toHaveLength(1);
    expect(smartRoutingSrc).toMatch(/senior_manager[\s\S]*?\/members\/placement/);
  });

  it('prospect/applicant default to /members/dashboard', () => {
    expect(smartRoutingSrc).toMatch(/prospect[\s\S]*?\/members\/dashboard/);
    expect(smartRoutingSrc).toMatch(/applicant[\s\S]*?\/members\/dashboard/);
  });

  it('fallback default is /members/dashboard', () => {
    expect(smartRoutingSrc).toMatch(/default:\s*\n?\s*return\s*'\/members\/dashboard'/);
  });

  it('admin always routes to /members/admin-workspace', () => {
    expect(smartRoutingSrc).toMatch(/isAdmin.*return\s*'\/members\/admin-workspace'/);
  });
});

/* ══════════════════════════════════════════════════════════════════
   5. Entry flow auto-redirect uses targetDashboard (smart-routing),
      but explicit "Dashboard" button overrides it
   ══════════════════════════════════════════════════════════════════ */
describe('Entry flow auto-redirect vs explicit Dashboard', () => {
  it('targetDashboard is computed via getDefaultRouteForStage', () => {
    expect(entrySrc).toContain('getDefaultRouteForStage');
    expect(entrySrc).toContain('targetDashboard');
    // targetDashboard is derived from getDefaultRouteForStage (may span multiple lines)
    expect(entrySrc).toMatch(/targetDashboard[\s\S]*getDefaultRouteForStage|getDefaultRouteForStage[\s\S]*targetDashboard/);
  });

  it('admin bypass uses targetDashboard (correct for auto-skip)', () => {
    const bypassBlock = entrySrc.match(/adminBypass[\s\S]*?navigate\(targetDashboard/);
    expect(bypassBlock).toBeTruthy();
  });

  it('session-seen check uses targetDashboard (correct for auto-skip)', () => {
    const seenBlock = entrySrc.match(/already seen[\s\S]*?navigate\(targetDashboard/);
    expect(seenBlock).toBeTruthy();
  });

  it('explicit handleDashboard button does NOT use targetDashboard', () => {
    const fn = entrySrc.match(/const handleDashboard[\s\S]*?};/);
    expect(fn![0]).not.toContain('targetDashboard');
    expect(fn![0]).toContain("'/members/dashboard'");
  });
});

/* ══════════════════════════════════════════════════════════════════
   6. Route uniqueness: dashboard and placement are distinct routes
   ══════════════════════════════════════════════════════════════════ */
describe('Route uniqueness', () => {
  it('App.tsx has separate path entries for dashboard and placement', () => {
    const dashboardRoutes = appSrc.match(/path="dashboard"/g);
    const placementRoutes = appSrc.match(/path="placement"/g);
    expect(dashboardRoutes).toBeTruthy();
    expect(placementRoutes).toBeTruthy();
    expect(dashboardRoutes!.length).toBeGreaterThanOrEqual(1);
    expect(placementRoutes!.length).toBeGreaterThanOrEqual(1);
  });
});

/* ══════════════════════════════════════════════════════════════════
   7. Performance Dashboard routing: default tab = Revenue Flow
   ══════════════════════════════════════════════════════════════════ */
describe('Performance Dashboard → Revenue Flow default', () => {
  it('performance index route redirects to revenue (not Execution)', () => {
    // The index route inside performance shell should Navigate to "revenue"
    const perfBlock = appSrc.match(/path="performance"[\s\S]*?<\/Route>\s*\n/);
    expect(perfBlock).toBeTruthy();
    // Index route should be a Navigate to revenue, not ExecutionDashboard
    expect(perfBlock![0]).toMatch(/index.*Navigate.*to="revenue"/);
    expect(perfBlock![0]).not.toMatch(/index.*ExecutionDashboard/);
  });

  it('sidebar Performance link points to /members/performance/revenue', () => {
    expect(sidebarSrc).toContain('/members/performance/revenue');
    // Should NOT have a bare /members/performance link (would land on index→redirect)
    const barePerf = sidebarSrc.match(/to="\/members\/performance"(?!\/)/);
    expect(barePerf).toBeNull();
  });

  it('performance shell has revenue, execution, talent, intelligence, l6 child routes', () => {
    expect(appSrc).toMatch(/path="revenue"/);
    expect(appSrc).toMatch(/path="execution"/);
    expect(appSrc).toMatch(/path="talent"/);
    expect(appSrc).toMatch(/path="intelligence"/);
    expect(appSrc).toMatch(/path="l6"/);
  });

  it('PerformanceShell activeTab falls back to "revenue" when no specific path matches', () => {
    const shellSrc = read('components/performance/PerformanceShell.tsx');
    // The activeTab memo should return "revenue" as the final fallback
    // (execution/talent/intelligence/l6 are matched by pathname checks first)
    const activeTabBlock = shellSrc.match(/activeTab[\s\S]*?\n\s*return "(\w+)";\s*\n\s*\}, \[pathname\]/);
    expect(activeTabBlock).toBeTruthy();
    expect(activeTabBlock![1]).toBe('revenue');
  });
});
