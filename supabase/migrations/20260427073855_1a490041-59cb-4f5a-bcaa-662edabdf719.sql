-- =============================================================================
-- A/B Funnel Test — Deterministic Rule Engine (Server-side, no UI)
-- =============================================================================
-- Adds explicit Stop / Win / Rollback rules on top of the existing
-- ab_funnel_tests + ab_funnel_assignments + ab_test_kpis infrastructure.
-- All rules live in SQL so the system produces reliable, reproducible
-- decisions independent of any dashboard.
-- =============================================================================

-- 1) Per-arm sample size + duration check (STOP gate) ------------------------
CREATE OR REPLACE FUNCTION public.ab_test_readiness(p_test_id uuid)
RETURNS TABLE (
  test_id uuid,
  arm text,
  funnel public.funnel_source_t,
  leads bigint,
  min_required integer,
  arm_ready boolean,
  duration_days numeric,
  duration_required integer,
  duration_ready boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT id, min_sample_size, min_duration_days, started_at,
           champion_funnel, challenger_funnel
    FROM public.ab_funnel_tests WHERE id = p_test_id
  ),
  arms AS (
    SELECT t.id AS test_id, 'champion'::text AS arm, t.champion_funnel AS funnel,
           t.min_sample_size, t.min_duration_days, t.started_at FROM t
    UNION ALL
    SELECT t.id, 'challenger', t.challenger_funnel,
           t.min_sample_size, t.min_duration_days, t.started_at FROM t
  ),
  counts AS (
    SELECT a.test_id, a.arm, a.funnel, a.min_sample_size, a.min_duration_days,
           a.started_at,
           (SELECT count(*) FROM public.ab_funnel_assignments x
              WHERE x.test_id = a.test_id AND x.bucket = a.arm) AS leads
    FROM arms a
  )
  SELECT
    c.test_id,
    c.arm,
    c.funnel,
    c.leads,
    c.min_sample_size,
    (c.leads >= c.min_sample_size) AS arm_ready,
    EXTRACT(EPOCH FROM (now() - COALESCE(c.started_at, now()))) / 86400.0 AS duration_days,
    c.min_duration_days,
    (c.started_at IS NOT NULL
      AND (now() - c.started_at) >= make_interval(days => c.min_duration_days)
    ) AS duration_ready
  FROM counts c;
$$;

-- 2) Two-proportion / two-mean significance helper ---------------------------
-- Returns z-score, p-value approximation, and lift for the configured KPI.
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
  v_champ_x numeric; v_chall_x numeric;  -- successes (rate KPIs) or sums (revenue)
  v_p1 numeric; v_p2 numeric; v_p_pool numeric;
  v_se numeric; v_z numeric; v_p numeric;
  v_lift numeric;
BEGIN
  SELECT primary_kpi INTO v_kpi FROM public.ab_funnel_tests WHERE id = p_test_id;
  IF v_kpi IS NULL THEN RETURN; END IF;

  -- Pull KPI rollups from ab_test_kpis (existing view from prior migration)
  SELECT
    SUM(CASE WHEN bucket='champion'   THEN leads ELSE 0 END),
    SUM(CASE WHEN bucket='challenger' THEN leads ELSE 0 END),
    SUM(CASE WHEN bucket='champion'   THEN
      CASE v_kpi
        WHEN 'close_rate'         THEN deals
        WHEN 'show_rate_x_close'  THEN deals
        WHEN 'revenue_per_lead'   THEN revenue
        ELSE deals END
      ELSE 0 END),
    SUM(CASE WHEN bucket='challenger' THEN
      CASE v_kpi
        WHEN 'close_rate'         THEN deals
        WHEN 'show_rate_x_close'  THEN deals
        WHEN 'revenue_per_lead'   THEN revenue
        ELSE deals END
      ELSE 0 END)
  INTO v_champ_n, v_chall_n, v_champ_x, v_chall_x
  FROM public.ab_test_kpis WHERE test_id = p_test_id;

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

  -- z-test for proportions (also a reasonable approximation for revenue/lead
  -- when n is large; KPI quality lock is enforced via min_sample_size).
  v_p_pool := (v_champ_x + v_chall_x) / NULLIF(v_champ_n + v_chall_n, 0);
  v_se := sqrt(GREATEST(v_p_pool * (1 - v_p_pool) * (1.0/v_champ_n + 1.0/v_chall_n), 0));
  v_z := CASE WHEN v_se > 0 THEN (v_p2 - v_p1) / v_se ELSE NULL END;
  -- Two-sided p-value via erfc approximation
  v_p := CASE WHEN v_z IS NULL THEN NULL
              ELSE 2 * (1 - (0.5 * (1 + erf(abs(v_z) / sqrt(2.0))))) END;

  RETURN QUERY SELECT p_test_id, v_kpi, v_p1, v_p2, v_lift, v_z, v_p;
END;
$$;

-- erf() polyfill (Postgres has no native erf; uses Abramowitz & Stegun 7.1.26)
CREATE OR REPLACE FUNCTION public.erf(x double precision)
RETURNS double precision
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  a1 double precision := 0.254829592;
  a2 double precision := -0.284496736;
  a3 double precision := 1.421413741;
  a4 double precision := -1.453152027;
  a5 double precision := 1.061405429;
  p  double precision := 0.3275911;
  sgn int; t double precision; y double precision;
BEGIN
  sgn := CASE WHEN x < 0 THEN -1 ELSE 1 END;
  x := abs(x);
  t := 1.0 / (1.0 + p * x);
  y := 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1) * t * exp(-x*x);
  RETURN sgn * y;
END;
$$;

-- 3) Master evaluator — returns ONE deterministic recommendation -------------
--    Possible outcomes:
--      INSUFFICIENT_DATA  — sample/duration gates not met
--      ROLLBACK           — challenger lift <= -0.20 after sample met
--      PROMOTE_CHALLENGER — significant + lift >= +0.05
--      KEEP_CHAMPION      — significant + lift <= -0.05 OR no sig + sample full
--      CONTINUE           — collected enough but no clear winner yet
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
  SELECT * INTO v_test FROM public.ab_funnel_tests WHERE test_key = p_test_key;
  IF v_test.id IS NULL THEN
    RAISE EXCEPTION 'Unknown test_key %', p_test_key;
  END IF;

  -- Readiness
  SELECT bool_and(arm_ready) FILTER (WHERE arm='champion'),
         bool_and(arm_ready) FILTER (WHERE arm='challenger'),
         bool_and(duration_ready),
         max(leads) FILTER (WHERE arm='champion'),
         max(leads) FILTER (WHERE arm='challenger'),
         max(duration_days)
  INTO v_champ_ready, v_chall_ready, v_dur_ready,
       v_champ_n, v_chall_n, v_dur
  FROM public.ab_test_readiness(v_test.id);

  -- Stats
  SELECT primary_kpi, champion_value, challenger_value, lift, z_score, p_value
  INTO v_kpi, v_p1, v_p2, v_lift, v_z, v_p
  FROM public.ab_test_stats(v_test.id);

  v_threshold := 1 - v_test.significance_threshold;  -- e.g. 0.05

  -- Rule cascade (deterministic order)
  IF v_test.status NOT IN ('running') THEN
    v_rec := 'NO_OP';
    v_reason := 'Test not running (status=' || v_test.status || ')';
  ELSIF NOT (v_champ_ready AND v_chall_ready) THEN
    v_rec := 'INSUFFICIENT_DATA';
    v_reason := format('Need ≥%s leads per arm (champ=%s, chall=%s)',
                       v_test.min_sample_size, v_champ_n, v_chall_n);
  ELSIF v_lift IS NOT NULL AND v_lift <= -0.20 THEN
    v_rec := 'ROLLBACK';
    v_reason := format('Challenger underperforms champion by %s%% — abort', round(v_lift*100,1));
  ELSIF NOT v_dur_ready THEN
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

-- 4) Auto-rollback executor (only acts on explicit call) ---------------------
CREATE OR REPLACE FUNCTION public.ab_apply_rollback(p_test_key text)
RETURNS public.ab_funnel_tests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval RECORD;
  v_row public.ab_funnel_tests;
BEGIN
  SELECT * INTO v_eval FROM public.ab_evaluate_test(p_test_key);
  IF v_eval.recommendation <> 'ROLLBACK' THEN
    RAISE EXCEPTION 'No rollback condition for test %, current recommendation=%',
                    p_test_key, v_eval.recommendation;
  END IF;
  UPDATE public.ab_funnel_tests
     SET status = 'aborted',
         completed_at = now(),
         notes = COALESCE(notes,'') ||
                 E'\nROLLBACK ' || to_char(now(),'YYYY-MM-DD HH24:MI') ||
                 ' — ' || v_eval.reason
   WHERE test_key = p_test_key
   RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ab_test_readiness(uuid)  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ab_test_stats(uuid)      TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ab_evaluate_test(text)   TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ab_apply_rollback(text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.erf(double precision)    TO authenticated, anon;
