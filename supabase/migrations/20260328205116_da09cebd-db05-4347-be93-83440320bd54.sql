-- 1. Add week_start and total_actions to user_streaks
ALTER TABLE public.user_streaks
  ADD COLUMN IF NOT EXISTS week_start date DEFAULT date_trunc('week', now())::date,
  ADD COLUMN IF NOT EXISTS total_actions int DEFAULT 0;

-- 2. Add chat message status columns to direct_messages
ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS seen_at timestamptz;

-- Add constraint via trigger (CHECK constraints cannot be added IF NOT EXISTS safely)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'direct_messages_status_check'
  ) THEN
    ALTER TABLE public.direct_messages
      ADD CONSTRAINT direct_messages_status_check
      CHECK (status IN ('sent', 'delivered', 'seen'));
  END IF;
END $$;

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_dm_status ON public.direct_messages (status);