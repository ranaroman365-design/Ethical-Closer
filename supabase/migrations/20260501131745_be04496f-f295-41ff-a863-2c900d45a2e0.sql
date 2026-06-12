
CREATE TABLE public.lead_auto_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL,
  lead_id UUID,
  action_key TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  trigger_reason TEXT,
  timeline_minutes INT NOT NULL DEFAULT 0,
  can_auto_execute BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  executed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES auth.users(id),
  lead_score INT,
  show_probability INT,
  close_probability INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(appointment_id, action_key)
);

ALTER TABLE public.lead_auto_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read auto actions"
  ON public.lead_auto_actions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert auto actions"
  ON public.lead_auto_actions FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update auto actions"
  ON public.lead_auto_actions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_lead_auto_actions_appointment ON public.lead_auto_actions(appointment_id);
CREATE INDEX idx_lead_auto_actions_status ON public.lead_auto_actions(status);
