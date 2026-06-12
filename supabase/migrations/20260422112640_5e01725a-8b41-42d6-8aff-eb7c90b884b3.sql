
-- Show-up reminder state on appointments (idempotent dispatch tracking)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminders_state JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index for the reminder dispatcher (only future appointments still booked)
CREATE INDEX IF NOT EXISTS idx_appointments_upcoming_reminders
  ON public.appointments (starts_at)
  WHERE appointment_status = 'booked';

-- Track explicit applicant commitment confirmations for compliance + show-up correlation
CREATE TABLE IF NOT EXISTS public.appointment_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,
  commit_show_on_time BOOLEAN NOT NULL DEFAULT false,
  commit_quiet_environment BOOLEAN NOT NULL DEFAULT false,
  commit_open_to_change BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  UNIQUE (appointment_id)
);

ALTER TABLE public.appointment_commitments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_insert_own_commitment" ON public.appointment_commitments;
CREATE POLICY "public_insert_own_commitment"
  ON public.appointment_commitments FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_select_commitments" ON public.appointment_commitments;
CREATE POLICY "service_select_commitments"
  ON public.appointment_commitments FOR SELECT TO authenticated
  USING (false);
