
-- Add win_reasons and AI fields to call_outcomes
ALTER TABLE public.call_outcomes
  ADD COLUMN IF NOT EXISTS win_reasons text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_suggested_loss_reason text,
  ADD COLUMN IF NOT EXISTS ai_suggested_win_reasons text[],
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_suggestion_accepted boolean;

-- Update lost_reason to support the expanded MECE set (no schema change needed, values are text)
-- Add index for dashboard aggregation queries
CREATE INDEX IF NOT EXISTS idx_call_outcomes_outcome ON public.call_outcomes (outcome);
CREATE INDEX IF NOT EXISTS idx_call_outcomes_user_date ON public.call_outcomes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_outcomes_lost_reason ON public.call_outcomes (lost_reason) WHERE lost_reason IS NOT NULL;
