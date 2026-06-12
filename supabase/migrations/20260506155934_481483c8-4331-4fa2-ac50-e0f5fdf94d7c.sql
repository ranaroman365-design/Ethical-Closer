
-- Table for tracking meeting link clicks
CREATE TABLE public.meeting_link_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  tracking_token TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT,
  ip_hash TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_meeting_link_clicks_appointment ON public.meeting_link_clicks(appointment_id);
CREATE INDEX idx_meeting_link_clicks_lead ON public.meeting_link_clicks(lead_id);
CREATE INDEX idx_meeting_link_clicks_token ON public.meeting_link_clicks(tracking_token);

-- Enable RLS
ALTER TABLE public.meeting_link_clicks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all clicks (operators need visibility)
CREATE POLICY "Authenticated users can view meeting link clicks"
  ON public.meeting_link_clicks
  FOR SELECT
  TO authenticated
  USING (true);

-- No direct inserts from client — edge function uses service role
CREATE POLICY "Service role inserts meeting link clicks"
  ON public.meeting_link_clicks
  FOR INSERT
  TO service_role
  WITH CHECK (true);
