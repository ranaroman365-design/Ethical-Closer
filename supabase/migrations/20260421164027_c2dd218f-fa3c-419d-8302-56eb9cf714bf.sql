
-- B5: Scheduler tracking columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS setter_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_detected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_appt_sched_sla
  ON public.appointments(starts_at)
  WHERE appointment_status IN ('scheduled','confirmed') AND sla_escalated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_sched_setter_rem
  ON public.appointments(starts_at)
  WHERE appointment_status IN ('scheduled','confirmed') AND setter_reminder_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_sched_noshow
  ON public.appointments(starts_at)
  WHERE appointment_status IN ('scheduled','confirmed') AND no_show_detected_at IS NULL;

-- B6: Automation log table for the health dashboard
CREATE TABLE IF NOT EXISTS public.automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  metrics jsonb DEFAULT '{}'::jsonb,
  error text,
  ran_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_log_ran_at ON public.automation_log(ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_log_job ON public.automation_log(job_name, ran_at DESC);

ALTER TABLE public.automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read automation log"
  ON public.automation_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role writes automation log"
  ON public.automation_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
