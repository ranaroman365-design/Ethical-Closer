
-- Function to detect duplicate dispatches (same user_id + event_key within a time window)
CREATE OR REPLACE FUNCTION public.detect_duplicate_dispatches(p_window_hours int DEFAULT 24)
RETURNS TABLE(
  user_id uuid,
  event_key text,
  dispatch_count bigint,
  first_dispatched_at timestamptz,
  last_dispatched_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.user_id,
    d.event_key,
    count(*) AS dispatch_count,
    min(d.dispatched_at) AS first_dispatched_at,
    max(d.dispatched_at) AS last_dispatched_at
  FROM communication_dispatch_log d
  WHERE d.dispatched_at >= now() - (p_window_hours || ' hours')::interval
    AND d.status = 'sent'
    AND d.user_id IS NOT NULL
  GROUP BY d.user_id, d.event_key
  HAVING count(*) > 1
  ORDER BY count(*) DESC
  LIMIT 50;
$$;
