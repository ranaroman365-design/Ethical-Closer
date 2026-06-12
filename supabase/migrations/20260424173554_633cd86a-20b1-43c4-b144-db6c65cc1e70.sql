
DROP FUNCTION IF EXISTS public.get_ab_reassignment_stats(integer);

CREATE OR REPLACE FUNCTION public.get_ab_reassignment_stats(p_days integer DEFAULT 30)
RETURNS TABLE (
  test_key text,
  day date,
  reassignments bigint,
  fresh_assignments bigint,
  legacy_migrations bigint
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
  WITH window_events AS (
    SELECT created_at, event_name, payload
    FROM public.event_logs
    WHERE created_at >= now() - make_interval(days => GREATEST(1, p_days))
      AND (event_name LIKE '%_assigned' OR event_name = 'ab_legacy_migrated')
  ),
  norm AS (
    SELECT
      COALESCE(
        NULLIF(payload->>'ab_test', ''),
        NULLIF(payload->>'test', ''),
        NULLIF(payload->>'storage_key', ''),
        regexp_replace(event_name, '_assigned$', '')
      ) AS test_key,
      (created_at AT TIME ZONE 'UTC')::date AS day,
      event_name,
      COALESCE((payload->>'reassigned')::boolean, false) AS reassigned
    FROM window_events
  )
  SELECT
    n.test_key,
    n.day,
    COUNT(*) FILTER (WHERE n.event_name LIKE '%_assigned' AND n.reassigned)::bigint,
    COUNT(*) FILTER (WHERE n.event_name LIKE '%_assigned' AND NOT n.reassigned)::bigint,
    COUNT(*) FILTER (WHERE n.event_name = 'ab_legacy_migrated')::bigint
  FROM norm n
  WHERE n.test_key IS NOT NULL
  GROUP BY n.test_key, n.day
  ORDER BY n.day DESC, n.test_key ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ab_reassignment_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ab_reassignment_stats(integer) TO authenticated;
