ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reschedule_at timestamptz;