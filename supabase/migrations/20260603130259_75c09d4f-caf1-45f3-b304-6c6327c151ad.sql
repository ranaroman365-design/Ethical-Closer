
ALTER TABLE public.ab_slot_weights
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booking_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hql_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quiz_completed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quiz_started_count integer NOT NULL DEFAULT 0;
