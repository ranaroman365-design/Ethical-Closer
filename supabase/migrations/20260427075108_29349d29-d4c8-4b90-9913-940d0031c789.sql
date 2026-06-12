-- 1) Decision Log Tabelle ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ab_test_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.ab_funnel_tests(id) ON DELETE RESTRICT,
  test_key text NOT NULL,
  decision text NOT NULL,
  decision_reason text NOT NULL,
  kpi text,
  champion_funnel public.funnel_source_t,
  challenger_funnel public.funnel_source_t,
  champion_value numeric,
  challenger_value numeric,
  champion_ci_low numeric,
  champion_ci_high numeric,
  challenger_ci_low numeric,
  challenger_ci_high numeric,
  lift numeric,
  p_value numeric,
  champion_leads bigint,
  challenger_leads bigint,
  duration_days numeric,
  test_status_before text,
  test_status_after text,
  parameter_snapshot jsonb NOT NULL,
  actor_user_id uuid,
  actor_type text NOT NULL DEFAULT 'system',
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_test_decision_log_decision_check CHECK (
    decision = ANY (ARRAY[
      'START','PROMOTE_CHALLENGER','KEEP_CHAMPION','ROLLBACK',
      'ABORT','MANUAL_OVERRIDE','EVALUATE_NO_OP'
    ])
  ),
  CONSTRAINT ab_test_decision_log_actor_type_check CHECK (
    actor_type = ANY (ARRAY['system','admin','cron','api'])
  )
);

CREATE INDEX IF NOT EXISTS ab_test_decision_log_exp_idx
  ON public.ab_test_decision_log (experiment_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS ab_test_decision_log_key_idx
  ON public.ab_test_decision_log (test_key, decided_at DESC);
CREATE INDEX IF NOT EXISTS ab_test_decision_log_decision_idx
  ON public.ab_test_decision_log (decision, decided_at DESC);

-- 2) Immutability Trigger ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.ab_decision_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ab_test_decision_log is append-only — % not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS ab_decision_log_no_update ON public.ab_test_decision_log;
CREATE TRIGGER ab_decision_log_no_update
  BEFORE UPDATE ON public.ab_test_decision_log
  FOR EACH ROW EXECUTE FUNCTION public.ab_decision_log_immutable();

DROP TRIGGER IF EXISTS ab_decision_log_no_delete ON public.ab_test_decision_log;
CREATE TRIGGER ab_decision_log_no_delete
  BEFORE DELETE ON public.ab_test_decision_log
  FOR EACH ROW EXECUTE FUNCTION public.ab_decision_log_immutable();

-- 3) RLS — read for admins/owners; writes only via SECURITY DEFINER ----------
ALTER TABLE public.ab_test_decision_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ab_decision_log_admin_read ON public.ab_test_decision_log;
CREATE POLICY ab_decision_log_admin_read
  ON public.ab_test_decision_log FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- Kein direktes INSERT/UPDATE/DELETE über REST — nur via RPC.

-- 4) Logging RPC -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ab_log_decision(
  p_test_key text,
  p_decision text,
  p_reason text,
  p_kpi text DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_status_after text DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.ab_funnel_tests%ROWTYPE;
  v_kpi text;
  s RECORD;
  v_champ_n bigint; v_chall_n bigint; v_dur numeric;
  v_log_id uuid;
  v_snapshot jsonb;
BEGIN
  SELECT t.* INTO v_test FROM public.ab_funnel_tests t WHERE t.test_key = p_test_key;
  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'ab_log_decision: unknown test_key %', p_test_key;
  END IF;

  v_kpi := COALESCE(p_kpi, v_test.primary_kpi);

  -- Best-effort statistics — falls noch keine Daten, bleiben Felder NULL.
  BEGIN
    SELECT * INTO s FROM public.ab_test_significance(v_test.id, v_kpi);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    SELECT max(r.leads) FILTER (WHERE r.arm='champion'),
           max(r.leads) FILTER (WHERE r.arm='challenger'),
           max(r.duration_days)
      INTO v_champ_n, v_chall_n, v_dur
      FROM public.ab_test_readiness(v_test.id) r;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  v_snapshot := jsonb_build_object(
    'test_id', v_test.id,
    'test_key', v_test.test_key,
    'test_number', v_test.test_number,
    'champion_funnel', v_test.champion_funnel,
    'challenger_funnel', v_test.challenger_funnel,
    'primary_kpi', v_test.primary_kpi,
    'evaluated_kpi', v_kpi,
    'min_sample_size', v_test.min_sample_size,
    'min_duration_days', v_test.min_duration_days,
    'significance_threshold', v_test.significance_threshold,
    'rollback_threshold', v_test.rollback_threshold,
    'rollback_min_sample', v_test.rollback_min_sample,
    'started_at', v_test.started_at,
    'completed_at', v_test.completed_at,
    'promoted_at', v_test.promoted_at,
    'rolled_back_at', v_test.rolled_back_at,
    'winner', v_test.winner,
    'snapshot_taken_at', now()
  ) || COALESCE(p_extra, '{}'::jsonb);

  INSERT INTO public.ab_test_decision_log (
    experiment_id, test_key, decision, decision_reason, kpi,
    champion_funnel, challenger_funnel,
    champion_value, challenger_value,
    champion_ci_low, champion_ci_high,
    challenger_ci_low, challenger_ci_high,
    lift, p_value,
    champion_leads, challenger_leads, duration_days,
    test_status_before, test_status_after,
    parameter_snapshot, actor_user_id, actor_type
  ) VALUES (
    v_test.id, v_test.test_key, p_decision, p_reason, v_kpi,
    v_test.champion_funnel, v_test.challenger_funnel,
    s.champion_value, s.challenger_value,
    s.champion_ci_low, s.champion_ci_high,
    s.challenger_ci_low, s.challenger_ci_high,
    s.lift, s.p_value,
    v_champ_n, v_chall_n, v_dur,
    v_test.status, COALESCE(p_status_after, v_test.status),
    v_snapshot, auth.uid(), p_actor_type
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ab_log_decision(text,text,text,text,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.ab_log_decision(text,text,text,text,text,text,jsonb) TO authenticated;

-- 5) Auto-Rollback schreibt Log ---------------------------------------------
CREATE OR REPLACE FUNCTION public.ab_auto_rollback_if_needed(
  p_test_key text,
  p_kpi text DEFAULT NULL
)
RETURNS TABLE (
  test_id uuid, test_key text, rolled_back boolean, reason text,
  lift numeric, threshold numeric,
  champion_value numeric, challenger_value numeric,
  champion_leads bigint, challenger_leads bigint
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
  IF v_test.id IS NULL THEN RAISE EXCEPTION 'Unknown test_key %', p_test_key; END IF;

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
      v_kpi, round(s.lift*100, 2), round(v_test.rollback_threshold*100, 2),
      s.champion_value, s.challenger_value, v_champ_n, v_chall_n
    );

    UPDATE public.ab_funnel_tests
       SET status='rolled_back', winner=champion_funnel,
           rollback_reason=v_reason, rolled_back_at=now(),
           completed_at=COALESCE(completed_at, now())
     WHERE id = v_test.id;

    BEGIN
      PERFORM public.ab_log_decision(
        v_test.test_key, 'ROLLBACK', v_reason, v_kpi,
        'system', 'rolled_back',
        jsonb_build_object('triggered_by','ab_auto_rollback_if_needed')
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

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

GRANT EXECUTE ON FUNCTION public.ab_auto_rollback_if_needed(text, text) TO authenticated;