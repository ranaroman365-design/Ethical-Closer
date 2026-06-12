# Dashboard Consolidation Decisions

**Date:** 2026-05-04
**Status:** Implemented

## Decision Table

| Route | Component | Data Source | Overlap | Decision | Reason | Action | Remaining Risk |
|-------|-----------|-------------|---------|----------|--------|--------|---------------|
| `/members/performance` | PerformanceShell | RPCs, leads, appointments | — | **KEEP** | Operator Master Dashboard | None | None |
| `/members/performance/revenue` | Revenue tab | RPCs, leads | — | **KEEP** | Canonical Revenue Flow | None | None |
| `/members/performance/talent` | Talent tab | RPCs, profiles | — | **KEEP** | Canonical Talent OS | None | None |
| `/members/performance/intelligence` | Intelligence tab | RPCs, intelligence_* | — | **KEEP** | Canonical Intelligence Control | None | None |
| `/members/admin/performance-command` | PerformanceCommandCenter | usePerformanceDashboard (6 queries) | Overlaps Performance Shell | **HIDE_FROM_SIDEBAR** | Real data but fully overlapped by Performance Shell tabs. Route preserved. | Removed from sidebar | Access via direct URL still works |
| `/members/admin/kpi-dashboard` | AdminKpiDashboard | leads, calls, profiles, system_health_checks, system_error_logs, member_kpis | System monitoring unique | **KEEP** | Real system health/monitoring data not in Performance Shell | Labeled "System Monitoring" in sidebar | None |
| `/members/dashboard/performance` | OperatorComparisonDashboard | useTeamPerformance (3 queries) | Overlaps Talent OS | **KEEP** | Has unique operator comparison matrix. Route kept for deep-links. | Not in sidebar (never was for L6+) | None |
| `/members/admin/revenue-command` | RevenueCommandCenter | LiveFunnelPanel, CallPerformancePanel (real queries) | Overlaps Revenue tab | **KEEP** | Sub-panels have real data. Route preserved. | Not in sidebar | None |
| `/members/admin/revenue-acceleration` | RevenueAccelerationKPI | RPC get_revenue_acceleration_kpis | Unique KPI | **KEEP** | Unique RPC data. Route preserved. | Not in sidebar | None |
| `/members/dashboard/ceo` | CeoDashboard | useCeoDashboard (RPC) | Executive-level view | **KEEP** | Real RPC data, unique CEO perspective. | Added to Admin sidebar under "Reports" | None |
| `/members/admin/investor-dashboard` | InvestorDashboard | tenants, tenant_revenue | Niche | **KEEP** | Real data but niche use case. | Not in sidebar | Low usage risk |
| `/members/owner/dashboard` | OwnerDashboard | 11 Supabase queries | Niche | **KEEP** | Real data. Multi-tenant feature. | Not in sidebar | None |
| `/members/tenant-dashboard` | TenantDashboard | Supabase queries | Niche | **KEEP** | Real data. Multi-tenant feature. | Not in sidebar | None |

## Legacy Redirects (Already Implemented)

| Old Route | Canonical Target | Status |
|-----------|-----------------|--------|
| `/members/admin/conversion-intelligence` | `/members/performance/revenue` | ✅ Active |
| `/members/admin/intelligence-control` | `/members/performance/intelligence` | ✅ Active |
| `/members/dashboard/intelligence-control` | `/members/performance/intelligence` | ✅ Active |
| `/members/admin/performance` | `/members/performance/talent` | ✅ Active |
| `/members/dashboard/operator-control` | `/members/dashboard/performance/operator-control` | ✅ Active |
| `/members/admin/self-optimization` | `/members/dashboard/self-optimization` | ✅ Active |

## Key Principle

No dashboard was deleted. No data logic was removed. No permissions were weakened. Consolidation = sidebar organization + documentation, not deletion.
