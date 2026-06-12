-- Reminder dedup/tracking table
CREATE TABLE IF NOT EXISTS public.appointment_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h', '3h', '30min')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  recipient_email text,
  idempotency_key text,
  UNIQUE (appointment_id, reminder_type)
);

ALTER TABLE public.appointment_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on reminder log"
  ON public.appointment_reminder_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view reminder logs"
  ON public.appointment_reminder_log FOR SELECT TO authenticated
  USING (true);

CREATE INDEX idx_reminder_log_appointment
  ON public.appointment_reminder_log (appointment_id, reminder_type);

-- Function to find appointments needing reminders
CREATE OR REPLACE FUNCTION public.get_pending_reminders()
RETURNS TABLE (
  appointment_id uuid,
  lead_id uuid,
  lead_email text,
  lead_name text,
  starts_at timestamptz,
  call_type text,
  reminder_type text,
  setter_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH windows AS (
    SELECT '24h'::text AS rtype, interval '24 hours' AS lo, interval '25 hours' AS hi
    UNION ALL
    SELECT '3h', interval '3 hours', interval '4 hours'
    UNION ALL
    SELECT '30min', interval '30 minutes', interval '35 minutes'
  )
  SELECT
    a.id AS appointment_id,
    a.lead_id,
    l.email AS lead_email,
    COALESCE(l.name, '') AS lead_name,
    a.starts_at,
    a.call_type,
    w.rtype AS reminder_type,
    a.setter_id
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.lead_id
  CROSS JOIN windows w
  WHERE a.appointment_status = 'active'
    AND a.starts_at BETWEEN now() + w.lo AND now() + w.hi
    AND l.email IS NOT NULL
    AND COALESCE(l.is_test_lead, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.appointment_reminder_log r
      WHERE r.appointment_id = a.id AND r.reminder_type = w.rtype
    );
$$;