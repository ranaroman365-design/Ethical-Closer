
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS setter_lead_uniqueness text,
  ADD COLUMN IF NOT EXISTS setter_closing_insights jsonb;

COMMENT ON COLUMN public.leads.setter_lead_uniqueness IS 'Required setter field: what makes this lead special (personal story, pain, motivation)';
COMMENT ON COLUMN public.leads.setter_closing_insights IS 'Optional structured insights: budget_sensitivity, decision_structure, urgency, objections';
