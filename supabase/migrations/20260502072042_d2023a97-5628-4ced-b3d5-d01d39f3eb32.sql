
CREATE TABLE public.lead_contact_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'contact_click',
  channel TEXT NOT NULL,
  source_component TEXT,
  button_type TEXT,
  template_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_contact_events_lead ON public.lead_contact_events(lead_id);
CREATE INDEX idx_lead_contact_events_user ON public.lead_contact_events(user_id);
CREATE INDEX idx_lead_contact_events_created ON public.lead_contact_events(created_at DESC);
CREATE INDEX idx_lead_contact_events_dedup ON public.lead_contact_events(user_id, lead_id, channel, created_at DESC);

ALTER TABLE public.lead_contact_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert contact events"
  ON public.lead_contact_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own contact events"
  ON public.lead_contact_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all contact events"
  ON public.lead_contact_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
