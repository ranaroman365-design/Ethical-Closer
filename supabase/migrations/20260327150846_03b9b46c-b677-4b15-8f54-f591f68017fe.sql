
-- Fix search_path warnings on new functions
ALTER FUNCTION public.generate_revenue_forecast(uuid, uuid, text) SET search_path = 'public';
