
-- Fix recalc_user_kpi_snapshot to use correct column name
CREATE OR REPLACE FUNCTION public.recalc_user_kpi_snapshot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booked int;
  v_showed int;
  v_no_show int;
  v_won int;
  v_revenue numeric;
  v_show_rate numeric;
  v_close_rate numeric;
  v_epc numeric;
BEGIN
  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE no_show_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_no_show, v_won, v_revenue
  FROM calls WHERE user_id = p_user_id;

  v_show_rate := CASE WHEN (v_showed + v_no_show) > 0
    THEN LEAST(ROUND((v_showed::numeric / (v_showed + v_no_show)) * 100, 1), 100) ELSE 0 END;
  v_close_rate := CASE WHEN v_showed > 0
    THEN LEAST(ROUND((v_won::numeric / v_showed) * 100, 1), 100) ELSE 0 END;
  v_epc := CASE WHEN v_booked > 0
    THEN ROUND(v_revenue / v_booked, 2) ELSE 0 END;

  INSERT INTO users_kpi_snapshot (user_id, total_calls, total_revenue, show_rate, close_rate, earnings_per_call, last_updated)
  VALUES (p_user_id, v_booked, v_revenue, v_show_rate, v_close_rate, v_epc, now())
  ON CONFLICT (user_id) DO UPDATE SET
    total_calls = EXCLUDED.total_calls,
    total_revenue = EXCLUDED.total_revenue,
    show_rate = EXCLUDED.show_rate,
    close_rate = EXCLUDED.close_rate,
    earnings_per_call = EXCLUDED.earnings_per_call,
    last_updated = now();
END;
$$;
