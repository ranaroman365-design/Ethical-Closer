-- Meta Event QA + Attribution Monitoring Layer
CREATE TABLE IF NOT EXISTS public.meta_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_id text,
  source text NOT NULL CHECK (source IN ('browser','server','both','unknown')),
  lead_id uuid,
  session_id text,
  appointment_id uuid,
  call_id uuid,
  origin_key text,
  operator_email text,
  meta_response_status int,
  meta_fbtrace_id text,
  meta_events_received int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_event_logs_event_id   ON public.meta_event_logs (event_id);
CREATE INDEX IF NOT EXISTS idx_meta_event_logs_event_name ON public.meta_event_logs (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_event_logs_created    ON public.meta_event_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_event_logs_lead       ON public.meta_event_logs (lead_id) WHERE lead_id IS NOT NULL;

ALTER TABLE public.meta_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_event_logs_admin_read ON public.meta_event_logs;
CREATE POLICY meta_event_logs_admin_read
  ON public.meta_event_logs
  FOR SELECT
  TO authenticated
  USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.lead_origins
  ADD COLUMN IF NOT EXISTS fbclid text,
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS ttclid text,
  ADD COLUMN IF NOT EXISTS operator_email_attr text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS attribution_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.log_meta_event_browser(
  _event_name text,
  _event_id   text,
  _lead_id    uuid DEFAULT NULL,
  _session_id text DEFAULT NULL,
  _appointment_id uuid DEFAULT NULL,
  _origin_key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _event_name IS NULL OR length(_event_name) = 0 THEN
    RETURN;
  END IF;
  INSERT INTO public.meta_event_logs(
    event_name, event_id, source, lead_id, session_id, appointment_id, origin_key
  ) VALUES (
    _event_name, _event_id, 'browser', _lead_id, _session_id, _appointment_id, _origin_key
  );
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_meta_event_browser(text,text,uuid,text,uuid,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_meta_event_server(
  _event_name text,
  _event_id text,
  _meta_status int,
  _meta_fbtrace_id text,
  _meta_events_received int,
  _error_message text DEFAULT NULL,
  _lead_id uuid DEFAULT NULL,
  _session_id text DEFAULT NULL,
  _appointment_id uuid DEFAULT NULL,
  _origin_key text DEFAULT NULL,
  _operator_email text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.meta_event_logs(
    event_name, event_id, source,
    lead_id, session_id, appointment_id, origin_key, operator_email,
    meta_response_status, meta_fbtrace_id, meta_events_received, error_message
  ) VALUES (
    _event_name, _event_id, 'server',
    _lead_id, _session_id, _appointment_id, _origin_key, _operator_email,
    _meta_status, _meta_fbtrace_id, _meta_events_received, _error_message
  );
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_meta_event_server(text,text,int,text,int,text,uuid,text,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.meta_event_health(_hours int DEFAULT 24)
RETURNS TABLE(
  total_events bigint,
  browser_events bigint,
  server_events bigint,
  server_success_rate numeric,
  dedup_pairs bigint,
  dedup_rate numeric,
  missing_event_id bigint,
  error_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := now() - make_interval(hours => GREATEST(_hours, 1));
BEGIN
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH win AS (
    SELECT * FROM public.meta_event_logs WHERE created_at >= _since
  ),
  per_id AS (
    SELECT event_id,
           bool_or(source='browser') AS has_browser,
           bool_or(source='server')  AS has_server
    FROM win
    WHERE event_id IS NOT NULL
    GROUP BY event_id
  )
  SELECT
    (SELECT count(*) FROM win),
    (SELECT count(*) FROM win WHERE source='browser'),
    (SELECT count(*) FROM win WHERE source='server'),
    CASE WHEN (SELECT count(*) FROM win WHERE source='server') = 0 THEN NULL
         ELSE round(
           100.0 * (SELECT count(*) FROM win
                    WHERE source='server'
                      AND coalesce(meta_response_status,200) < 400
                      AND error_message IS NULL)
           / NULLIF((SELECT count(*) FROM win WHERE source='server'),0), 2)
    END,
    (SELECT count(*) FROM per_id WHERE has_browser AND has_server),
    CASE WHEN (SELECT count(*) FROM per_id) = 0 THEN NULL
         ELSE round(
           100.0 * (SELECT count(*) FROM per_id WHERE has_browser AND has_server)
           / NULLIF((SELECT count(*) FROM per_id),0), 2)
    END,
    (SELECT count(*) FROM win WHERE event_id IS NULL OR event_id = ''),
    (SELECT count(*) FROM win
       WHERE coalesce(meta_response_status,200) >= 400 OR error_message IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.meta_event_health(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.meta_event_coverage(_hours int DEFAULT 24)
RETURNS TABLE(
  event_name text,
  has_browser boolean,
  has_server boolean,
  has_dedup boolean,
  last_seen_at timestamptz,
  count_24h bigint,
  error_count bigint,
  status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := now() - make_interval(hours => GREATEST(_hours, 1));
BEGIN
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH expected(event_name) AS (
    VALUES
      ('ViewContent'),
      ('ApplyCtaClick'),
      ('QuizStarted'),
      ('CompleteRegistration'),
      ('Lead'),
      ('LowLeadResultView'),
      ('BookingStarted'),
      ('BookingCreated'),
      ('Schedule'),
      ('Purchase'),
      ('ApplicantAccessProvisioned'),
      ('ApplicantAccessProvisioningFailed')
  ),
  win AS (
    SELECT * FROM public.meta_event_logs WHERE created_at >= _since
  ),
  agg AS (
    SELECT
      e.event_name,
      bool_or(w.source='browser') AS has_browser,
      bool_or(w.source='server')  AS has_server,
      max(w.created_at) AS last_seen_at,
      count(w.id) AS count_24h,
      count(w.id) FILTER (
        WHERE coalesce(w.meta_response_status,200) >= 400 OR w.error_message IS NOT NULL
      ) AS error_count,
      EXISTS (
        SELECT 1
        FROM win w2
        WHERE w2.event_name = e.event_name AND w2.event_id IS NOT NULL
        GROUP BY w2.event_id
        HAVING bool_or(w2.source='browser') AND bool_or(w2.source='server')
      ) AS has_dedup
    FROM expected e
    LEFT JOIN win w ON w.event_name = e.event_name
    GROUP BY e.event_name
  )
  SELECT
    a.event_name,
    coalesce(a.has_browser,false),
    coalesce(a.has_server,false),
    coalesce(a.has_dedup,false),
    a.last_seen_at,
    a.count_24h,
    a.error_count,
    CASE
      WHEN a.count_24h = 0 THEN 'missing_event'
      WHEN a.error_count > 0 AND a.count_24h <= a.error_count THEN 'failing'
      WHEN a.has_browser AND a.has_server AND a.has_dedup THEN 'ok_deduped'
      WHEN a.has_browser AND NOT a.has_server THEN 'browser_only'
      WHEN a.has_server AND NOT a.has_browser THEN 'server_only'
      ELSE 'partial'
    END
  FROM agg a
  ORDER BY a.event_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.meta_event_coverage(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.meta_recent_logs(_limit int DEFAULT 100)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  event_name text,
  event_id text,
  source text,
  meta_response_status int,
  meta_fbtrace_id text,
  lead_id uuid,
  session_id text,
  appointment_id uuid,
  origin_key text,
  error_message text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT l.id, l.created_at, l.event_name, l.event_id, l.source,
         l.meta_response_status, l.meta_fbtrace_id,
         l.lead_id, l.session_id, l.appointment_id, l.origin_key, l.error_message
  FROM public.meta_event_logs l
  ORDER BY l.created_at DESC
  LIMIT GREATEST(LEAST(_limit, 500), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.meta_recent_logs(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.meta_attribution_completeness(_days int DEFAULT 7)
RETURNS TABLE(
  total_leads bigint,
  pct_with_utm numeric,
  pct_with_fbclid numeric,
  pct_with_fbp numeric,
  pct_with_fbc numeric,
  pct_with_origin numeric,
  pct_with_operator numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := now() - make_interval(days => GREATEST(_days, 1));
BEGIN
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT l.id AS lead_id, lo.origin_source, lo.origin_campaign, lo.origin_medium,
           lo.fbclid, lo.fbp, lo.fbc, lo.operator_email_attr
    FROM public.leads l
    LEFT JOIN public.lead_origins lo ON lo.lead_id = l.id
    WHERE l.created_at >= _since
  ),
  tot AS (SELECT count(*)::bigint AS n FROM base)
  SELECT
    (SELECT n FROM tot),
    CASE WHEN (SELECT n FROM tot)=0 THEN 0
         ELSE round(100.0 * count(*) FILTER (WHERE origin_source IS NOT NULL OR origin_campaign IS NOT NULL OR origin_medium IS NOT NULL) / (SELECT n FROM tot), 2) END,
    CASE WHEN (SELECT n FROM tot)=0 THEN 0
         ELSE round(100.0 * count(*) FILTER (WHERE fbclid IS NOT NULL) / (SELECT n FROM tot), 2) END,
    CASE WHEN (SELECT n FROM tot)=0 THEN 0
         ELSE round(100.0 * count(*) FILTER (WHERE fbp IS NOT NULL) / (SELECT n FROM tot), 2) END,
    CASE WHEN (SELECT n FROM tot)=0 THEN 0
         ELSE round(100.0 * count(*) FILTER (WHERE fbc IS NOT NULL) / (SELECT n FROM tot), 2) END,
    CASE WHEN (SELECT n FROM tot)=0 THEN 0
         ELSE round(100.0 * count(*) FILTER (WHERE origin_source IS NOT NULL) / (SELECT n FROM tot), 2) END,
    CASE WHEN (SELECT n FROM tot)=0 THEN 0
         ELSE round(100.0 * count(*) FILTER (WHERE operator_email_attr IS NOT NULL) / (SELECT n FROM tot), 2) END
  FROM base;
END;
$$;

GRANT EXECUTE ON FUNCTION public.meta_attribution_completeness(int) TO authenticated;