
-- AI Operator Configuration (singleton-style, one row)
CREATE TABLE public.ai_operator_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT false,
  auto_contact_delay_seconds int NOT NULL DEFAULT 300,
  channels_priority jsonb NOT NULL DEFAULT '["whatsapp","sms","email"]',
  handoff_triggers jsonb NOT NULL DEFAULT '{"complex_reply":true,"objection":true,"emotion":true,"pre_closing":true}',
  safety_rules jsonb NOT NULL DEFAULT '{"no_false_promises":true,"no_pressure":true,"no_unethical":true,"max_messages_per_lead_per_day":5}',
  noshow_sequence jsonb NOT NULL DEFAULT '[{"delay_minutes":5,"action":"message","channel":"whatsapp"},{"delay_minutes":120,"action":"rebooking_offer","channel":"whatsapp"},{"delay_minutes":1440,"action":"escalation","channel":"sms"}]',
  noclose_sequence jsonb NOT NULL DEFAULT '[{"delay_hours":2,"action":"followup","content_type":"empathy"},{"delay_hours":48,"action":"objection_content"},{"delay_hours":96,"action":"case_study"},{"delay_hours":168,"action":"reopen_offer"}]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_operator_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ai_operator_config"
  ON public.ai_operator_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default config
INSERT INTO public.ai_operator_config (id) VALUES (gen_random_uuid());

-- AI Operator Actions Log
CREATE TABLE public.ai_operator_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('lead_created','no_response','booking_created','call_completed','no_show','deal_lost','reactivation','follow_up')),
  action_type text NOT NULL CHECK (action_type IN ('message_sent','task_created','channel_switch','escalation','handoff','status_change','rebooking_offer')),
  channel text CHECK (channel IN ('whatsapp','sms','email','none')),
  message_content text,
  lead_status_before text,
  lead_status_after text,
  decision_reasoning text,
  success boolean DEFAULT true,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_operator_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see all ai_operator_actions"
  ON public.ai_operator_actions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System inserts ai_operator_actions"
  ON public.ai_operator_actions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ai_operator_actions_lead ON public.ai_operator_actions(lead_id);
CREATE INDEX idx_ai_operator_actions_event ON public.ai_operator_actions(event_type);
CREATE INDEX idx_ai_operator_actions_created ON public.ai_operator_actions(created_at DESC);

-- AI Operator Handoffs
CREATE TABLE public.ai_operator_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  operator_id uuid,
  reason text NOT NULL CHECK (reason IN ('complex_reply','objection','emotion','pre_closing','manual','unresponsive_escalation')),
  ai_summary text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','completed','expired')),
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_operator_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators see own handoffs"
  ON public.ai_operator_handoffs FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators update own handoffs"
  ON public.ai_operator_handoffs FOR UPDATE TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System inserts handoffs"
  ON public.ai_operator_handoffs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_ai_handoffs_operator ON public.ai_operator_handoffs(operator_id);
CREATE INDEX idx_ai_handoffs_status ON public.ai_operator_handoffs(status);

-- AI Operator Metrics (daily aggregates)
CREATE TABLE public.ai_operator_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  leads_processed int NOT NULL DEFAULT 0,
  messages_sent int NOT NULL DEFAULT 0,
  bookings_created int NOT NULL DEFAULT 0,
  handoffs_triggered int NOT NULL DEFAULT 0,
  response_rate numeric(5,2) DEFAULT 0,
  booking_rate numeric(5,2) DEFAULT 0,
  show_rate numeric(5,2) DEFAULT 0,
  conversion_rate numeric(5,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_operator_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see ai_operator_metrics"
  ON public.ai_operator_metrics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at on config
CREATE TRIGGER update_ai_operator_config_updated_at
  BEFORE UPDATE ON public.ai_operator_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
