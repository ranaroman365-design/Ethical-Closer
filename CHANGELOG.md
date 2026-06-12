# Changelog

## [2026-05-04] Platform Consolidation — Phase 2

### Dashboard Consolidation
- PerformanceCommandCenter removed from Admin sidebar (overlaps Performance Shell); route preserved
- CEO Dashboard added to Admin sidebar under new "Reports" subsection
- All 18 audited dashboards confirmed to use real Supabase data — zero mock/fake data found

### Sidebar Changes
- Admin VERWALTUNG: added "Reports" group with CEO Dashboard
- Removed redundant "Performance → Command Center" from Admin block
- No L6+ Performance block changes

### Documentation
- Created `docs/dashboard_consolidation_decisions.md` — full decision table for all dashboards
- Created `docs/dashboard_data_truth_audit.md` — data source verification for all visible dashboards
- Updated `docs/platform_navigation_map.md` — canonical routes, redirects, sidebar structure by role

### No Breaking Changes
- No database migrations
- No routes deleted
- No components deleted
- No permissions weakened
- No business logic changed
- All 23 existing tests pass



## [2026-05-03] Platform Navigation Cleanup — Non-Breaking Consolidation

### Route Canonicalization
- 6 legacy routes converted to `<Navigate replace />` redirects (no components deleted)
- All redirects point to canonical Performance Shell or dashboard routes
- Query params preserved via React Router `replace` behavior

### Sidebar Reorganization
- Admin sidebar restructured into 5 grouped subsections: Core, System, Operations, Tools, Governance
- `AdminKpiDashboard` renamed from "System Dashboard" → "System Monitoring" in sidebar
- Helper components (`AdminNavLink`, `AdminSubheader`) extracted for DRY sidebar construction
- Performance block (L6+) unchanged — already well-structured

### Dashboard Consolidation
- 14 dashboards audited — **all confirmed to use real Supabase data**
- No dashboards deleted or removed
- CeoDashboard, InvestorDashboard, OwnerDashboard, TenantDashboard: routes preserved, removed from sidebar (niche use, real data)
- RevenueCommandCenter, RevenueAccelerationKPI: routes preserved, not in sidebar (admin-only, accessible via direct link)

### What Did NOT Change
- ❌ No database migrations
- ❌ No tables/columns/RPCs modified
- ❌ No Edge Functions deleted
- ❌ No components deleted
- ❌ No auth/role/permission logic changed
- ❌ No business logic modified
- ❌ No deep links broken

### Documentation Created
- `docs/platform_navigation_map.md` — Full route map with sidebar structure by role
- `docs/dashboard_consolidation_decisions.md` — Decision matrix with evidence
- `docs/dashboard_data_truth_audit.md` — Data truth verification for all dashboards
