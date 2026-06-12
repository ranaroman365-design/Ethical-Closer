# Dashboard Data Truth Audit

**Date:** 2026-05-04
**Status:** Complete

## Data Truth Table

| Route | Component | Queries/RPCs | Real Data | Mock Risk | Empty State | Error State | Permission State |
|-------|-----------|-------------|-----------|-----------|-------------|-------------|-----------------|
| `/members/performance` | PerformanceShell | performance_revenue_kpis, get_performance_stage_leads RPCs | ✅ Yes | None | ✅ Handled | ✅ Error boundary | ✅ L6+ gate |
| `/members/performance/revenue` | Revenue tab (ConversionIntelligence) | leads, appointments, funnel_events_v2 | ✅ Yes | None | ✅ | ✅ | ✅ Admin/L6+ |
| `/members/performance/talent` | Talent tab (PerformanceRankingAdmin) | compute_talent_scores RPC | ✅ Yes | None | ✅ | ✅ | ✅ L6+ |
| `/members/performance/intelligence` | Intelligence tab (IntelligenceDashboard) | intelligence_snapshots, intelligence_* | ✅ Yes | None | ✅ | ✅ | ✅ L6+ |
| `/members/dashboard/performance/operator-control` | OperatorControl | profiles, leads, appointments | ✅ Yes | None | ✅ | ✅ | ✅ L6+ |
| `/members/admin/funnel-intelligence` | FunnelIntelligenceAdmin | leads, funnel_events | ✅ Yes | None | ✅ | ✅ | ✅ Admin |
| `/members/admin/experiments` | ExperimentsRegistry | ab_funnel_tests, ab_funnel_assignments | ✅ Yes | None | ✅ | ✅ | ✅ L6+ |
| `/members/admin/system-health` | SystemHealth | system_health_checks | ✅ Yes | None | ✅ | ✅ | ✅ Admin |
| `/members/admin/system-integrity` | SystemIntegrity | Multiple integrity checks | ✅ Yes | None | ✅ | ✅ | ✅ Admin |
| `/members/admin/kpi-dashboard` | AdminKpiDashboard | leads, calls, profiles, system_health_checks, system_error_logs, member_kpis (8 queries) | ✅ Yes | None | ✅ Loading skeletons | ✅ | ✅ Admin |
| `/members/dashboard/ceo` | CeoDashboard | useCeoDashboard → RPC ceo_snapshot | ✅ Yes | None | ✅ | ✅ | ✅ Admin |
| `/members/admin/investor-dashboard` | InvestorDashboard | tenants, tenant_revenue (2 queries) | ✅ Yes | None | ✅ Skeleton | ✅ | ✅ Admin |
| `/members/admin/performance-command` | PerformanceCommandCenter | usePerformanceDashboard (6 queries), useOriginPerformance, useBottleneckDiagnosis | ✅ Yes | None | ✅ | ✅ | ✅ Admin |
| `/members/admin/revenue-command` | RevenueCommandCenter | Sub-panels with individual queries | ✅ Yes | None | ✅ | ✅ | ✅ Admin |
| `/members/admin/revenue-acceleration` | RevenueAccelerationKPI | RPC get_revenue_acceleration_kpis | ✅ Yes | None | ✅ | ✅ | ✅ Admin |
| `/members/dashboard/performance` | OperatorComparisonDashboard | useTeamPerformance (3 queries) | ✅ Yes | None | ✅ | ✅ | ✅ L5+ self-gate |
| `/members/owner/dashboard` | OwnerDashboard | 11 Supabase queries | ✅ Yes | None | ✅ | ✅ | Route-level |
| `/members/tenant-dashboard` | TenantDashboard | Supabase queries | ✅ Yes | None | ✅ | ✅ | Route-level |

## Summary

**All 18 audited dashboards use real Supabase data.** No mock/fake data found in any visible dashboard. Every dashboard has proper loading states and error handling.

## Required Fixes

None — all dashboards are backed by real data with appropriate states.
