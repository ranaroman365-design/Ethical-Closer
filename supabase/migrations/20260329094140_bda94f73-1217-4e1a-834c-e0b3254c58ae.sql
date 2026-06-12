
-- ============================================================
-- SECURITY FIX SPRINT — ALL FINDINGS
-- ============================================================

-- ==========================================
-- TASK 1: Fix invite_tokens public exposure
-- Replace wide-open SELECT with token-scoped lookup
-- ==========================================
DROP POLICY IF EXISTS "Public validate tokens" ON public.invite_tokens;

-- Allow unauthenticated token validation ONLY when filtering by exact token value
-- This prevents browsing all emails but allows Register.tsx to validate a specific token
CREATE POLICY "Validate specific token only"
ON public.invite_tokens
FOR SELECT
TO anon, authenticated
USING (true);

-- NOTE: The above still uses USING(true) because RLS cannot inspect WHERE clause.
-- Real fix: replace with a SECURITY DEFINER function for token validation.
-- Drop the permissive policy and use function instead:
DROP POLICY IF EXISTS "Validate specific token only" ON public.invite_tokens;

-- Secure policy: only admins can SELECT invite_tokens directly
CREATE POLICY "Only admins read invite_tokens"
ON public.invite_tokens
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Create a secure function for token validation (used by Register.tsx)
CREATE OR REPLACE FUNCTION public.validate_invite_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record record;
BEGIN
  SELECT email, initial_stage, expires_at, used
  INTO v_record
  FROM public.invite_tokens
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'invalid_token');
  END IF;

  IF v_record.used THEN
    RETURN jsonb_build_object('valid', false, 'error', 'already_used');
  END IF;

  IF v_record.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'expired');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'email', v_record.email,
    'initial_stage', v_record.initial_stage,
    'expires_at', v_record.expires_at
  );
END;
$$;

-- ==========================================
-- TASK 2: Fix Security Definer View
-- view_performance_rankings missing security_invoker
-- ==========================================
ALTER VIEW public.view_performance_rankings SET (security_invoker = on);

-- ==========================================
-- TASK 3: Fix applicant_scores public exposure
-- ==========================================
DROP POLICY IF EXISTS "Public read own score via lead email" ON public.applicant_scores;

CREATE POLICY "Authenticated read own applicant scores"
ON public.applicant_scores
FOR SELECT
TO authenticated
USING (
  scored_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- ==========================================
-- TASK 4: Fix anonymous insert on system logs
-- system_error_logs and system_health_checks have WITH CHECK(true)
-- ==========================================
DROP POLICY IF EXISTS "Service can insert error logs" ON public.system_error_logs;

CREATE POLICY "Service role insert error logs"
ON public.system_error_logs
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Service can insert health checks" ON public.system_health_checks;

CREATE POLICY "Service role insert health checks"
ON public.system_health_checks
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role'
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- ==========================================
-- TASK 5: Fix function search_path
-- 4 functions missing search_path
-- ==========================================
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;

-- ==========================================
-- TASK 6: Extension pg_trgm in public schema
-- Move to dedicated schema
-- ==========================================
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
