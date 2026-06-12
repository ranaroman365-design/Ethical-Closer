ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_unlock_seen_level INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.last_unlock_seen_level IS 'Highest level for which the user has seen the LevelUnlockModal. Used to trigger the unlock experience exactly once per level.';