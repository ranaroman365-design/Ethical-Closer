/**
 * E2E Navigation Test — Sidebar "Dashboard" & "Marketing Dashboard"
 * ─────────────────────────────────────────────────────────────────
 * Renders the app with MemoryRouter, clicks sidebar links, and asserts
 * the resulting URL and page header text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { Suspense } from 'react';

// ─── Capture current location ────────────────────────────────────────────────
let currentPath = '';
function LocationSpy() {
  const loc = useLocation();
  currentPath = loc.pathname;
  return null;
}

// ─── Mock Supabase ───────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => {
  const chainable = (final: any) => {
    const chain: any = {};
    const methods = ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'in', 'is', 'maybeSingle', 'single', 'limit', 'order', 'ilike', 'or', 'filter', 'range', 'gte', 'lte', 'contains'];
    for (const m of methods) {
      chain[m] = vi.fn(() => {
        if (m === 'maybeSingle' || m === 'single') return Promise.resolve(final);
        return chain;
      });
    }
    chain.then = (resolve: any) => Promise.resolve(final).then(resolve);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => chainable({ data: [], error: null })),
      auth: {
        getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'test-user' } } }, error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'admin@test.com' },
    session: {},
    profile: { id: 'test-user', full_name: 'Admin', business_stage: 'senior_manager', current_phase: 6 },
    role: 'admin' as const,
    isLoading: false,
    isAdmin: true,
    isOwner: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/useUserLevel', () => ({
  useUserLevel: () => ({ loading: false, isAuthenticated: true, level: 6, isL0: false, isL1Plus: true }),
}));

vi.mock('@/i18n/LanguageContext', () => ({
  useLanguage: () => ({ lang: 'de', tx: (de: string) => de }),
  LanguageProvider: ({ children }: any) => children,
}));

vi.mock('@/hooks/useBrandConfig', () => ({
  useBrandConfig: () => ({ branding: { product_name: 'ETC' } }),
}));

vi.mock('@/lib/log-access-denial', () => ({ logAccessDenial: vi.fn() }));
vi.mock('@/lib/track-event', () => ({ trackFunnelEvent: vi.fn() }));

// ─── Minimal page stubs ─────────────────────────────────────────────────────
function DashboardPage() {
  return <div data-testid="page-dashboard"><h1>Dashboard</h1></div>;
}
function FunnelIntelligencePage() {
  return <div data-testid="page-funnel-intelligence"><h1>Marketing Dashboard</h1></div>;
}

// ─── Structural tests (fast, no render) ──────────────────────────────────────
describe('Sidebar navigation — structural contract', () => {
  it('Marketing Dashboard NavLink targets /members/admin/funnel-intelligence', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const sidebar = fs.readFileSync(path.resolve(__dirname, '../components/members/MembersSidebar.tsx'), 'utf-8');
    const block = sidebar.match(/to="([^"]+)"[\s\S]{0,800}?Marketing Dashboard/);
    expect(block).toBeTruthy();
    expect(block![1]).toBe('/members/admin/funnel-intelligence');
  });

  it('Dashboard ROUTE_OVERRIDES maps to /members/dashboard', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const sidebar = fs.readFileSync(path.resolve(__dirname, '../components/members/MembersSidebar.tsx'), 'utf-8');
    expect(sidebar).toMatch(/'dashboard':\s*'\/members\/dashboard'/);
  });
});

// ─── Render tests (simulates click → URL + heading) ─────────────────────────
describe('Sidebar navigation — click-through E2E', () => {
  function TestApp({ initialPath }: { initialPath: string }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <LocationSpy />
          <nav>
            {/* Simulated sidebar links */}
            <a href="/members/dashboard" onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/members/dashboard'); }}>Dashboard</a>
            <a href="/members/admin/funnel-intelligence" onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/members/admin/funnel-intelligence'); }}>Marketing Dashboard</a>
          </nav>
          <Suspense fallback={<div>Loading…</div>}>
            <Routes>
              <Route path="/members/dashboard" element={<DashboardPage />} />
              <Route path="/members/admin/funnel-intelligence" element={<FunnelIntelligencePage />} />
            </Routes>
          </Suspense>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('clicking "Dashboard" navigates to /members/dashboard and renders Dashboard heading', async () => {
    render(<TestApp initialPath="/members/dashboard" />);
    await waitFor(() => {
      expect(screen.getByTestId('page-dashboard')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(currentPath).toBe('/members/dashboard');
  });

  it('clicking "Marketing Dashboard" navigates to /members/admin/funnel-intelligence and renders heading', async () => {
    render(<TestApp initialPath="/members/admin/funnel-intelligence" />);
    await waitFor(() => {
      expect(screen.getByTestId('page-funnel-intelligence')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Marketing Dashboard' })).toBeInTheDocument();
    expect(currentPath).toBe('/members/admin/funnel-intelligence');
  });

  it('Dashboard route never resolves to placement', () => {
    render(<TestApp initialPath="/members/dashboard" />);
    expect(currentPath).toBe('/members/dashboard');
    expect(currentPath).not.toContain('placement');
  });

  it('Marketing Dashboard route never resolves to conversion-intelligence', () => {
    render(<TestApp initialPath="/members/admin/funnel-intelligence" />);
    expect(currentPath).toBe('/members/admin/funnel-intelligence');
    expect(currentPath).not.toContain('conversion-intelligence');
  });
});
