
-- Fix show-up rate calculation across ALL KPI functions
-- Correct formula: showed / (showed + no_show) instead of showed / booked

-- 1. Fix recalc_kpis_from_call (trigger on calls table)
CREATE OR REPLACE FUNCTION public.recalc_kpis_from_call()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_showed int;
  v_no_show int;
  v_closed_won int;
  v_total_revenue numeric;
  v_show_rate numeric;
  v_close_rate numeric;
  v_booked int;
BEGIN
  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE no_show_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_no_show, v_closed_won, v_total_revenue
  FROM calls
  WHERE user_id = v_user_id;

  -- Show rate = showed / (showed + no_show)
  v_show_rate := CASE WHEN (v_showed + v_no_show) > 0
    THEN LEAST(ROUND((v_showed::numeric / (v_showed + v_no_show)) * 100, 1), 100)
    ELSE 0 END;

  v_close_rate := CASE WHEN v_showed > 0
    THEN LEAST(ROUND((v_closed_won::numeric / v_showed) * 100, 1), 100)
    ELSE 0 END;

  INSERT INTO member_kpis (user_id, closing_rate, show_rate, calls_handled, revenue_closed, updated_at)
  VALUES (v_user_id, v_close_rate, v_show_rate, v_booked, v_total_revenue, now())
  ON CONFLICT (user_id) DO UPDATE SET
    closing_rate = EXCLUDED.closing_rate,
    show_rate = EXCLUDED.show_rate,
    calls_handled = EXCLUDED.calls_handled,
    revenue_closed = EXCLUDED.revenue_closed,
    updated_at = now();

  RETURN NEW;
END;
$function$;

-- 2. Fix recalc_user_kpi_snapshot
CREATE OR REPLACE FUNCTION public.recalc_user_kpi_snapshot(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booked int;
  v_showed int;
  v_no_show int;
  v_won int;
  v_revenue numeric;
  v_show_rate numeric;
  v_close_rate numeric;
  v_epc numeric;
  v_team_avg_epc numeric;
  v_score numeric;
BEGIN
  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE no_show_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_no_show, v_won, v_revenue
  FROM calls
  WHERE user_id = p_user_id;

  -- Show rate = showed / (showed + no_show)
  v_show_rate := CASE WHEN (v_showed + v_no_show) > 0
    THEN LEAST(ROUND((v_showed::numeric / (v_showed + v_no_show)) * 100, 1), 100)
    ELSE 0 END;
  v_close_rate := CASE WHEN v_showed > 0 THEN LEAST(ROUND((v_won::numeric / v_showed) * 100, 1), 100) ELSE 0 END;
  v_epc := CASE WHEN v_showed > 0 THEN ROUND(v_revenue / v_showed, 2) ELSE 0 END;

  SELECT COALESCE(AVG(CASE WHEN s.earnings_per_call > 0 THEN s.earnings_per_call END), 1)
  INTO v_team_avg_epc
  FROM users_kpi_snapshot s;

  v_score := ROUND(
    (v_show_rate * 0.3) +
    (v_close_rate * 0.4) +
    (LEAST(v_epc / GREATEST(v_team_avg_epc, 1) * 100, 100) * 0.3)
  , 1);

  INSERT INTO users_kpi_snapshot (user_id, show_rate, close_rate, earnings_per_call, performance_score, total_calls, total_revenue, last_updated)
  VALUES (p_user_id, v_show_rate, v_close_rate, v_epc, v_score, v_booked, v_revenue, now())
  ON CONFLICT (user_id) DO UPDATE SET
    show_rate = EXCLUDED.show_rate,
    close_rate = EXCLUDED.close_rate,
    earnings_per_call = EXCLUDED.earnings_per_call,
    performance_score = EXCLUDED.performance_score,
    total_calls = EXCLUDED.total_calls,
    total_revenue = EXCLUDED.total_revenue,
    last_updated = now();

  INSERT INTO member_kpis (user_id, closing_rate, show_rate, revenue_closed, calls_handled, earnings_per_call, updated_at)
  VALUES (p_user_id, v_close_rate, v_show_rate, v_revenue, v_booked, v_epc, now())
  ON CONFLICT (user_id) DO UPDATE SET
    closing_rate = EXCLUDED.closing_rate,
    show_rate = EXCLUDED.show_rate,
    revenue_closed = EXCLUDED.revenue_closed,
    calls_handled = EXCLUDED.calls_handled,
    earnings_per_call = EXCLUDED.earnings_per_call,
    updated_at = now();
END;
$function$;

-- 3. Fix recalc_enhanced_performance
CREATE OR REPLACE FUNCTION public.recalc_enhanced_performance(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booked int; v_showed int; v_no_show int; v_won int; v_revenue numeric;
  v_show_rate numeric; v_close_rate numeric; v_epc numeric;
  v_ai_avg numeric; v_team_avg_epc numeric; v_score numeric;
  v_has_ai boolean;
BEGIN
  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE no_show_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_no_show, v_won, v_revenue
  FROM calls WHERE user_id = p_user_id;

  -- Show rate = showed / (showed + no_show)
  v_show_rate := CASE WHEN (v_showed + v_no_show) > 0
    THEN LEAST(ROUND((v_showed::numeric / (v_showed + v_no_show)) * 100, 1), 100)
    ELSE 0 END;
  v_close_rate := CASE WHEN v_showed > 0 THEN LEAST(ROUND((v_won::numeric / v_showed) * 100, 1), 100) ELSE 0 END;
  v_epc := CASE WHEN v_showed > 0 THEN ROUND(v_revenue / v_showed, 2) ELSE 0 END;

  SELECT COALESCE(AVG(CASE WHEN s.earnings_per_call > 0 THEN s.earnings_per_call END), 1)
  INTO v_team_avg_epc FROM users_kpi_snapshot s;

  SELECT AVG(cas.overall_call_score), count(*) > 0
  INTO v_ai_avg, v_has_ai
  FROM call_ai_scores cas
  JOIN calls c ON c.id = cas.call_id
  WHERE cas.user_id = p_user_id
    AND cas.scoring_status = 'scored'
    AND c.showed_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM data_integrity_logs dil
      WHERE dil.record_id = c.id AND dil.table_name = 'calls'
        AND dil.violation_type NOT IN ('resolved')
    );

  IF v_has_ai AND v_ai_avg IS NOT NULL THEN
    v_score := ROUND(
      (v_show_rate * 0.25) +
      (v_close_rate * 0.30) +
      (LEAST(v_epc / GREATEST(v_team_avg_epc, 1) * 100, 100) * 0.25) +
      (LEAST(v_ai_avg, 100) * 0.20)
    , 1);
  ELSE
    v_score := ROUND(
      (v_show_rate * 0.3125) +
      (v_close_rate * 0.375) +
      (LEAST(v_epc / GREATEST(v_team_avg_epc, 1) * 100, 100) * 0.3125)
    , 1);
  END IF;

  INSERT INTO users_kpi_snapshot (user_id, show_rate, close_rate, earnings_per_call, performance_score, total_calls, total_revenue, last_updated)
  VALUES (p_user_id, v_show_rate, v_close_rate, v_epc, v_score, v_booked, v_revenue, now())
  ON CONFLICT (user_id) DO UPDATE SET
    show_rate = EXCLUDED.show_rate, close_rate = EXCLUDED.close_rate,
    earnings_per_call = EXCLUDED.earnings_per_call, performance_score = EXCLUDED.performance_score,
    total_calls = EXCLUDED.total_calls, total_revenue = EXCLUDED.total_revenue, last_updated = now();

  INSERT INTO member_kpis (user_id, closing_rate, show_rate, revenue_closed, calls_handled, earnings_per_call, updated_at)
  VALUES (p_user_id, v_close_rate, v_show_rate, v_revenue, v_booked, v_epc, now())
  ON CONFLICT (user_id) DO UPDATE SET
    closing_rate = EXCLUDED.closing_rate, show_rate = EXCLUDED.show_rate,
    revenue_closed = EXCLUDED.revenue_closed, calls_handled = EXCLUDED.calls_handled,
    earnings_per_call = EXCLUDED.earnings_per_call, updated_at = now();
END;
$function$;
