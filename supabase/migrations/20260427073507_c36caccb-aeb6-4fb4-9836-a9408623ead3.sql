
CREATE TABLE IF NOT EXISTS public.funnel_status_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_source text NOT NULL UNIQUE,
  forced_status text NULL CHECK (forced_status IN ('champion','suppressed')),
  budget_routing_paused boolean NOT NULL DEFAULT false,
  note text NULL,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.funnel_budget_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_source text NOT NULL,
  prev_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  delta_pct numeric NOT NULL,
  reason text NOT NULL,
  decision_bucket int NULL,
  performance_score numeric NULL,
  applied_by uuid NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fbc_funnel_applied_idx ON public.funnel_budget_changes(funnel_source, applied_at DESC);

ALTER TABLE public.funnel_status_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_budget_changes   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fso_admin_all ON public.funnel_status_overrides;
CREATE POLICY fso_admin_all ON public.funnel_status_overrides
  FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
DROP POLICY IF EXISTS fso_authenticated_read ON public.funnel_status_overrides;
CREATE POLICY fso_authenticated_read ON public.funnel_status_overrides
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS fbc_admin_all ON public.funnel_budget_changes;
CREATE POLICY fbc_admin_all ON public.funnel_budget_changes
  FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));
DROP POLICY IF EXISTS fbc_authenticated_read ON public.funnel_budget_changes;
CREATE POLICY fbc_authenticated_read ON public.funnel_budget_changes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE VIEW public.funnel_performance
WITH (security_invoker = true) AS
SELECT
  funnel_source::text AS funnel_source,
  SUM(leads)    AS leads,
  SUM(bookings) AS bookings,
  SUM(shows)    AS shows,
  SUM(deals)    AS deals,
  SUM(revenue)  AS revenue,
  ROUND( SUM(bookings)::numeric / NULLIF(SUM(leads),0)   , 4) AS booking_rate,
  ROUND( SUM(shows)::numeric    / NULLIF(SUM(bookings),0), 4) AS show_rate,
  ROUND( SUM(deals)::numeric    / NULLIF(SUM(shows),0)   , 4) AS close_rate,
  ROUND( SUM(revenue)::numeric  / NULLIF(SUM(leads),0)   , 2) AS revenue_per_lead
FROM public.operator_performance
WHERE funnel_source IS NOT NULL
GROUP BY funnel_source;

CREATE OR REPLACE VIEW public.funnel_score
WITH (security_invoker = true) AS
WITH max_rpl AS (
  SELECT NULLIF(MAX(revenue_per_lead),0) AS m FROM public.funnel_performance
)
SELECT
  fp.*,
  ROUND(
    0.6 * COALESCE(fp.revenue_per_lead,0) / COALESCE((SELECT m FROM max_rpl), 1)
  + 0.2 * COALESCE(fp.booking_rate,0)
  + 0.2 * COALESCE(fp.close_rate,0)
  , 4) AS performance_score
FROM public.funnel_performance fp;

CREATE OR REPLACE VIEW public.funnel_ranking
WITH (security_invoker = true) AS
SELECT
  fs.*,
  CASE
    WHEN fs.leads < 50 THEN NULL
    ELSE NTILE(5) OVER (
      PARTITION BY (CASE WHEN fs.leads >= 50 THEN 1 ELSE 0 END)
      ORDER BY fs.performance_score DESC
    )
  END AS rank_bucket,
  CASE WHEN fs.leads < 50 THEN 'INSUFFICIENT_DATA' ELSE NULL END AS data_status
FROM public.funnel_score fs;

CREATE OR REPLACE VIEW public.champion_funnels
WITH (security_invoker = true) AS
SELECT
  fp.*,
  COALESCE(o.forced_status, 'champion') AS status
FROM public.funnel_performance fp
LEFT JOIN public.funnel_status_overrides o ON o.funnel_source = fp.funnel_source
WHERE fp.leads >= 50
  AND fp.booking_rate >= 0.20
  AND fp.show_rate    >= 0.60
  AND fp.close_rate   >= 0.20
  AND fp.revenue_per_lead = (
        SELECT MAX(revenue_per_lead) FROM public.funnel_performance
        WHERE leads >= 50
          AND booking_rate >= 0.20 AND show_rate >= 0.60 AND close_rate >= 0.20
      )
  AND COALESCE(o.forced_status,'champion') <> 'suppressed';

CREATE OR REPLACE VIEW public.funnel_current_spend
WITH (security_invoker = true) AS
SELECT
  fp.funnel_source,
  COALESCE(SUM(s.amount) FILTER (WHERE s.spend_date >= current_date - 6), 0)  AS spend_7d,
  COALESCE(SUM(s.amount) FILTER (WHERE s.spend_date >= current_date - 29), 0) AS spend_30d
FROM public.funnel_performance fp
LEFT JOIN public.ad_spend_daily s
  ON lower(s.source) = lower(fp.funnel_source)
  OR lower(s.campaign) LIKE '%' || lower(fp.funnel_source) || '%'
GROUP BY fp.funnel_source;

CREATE OR REPLACE VIEW public.funnel_budget_recommendations
WITH (security_invoker = true) AS
WITH last_change AS (
  SELECT funnel_source, MAX(applied_at) AS last_applied_at
  FROM public.funnel_budget_changes GROUP BY funnel_source
)
SELECT
  r.funnel_source,
  r.leads,
  r.performance_score,
  r.rank_bucket,
  cs.spend_7d,
  cs.spend_30d,
  CASE
    WHEN o.budget_routing_paused THEN 'PAUSED'
    WHEN r.leads < 50            THEN 'INSUFFICIENT_DATA'
    WHEN lc.last_applied_at IS NOT NULL
         AND now() - lc.last_applied_at < interval '3 days' THEN 'COOLDOWN'
    WHEN r.rank_bucket = 1       THEN 'SCALE'
    WHEN r.rank_bucket = 5       THEN 'REDUCE'
    ELSE 'MAINTAIN'
  END AS recommendation,
  CASE
    WHEN COALESCE(o.budget_routing_paused,false) OR r.leads < 50 THEN 0
    WHEN lc.last_applied_at IS NOT NULL
         AND now() - lc.last_applied_at < interval '3 days' THEN 0
    WHEN r.rank_bucket = 1 THEN  0.30
    WHEN r.rank_bucket = 5 THEN -0.30
    ELSE 0
  END AS suggested_delta_pct,
  ROUND(
    cs.spend_7d * (1 +
      CASE
        WHEN COALESCE(o.budget_routing_paused,false) OR r.leads < 50 THEN 0
        WHEN lc.last_applied_at IS NOT NULL
             AND now() - lc.last_applied_at < interval '3 days' THEN 0
        WHEN r.rank_bucket = 1 THEN  0.30
        WHEN r.rank_bucket = 5 THEN -0.30
        ELSE 0
      END
    ), 2) AS suggested_new_spend_7d,
  lc.last_applied_at,
  COALESCE(o.budget_routing_paused, false) AS budget_routing_paused,
  o.forced_status
FROM public.funnel_ranking r
LEFT JOIN public.funnel_current_spend cs ON cs.funnel_source = r.funnel_source
LEFT JOIN public.funnel_status_overrides o ON o.funnel_source = r.funnel_source
LEFT JOIN last_change lc                  ON lc.funnel_source = r.funnel_source;

CREATE OR REPLACE FUNCTION public.apply_funnel_budget_change(
  p_funnel_source text,
  p_new_amount    numeric,
  p_reason        text DEFAULT 'manual'
) RETURNS public.funnel_budget_changes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev numeric;
  v_delta numeric;
  v_row public.funnel_budget_changes%ROWTYPE;
  v_last timestamptz;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Only admin/owner may apply budget changes';
  END IF;

  SELECT MAX(applied_at) INTO v_last
  FROM public.funnel_budget_changes WHERE funnel_source = p_funnel_source;
  IF v_last IS NOT NULL AND now() - v_last < interval '3 days' THEN
    RAISE EXCEPTION 'Cooldown active — last change %', v_last;
  END IF;

  SELECT spend_7d INTO v_prev FROM public.funnel_current_spend WHERE funnel_source = p_funnel_source;
  v_prev := COALESCE(v_prev, 0);

  IF v_prev > 0 THEN
    v_delta := (p_new_amount - v_prev) / v_prev;
    IF abs(v_delta) > 0.30 THEN
      RAISE EXCEPTION 'Change exceeds ±30%% safeguard (delta=%)', v_delta;
    END IF;
  ELSE v_delta := 0; END IF;

  INSERT INTO public.funnel_budget_changes(
    funnel_source, prev_amount, new_amount, delta_pct, reason, applied_by
  ) VALUES (
    p_funnel_source, v_prev, p_new_amount, v_delta, p_reason, auth.uid()
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;
GRANT EXECUTE ON FUNCTION public.apply_funnel_budget_change(text, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.champion_engine_readiness()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH f AS (SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE leads>=50) AS ready
             FROM public.funnel_performance),
       c AS (SELECT COUNT(*) AS champs FROM public.champion_funnels)
  SELECT jsonb_build_object(
    'funnels_total',  f.total,
    'funnels_ready',  f.ready,
    'champions',      c.champs,
    'readiness_score', ROUND( CASE WHEN f.total=0 THEN 0
                                   ELSE f.ready::numeric / f.total END, 2)
  ) FROM f, c;
$$;
GRANT EXECUTE ON FUNCTION public.champion_engine_readiness() TO authenticated;
