/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL REVENUE TRUTH — Layer 54 (BINDING)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ONE revenue truth. Deterministic attribution. Immutable after payout.
 *
 * Block: Value
 * Layer: Revenue Engine
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── REVENUE SOURCE HIERARCHY ───────────────────────────────────────

export type RevenueSourceTier = 'canonical' | 'derived' | 'non_canonical';

export interface RevenueSource {
  id: string;
  table: string;
  field: string;
  tier: RevenueSourceTier;
  description: string;
  usage: string;
  risk: 'none' | 'low' | 'medium' | 'high';
}

export const REVENUE_SOURCES: RevenueSource[] = [
  {
    id: 'calls_revenue',
    table: 'calls',
    field: 'revenue',
    tier: 'canonical',
    description: 'Revenue from closed calls — the primary conversion event',
    usage: 'Commission calculation, operator KPIs, North Star metric',
    risk: 'none',
  },
  {
    id: 'payment_events',
    table: 'payment_events',
    field: 'metadata->amount',
    tier: 'canonical',
    description: 'Stripe payment event confirmations',
    usage: 'Payment verification, reconciliation',
    risk: 'none',
  },
  {
    id: 'stripe_events',
    table: 'stripe_events',
    field: 'payload->amount',
    tier: 'canonical',
    description: 'Raw Stripe webhook events',
    usage: 'Audit trail, dispute resolution',
    risk: 'none',
  },
  {
    id: 'revenue_truth_view',
    table: 'revenue_truth_view',
    field: '*',
    tier: 'derived',
    description: 'Materialized view joining calls + payment_events',
    usage: 'Dashboard aggregations',
    risk: 'low',
  },
  {
    id: 'payment_truth_view',
    table: 'payment_truth_view',
    field: '*',
    tier: 'derived',
    description: 'Materialized view for payment reconciliation',
    usage: 'Admin payment oversight',
    risk: 'low',
  },
  {
    id: 'leads_deal_value',
    table: 'leads',
    field: 'deal_value',
    tier: 'non_canonical',
    description: 'Pre-payment estimate. Editable, stale, not operational truth.',
    usage: 'Pipeline forecasting ONLY — never for actual revenue',
    risk: 'high',
  },
  {
    id: 'tenant_revenue',
    table: 'tenant_revenue',
    field: 'amount',
    tier: 'derived',
    description: 'Tenant-level revenue aggregation',
    usage: 'Multi-tenant reporting',
    risk: 'low',
  },
];

// ─── DASHBOARD REVENUE SOURCE MAP ───────────────────────────────────

export interface DashboardRevenueMapping {
  dashboard: string;
  component: string;
  currentSource: string;
  canonical: boolean;
  risk: 'none' | 'low' | 'medium' | 'high';
  notes: string;
}

export const DASHBOARD_REVENUE_MAP: DashboardRevenueMapping[] = [
  {
    dashboard: 'Revenue Performance (PerformanceShell)',
    component: 'src/components/performance/PerformanceShell.tsx',
    currentSource: 'member_kpis.revenue_closed',
    canonical: true,
    risk: 'none',
    notes: 'Uses canonical L3 KPI table',
  },
  {
    dashboard: 'Conversion Intelligence',
    component: 'src/components/admin/ConversionIntelligence.tsx',
    currentSource: 'real_kpi_snapshot',
    canonical: true,
    risk: 'none',
    notes: 'Uses canonical Intelligence L1 table',
  },
  {
    dashboard: 'Operator Performance',
    component: 'src/components/performance/OperatorPerformanceCards.tsx',
    currentSource: 'member_kpis',
    canonical: true,
    risk: 'none',
    notes: 'Uses canonical L3 KPI table',
  },
  {
    dashboard: 'Executive Strip',
    component: 'src/components/admin/performance/ExecutiveStrip.tsx',
    currentSource: 'calls.revenue (aggregated)',
    canonical: true,
    risk: 'none',
    notes: 'Direct calls query — acceptable for admin executive view',
  },
  {
    dashboard: 'Profit Center Panel',
    component: 'src/components/performance/ProfitCenterPanel.tsx',
    currentSource: 'commissions + calls',
    canonical: true,
    risk: 'none',
    notes: 'L6 profit center uses canonical commission + calls data',
  },
  {
    dashboard: 'Earning Projection',
    component: 'src/components/dashboard/EarningProjection.tsx',
    currentSource: 'member_kpis.commission_earned',
    canonical: true,
    risk: 'none',
    notes: 'Uses canonical L3 KPI table',
  },
  {
    dashboard: 'Execution Dashboard',
    component: 'src/components/performance/ExecutionDashboard.tsx',
    currentSource: 'appointments + calls (raw queries)',
    canonical: false,
    risk: 'medium',
    notes: 'FLAGGED: Reads raw operational tables. Must migrate to canonical KPI sources.',
  },
];

// ─── REVENUE ATTRIBUTION RULES ──────────────────────────────────────

export const REVENUE_ATTRIBUTION_RULES = [
  'Revenue owner = calls.revenue_owner_user_id (canonical)',
  'Fallback: calls.user_id if revenue_owner_user_id is NULL',
  'Commission follows revenue_owner, NOT lead.owner_id',
  'leads.deal_value is NEVER used for commission calculation',
  'Revenue is immutable after payout batch finalization',
  'All revenue disputes must go through commission_audit_log',
  'Storno (cancellation) reversal uses commissions.reversed_at + reversed_reason',
] as const;

// ─── NON-CANONICAL REVENUE SOURCES ─────────────────────────────────

export const NON_CANONICAL_REVENUE_WARNING = {
  table: 'leads',
  field: 'deal_value',
  reason: 'Pre-payment estimate. May be edited, may be stale, may not match actual payment.',
  allowedUsage: ['Pipeline forecasting', 'Lead scoring input'],
  forbiddenUsage: ['Commission calculation', 'Revenue reporting', 'KPI computation', 'Payout decisions'],
} as const;
