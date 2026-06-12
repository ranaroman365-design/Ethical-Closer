
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qualification_score integer,
  ADD COLUMN IF NOT EXISTS qualification_bucket text,
  ADD COLUMN IF NOT EXISTS qualification_path text;

CREATE INDEX IF NOT EXISTS idx_leads_qualification_bucket ON public.leads (qualification_bucket);
