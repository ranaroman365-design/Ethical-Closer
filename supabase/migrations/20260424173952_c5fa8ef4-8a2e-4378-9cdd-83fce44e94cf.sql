
DROP FUNCTION IF EXISTS public.get_ab_reassigned_events(integer);

CREATE OR REPLACE FUNCTION public.get_ab_reassigned_events(p_days integer DEFAULT 30)
RETURNS TABLE (
  test_key text,
  day date,
  reassign_events bigint,
  distinct_sessions bigint,
  variant_changes bigint,
  avg_expired_after_days numeric
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
      created_at,
      payload
    FROM public.event_logs
    WHERE event_name = 'ab_reassigned'
      AND created_at >= now() - make_interval(days => GREATEST(1, p_days))
  ),
  norm AS (
    SELECT
      COALESCE(NULLIF(payload->>'test_key', ''), NULLIF(payload->>'ab_test', '')) AS test_key,
      (created_at AT TIME ZONE 'UTC')::date AS day,
      NULLIF(payload->>'browser_session_id', '') AS session_id,
      COALESCE((payload->>'variant_changed')::boolean,
               NULLIF(payload->>'from_variant','') IS DISTINCT FROM NULLIF(payload->>'to_variant','')) AS changed,
      NULLIF(payload->>'expired_after_days','')::numeric AS expired_days
    FROM src
  )
  SELECT
    n.test_key,
    n.day,
    COUNT(*)::bigint AS reassign_events,
    COUNT(DISTINCT n.session_id)::bigint AS distinct_sessions,
    COUNT(*) FILTER (WHERE n.changed)::bigint AS variant_changes,
    ROUND(AVG(n.expired_days)::numeric, 2) AS avg_expired_after_days
  FROM norm n
  WHERE n.test_key IS NOT NULL
  GROUP BY n.test_key, n.day
  ORDER BY n.day DESC, n.test_key ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ab_reassigned_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ab_reassigned_events(integer) TO authenticated;
