CREATE OR REPLACE FUNCTION public.ab_evaluate_test(p_test_key text)
RETURNS TABLE (
  test_id uuid,
  test_key text,
  status text,
  recommendation text,
  reason text,
  champion_value numeric,
  challenger_value numeric,
  lift numeric,
  p_value numeric,
  champion_leads bigint,
  challenger_leads bigint,
  duration_days numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.ab_funnel_tests%ROWTYPE;
  v_champ_ready boolean; v_chall_ready boolean; v_dur_ready boolean;
  v_champ_n bigint; v_chall_n bigint;
  v_dur numeric;
  v_kpi text; v_p1 numeric; v_p2 numeric; v_lift numeric;
  v_z numeric; v_p numeric;
  v_threshold numeric;
  v_rec text; v_reason text;
BEGIN
  SELECT t.* INTO v_test FROM public.ab_funnel_tests t WHERE t.test_key = p_test_key;
  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'Unknown test_key %', p_test_key;
  END IF;

  SELECT bool_and(r.arm_ready) FILTER (WHERE r.arm='champion'),
         bool_and(r.arm_ready) FILTER (WHERE r.arm='challenger'),
         bool_and(r.duration_ready),
         max(r.leads) FILTER (WHERE r.arm='champion'),
         max(r.leads) FILTER (WHERE r.arm='challenger'),
         max(r.duration_days)
  INTO v_champ_ready, v_chall_ready, v_dur_ready,
       v_champ_n, v_chall_n, v_dur
  FROM public.ab_test_readiness(v_test.id) r;

  SELECT s.primary_kpi, s.champion_value, s.challenger_value, s.lift, s.z_score, s.p_value
  INTO v_kpi, v_p1, v_p2, v_lift, v_z, v_p
  FROM public.ab_test_stats(v_test.id) s;

  v_threshold := 1 - v_test.significance_threshold;

  IF v_test.status NOT IN ('running') THEN
    v_rec := 'NO_OP';
    v_reason := 'Test not running (status=' || v_test.status || ')';
  ELSIF NOT (COALESCE(v_champ_ready,false) AND COALESCE(v_chall_ready,false)) THEN
    v_rec := 'INSUFFICIENT_DATA';
    v_reason := format('Need >=%s leads per arm (champ=%s, chall=%s)',
                       v_test.min_sample_size, v_champ_n, v_chall_n);
  ELSIF v_lift IS NOT NULL AND v_lift <= -0.20 THEN
    v_rec := 'ROLLBACK';
    v_reason := format('Challenger underperforms by %s%% — abort', round(v_lift*100,1));
  ELSIF NOT COALESCE(v_dur_ready,false) THEN
    v_rec := 'CONTINUE';
    v_reason := format('Duration %.1f/%s days', v_dur, v_test.min_duration_days);
  ELSIF v_p IS NULL THEN
    v_rec := 'CONTINUE';
    v_reason := 'No measurable variance yet';
  ELSIF v_p < v_threshold AND v_lift >= 0.05 THEN
    v_rec := 'PROMOTE_CHALLENGER';
    v_reason := format('Significant lift +%s%% (p=%.4f)', round(v_lift*100,1), v_p);
  ELSIF v_p < v_threshold AND v_lift <= -0.05 THEN
    v_rec := 'KEEP_CHAMPION';
    v_reason := format('Significant negative lift %s%% (p=%.4f)', round(v_lift*100,1), v_p);
  ELSE
    v_rec := 'KEEP_CHAMPION';
    v_reason := format('No significant difference (lift=%s%%, p=%.4f)',
                       round(COALESCE(v_lift,0)*100,1), v_p);
  END IF;

  RETURN QUERY SELECT v_test.id, v_test.test_key, v_test.status,
                      v_rec, v_reason,
                      v_p1, v_p2, v_lift, v_p,
                      v_champ_n, v_chall_n, v_dur;
END;
$$;