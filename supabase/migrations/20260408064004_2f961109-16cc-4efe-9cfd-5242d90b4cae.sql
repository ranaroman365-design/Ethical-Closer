
-- Add automation tracking fields to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_show_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rebooked_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_risk_score integer;

-- Reminder tracking table
CREATE TABLE public.lead_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  cancelled_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  message_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_reminders_status ON public.lead_reminders(status, scheduled_for);
CREATE INDEX idx_lead_reminders_appointment ON public.lead_reminders(appointment_id);
CREATE INDEX idx_lead_reminders_lead ON public.lead_reminders(lead_id);

ALTER TABLE public.lead_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on lead_reminders"
  ON public.lead_reminders FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users can view own reminders"
  ON public.lead_reminders FOR SELECT
  TO authenticated
  USING (lead_id IN (SELECT id FROM public.leads WHERE owner_id = auth.uid()));

-- No-show risk prediction table
CREATE TABLE public.no_show_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  risk_score integer NOT NULL DEFAULT 0,
  risk_tier text NOT NULL DEFAULT 'low',
  input_signals jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(appointment_id)
);

ALTER TABLE public.no_show_risk_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on no_show_risk_scores"
  ON public.no_show_risk_scores FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Trigger: schedule reminders when appointment is confirmed
CREATE OR REPLACE FUNCTION public.schedule_appointment_reminders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.appointment_status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.appointment_status != 'confirmed') THEN
    UPDATE lead_reminders SET status = 'cancelled', cancelled_at = now()
    WHERE appointment_id = NEW.id AND status = 'pending';

    IF NEW.starts_at - interval '24 hours' > now() THEN
      INSERT INTO lead_reminders (lead_id, appointment_id, reminder_type, channel, scheduled_for, message_key)
      VALUES (NEW.lead_id, NEW.id, '24h', 'email', NEW.starts_at - interval '24 hours', 'reminder_24h');
    END IF;

    IF NEW.starts_at - interval '2 hours' > now() THEN
      INSERT INTO lead_reminders (lead_id, appointment_id, reminder_type, channel, scheduled_for, message_key)
      VALUES (NEW.lead_id, NEW.id, '2h', 'email', NEW.starts_at - interval '2 hours', 'reminder_2h');
      INSERT INTO lead_reminders (lead_id, appointment_id, reminder_type, channel, scheduled_for, message_key)
      VALUES (NEW.lead_id, NEW.id, 'pre_call_activation', 'email', NEW.starts_at - interval '2 hours', 'pre_call_prep');
    END IF;

    IF NEW.starts_at - interval '15 minutes' > now() THEN
      INSERT INTO lead_reminders (lead_id, appointment_id, reminder_type, channel, scheduled_for, message_key)
      VALUES (NEW.lead_id, NEW.id, '15min', 'email', NEW.starts_at - interval '15 minutes', 'reminder_15min');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_schedule_reminders
  AFTER INSERT OR UPDATE OF appointment_status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.schedule_appointment_reminders();

-- Trigger: cancel reminders when user clicks join
CREATE OR REPLACE FUNCTION public.cancel_reminders_on_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.join_clicked_at IS NOT NULL AND OLD.join_clicked_at IS NULL THEN
    UPDATE lead_reminders SET status = 'cancelled', cancelled_at = now()
    WHERE appointment_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancel_reminders_on_join
  AFTER UPDATE OF join_clicked_at ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_reminders_on_join();

-- Trigger: schedule recovery messages on no-show
CREATE OR REPLACE FUNCTION public.schedule_no_show_recovery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.call_status = 'no_show' AND (OLD.call_status IS DISTINCT FROM 'no_show') THEN
    UPDATE leads SET no_show_flag = true WHERE id = NEW.lead_id;

    INSERT INTO lead_reminders (lead_id, appointment_id, reminder_type, channel, scheduled_for, message_key)
    VALUES
      (NEW.lead_id, NEW.id, 'recovery_1', 'email', now(), 'no_show_recovery_immediate'),
      (NEW.lead_id, NEW.id, 'recovery_2', 'email', now() + interval '12 hours', 'no_show_recovery_12h'),
      (NEW.lead_id, NEW.id, 'recovery_3', 'email', now() + interval '48 hours', 'no_show_recovery_48h');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_schedule_no_show_recovery
  AFTER UPDATE OF call_status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.schedule_no_show_recovery();

-- Trigger: stop recovery flow when lead rebooks
CREATE OR REPLACE FUNCTION public.stop_recovery_on_rebook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.appointment_status = 'confirmed' THEN
    UPDATE lead_reminders SET status = 'cancelled', cancelled_at = now()
    WHERE lead_id = NEW.lead_id AND status = 'pending' AND reminder_type LIKE 'recovery_%';

    UPDATE leads SET rebooked_flag = true, no_show_flag = false WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stop_recovery_on_rebook
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.stop_recovery_on_rebook();
