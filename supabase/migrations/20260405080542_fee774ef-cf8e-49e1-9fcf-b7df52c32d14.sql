
-- Copilot interactions for Closer AI V2
CREATE TABLE public.copilot_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  closer_id UUID NOT NULL,
  raw_input TEXT NOT NULL,
  detected_phase TEXT,
  detected_objection TEXT,
  suggested_response TEXT,
  suggested_next_action TEXT,
  confidence TEXT DEFAULT 'medium',
  summary_text TEXT,
  suggested_outcome TEXT,
  copilot_used BOOLEAN DEFAULT true,
  session_notes TEXT[] DEFAULT '{}',
  lead_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Closers can create their own interactions"
ON public.copilot_interactions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = closer_id);

CREATE POLICY "Closers can view their own interactions"
ON public.copilot_interactions FOR SELECT
TO authenticated
USING (auth.uid() = closer_id);

CREATE POLICY "Admins can view all interactions"
ON public.copilot_interactions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_copilot_interactions_lead ON public.copilot_interactions(lead_id);
CREATE INDEX idx_copilot_interactions_closer ON public.copilot_interactions(closer_id);
