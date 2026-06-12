-- =========================================================
-- Setter Availability Analytics (Fastlane Fallback Layer)
-- =========================================================

-- 1) Logging table
CREATE TABLE IF NOT EXISTS public.availability_check_log (
  id BIGSERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_days INTEGER NOT NULL,
  available BOOLEAN NOT NULL,
  open_slots INTEGER NOT NULL DEFAULT 0,
  active_setters INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  traffic_source TEXT,
  context JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_availability_check_log_checked_at
  ON public.availability_check_log (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_availability_check_log_reason
  ON public.availability_check_log (reason);

ALTER TABLE public.availability_check_log ENABLE ROW LEVEL SECURITY;

-- Admins read; service role / RPC writes
DROP POLICY IF EXISTS "availability_check_log_admin_read" ON public.availability_check_log;
CREATE POLICY "availability_check_log_admin_read"
  ON public.availability_check_log FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS "availability_check_log_service_insert" ON public.availability_check_log;
CREATE POLICY "availability_check_log_service_insert"
  ON public.availability_check_log FOR INSERT
  WITH CHECK (true);

-- 2) Core availability function
CREATE OR REPLACE FUNCTION public.check_setter_availability(p_window_days INTEGER DEFAULT 5)
RETURNS TABLE (
  available BOOLEAN,
  open_slots INTEGER,
  active_setters INTEGER,
  reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_slots INTEGER := 0;
  v_active_setters INTEGER := 0;
  v_reason TEXT := 'ok';
  v_available BOOLEAN := false;
BEGIN
  IF p_window_days IS NULL OR p_window_days < 1 THEN
    p_window_days := 5;
  END IF;

  -- Open setter slots in the window
  SELECT COALESCE(SUM(GREATEST(max_bookings - current_bookings, 0)), 0)::INTEGER
    INTO v_open_slots
  FROM public.availability_slots
  WHERE is_active = true
    AND slot_type = 'setter'
    AND starts_at >= now()
    AND starts_at <  now() + (p_window_days || ' days')::interval
    AND current_bookings < max_bookings;

  -- Active setters (roster gate, optional)
  SELECT COUNT(*)::INTEGER INTO v_active_setters
  FROM public.setter_capacity
  WHERE COALESCE((row_to_json(setter_capacity)::jsonb ->> 'is_active')::boolean, true) = true;

  IF v_open_slots <= 0 THEN
    v_reason := 'no_open_slots';
  ELSIF v_active_setters = 0 THEN
    -- treat empty roster as "no gate configured" => still available if slots exist
    v_reason := 'ok_no_roster_gate';
    v_available := true;
  ELSE
    v_reason := 'ok';
    v_available := true;
  END IF;

  RETURN QUERY SELECT v_available, v_open_slots, v_active_setters, v_reason;
END;
$$;

REVOKE ALL ON FUNCTION public.check_setter_availability(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_setter_availability(INTEGER) TO anon, authenticated, service_role;

-- 3) Logged wrapper — call this from booking/fastlane paths
CREATE OR REPLACE FUNCTION public.check_setter_availability_logged(
  p_window_days INTEGER DEFAULT 5,
  p_traffic_source TEXT DEFAULT NULL,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  available BOOLEAN,
  open_slots INTEGER,
  active_setters INTEGER,
  reason TEXT,
  latency_ms INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t0 TIMESTAMPTZ := clock_timestamp();
  v_latency INTEGER;
  r RECORD;
BEGIN
  SELECT * INTO r FROM public.check_setter_availability(p_window_days);
  v_latency := GREATEST(0, EXTRACT(MILLISECOND FROM (clock_timestamp() - v_t0))::INTEGER
                          + (EXTRACT(EPOCH FROM (clock_timestamp() - v_t0))::INTEGER * 1000));

  INSERT INTO public.availability_check_log
    (window_days, available, open_slots, active_setters, reason, latency_ms, traffic_source, context)
  VALUES
    (p_window_days, r.available, r.open_slots, r.active_setters, r.reason, v_latency, p_traffic_source, COALESCE(p_context,'{}'::jsonb));

  RETURN QUERY SELECT r.available, r.open_slots, r.active_setters, r.reason, v_latency;
END;
$$;

REVOKE ALL ON FUNCTION public.check_setter_availability_logged(INTEGER, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_setter_availability_logged(INTEGER, TEXT, JSONB) TO anon, authenticated, service_role;

-- 4) Daily aggregate view
CREATE OR REPLACE VIEW public.v_availability_daily
WITH (security_invoker=true) AS
SELECT
  date_trunc('day', checked_at)::date AS day,
  COUNT(*)::INTEGER                                AS checks,
  SUM(CASE WHEN available THEN 1 ELSE 0 END)::INTEGER AS available_checks,
  ROUND(100.0 * SUM(CASE WHEN available THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS availability_rate_pct,
  ROUND(AVG(latency_ms)::numeric, 1)               AS avg_latency_ms,
  MAX(latency_ms)                                  AS p_max_latency_ms,
  ROUND(AVG(open_slots)::numeric, 1)               AS avg_open_slots
FROM public.availability_check_log
GROUP BY 1
ORDER BY 1 DESC;

-- 5) Hour x weekday heatmap view
CREATE OR REPLACE VIEW public.v_availability_hourly_heatmap
WITH (security_invoker=true) AS
SELECT
  EXTRACT(DOW  FROM checked_at)::INTEGER AS weekday, -- 0=Sun
  EXTRACT(HOUR FROM checked_at)::INTEGER AS hour,
  COUNT(*)::INTEGER                                  AS checks,
  ROUND(100.0 * SUM(CASE WHEN available THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS availability_rate_pct,
  ROUND(AVG(latency_ms)::numeric, 1)                 AS avg_latency_ms
FROM public.availability_check_log
WHERE checked_at >= now() - interval '60 days'
GROUP BY 1,2;

-- 6) Reason breakdown view
CREATE OR REPLACE VIEW public.v_availability_reasons
WITH (security_invoker=true) AS
SELECT
  reason,
  COUNT(*)::INTEGER AS checks,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (),0), 2) AS share_pct,
  ROUND(AVG(latency_ms)::numeric, 1) AS avg_latency_ms
FROM public.availability_check_log
WHERE checked_at >= now() - interval '30 days'
GROUP BY reason
ORDER BY checks DESC;