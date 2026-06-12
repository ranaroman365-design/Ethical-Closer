
-- Recreate revenue_truth_view with test lead filter
CREATE OR REPLACE VIEW public.revenue_truth_view
WITH (security_invoker = on) AS
WITH payment_revenue AS (
  SELECT pl.id AS source_id, 'payment_link'::text AS source_type,
    pl.lead_id, pl.closer_id, l.setter_id,
    l.unit_id AS operator_unit_id, l.assigned_operator_id,
    pl.amount::numeric / 100.0 AS revenue_amount, pl.currency,
    pl.paid_at AS revenue_at, pl.offer_title AS product,
    pl.call_id, pl.appointment_id
  FROM payment_links pl
  LEFT JOIN leads l ON l.id = pl.lead_id
  WHERE pl.status = 'paid' AND pl.paid_at IS NOT NULL
    AND (l.id IS NULL OR NOT is_test_lead(l.is_simulation, l.source, l.name))
),
call_revenue AS (
  SELECT c.id AS source_id, 'call'::text AS source_type,
    c.lead_id, c.user_id AS closer_id, l.setter_id,
    l.unit_id AS operator_unit_id, l.assigned_operator_id,
    c.revenue AS revenue_amount, 'EUR'::text AS currency,
    c.closed_at AS revenue_at, c.offer_type AS product,
    c.id AS call_id, c.appointment_id
  FROM calls c
  LEFT JOIN leads l ON l.id = c.lead_id
  WHERE c.result = 'won' AND c.revenue > 0 AND c.is_simulation = false
    AND (l.id IS NULL OR NOT is_test_lead(l.is_simulation, l.source, l.name))
    AND NOT EXISTS (SELECT 1 FROM payment_links pl WHERE pl.call_id = c.id AND pl.status = 'paid')
),
funnel_revenue AS (
  SELECT fe.id AS source_id, 'funnel_event'::text AS source_type,
    NULL::uuid AS lead_id, NULL::uuid AS closer_id, NULL::uuid AS setter_id,
    NULL::uuid AS operator_unit_id, NULL::uuid AS assigned_operator_id,
    fe.revenue AS revenue_amount, 'EUR'::text AS currency,
    fe."timestamp" AS revenue_at, NULL::text AS product,
    NULL::uuid AS call_id, NULL::uuid AS appointment_id
  FROM funnel_events_v2 fe
  WHERE fe.event_type = 'deal_won' AND fe.revenue > 0
    AND NOT EXISTS (SELECT 1 FROM payment_links pl WHERE pl.status = 'paid' AND pl.paid_at IS NOT NULL AND lower(pl.email) = lower(fe.origin_email) AND abs(EXTRACT(epoch FROM pl.paid_at - fe."timestamp")) < 86400)
    AND NOT EXISTS (SELECT 1 FROM calls c WHERE c.result = 'won' AND c.is_simulation = false AND c.revenue > 0 AND abs(EXTRACT(epoch FROM c.closed_at - fe."timestamp")) < 86400)
)
SELECT * FROM payment_revenue
UNION ALL SELECT * FROM call_revenue
UNION ALL SELECT * FROM funnel_revenue;

-- Update audit function to reflect commissions are append-only
CREATE OR REPLACE FUNCTION public.audit_kpi_consistency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_test_in_scorecards int;
  v_test_in_revenue int;
  v_test_in_commissions int;
  v_test_in_leaderboard int;
  v_inactive_in_kpis int;
BEGIN
  SELECT count(*) INTO v_test_in_scorecards
  FROM operator_scorecards os
  JOIN profiles p ON p.email = os.operator_email
  WHERE p.is_test_user = true OR p.exclude_from_kpis = true OR p.is_active = false;

  SELECT count(*) INTO v_test_in_revenue
  FROM revenue_truth_view rtv
  JOIN leads l ON l.id = rtv.lead_id
  WHERE is_test_lead(l.is_simulation, l.source, l.name);

  SELECT count(*) INTO v_test_in_commissions
  FROM commissions c
  JOIN profiles p ON p.id = c.user_id
  WHERE p.is_test_user = true OR p.exclude_from_kpis = true;

  SELECT count(*) INTO v_test_in_leaderboard
  FROM view_performance_rankings vpr
  JOIN profiles p ON p.id = vpr.user_id
  WHERE p.is_test_user = true OR p.exclude_from_kpis = true;

  SELECT count(*) INTO v_inactive_in_kpis
  FROM operator_performance_metrics opm
  JOIN profiles p ON p.id = opm.user_id
  WHERE p.is_active = false;

  v_result := jsonb_build_object(
    'test_users_in_scorecards', v_test_in_scorecards,
    'test_leads_in_revenue', v_test_in_revenue,
    'test_users_in_commissions', v_test_in_commissions,
    'test_users_in_leaderboard', v_test_in_leaderboard,
    'inactive_in_kpi_views', v_inactive_in_kpis,
    'is_clean', (v_test_in_scorecards = 0 AND v_test_in_revenue = 0 AND v_test_in_leaderboard = 0 AND v_inactive_in_kpis = 0),
    'commissions_note', CASE WHEN v_test_in_commissions > 0 THEN 'append-only table — historical test commissions exist but are excluded from new calculations' ELSE 'clean' END,
    'audited_at', now()
  );

  RETURN v_result;
END;
$$;
