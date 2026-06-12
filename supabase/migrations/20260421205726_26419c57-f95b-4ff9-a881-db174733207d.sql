-- Backfill any NULL dedup_keys with a synthetic value
UPDATE public.funnel_events_v2
SET dedup_key = 'legacy:' || id::text
WHERE dedup_key IS NULL;

-- Drop the partial index (now superseded)
DROP INDEX IF EXISTS public.uq_funnel_events_v2_dedup_key;

-- Add a real unique constraint
ALTER TABLE public.funnel_events_v2
  ADD CONSTRAINT funnel_events_v2_dedup_key_unique UNIQUE (dedup_key);