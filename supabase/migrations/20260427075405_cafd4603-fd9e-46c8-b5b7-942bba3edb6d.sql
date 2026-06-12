DROP FUNCTION IF EXISTS public.ab_evaluate_test(text, text);

ALTER TABLE public.ab_funnel_tests
  ADD COLUMN IF NOT EXISTS primary_min_lift numeric NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS guard_kpis       jsonb   NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ab_funnel_tests.primary_min_lift IS
  'Mindest-Lift (z.B. 0.05 = +5%) für Promotion auf der primären KPI.';
COMMENT ON COLUMN public.ab_funnel_tests.guard_kpis IS
  'JSONB-Array von {kpi:text, max_regression:numeric (negativ)}.';

ALTER TABLE public.ab_test_decision_log
  DROP CONSTRAINT IF EXISTS ab_test_decision_log_decision_check;
ALTER TABLE public.ab_test_decision_log
  ADD CONSTRAINT ab_test_decision_log_decision_check CHECK (
    decision = ANY (ARRAY[
      'START','PROMOTE_CHALLENGER','KEEP_CHAMPION','ROLLBACK',
      'ABORT','MANUAL_OVERRIDE','EVALUATE_NO_OP','BLOCKED_BY_GUARD'
    ])
  );

UPDATE public.ab_funnel_tests
   SET guard_kpis = CASE primary_kpi
     WHEN 'booking_rate' THEN
       '[{"kpi":"qualified_rate","max_regression":-0.02},
         {"kpi":"show_rate","max_regression":-0.05}]'::jsonb
     WHEN 'qualified_rate' THEN
       '[{"kpi":"show_rate","max_regression":-0.05},
         {"kpi":"close_rate","max_regression":-0.05}]'::jsonb
     WHEN 'revenue_per_lead' THEN
       '[{"kpi":"booking_rate","max_regression":-0.05},
         {"kpi":"show_rate","max_regression":-0.05}]'::jsonb
     ELSE '[]'::jsonb
   END
 WHERE guard_kpis = '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.ab_check_guard_kpis(p_test_id uuid)
RETURNS TABLE (
  kpi text, max_regression numeric,
  champion_value numeric, challenger_value numeric,
  lift numeric, p_value numeric,
  is_violated boolean, reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_test public.ab_funnel_tests%ROWTYPE;
  v_guard jsonb; v_kpi text; v_max_reg numeric; v_alpha numeric; s RECORD;
BEGIN
  SELECT t.* INTO v_test FROM public.ab_funnel_tests t WHERE t.id = p_test_id;
  IF v_test.id IS NULL THEN RETURN; END IF;
  v_alpha := 1 - v_test.significance_threshold;

  FOR v_guard IN SELECT * FROM jsonb_array_elements(COALESCE(v_test.guard_kpis,'[]'::jsonb))
  LOOP
    v_kpi := v_guard->>'kpi';
    v_max_reg := COALESCE((v_guard->>'max_regression')::numeric, -0.05);
    IF v_kpi IS NULL OR v_kpi = v_test.primary_kpi THEN CONTINUE; END IF;

    SELECT * INTO s FROM public.ab_test_significance(v_test.id, v_kpi);

    kpi := v_kpi;
    max_regression := v_max_reg;
    champion_value := s.champion_value;
    challenger_value := s.challenger_value;
    lift := s.lift;
    p_value := s.p_value;
    is_violated := COALESCE(s.lift,0) < v_max_reg
                   AND s.p_value IS NOT NULL AND s.p_value < v_alpha;
    IF is_violated THEN
      reason := format('Guard %s regressed %s%% (tol %s%%, p=%.4f)',
        v_kpi, round(COALESCE(s.lift,0)*100,2), round(v_max_reg*100,2), s.p_value);
    ELSIF s.lift IS NOT NULL AND s.lift < v_max_reg THEN
      reason := format('Guard %s below tol but not significant (lift=%s%%, p=%.4f)',
        v_kpi, round(s.lift*100,2), COALESCE(s.p_value,1));
    ELSE
      reason := format('Guard %s OK (lift=%s%%)',
        v_kpi, round(COALESCE(s.lift,0)*100,2));
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ab_check_guard_kpis(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ab_evaluate_test(
  p_test_key text, p_kpi text DEFAULT NULL
)
RETURNS TABLE (
  test_id uuid, test_key text, status text, kpi text,
  recommendation text, reason text,
  champion_value numeric, challenger_value numeric,
  champion_ci_low numeric, champion_ci_high numeric,
  challenger_ci_low numeric, challenger_ci_high numeric,
  lift numeric, p_value numeric,
  champion_leads bigint, challenger_leads bigint,
  duration_days numeric,
  guard_violations jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_test public.ab_funnel_tests%ROWTYPE;
  v_kpi text;
  v_champ_ready boolean; v_chall_ready boolean; v_dur_ready boolean;
  v_champ_n bigint; v_chall_n bigint; v_dur numeric;
  s RECORD; v_alpha numeric; v_rec text; v_reason text;
  v_violations jsonb; v_violation_count int;
BEGIN
  SELECT t.* INTO v_test FROM public.ab_funnel_tests t WHERE t.test_key = p_test_key;
  IF v_test.id IS NULL THEN RAISE EXCEPTION 'Unknown test_key %', p_test_key; END IF;
  v_kpi := COALESCE(p_kpi, v_test.primary_kpi);

  SELECT bool_and(r.arm_ready) FILTER (WHERE r.arm='champion'),
         bool_and(r.arm_ready) FILTER (WHERE r.arm='challenger'),
         bool_and(r.duration_ready),
         max(r.leads) FILTER (WHERE r.arm='champion'),
         max(r.leads) FILTER (WHERE r.arm='challenger'),
         max(r.duration_days)
  INTO v_champ_ready, v_chall_ready, v_dur_ready,
       v_champ_n, v_chall_n, v_dur
  FROM public.ab_test_readiness(v_test.id) r;

  SELECT * INTO s FROM public.ab_test_significance(v_test.id, v_kpi);
  v_alpha := 1 - v_test.significance_threshold;

  SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb),
         count(*) FILTER (WHERE g.is_violated)
    INTO v_violations, v_violation_count
    FROM public.ab_check_guard_kpis(v_test.id) g;

  IF v_test.status NOT IN ('running') THEN
    v_rec := 'NO_OP';
    v_reason := format('Test not running (status=%s)', v_test.status);
  ELSIF s.lift IS NOT NULL
        AND s.lift <= v_test.rollback_threshold
        AND COALESCE(v_champ_n,0) >= v_test.rollback_min_sample
        AND COALESCE(v_chall_n,0) >= v_test.rollback_min_sample THEN
    v_rec := 'ROLLBACK';
    v_reason := format('Lift %s%% ≤ rollback threshold %s%% (n=%s/%s) — auto-rollback',
                       round(s.lift*100,2), round(v_test.rollback_threshold*100,2),
                       v_champ_n, v_chall_n);
  ELSIF NOT (COALESCE(v_champ_ready,false) AND COALESCE(v_chall_ready,false)) THEN
    v_rec := 'INSUFFICIENT_DATA';
    v_reason := format('Need >=%s leads per arm (champ=%s, chall=%s)',
                       v_test.min_sample_size, v_champ_n, v_chall_n);
  ELSIF NOT COALESCE(v_dur_ready,false) THEN
    v_rec := 'CONTINUE';
    v_reason := format('Duration %.1f/%s days', v_dur, v_test.min_duration_days);
  ELSIF s.p_value IS NULL THEN
    v_rec := 'CONTINUE';
    v_reason := 'No measurable variance yet';
  ELSIF s.p_value < v_alpha
        AND s.lift >= v_test.primary_min_lift
        AND v_violation_count = 0 THEN
    v_rec := 'PROMOTE_CHALLENGER';
    v_reason := format('Primary %s lift +%s%% (p=%.4f, ≥min %s%%); %s guard(s) all green',
                       v_kpi, round(s.lift*100,2), s.p_value,
                       round(v_test.primary_min_lift*100,2),
                       jsonb_array_length(v_violations));
  ELSIF s.p_value < v_alpha
        AND s.lift >= v_test.primary_min_lift
        AND v_violation_count > 0 THEN
    v_rec := 'BLOCKED_BY_GUARD';
    v_reason := format('Primary win on %s (+%s%%, p=%.4f) BLOCKED by %s guard violation(s): %s',
                       v_kpi, round(s.lift*100,2), s.p_value, v_violation_count,
                       (SELECT string_agg(g->>'reason', '; ')
                          FROM jsonb_array_elements(v_violations) g
                         WHERE (g->>'is_violated')::boolean));
  ELSIF s.p_value < v_alpha AND s.lift < v_test.primary_min_lift AND s.lift > 0 THEN
    v_rec := 'KEEP_CHAMPION';
    v_reason := format('Significant lift +%s%% but below min lift %s%%',
                       round(s.lift*100,2), round(v_test.primary_min_lift*100,2));
  ELSIF s.p_value < v_alpha AND s.lift <= -0.05 THEN
    v_rec := 'KEEP_CHAMPION';
    v_reason := format('Significant negative lift %s%% (p=%.4f)',
                       round(s.lift*100,2), s.p_value);
  ELSE
    v_rec := 'KEEP_CHAMPION';
    v_reason := format('No significant difference (lift=%s%%, p=%.4f)',
                       round(COALESCE(s.lift,0)*100,2), s.p_value);
  END IF;

  RETURN QUERY SELECT
    v_test.id, v_test.test_key, v_test.status, v_kpi,
    v_rec, v_reason,
    s.champion_value, s.challenger_value,
    s.champion_ci_low, s.champion_ci_high,
    s.challenger_ci_low, s.challenger_ci_high,
    s.lift, s.p_value,
    v_champ_n, v_chall_n, v_dur,
    v_violations;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ab_evaluate_test(text, text) TO authenticated;