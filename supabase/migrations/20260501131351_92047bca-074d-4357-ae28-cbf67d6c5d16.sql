CREATE TABLE public.lead_score_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  appointment_id uuid,
  viewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_score integer NOT NULL,
  show_probability integer NOT NULL,
  close_probability integer NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}',
  input_snapshot jsonb NOT NULL DEFAULT '{}',
  trigger text NOT NULL DEFAULT 'ccp_open',
  previous_lead_score integer,
  score_delta integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_score_audit_lead ON public.lead_score_audit(lead_id, created_at DESC);
CREATE INDEX idx_lead_score_audit_appointment ON public.lead_score_audit(appointment_id, created_at DESC);

ALTER TABLE public.lead_score_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view score audit"
  ON public.lead_score_audit FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert score audit"
  ON public.lead_score_audit FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());