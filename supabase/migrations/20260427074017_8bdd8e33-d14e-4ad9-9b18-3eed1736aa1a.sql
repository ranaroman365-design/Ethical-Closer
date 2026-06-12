CREATE OR REPLACE FUNCTION public.ab_test_stats(p_test_id uuid)
RETURNS TABLE (
  test_id uuid,
  primary_kpi text,
  champion_value numeric,
  challenger_value numeric,
  lift numeric,
  z_score numeric,
  p_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kpi text;
  v_champ_n bigint; v_chall_n bigint;
  v_champ_x numeric; v_chall_x numeric;
  v_p1 numeric; v_p2 numeric; v_p_pool numeric;
  v_se numeric; v_z numeric; v_p numeric;
  v_lift numeric;
BEGIN
  SELECT t.primary_kpi INTO v_kpi
    FROM public.ab_funnel_tests t WHERE t.id = p_test_id;
  IF v_kpi IS NULL THEN RETURN; END IF;

  SELECT
    SUM(CASE WHEN k.bucket='champion'   THEN k.leads ELSE 0 END),
    SUM(CASE WHEN k.bucket='challenger' THEN k.leads ELSE 0 END),
    SUM(CASE WHEN k.bucket='champion'   THEN
      CASE v_kpi
        WHEN 'close_rate'         THEN k.deals
        WHEN 'show_rate_x_close'  THEN k.deals
        WHEN 'revenue_per_lead'   THEN k.revenue
        ELSE k.deals END
      ELSE 0 END),
    SUM(CASE WHEN k.bucket='challenger' THEN
      CASE v_kpi
        WHEN 'close_rate'         THEN k.deals
        WHEN 'show_rate_x_close'  THEN k.deals
        WHEN 'revenue_per_lead'   THEN k.revenue
        ELSE k.deals END
      ELSE 0 END)
  INTO v_champ_n, v_chall_n, v_champ_x, v_chall_x
  FROM public.ab_test_kpis k WHERE k.test_id = p_test_id;

  v_champ_n := COALESCE(v_champ_n, 0);
  v_chall_n := COALESCE(v_chall_n, 0);
  v_champ_x := COALESCE(v_champ_x, 0);
  v_chall_x := COALESCE(v_chall_x, 0);

  IF v_champ_n = 0 OR v_chall_n = 0 THEN
    RETURN QUERY SELECT p_test_id, v_kpi, NULL::numeric, NULL::numeric,
                        NULL::numeric, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  v_p1 := v_champ_x::numeric / v_champ_n;
  v_p2 := v_chall_x::numeric / v_chall_n;
  v_lift := CASE WHEN v_p1 = 0 THEN NULL ELSE (v_p2 - v_p1) / v_p1 END;

  v_p_pool := (v_champ_x + v_chall_x) / NULLIF(v_champ_n + v_chall_n, 0);
  v_se := sqrt(GREATEST(v_p_pool * (1 - v_p_pool) * (1.0/v_champ_n + 1.0/v_chall_n), 0));
  v_z := CASE WHEN v_se > 0 THEN (v_p2 - v_p1) / v_se ELSE NULL END;
  v_p := CASE WHEN v_z IS NULL THEN NULL
              ELSE 2 * (1 - (0.5 * (1 + public.erf(abs(v_z) / sqrt(2.0))))) END;

  RETURN QUERY SELECT p_test_id, v_kpi, v_p1, v_p2, v_lift, v_z, v_p;
END;
$$;