-- ═══════════════════════════════════════════════════════════════
-- KPI Hierarchy Unification — Layer 52
-- Canonical ownership: real_kpi_snapshot (L2/Intelligence),
--   kpi_snapshots (L3/Talent weekly), member_kpis (L3-L4/Talent latest)
-- Deprecated: users_kpi_snapshot, dashboard_daily_aggregates
-- ═══════════════════════════════════════════════════════════════

-- 1. Document canonical tables
COMMENT ON VIEW public.real_kpi_snapshot IS 'CANONICAL (L2/Intelligence). Funnel-level aggregates derived from leads+calls. Read-only view.';
COMMENT ON TABLE public.kpi_snapshots IS 'CANONICAL (L3/Talent). Weekly per-operator performance history. Written by calculate-kpi-snapshots cron. Used for trend analysis and promotion evaluation.';
COMMENT ON TABLE public.member_kpis IS 'CANONICAL (L3-L4/Talent). Latest per-operator KPIs including ethical and diagnostic scores. Primary source for operator dashboards. Written by sync-kpis.';

-- 2. Mark deprecated tables
COMMENT ON TABLE public.users_kpi_snapshot IS 'DEPRECATED — migrate to member_kpis. Redundant subset. Do not add new consumers.';
COMMENT ON TABLE public.dashboard_daily_aggregates IS 'DEPRECATED — migrate to real_kpi_snapshot. Only 2 rows, JSONB blob. Do not add new consumers.';

-- 3. Create unified operator KPI view (joins latest + trend)
CREATE OR REPLACE VIEW public.canonical_kpi_unified AS
SELECT
  mk.user_id,
  mk.updated_at AS latest_updated_at,
  -- L3 Core Operator KPIs (from member_kpis = latest)
  mk.closing_rate,
  mk.show_rate,
  mk.revenue_closed,
  mk.commission_earned,
  mk.storno_rate,
  mk.response_time,
  mk.follow_up_rate,
  mk.crm_hygiene_score,
  mk.calls_handled,
  mk.earnings_per_call,
  mk.calls_per_week,
  -- L3 Setter-Specific
  mk.qualification_accuracy,
  mk.handover_rate,
  mk.leads_assigned,
  mk.leads_qualified,
  mk.leads_won,
  mk.setter_influenced_revenue,
  mk.closer_direct_revenue,
  -- L4 Diagnostic (Ethical / Advanced)
  mk.lead_quality_sensitivity,
  mk.arrival_score,
  mk.context_score,
  mk.friction_score,
  mk.awareness_score,
  mk.ownership_score,
  mk.decision_score,
  mk.ethical_alignment_score,
  mk.pressure_index,
  mk.avg_awareness_created,
  mk.resistance_spikes,
  mk.decision_conversion_rate,
  -- Trend (latest weekly snapshot)
  ks.week_start AS trend_week_start,
  ks.closing_rate AS trend_closing_rate,
  ks.show_rate AS trend_show_rate,
  ks.revenue_closed AS trend_revenue_closed,
  ks.storno_rate AS trend_storno_rate,
  ks.response_time AS trend_response_time,
  ks.follow_up_rate AS trend_follow_up_rate,
  ks.crm_hygiene_score AS trend_crm_hygiene,
  ks.calls_handled AS trend_calls_handled,
  ks.earnings_per_call AS trend_epc
FROM public.member_kpis mk
LEFT JOIN LATERAL (
  SELECT *
  FROM public.kpi_snapshots s
  WHERE s.user_id = mk.user_id
  ORDER BY s.week_start DESC
  LIMIT 1
) ks ON true;

COMMENT ON VIEW public.canonical_kpi_unified IS 'CANONICAL (Layer 52). Unified operator KPI surface joining member_kpis (latest) with kpi_snapshots (latest weekly trend). All dashboards should prefer this view.';