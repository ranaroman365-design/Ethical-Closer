
-- Step 1: Add new enum values only
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'security_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ops_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'content_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'partner_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'analyst_readonly';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'automation_service';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ai_agent';
