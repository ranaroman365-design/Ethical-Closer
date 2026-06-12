-- Phase 4: Smart Attendance & No-Show Recovery fields
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pre_call_unconfirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS attendance_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS appointment_status text DEFAULT 'scheduled';

-- Add comment for documentation
COMMENT ON COLUMN public.leads.pre_call_unconfirmed IS 'Phase 4: true if lead did not confirm pre-call check';
COMMENT ON COLUMN public.leads.attendance_flag IS 'Phase 4: true if lead attended their appointment';
COMMENT ON COLUMN public.leads.appointment_status IS 'Phase 4: scheduled | at_risk | completed | no_show | rebooked';