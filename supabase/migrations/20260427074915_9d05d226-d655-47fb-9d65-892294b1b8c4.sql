-- 1) Erweitern der Test-Tabelle ----------------------------------------------
ALTER TABLE public.ab_funnel_tests
  ADD COLUMN IF NOT EXISTS rollback_threshold  numeric NOT NULL DEFAULT -0.20,
  ADD COLUMN IF NOT EXISTS rollback_min_sample integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS rollback_reason     text,
  ADD COLUMN IF NOT EXISTS rolled_back_at      timestamptz;

-- Constraint anpassen: 'rolled_back' als zusätzlicher Status
ALTER TABLE public.ab_funnel_tests DROP CONSTRAINT IF EXISTS ab_funnel_tests_status_check;
ALTER TABLE public.ab_funnel_tests
  ADD CONSTRAINT ab_funnel_tests_status_check
  CHECK (status = ANY (ARRAY['pending','running','completed','aborted','rolled_back']));

-- 2) Auto-Rollback RPC --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ab_auto_rollback_if_needed(
  p_test_key text,
  p_kpi text DEFAULT NULL
)
RETURNS TABLE (
  test_id uuid,
  test_key text,
  rolled_back boolean,
  reason text,
  lift numeric,
  threshold numeric,
  champion_value numeric,
  challenger_value numeric,
  champion_leads bigint,
  challenger_leads bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.ab_funnel_tests%ROWTYPE;
  v_kpi text;
  v_champ_n bigint; v_chall_n bigint;
  s RECORD;
  v_reason text;
  v_did boolean := false;
BEGIN
  SELECT t.* INTO v_test FROM public.ab_funnel_tests t WHERE t.test_key = p_test_key;
  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'Unknown test_key %', p_test_key;
  END IF;

  IF v_test.status <> 'running' THEN
    RETURN QUERY SELECT v_test.id, v_test.test_key, false,
      format('Test not running (status=%s)', v_test.status)::text,
      NULL::numeric, v_test.rollback_threshold, NULL::numeric, NULL::numeric,
      NULL::bigint, NULL::bigint;
    RETURN;
  END IF;

  v_kpi := COALESCE(p_kpi, v_test.primary_kpi);

  SELECT max(r.leads) FILTER (WHERE r.arm='champion'),
         max(r.leads) FILTER (WHERE r.arm='challenger')
    INTO v_champ_n, v_chall_n
    FROM public.ab_test_readiness(v_test.id) r;

  -- Mindest-Stichprobe gegen Frühfehler
  IF COALESCE(v_champ_n,0) < v_test.rollback_min_sample
     OR COALESCE(v_chall_n,0) < v_test.rollback_min_sample THEN
    RETURN QUERY SELECT v_test.id, v_test.test_key, false,
      format('Below rollback_min_sample (%s/%s vs required %s)',
             v_champ_n, v_chall_n, v_test.rollback_min_sample)::text,
      NULL::numeric, v_test.rollback_threshold, NULL::numeric, NULL::numeric,
      v_champ_n, v_chall_n;
    RETURN;
  END IF;

  SELECT * INTO s FROM public.ab_test_significance(v_test.id, v_kpi);

  IF s.lift IS NULL THEN
    RETURN QUERY SELECT v_test.id, v_test.test_key, false,
      'No measurable lift yet'::text,
      NULL::numeric, v_test.rollback_threshold,
      s.champion_value, s.challenger_value, v_champ_n, v_chall_n;
    RETURN;
  END IF;

  IF s.lift <= v_test.rollback_threshold THEN
    v_reason := format(
      'Auto-rollback: KPI %s lift %s%% ≤ threshold %s%% (champ=%s, chall=%s, n=%s/%s)',
      v_kpi,
      round(s.lift*100, 2),
      round(v_test.rollback_threshold*100, 2),
      s.champion_value, s.challenger_value, v_champ_n, v_chall_n
    );

    UPDATE public.ab_funnel_tests
       SET status         = 'rolled_back',
           winner         = champion_funnel,
           rollback_reason= v_reason,
           rolled_back_at = now(),
           completed_at   = COALESCE(completed_at, now())
     WHERE id = v_test.id;

    -- Audit-Trail (best-effort, blockt Rollback nicht)
    BEGIN
      INSERT INTO public.audit_logs (
        action, action_type, action_result,
        resource_type, resource_id, note, metadata, created_at
      ) VALUES (
        'ab_test_auto_rollback', 'system_action', 'success',
        'ab_funnel_test', v_test.id, v_reason,
        jsonb_build_object(
          'test_key', v_test.test_key,
          'kpi', v_kpi,
          'lift', s.lift,
          'threshold', v_test.rollback_threshold,
          'champion_value', s.champion_value,
          'challenger_value', s.challenger_value,
          'champion_leads', v_champ_n,
          'challenger_leads', v_chall_n,
          'p_value', s.p_value
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    v_did := true;
  ELSE
    v_reason := format('Lift %s%% above threshold %s%% — no rollback',
      round(s.lift*100,2), round(v_test.rollback_threshold*100,2));
  END IF;

  RETURN QUERY SELECT
    v_test.id, v_test.test_key, v_did, v_reason,
    s.lift, v_test.rollback_threshold,
    s.champion_value, s.challenger_value,
    v_champ_n, v_chall_n;
END;
$$;

-- 3) Evaluator nutzt per-Test-Schwelle ---------------------------------------
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
  duration_days numeric
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.ab_funnel_tests%ROWTYPE;
  v_kpi text;
  v_champ_ready boolean; v_chall_ready boolean; v_dur_ready boolean;
  v_champ_n bigint; v_chall_n bigint; v_dur numeric;
  s RECORD; v_threshold numeric; v_rec text; v_reason text;
BEGIN
  SELECT t.* INTO v_test FROM public.ab_funnel_tests t WHERE t.test_key = p_test_key;
  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'Unknown test_key %', p_test_key;
  END IF;

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
  v_threshold := 1 - v_test.significance_threshold;

  IF v_test.status NOT IN ('running') THEN
    v_rec := 'NO_OP';
    v_reason := format('Test not running (status=%s)', v_test.status);
  ELSIF s.lift IS NOT NULL
        AND s.lift <= v_test.rollback_threshold
        AND COALESCE(v_champ_n,0) >= v_test.rollback_min_sample
        AND COALESCE(v_chall_n,0) >= v_test.rollback_min_sample THEN
    v_rec := 'ROLLBACK';
    v_reason := format('Lift %s%% ≤ rollback threshold %s%% (n=%s/%s) — auto-rollback',
                       round(s.lift*100,2),
                       round(v_test.rollback_threshold*100,2),
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
  ELSIF s.p_value < v_threshold AND s.lift >= 0.05 THEN
    v_rec := 'PROMOTE_CHALLENGER';
    v_reason := format('Significant lift +%s%% (p=%.4f, 95%% CI [%s, %s])',
                       round(s.lift*100,1), s.p_value,
                       s.challenger_ci_low, s.challenger_ci_high);
  ELSIF s.p_value < v_threshold AND s.lift <= -0.05 THEN
    v_rec := 'KEEP_CHAMPION';
    v_reason := format('Significant negative lift %s%% (p=%.4f)',
                       round(s.lift*100,1), s.p_value);
  ELSE
    v_rec := 'KEEP_CHAMPION';
    v_reason := format('No significant difference (lift=%s%%, p=%.4f)',
                       round(COALESCE(s.lift,0)*100,1), s.p_value);
  END IF;

  RETURN QUERY SELECT
    v_test.id, v_test.test_key, v_test.status, v_kpi,
    v_rec, v_reason,
    s.champion_value, s.challenger_value,
    s.champion_ci_low, s.champion_ci_high,
    s.challenger_ci_low, s.challenger_ci_high,
    s.lift, s.p_value,
    v_champ_n, v_chall_n, v_dur;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ab_auto_rollback_if_needed(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ab_evaluate_test(text, text) TO authenticated;