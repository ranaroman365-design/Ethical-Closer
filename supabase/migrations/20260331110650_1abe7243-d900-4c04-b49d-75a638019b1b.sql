
-- Step 1: Add administrator enum value only
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrator';
