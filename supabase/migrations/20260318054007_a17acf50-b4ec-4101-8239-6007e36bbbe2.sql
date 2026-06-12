
ALTER TABLE public.member_kpis 
  ADD COLUMN IF NOT EXISTS follow_up_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crm_hygiene_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls_per_week numeric DEFAULT 0;
