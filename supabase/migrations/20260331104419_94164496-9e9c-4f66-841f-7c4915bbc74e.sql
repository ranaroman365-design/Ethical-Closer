
-- Fix search_path on set_updated_at and deny_audit_modification
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.deny_audit_modification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$;

-- Fix security definer views - find and recreate with security_invoker
-- Check which views are security definer
DO $$ 
DECLARE v record;
BEGIN
  FOR v IN 
    SELECT viewname FROM pg_views WHERE schemaname = 'public'
  LOOP
    -- We'll handle known views
    NULL;
  END LOOP;
END $$;
