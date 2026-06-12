/**
 * Regression: Dashboard / Earn Dashboard / Marketing Dashboard routing
 * must never resolve to wrong targets or dead routes.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf-8');

describe('Dashboard routing regression', () => {
  const sidebar = read('components/members/MembersSidebar.tsx');
  const entry = read('pages/members/EntryScreen.tsx');
  const app = read('App.tsx');

  it('EntryScreen handleDashboard navigates to /members/dashboard, not placement', () => {
    const handler = entry.match(/const handleDashboard[\s\S]*?};/);
    expect(handler).toBeTruthy();
    expect(handler![0]).toContain('/members/dashboard');
    expect(handler![0]).not.toContain('placement');
    expect(handler![0]).not.toContain('targetDashboard');
  });

  it('ROUTE_OVERRIDES maps dashboard to /members/dashboard', () => {
    expect(sidebar).toMatch(/'dashboard':\s*'\/members\/dashboard'/);
  });

  it('dashboard slug is in orientierung section, not einkommen', () => {
    const orientierung = sidebar.match(/key:\s*'orientierung'[\s\S]*?slugs:\s*\[([^\]]+)\]/);
    expect(orientierung).toBeTruthy();
    expect(orientierung![1]).toContain("'dashboard'");

    const einkommen = sidebar.match(/key:\s*'einkommen'[\s\S]*?slugs:\s*\[([^\]]+)\]/);
    expect(einkommen).toBeTruthy();
    const einkommenSlugs = einkommen![1].split(',').map(s => s.trim().replace(/'/g, ''));
    expect(einkommenSlugs).not.toContain('dashboard');
  });

  it('earn-dashboard slug is in einkommen section', () => {
    const einkommen = sidebar.match(/key:\s*'einkommen'[\s\S]*?slugs:\s*\[([^\]]+)\]/);
    expect(einkommen).toBeTruthy();
    expect(einkommen![1]).toContain("'earn-dashboard'");
  });

  it('earn-dashboard route exists in App.tsx', () => {
    expect(app).toMatch(/path="earn-dashboard"/);
    expect(app).toMatch(/EarnDashboard/);
  });

  it('no ROUTE_OVERRIDES point to placement', () => {
    const overrides = sidebar.match(/ROUTE_OVERRIDES[\s\S]*?};/);
    expect(overrides).toBeTruthy();
    expect(overrides![0]).not.toContain('placement');
  });
});

describe('Marketing Dashboard routing regression', () => {
  const sidebar = read('components/members/MembersSidebar.tsx');
  const app = read('App.tsx');

  it('sidebar links Marketing Dashboard to /members/admin/funnel-intelligence', () => {
    // The NavLink for Marketing Dashboard must point to funnel-intelligence
    // Find the NavLink block containing 'Marketing Dashboard'
    const block = sidebar.match(/to="([^"]+)"[\s\S]{0,800}?Marketing Dashboard/);
    expect(block).toBeTruthy();
    expect(block![1]).toBe('/members/admin/funnel-intelligence');
  });

  it('funnel-intelligence route exists in App.tsx with correct component', () => {
    expect(app).toMatch(/path="admin\/funnel-intelligence"/);
    expect(app).toMatch(/FunnelIntelligenceAdmin/);
  });

  it('Marketing Dashboard does NOT route to conversion-intelligence or placement', () => {
    const block = sidebar.match(/to="([^"]+)"[\s\S]{0,800}?Marketing Dashboard/);
    expect(block).toBeTruthy();
    expect(block![1]).not.toContain('conversion-intelligence');
    expect(block![1]).not.toContain('placement');
  });
});

describe('Dead route detection', () => {
  const app = read('App.tsx');
  const sidebar = read('components/members/MembersSidebar.tsx');

  // All NavLink `to` paths in sidebar must have a matching route in App.tsx
  it('all sidebar NavLink paths have matching App.tsx routes', () => {
    const navLinkPaths = [...sidebar.matchAll(/to="(\/members\/[^"]+)"/g)]
      .map(m => m[1]);

    expect(navLinkPaths.length).toBeGreaterThan(5);

    // Extract route paths from App.tsx (nested under /members)
    const routePaths = [...app.matchAll(/path="([^"]+)"/g)].map(m => m[1]);

    for (const fullPath of navLinkPaths) {
      // Convert /members/admin/funnel-intelligence → admin/funnel-intelligence
      const relative = fullPath.replace(/^\/members\//, '');

      // Check route exists (either exact or as nested segment)
      const hasRoute = routePaths.some(rp =>
        rp === relative ||
        relative.startsWith(rp + '/') ||
        relative.endsWith(rp)
      );

      expect(hasRoute, `Dead route in sidebar: ${fullPath} has no matching App.tsx route`).toBe(true);
    }
  });

  // Legacy redirects must still exist
  it('legacy redirects for conversion-intelligence and intelligence-control exist', () => {
    expect(app).toMatch(/admin\/conversion-intelligence/);
    expect(app).toMatch(/admin\/intelligence-control/);
    expect(app).toMatch(/Navigate/);
  });

  // Dropped tables must not be referenced in active sidebar pages
  it('sidebar does not link to dropped attendance_templates/attendance_jobs pages', () => {
    const navLinks = [...sidebar.matchAll(/to="([^"]+)"/g)].map(m => m[1]);
    for (const link of navLinks) {
      expect(link).not.toContain('attendance-templates');
      expect(link).not.toContain('attendance-jobs');
    }
  });

  // Admin Smart Attendance must not appear in sidebar (legacy tables dropped)
  it('admin/smart-attendance is NOT linked in sidebar', () => {
    const navLinks = [...sidebar.matchAll(/to="([^"]+)"/g)].map(m => m[1]);
    expect(navLinks).not.toContain('/members/admin/smart-attendance');
  });

  // Admin Smart Attendance route redirects (not renders dead component)
  it('admin/smart-attendance route redirects to operator attendance', () => {
    const routeBlock = app.match(/path="admin\/smart-attendance"[^>]*>([^<]*)</);
    expect(app).toMatch(/admin\/smart-attendance/);
    expect(app).toMatch(/Navigate to="\/members\/dashboard\/performance\/attendance"/);
  });

  // Operator attendance route still exists
  it('operator attendance route still exists', () => {
    expect(app).toMatch(/dashboard\/performance\/attendance/);
  });
});
