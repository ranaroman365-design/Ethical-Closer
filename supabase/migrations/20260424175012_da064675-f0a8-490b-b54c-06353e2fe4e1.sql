
CREATE OR REPLACE FUNCTION public.get_sticky_hint_ab_results(p_days integer DEFAULT 30)
RETURNS TABLE (
  ab_variant text,
  impressions bigint,
  clicks bigint,
  ctr_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH src AS (
    SELECT
      event_name,
      NULLIF(payload->>'ab_variant', '') AS variant
    FROM public.event_logs
    WHERE event_name IN ('sticky_hint_impression', 'sticky_hint_click')
      AND payload->>'ab_test' = 'sticky_hint_v1'
      AND created_at >= now() - make_interval(days => GREATEST(1, p_days))
  ),
  agg AS (
    SELECT
      variant,
      COUNT(*) FILTER (WHERE event_name = 'sticky_hint_impression')::bigint AS impressions,
      COUNT(*) FILTER (WHERE event_name = 'sticky_hint_click')::bigint AS clicks
    FROM src
    WHERE variant IS NOT NULL
    GROUP BY variant
  )
  SELECT
    a.variant AS ab_variant,
    a.impressions,
    a.clicks,
    CASE WHEN a.impressions > 0
         THEN ROUND((a.clicks::numeric / a.impressions::numeric) * 100, 2)
         ELSE NULL END AS ctr_pct
  FROM agg a
  ORDER BY a.variant;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sticky_hint_ab_results(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sticky_hint_ab_results(integer) TO authenticated;
