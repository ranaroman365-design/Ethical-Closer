-- ============================================================
-- ETC FULL FUNNEL ATTRIBUTION SYSTEM (Backend, Forward-only)
-- ============================================================

-- 1) Extend lead_origins with UTM / first-touch fields
ALTER TABLE public.lead_origins
  ADD COLUMN IF NOT EXISTS origin_source     text,
  ADD COLUMN IF NOT EXISTS origin_campaign   text,
  ADD COLUMN IF NOT EXISTS origin_adset      text,
  ADD COLUMN IF NOT EXISTS origin_ad         text,
  ADD COLUMN IF NOT EXISTS origin_content    text,
  ADD COLUMN IF NOT EXISTS origin_medium     text,
  ADD COLUMN IF NOT EXISTS origin_term       text,
  ADD COLUMN IF NOT EXISTS referrer_url      text,
  ADD COLUMN IF NOT EXISTS landing_url       text,
  ADD COLUMN IF NOT EXISTS origin_timestamp  timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_lead_origins_source ON public.lead_origins(origin_source);
CREATE INDEX IF NOT EXISTS idx_lead_origins_campaign ON public.lead_origins(origin_campaign);

-- 2) Write-once enforcement trigger on lead_origins
CREATE OR REPLACE FUNCTION public.lead_origins_write_once()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Once an origin row exists with a non-null origin_source, never overwrite the marketing fields.
  IF TG_OP = 'UPDATE' AND OLD.origin_source IS NOT NULL THEN
    NEW.origin_source    := OLD.origin_source;
    NEW.origin_campaign  := COALESCE(OLD.origin_campaign,  NEW.origin_campaign);
    NEW.origin_adset     := COALESCE(OLD.origin_adset,     NEW.origin_adset);
    NEW.origin_ad        := COALESCE(OLD.origin_ad,        NEW.origin_ad);
    NEW.origin_content   := COALESCE(OLD.origin_content,   NEW.origin_content);
    NEW.origin_medium    := COALESCE(OLD.origin_medium,    NEW.origin_medium);
    NEW.origin_term      := COALESCE(OLD.origin_term,      NEW.origin_term);
    NEW.referrer_url     := COALESCE(OLD.referrer_url,     NEW.referrer_url);
    NEW.landing_url      := COALESCE(OLD.landing_url,      NEW.landing_url);
    NEW.origin_timestamp := OLD.origin_timestamp;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_origins_write_once ON public.lead_origins;
CREATE TRIGGER trg_lead_origins_write_once
  BEFORE UPDATE ON public.lead_origins
  FOR EACH ROW EXECUTE FUNCTION public.lead_origins_write_once();

-- 3) Extend funnel_events_v2
ALTER TABLE public.funnel_events_v2
  ADD COLUMN IF NOT EXISTS origin_source         text,
  ADD COLUMN IF NOT EXISTS community_influenced  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_funnel_events_origin_source ON public.funnel_events_v2(origin_source);
CREATE INDEX IF NOT EXISTS idx_funnel_events_event_type_ts ON public.funnel_events_v2(event_type, "timestamp");

-- 4) Extend appointments with origin_source (denormalized from lead for reporting)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS origin_source text;

-- 5) capture_lead_origin: First-touch RPC
CREATE OR REPLACE FUNCTION public.capture_lead_origin(
  _lead_id     uuid,
  _email       text,
  _source      text,
  _campaign    text DEFAULT NULL,
  _adset       text DEFAULT NULL,
  _ad          text DEFAULT NULL,
  _content     text DEFAULT NULL,
  _medium      text DEFAULT NULL,
  _term        text DEFAULT NULL,
  _referrer    text DEFAULT NULL,
  _landing_url text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _safe_source text := COALESCE(NULLIF(trim(_source), ''), 'direct');
BEGIN
  IF _lead_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.lead_origins(
    lead_id, origin_email, origin_source, origin_campaign, origin_adset,
    origin_ad, origin_content, origin_medium, origin_term, referrer_url,
    landing_url, origin_timestamp, first_seen_at
  )
  VALUES (
    _lead_id, lower(_email), _safe_source, _campaign, _adset,
    _ad, _content, _medium, _term, _referrer,
    _landing_url, now(), now()
  )
  ON CONFLICT (lead_id) DO NOTHING;  -- write-once

  -- Mirror to appointments rows for this lead (only when null, so we never overwrite)
  UPDATE public.appointments a
     SET origin_source = _safe_source
   WHERE a.lead_id = _lead_id
     AND a.origin_source IS NULL;
END;
$$;

-- 6) Mark community_influenced=true for DEAL_WON when path was completed earlier
CREATE OR REPLACE FUNCTION public.mark_community_influenced_deals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated int := 0;
BEGIN
  WITH path_users AS (
    SELECT user_id, completed_at
      FROM public.community_path_progress
     WHERE completed_at IS NOT NULL
  ),
  upd AS (
    UPDATE public.funnel_events_v2 fe
       SET community_influenced = true
      FROM path_users pu
     WHERE fe.event_type = 'DEAL_WON'
       AND fe.user_id   = pu.user_id
       AND fe."timestamp" >= pu.completed_at
       AND fe.community_influenced = false
     RETURNING 1
  )
  SELECT count(*) INTO _updated FROM upd;
  RETURN _updated;
END;
$$;

-- 7) Reporting RPCs (admin/owner only)

-- 7a) Revenue by origin_source
CREATE OR REPLACE FUNCTION public.attribution_revenue_by_source(_days integer DEFAULT 30)
RETURNS TABLE (
  origin_source text,
  leads         bigint,
  deals         bigint,
  revenue       numeric,
  conversion_rate numeric,
  community_influenced_revenue numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH window_leads AS (
    SELECT lo.lead_id, COALESCE(lo.origin_source, 'unknown') AS src
      FROM public.lead_origins lo
      JOIN public.leads l ON l.id = lo.lead_id
     WHERE l.created_at >= now() - make_interval(days => _days)
  ),
  window_deals AS (
    SELECT fe.lead_id,
           COALESCE(fe.origin_source, 'unknown') AS src,
           COALESCE(fe.revenue, 0) AS revenue,
           fe.community_influenced
      FROM public.funnel_events_v2 fe
     WHERE fe.event_type = 'DEAL_WON'
       AND fe."timestamp" >= now() - make_interval(days => _days)
  ),
  agg_leads AS (
    SELECT src, count(*)::bigint AS leads FROM window_leads GROUP BY src
  ),
  agg_deals AS (
    SELECT src,
           count(*)::bigint AS deals,
           sum(revenue)::numeric AS revenue,
           sum(revenue) FILTER (WHERE community_influenced)::numeric AS ci_rev
      FROM window_deals GROUP BY src
  )
  SELECT COALESCE(al.src, ad.src) AS origin_source,
         COALESCE(al.leads, 0)    AS leads,
         COALESCE(ad.deals, 0)    AS deals,
         COALESCE(ad.revenue, 0)  AS revenue,
         CASE WHEN COALESCE(al.leads,0) > 0
              THEN ROUND(COALESCE(ad.deals,0)::numeric / al.leads::numeric, 4)
              ELSE NULL END       AS conversion_rate,
         COALESCE(ad.ci_rev, 0)   AS community_influenced_revenue
    FROM agg_leads al
    FULL OUTER JOIN agg_deals ad ON ad.src = al.src
   ORDER BY revenue DESC NULLS LAST;
END;
$$;

-- 7b) Community ROI
CREATE OR REPLACE FUNCTION public.attribution_community_roi(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH community_users AS (
    SELECT user_id, started_at, completed_at
      FROM public.community_path_progress
     WHERE started_at >= now() - make_interval(days => _days)
  ),
  ci_deals AS (
    SELECT fe.user_id, fe.revenue, fe."timestamp"
      FROM public.funnel_events_v2 fe
     WHERE fe.event_type = 'DEAL_WON'
       AND fe.community_influenced = true
       AND fe."timestamp" >= now() - make_interval(days => _days)
  )
  SELECT jsonb_build_object(
    'community_members',         (SELECT count(*) FROM community_users),
    'path_completed',            (SELECT count(*) FROM community_users WHERE completed_at IS NOT NULL),
    'path_completion_rate',      CASE WHEN (SELECT count(*) FROM community_users) > 0
                                      THEN ROUND((SELECT count(*) FROM community_users WHERE completed_at IS NOT NULL)::numeric
                                                 / (SELECT count(*) FROM community_users)::numeric, 4)
                                      ELSE NULL END,
    'community_influenced_deals',(SELECT count(*) FROM ci_deals),
    'community_influenced_revenue', COALESCE((SELECT sum(revenue) FROM ci_deals), 0),
    'avg_time_to_conversion_hours',
        (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (cd."timestamp" - cu.started_at))/3600.0)::numeric, 1)
           FROM ci_deals cd
           JOIN community_users cu ON cu.user_id = cd.user_id),
    'days', _days,
    'computed_at', now()
  ) INTO _result;

  RETURN _result;
END;
$$;

-- 7c) Attribution health
CREATE OR REPLACE FUNCTION public.attribution_health(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH leads_w AS (
    SELECT id FROM public.leads WHERE created_at >= now() - make_interval(days => _days)
  ),
  bookings_w AS (
    SELECT id, lead_id FROM public.appointments WHERE created_at >= now() - make_interval(days => _days)
  ),
  deals_w AS (
    SELECT lead_id, origin_source FROM public.funnel_events_v2
     WHERE event_type = 'DEAL_WON' AND "timestamp" >= now() - make_interval(days => _days)
  )
  SELECT jsonb_build_object(
    'leads_total', (SELECT count(*) FROM leads_w),
    'leads_with_origin',
        (SELECT count(*) FROM leads_w l WHERE EXISTS (SELECT 1 FROM public.lead_origins lo WHERE lo.lead_id = l.id AND lo.origin_source IS NOT NULL)),
    'bookings_total', (SELECT count(*) FROM bookings_w),
    'bookings_with_lead', (SELECT count(*) FROM bookings_w WHERE lead_id IS NOT NULL),
    'deals_total', (SELECT count(*) FROM deals_w),
    'deals_with_origin', (SELECT count(*) FROM deals_w WHERE origin_source IS NOT NULL AND origin_source <> 'unknown'),
    'days', _days,
    'computed_at', now()
  ) INTO _result;
  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.capture_lead_origin(uuid, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_community_influenced_deals() TO authenticated;
GRANT EXECUTE ON FUNCTION public.attribution_revenue_by_source(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attribution_community_roi(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attribution_health(integer) TO authenticated;