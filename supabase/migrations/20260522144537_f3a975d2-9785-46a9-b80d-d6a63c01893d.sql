-- MBF Inbound Booking Receiver: minimal metadata landing
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_leads_metadata_source_system
  ON public.leads ((metadata->>'source_system'));

CREATE INDEX IF NOT EXISTS idx_appointments_metadata_source_system
  ON public.appointments ((metadata->>'source_system'));
