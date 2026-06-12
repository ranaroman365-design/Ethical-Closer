ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS close_reason text,
  ADD COLUMN IF NOT EXISTS follow_up_date timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;