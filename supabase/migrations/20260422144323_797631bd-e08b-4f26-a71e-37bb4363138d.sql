ALTER TABLE public.community_user_metrics
ADD COLUMN IF NOT EXISTS last_inactive_nudge_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cum_inactive_nudge_sweep
ON public.community_user_metrics (last_active_at, last_inactive_nudge_at);