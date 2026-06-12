-- Add missing columns to user_streaks to match frontend hook expectations
ALTER TABLE public.user_streaks 
  ADD COLUMN IF NOT EXISTS last_active_date date,
  ADD COLUMN IF NOT EXISTS last_action_type text,
  ADD COLUMN IF NOT EXISTS week_actions jsonb DEFAULT '{}'::jsonb;

-- Migrate existing data from last_activity_date to last_active_date
UPDATE public.user_streaks SET last_active_date = last_activity_date WHERE last_activity_date IS NOT NULL;

-- Fix partner-earnings room: allow all levels that could earn partner income
UPDATE public.rooms SET allowed_stages = ARRAY['opener','setter','senior_associate','junior_manager','manager','senior_manager','director','partner'] WHERE slug = 'partner-earnings';

-- Fix career-path room: allow all levels
UPDATE public.rooms SET allowed_stages = ARRAY['opener','setter','senior_associate','junior_manager','manager','senior_manager','director','partner'] WHERE slug = 'career-path';

-- Fix closer-benefits and build-your-team: align DB with ALWAYS_UNLOCKED frontend logic
UPDATE public.rooms SET allowed_stages = ARRAY['opener','setter','senior_associate','junior_manager','manager','senior_manager','director','partner'] WHERE slug IN ('closer-benefits', 'build-your-team');