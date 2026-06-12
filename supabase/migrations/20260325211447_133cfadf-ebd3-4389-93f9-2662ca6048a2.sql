
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_level text NOT NULL DEFAULT 'L0';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS quiz_score integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS quiz_result text;
