
-- Fix search_path on new functions
ALTER FUNCTION public.recalc_kpis_from_call() SET search_path TO 'public';
ALTER FUNCTION public.validate_call_lifecycle() SET search_path TO 'public';
