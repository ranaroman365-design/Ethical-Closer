
-- Add unique constraint for upsert in evaluate-thresholds
ALTER TABLE public.user_threshold_states ADD CONSTRAINT uq_user_threshold UNIQUE (user_id, threshold_id);
