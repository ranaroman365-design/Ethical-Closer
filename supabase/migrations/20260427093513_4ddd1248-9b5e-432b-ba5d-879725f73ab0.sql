ALTER TABLE public.lead_attribution
ADD COLUMN IF NOT EXISTS email text;

CREATE INDEX IF NOT EXISTS lead_attribution_email_unlinked_idx
  ON public.lead_attribution (lower(email))
  WHERE email IS NOT NULL AND lead_id IS NULL;

CREATE OR REPLACE FUNCTION public.capture_lead_attribution(
  p_session_id text,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_utm_term text DEFAULT NULL,
  p_fbclid text DEFAULT NULL,
  p_gclid text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_landing_page_url text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
    RAISE EXCEPTION 'session_id required';
  END IF;

  v_email := NULLIF(lower(trim(p_email)), '');

  INSERT INTO public.lead_attribution (
    session_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, gclid, referrer, landing_page_url, user_agent, email
  ) VALUES (
    p_session_id, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_fbclid, p_gclid, p_referrer, p_landing_page_url, p_user_agent, v_email
  )
  ON CONFLICT (session_id) DO UPDATE SET
    utm_source       = COALESCE(public.lead_attribution.utm_source, EXCLUDED.utm_source),
    utm_medium       = COALESCE(public.lead_attribution.utm_medium, EXCLUDED.utm_medium),
    utm_campaign     = COALESCE(public.lead_attribution.utm_campaign, EXCLUDED.utm_campaign),
    utm_content      = COALESCE(public.lead_attribution.utm_content, EXCLUDED.utm_content),
    utm_term         = COALESCE(public.lead_attribution.utm_term, EXCLUDED.utm_term),
    fbclid           = COALESCE(public.lead_attribution.fbclid, EXCLUDED.fbclid),
    gclid            = COALESCE(public.lead_attribution.gclid, EXCLUDED.gclid),
    referrer         = COALESCE(public.lead_attribution.referrer, EXCLUDED.referrer),
    landing_page_url = COALESCE(public.lead_attribution.landing_page_url, EXCLUDED.landing_page_url),
    user_agent       = COALESCE(public.lead_attribution.user_agent, EXCLUDED.user_agent),
    email            = COALESCE(public.lead_attribution.email, EXCLUDED.email),
    updated_at       = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.capture_lead_attribution(text, text, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_lead_attribution(
  p_session_id text,
  p_lead_id uuid,
  p_email text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_updated integer := 0;
BEGIN
  IF p_lead_id IS NULL THEN
    RETURN false;
  END IF;

  v_email := NULLIF(lower(trim(p_email)), '');

  IF p_session_id IS NOT NULL AND length(trim(p_session_id)) > 0 THEN
    UPDATE public.lead_attribution
       SET lead_id = p_lead_id,
           email = COALESCE(email, v_email),
           updated_at = now()
     WHERE session_id = p_session_id
       AND lead_id IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  IF v_updated = 0 AND v_email IS NOT NULL THEN
    UPDATE public.lead_attribution
       SET lead_id = p_lead_id,
           updated_at = now()
     WHERE lower(email) = v_email
       AND lead_id IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_lead_attribution(
  p_session_id text,
  p_lead_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.link_lead_attribution(p_session_id, p_lead_id, NULL::text);
$$;

GRANT EXECUTE ON FUNCTION public.link_lead_attribution(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_lead_attribution(text, uuid) TO anon, authenticated;