-- ═══════════════════════════════════════════════════════════════════════
-- ETC Canon Enforcement Pack v1 — KPI Truth RPC
-- One executable formula source for all dashboards + progression logic.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_kpi_truth(
  p_user_id uuid,
  p_window_days int DEFAULT 30
)
RETURNS TABLE (
  kpi_key           text,
  current_value     numeric,
  target_value      numeric,
  gap_pct           numeric,
  formula           text,
  min_level         int,
  invert            boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  -- Access check: self or admin (uses existing has_role helper if present)
  BEGIN
    SELECT public.has_role(v_caller, 'admin'::app_role) INTO v_is_admin;
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF v_caller <> p_user_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH k AS (
    SELECT * FROM public.member_kpis WHERE user_id = p_user_id LIMIT 1
  )
  -- Canonical KPI rows. Targets mirror canonical-thresholds.ts (PLACEMENT.readiness).
  SELECT 'closing_rate'::text,
         COALESCE((SELECT closing_rate FROM k), 0)::numeric,
         25::numeric,
         CASE WHEN 25 = 0 THEN 0
              ELSE ROUND(((COALESCE((SELECT closing_rate FROM k),0) - 25) / 25.0) * 100, 1) END,
         'deal_won / showed'::text,
         4, false
  UNION ALL
  SELECT 'show_rate',
         COALESCE((SELECT show_rate FROM k), 0)::numeric,
         70::numeric,
         CASE WHEN 70 = 0 THEN 0
              ELSE ROUND(((COALESCE((SELECT show_rate FROM k),0) - 70) / 70.0) * 100, 1) END,
         'showed / booked',
         1, false
  UNION ALL
  SELECT 'calls_per_week',
         COALESCE((SELECT calls_per_week FROM k), 0)::numeric,
         15::numeric,
         CASE WHEN 15 = 0 THEN 0
              ELSE ROUND(((COALESCE((SELECT calls_per_week FROM k),0) - 15) / 15.0) * 100, 1) END,
         'count(call_completed within 7d)',
         1, false
  UNION ALL
  SELECT 'follow_up_rate',
         COALESCE((SELECT follow_up_rate FROM k), 0)::numeric,
         100::numeric,
         CASE WHEN 100 = 0 THEN 0
              ELSE ROUND(((COALESCE((SELECT follow_up_rate FROM k),0) - 100) / 100.0) * 100, 1) END,
         'follow_ups_done / follow_ups_due',
         1, false
  UNION ALL
  SELECT 'crm_hygiene_score',
         COALESCE((SELECT crm_hygiene_score FROM k), 0)::numeric,
         100::numeric,
         CASE WHEN 100 = 0 THEN 0
              ELSE ROUND(((COALESCE((SELECT crm_hygiene_score FROM k),0) - 100) / 100.0) * 100, 1) END,
         'fields_complete / fields_required',
         1, false
  UNION ALL
  SELECT 'revenue_closed',
         COALESCE((SELECT revenue_closed FROM k), 0)::numeric,
         10000::numeric,
         CASE WHEN 10000 = 0 THEN 0
              ELSE ROUND(((COALESCE((SELECT revenue_closed FROM k),0) - 10000) / 10000.0) * 100, 1) END,
         'sum(deal_won.revenue within window)',
         4, false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kpi_truth(uuid, int) TO authenticated;

COMMENT ON FUNCTION public.get_kpi_truth IS
'Canon Enforcement v1 — single executable KPI truth. Returns canonical KPI rows with current/target/gap/formula. Self or admin only.';