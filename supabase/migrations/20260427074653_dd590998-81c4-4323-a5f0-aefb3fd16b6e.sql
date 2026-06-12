-- Drop old signatures so we can re-define with new return columns
DROP FUNCTION IF EXISTS public.ab_evaluate_test(text);
DROP FUNCTION IF EXISTS public.ab_test_significance(uuid);
DROP FUNCTION IF EXISTS public.ab_test_stats(uuid);
DROP FUNCTION IF EXISTS public.ab_test_readiness(uuid);

-- erf approximation (idempotent)
CREATE OR REPLACE FUNCTION public.erf(x double precision)
RETURNS double precision
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
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

-- 1) Per-arm value + 95% CI (Wilson for rates, normal for revenue)
CREATE OR REPLACE FUNCTION public.ab_test_kpi_stats(
  p_test_id uuid, p_kpi text
)
RETURNS TABLE (
  bucket text, numerator numeric, denominator numeric,
  value numeric, ci_low numeric, ci_high numeric
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_n numeric; v_x numeric; v_p numeric;
  v_z constant numeric := 1.96;
  v_denom numeric; v_centre numeric; v_margin numeric;
  v_mean numeric; v_sd numeric; v_se numeric;
BEGIN
  FOR r IN
    SELECT k.bucket, k.leads, k.bookings, k.shows, k.deals, k.revenue
      FROM public.ab_test_kpis k WHERE k.test_id = p_test_id
  LOOP
    CASE p_kpi
      WHEN 'qualified_rate', 'booking_rate' THEN
        v_x := r.bookings; v_n := r.leads;
      WHEN 'show_rate' THEN
        v_x := r.shows;    v_n := r.bookings;
      WHEN 'close_rate', 'show_rate_x_close' THEN
        v_x := r.deals;    v_n := COALESCE(NULLIF(r.shows,0), r.bookings);
      WHEN 'revenue_per_lead' THEN
        v_x := r.revenue;  v_n := r.leads;
      ELSE
        v_x := r.deals;    v_n := r.leads;
    END CASE;

    IF v_n IS NULL OR v_n = 0 THEN
      bucket := r.bucket; numerator := v_x; denominator := 0;
      value := NULL; ci_low := NULL; ci_high := NULL; RETURN NEXT; CONTINUE;
    END IF;

    IF p_kpi = 'revenue_per_lead' THEN
      v_mean := v_x::numeric / v_n;
      v_sd := GREATEST(v_mean, 1);
      v_se := v_sd / sqrt(v_n);
      bucket := r.bucket; numerator := v_x; denominator := v_n;
      value := round(v_mean, 4);
      ci_low  := round(GREATEST(v_mean - v_z * v_se, 0), 4);
      ci_high := round(v_mean + v_z * v_se, 4);
    ELSE
      v_p := v_x::numeric / v_n;
      v_denom  := 1 + (v_z*v_z)/v_n;
      v_centre := (v_p + (v_z*v_z)/(2*v_n)) / v_denom;
      v_margin := (v_z * sqrt((v_p*(1-v_p) + (v_z*v_z)/(4*v_n)) / v_n)) / v_denom;
      bucket := r.bucket; numerator := v_x; denominator := v_n;
      value := round(v_p, 4);
      ci_low  := round(GREATEST(v_centre - v_margin, 0), 4);
      ci_high := round(LEAST(v_centre + v_margin, 1), 4);
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 2) Two-sample significance
CREATE OR REPLACE FUNCTION public.ab_test_significance(
  p_test_id uuid, p_kpi text
)
RETURNS TABLE (
  champion_value numeric, challenger_value numeric,
  champion_ci_low numeric, champion_ci_high numeric,
  challenger_ci_low numeric, challenger_ci_high numeric,
  lift numeric, z_score numeric, p_value numeric
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD; ch RECORD;
  v_p_pool numeric; v_se numeric; v_z numeric; v_p numeric;
  v_lift numeric; v_se_a numeric; v_se_b numeric;
BEGIN
  SELECT * INTO c  FROM public.ab_test_kpi_stats(p_test_id, p_kpi) WHERE bucket='champion';
  SELECT * INTO ch FROM public.ab_test_kpi_stats(p_test_id, p_kpi) WHERE bucket='challenger';

  IF c.value IS NULL OR ch.value IS NULL THEN
    RETURN QUERY SELECT c.value, ch.value, c.ci_low, c.ci_high,
                        ch.ci_low, ch.ci_high,
                        NULL::numeric, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  v_lift := CASE WHEN c.value = 0 THEN NULL ELSE (ch.value - c.value) / c.value END;

  IF p_kpi = 'revenue_per_lead' THEN
    v_se_a := GREATEST(c.value, 1)  / sqrt(NULLIF(c.denominator,0));
    v_se_b := GREATEST(ch.value, 1) / sqrt(NULLIF(ch.denominator,0));
    v_se := sqrt(v_se_a*v_se_a + v_se_b*v_se_b);
    v_z := CASE WHEN v_se > 0 THEN (ch.value - c.value) / v_se ELSE NULL END;
  ELSE
    v_p_pool := (c.numerator + ch.numerator)
              / NULLIF(c.denominator + ch.denominator, 0);
    v_se := sqrt(GREATEST(v_p_pool * (1 - v_p_pool)
                          * (1.0/NULLIF(c.denominator,0) + 1.0/NULLIF(ch.denominator,0)), 0));
    v_z := CASE WHEN v_se > 0 THEN (ch.value - c.value) / v_se ELSE NULL END;
  END IF;

  v_p := CASE WHEN v_z IS NULL THEN NULL
              ELSE 2 * (1 - (0.5 * (1 + public.erf(abs(v_z)::double precision / sqrt(2.0))))) END;

  RETURN QUERY SELECT c.value, ch.value, c.ci_low, c.ci_high,
                      ch.ci_low, ch.ci_high,
                      v_lift, v_z, v_p::numeric;
END;
$$;

-- 3) Readiness gate
CREATE OR REPLACE FUNCTION public.ab_test_readiness(p_test_id uuid)
RETURNS TABLE (
  arm text, leads bigint, min_required integer,
  arm_ready boolean, duration_days numeric,
  duration_required integer, duration_ready boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT min_sample_size, min_duration_days, started_at
      FROM public.ab_funnel_tests WHERE id = p_test_id
  ),
  arms AS (SELECT 'champion'::text AS arm UNION ALL SELECT 'challenger'),
  counts AS (
    SELECT a.arm,
           (SELECT count(*) FROM public.ab_funnel_assignments x
              WHERE x.test_id = p_test_id AND x.bucket = a.arm) AS leads
    FROM arms a
  )
  SELECT c.arm, c.leads, t.min_sample_size,
         (c.leads >= t.min_sample_size),
         EXTRACT(EPOCH FROM (now() - COALESCE(t.started_at, now()))) / 86400.0,
         t.min_duration_days,
         (t.started_at IS NOT NULL
           AND (now() - t.started_at) >= make_interval(days => t.min_duration_days))
  FROM counts c CROSS JOIN t;
$$;

-- 4) Master deterministic evaluator
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
  ELSIF NOT (COALESCE(v_champ_ready,false) AND COALESCE(v_chall_ready,false)) THEN
    v_rec := 'INSUFFICIENT_DATA';
    v_reason := format('Need >=%s leads per arm (champ=%s, chall=%s)',
                       v_test.min_sample_size, v_champ_n, v_chall_n);
  ELSIF s.lift IS NOT NULL AND s.lift <= -0.20 THEN
    v_rec := 'ROLLBACK';
    v_reason := format('Challenger underperforms by %s%% — abort',
                       round(s.lift*100,1));
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

GRANT EXECUTE ON FUNCTION public.erf(double precision)              TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ab_test_kpi_stats(uuid, text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.ab_test_significance(uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.ab_test_readiness(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.ab_evaluate_test(text, text)       TO authenticated;