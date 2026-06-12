
-- Fix security definer views by setting them as SECURITY INVOKER
ALTER VIEW public.view_user_promotion_status SET (security_invoker = on);
ALTER VIEW public.view_lead_pipeline_summary SET (security_invoker = on);
ALTER VIEW public.view_director_team_kpis SET (security_invoker = on);
ALTER VIEW public.view_partner_summary SET (security_invoker = on)
