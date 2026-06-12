-- ============================================================
-- /apply Funnel: Pre-Ad Stabilization (Fixes 4 + 5)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- FIX 4: Lead Attribution (UTM / fbclid / referrer / landing)
-- ─────────────────────────────────────────────────────────────
-- Many ad-tracking fields are captured BEFORE a lead exists (cold
-- visitor lands on /apply). We persist them with a session_id and
-- later link to a lead_id once the user submits LeadCaptureGate.
CREATE TABLE IF NOT EXISTS public.lead_attribution (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      text NOT NULL,
  lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  fbclid          text,
  gclid           text,
  referrer        text,
  landing_page_url text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_attribution_session_uq
  ON public.lead_attribution (session_id);
CREATE INDEX IF NOT EXISTS lead_attribution_lead_idx
  ON public.lead_attribution (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_attribution_fbclid_idx
  ON public.lead_attribution (fbclid) WHERE fbclid IS NOT NULL;

ALTER TABLE public.lead_attribution ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or authed) may write a row keyed to their own session.
-- This is necessary because /apply is a cold-traffic landing page.
DROP POLICY IF EXISTS lead_attribution_insert_anyone ON public.lead_attribution;
CREATE POLICY lead_attribution_insert_anyone
  ON public.lead_attribution
  FOR INSERT
  WITH CHECK (true);

-- Updates also allowed (so we can attach lead_id post-RPC).
DROP POLICY IF EXISTS lead_attribution_update_anyone ON public.lead_attribution;
CREATE POLICY lead_attribution_update_anyone
  ON public.lead_attribution
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Read restricted to admins/owners; ads ops may use service role.
DROP POLICY IF EXISTS lead_attribution_read_admin ON public.lead_attribution;
CREATE POLICY lead_attribution_read_admin
  ON public.lead_attribution
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role));

-- RPC: capture/upsert attribution for a session (no auth required).
CREATE OR REPLACE FUNCTION public.capture_lead_attribution(
  p_session_id      text,
  p_utm_source      text DEFAULT NULL,
  p_utm_medium      text DEFAULT NULL,
  p_utm_campaign    text DEFAULT NULL,
  p_utm_content     text DEFAULT NULL,
  p_utm_term        text DEFAULT NULL,
  p_fbclid          text DEFAULT NULL,
  p_gclid           text DEFAULT NULL,
  p_referrer        text DEFAULT NULL,
  p_landing_page_url text DEFAULT NULL,
  p_user_agent      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
    RAISE EXCEPTION 'session_id required';
  END IF;

  INSERT INTO public.lead_attribution (
    session_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, referrer, landing_page_url, user_agent
  ) VALUES (
    p_session_id, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_fbclid, p_gclid, p_referrer, p_landing_page_url, p_user_agent
  )
  ON CONFLICT (session_id) DO UPDATE SET
    -- Only fill empty fields; never overwrite first-touch with later visit data.
    utm_source       = COALESCE(public.lead_attribution.utm_source,    EXCLUDED.utm_source),
    utm_medium       = COALESCE(public.lead_attribution.utm_medium,    EXCLUDED.utm_medium),
    utm_campaign     = COALESCE(public.lead_attribution.utm_campaign,  EXCLUDED.utm_campaign),
    utm_content      = COALESCE(public.lead_attribution.utm_content,   EXCLUDED.utm_content),
    utm_term         = COALESCE(public.lead_attribution.utm_term,      EXCLUDED.utm_term),
    fbclid           = COALESCE(public.lead_attribution.fbclid,        EXCLUDED.fbclid),
    gclid            = COALESCE(public.lead_attribution.gclid,         EXCLUDED.gclid),
    referrer         = COALESCE(public.lead_attribution.referrer,      EXCLUDED.referrer),
    landing_page_url = COALESCE(public.lead_attribution.landing_page_url, EXCLUDED.landing_page_url),
    user_agent       = COALESCE(public.lead_attribution.user_agent,    EXCLUDED.user_agent),
    updated_at       = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.capture_lead_attribution(text, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

-- RPC: link a session_id's attribution row to a lead_id post-capture.
CREATE OR REPLACE FUNCTION public.link_lead_attribution(
  p_session_id text,
  p_lead_id    uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR p_lead_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.lead_attribution
     SET lead_id = p_lead_id,
         updated_at = now()
   WHERE session_id = p_session_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_lead_attribution(text, uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────
-- FIX 5: Prevent duplicate active appointments per lead
-- ─────────────────────────────────────────────────────────────
-- Allow many rows in superseded/expired/cancelled history, but at
-- most ONE active row per lead at a time. This prevents reload /
-- back-button duplicate bookings even if the edge function flow
-- has a race condition.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_active_per_lead_uq
  ON public.appointments (lead_id)
  WHERE appointment_status IN ('booked', 'confirmed', 'pending_payment');


-- ─────────────────────────────────────────────────────────────
-- updated_at trigger for lead_attribution
-- ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS lead_attribution_set_updated_at ON public.lead_attribution;
CREATE TRIGGER lead_attribution_set_updated_at
  BEFORE UPDATE ON public.lead_attribution
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();