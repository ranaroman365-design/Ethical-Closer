
CREATE TABLE IF NOT EXISTS public.conversational_ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global',
  funnel_key text,
  enabled boolean NOT NULL DEFAULT false,
  funnel_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  min_reply_interval_seconds integer NOT NULL DEFAULT 60,
  max_replies_per_conversation integer NOT NULL DEFAULT 6,
  high_value_score_threshold integer NOT NULL DEFAULT 70,
  quiet_hours_start integer NOT NULL DEFAULT 21,
  quiet_hours_end integer NOT NULL DEFAULT 8,
  escalation_message_template_key text NOT NULL DEFAULT 'wa_escalation_handoff',
  ai_confidence_threshold numeric NOT NULL DEFAULT 0.65,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope, funnel_key)
);

INSERT INTO public.conversational_ai_settings (scope, funnel_key)
VALUES ('global', NULL)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  funnel_key text,
  phone_e164 text NOT NULL,
  state text NOT NULL DEFAULT 'cold'
    CHECK (state IN ('cold','engaged','interested','booking_pending','booked','lost','escalated')),
  last_intent text,
  last_intent_confidence numeric,
  message_count integer NOT NULL DEFAULT 0,
  ai_reply_count integer NOT NULL DEFAULT 0,
  ai_paused boolean NOT NULL DEFAULT false,
  ai_paused_reason text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_ai_reply_at timestamptz,
  last_human_reply_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phone_e164)
);
CREATE INDEX IF NOT EXISTS wa_conversations_lead ON public.wa_conversations(lead_id);
CREATE INDEX IF NOT EXISTS wa_conversations_funnel ON public.wa_conversations(funnel_key);
CREATE INDEX IF NOT EXISTS wa_conversations_state ON public.wa_conversations(state);

CREATE TABLE IF NOT EXISTS public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  lead_id uuid,
  funnel_key text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound_ai','outbound_human','outbound_system')),
  body text,
  intent text,
  intent_confidence numeric,
  template_key text,
  variant_key text,
  twilio_sid text,
  blocked boolean NOT NULL DEFAULT false,
  blocked_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_messages_conv ON public.wa_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_messages_lead ON public.wa_messages(lead_id);

CREATE TABLE IF NOT EXISTS public.wa_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  lead_id uuid,
  funnel_key text,
  trigger text NOT NULL
    CHECK (trigger IN ('complex_question','emotional_message','high_value_lead','repeated_confusion','explicit_human_request','ai_low_confidence','manual')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','resolved','dismissed')),
  assigned_to uuid,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_escalations_status ON public.wa_escalations(status, created_at DESC);

ALTER TABLE public.conversational_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_settings_admin_all" ON public.conversational_ai_settings FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role));

CREATE POLICY "wa_conv_admin_all" ON public.wa_conversations FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role));

CREATE POLICY "wa_msg_admin_all" ON public.wa_messages FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role));

CREATE POLICY "wa_esc_admin_all" ON public.wa_escalations FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'owner'::app_role) OR has_role(auth.uid(),'ops_admin'::app_role));

CREATE POLICY "wa_settings_l6_scoped" ON public.conversational_ai_settings FOR SELECT TO authenticated
USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));

CREATE POLICY "wa_settings_l6_update" ON public.conversational_ai_settings FOR UPDATE TO authenticated
USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key))
WITH CHECK (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));

CREATE POLICY "wa_conv_l6_scoped" ON public.wa_conversations FOR SELECT TO authenticated
USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));

CREATE POLICY "wa_conv_l6_update" ON public.wa_conversations FOR UPDATE TO authenticated
USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key))
WITH CHECK (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));

CREATE POLICY "wa_msg_l6_scoped" ON public.wa_messages FOR SELECT TO authenticated
USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));

CREATE POLICY "wa_esc_l6_scoped" ON public.wa_escalations FOR SELECT TO authenticated
USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));

CREATE POLICY "wa_esc_l6_update" ON public.wa_escalations FOR UPDATE TO authenticated
USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key))
WITH CHECK (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));

CREATE OR REPLACE FUNCTION public.touch_updated_at_wa()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_wa_settings_touch ON public.conversational_ai_settings;
CREATE TRIGGER trg_wa_settings_touch BEFORE UPDATE ON public.conversational_ai_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_wa();

DROP TRIGGER IF EXISTS trg_wa_conv_touch ON public.wa_conversations;
CREATE TRIGGER trg_wa_conv_touch BEFORE UPDATE ON public.wa_conversations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_wa();
