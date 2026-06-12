-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.appointment_modal_open_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid,
  user_id uuid,
  success boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  latency_ms integer,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appt_modal_log_created ON public.appointment_modal_open_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appt_modal_log_appt ON public.appointment_modal_open_log (appointment_id);

ALTER TABLE public.appointment_modal_open_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read modal log" ON public.appointment_modal_open_log;
CREATE POLICY "admins read modal log" ON public.appointment_modal_open_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth insert modal log" ON public.appointment_modal_open_log;
CREATE POLICY "auth insert modal log" ON public.appointment_modal_open_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Lightweight client-callable logger RPC (so client can log even when RPC itself fails)
CREATE OR REPLACE FUNCTION public.log_appointment_modal_open(
  p_appointment_id uuid,
  p_success boolean,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_latency_ms integer DEFAULT NULL,
  p_source text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.appointment_modal_open_log
    (appointment_id, user_id, success, error_code, error_message, latency_ms, source)
  VALUES
    (p_appointment_id, auth.uid(), p_success, p_error_code, p_error_message, p_latency_ms, p_source);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_appointment_modal_open(uuid, boolean, text, text, integer, text) TO authenticated;