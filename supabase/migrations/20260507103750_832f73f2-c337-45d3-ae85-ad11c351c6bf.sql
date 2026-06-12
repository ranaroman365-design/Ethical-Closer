-- ══════════════════════════════════════════════════════════════
-- Canonical Unbooked-Lead Booking Continuation
-- Layer: Conversion · Block: Acquisition → Conversion bridge
-- ══════════════════════════════════════════════════════════════

-- 1. Token storage table
CREATE TABLE IF NOT EXISTS public.lead_booking_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_booking_tokens_token ON public.lead_booking_tokens(token);
CREATE INDEX IF NOT EXISTS idx_lead_booking_tokens_lead_id ON public.lead_booking_tokens(lead_id);

ALTER TABLE public.lead_booking_tokens ENABLE ROW LEVEL SECURITY;

-- Public read by token (booking page needs this without auth)
CREATE POLICY "Anyone can validate a booking token"
  ON public.lead_booking_tokens
  FOR SELECT
  USING (true);

-- Authenticated insert (edge functions / RPCs run as service role anyway)
CREATE POLICY "Authenticated users can create tokens"
  ON public.lead_booking_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 2. Generate booking token (SECURITY DEFINER — called from edge functions)
CREATE OR REPLACE FUNCTION public.generate_booking_token(p_lead_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Reuse existing unexpired token if available
  SELECT token INTO v_token
  FROM lead_booking_tokens
  WHERE lead_id = p_lead_id
    AND expires_at > now()
    AND used_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  -- Generate new token
  INSERT INTO lead_booking_tokens (lead_id)
  VALUES (p_lead_id)
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

-- 3. Validate booking token — returns lead data for prefill
CREATE OR REPLACE FUNCTION public.validate_booking_token(p_token TEXT)
RETURNS TABLE(
  lead_id UUID,
  lead_name TEXT,
  lead_email TEXT,
  lead_phone TEXT,
  qualification_bucket TEXT,
  lead_quality TEXT,
  quiz_completed_at TIMESTAMPTZ,
  booking_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id AS lead_id,
    l.name AS lead_name,
    l.email AS lead_email,
    l.phone AS lead_phone,
    l.qualification_bucket,
    l.lead_quality,
    l.quiz_completed_at,
    l.booking_status
  FROM lead_booking_tokens t
  JOIN leads l ON l.id = t.lead_id
  WHERE t.token = p_token
    AND t.expires_at > now()
  LIMIT 1;
END;
$$;

-- 4. Resolve lead by email (fallback when no token)
CREATE OR REPLACE FUNCTION public.resolve_lead_by_email(p_email TEXT)
RETURNS TABLE(
  lead_id UUID,
  lead_name TEXT,
  lead_phone TEXT,
  qualification_bucket TEXT,
  lead_quality TEXT,
  booking_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id AS lead_id,
    l.name AS lead_name,
    l.phone AS lead_phone,
    l.qualification_bucket,
    l.lead_quality,
    l.booking_status
  FROM leads l
  WHERE lower(trim(l.email)) = lower(trim(p_email))
  ORDER BY l.created_at DESC
  LIMIT 1;
END;
$$;

-- 5. Mark token as used (soft — token stays valid for session)
CREATE OR REPLACE FUNCTION public.mark_booking_token_used(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE lead_booking_tokens
  SET used_at = now()
  WHERE token = p_token
    AND used_at IS NULL;
END;
$$;