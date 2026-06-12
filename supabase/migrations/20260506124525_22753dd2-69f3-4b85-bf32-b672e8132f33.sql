
-- Fix views to use SECURITY INVOKER (respects caller's RLS)
DROP VIEW IF EXISTS public.active_appointments;
CREATE VIEW public.active_appointments
WITH (security_invoker = true)
AS
SELECT a.*
FROM appointments a
LEFT JOIN leads l ON l.id = a.lead_id
WHERE a.appointment_status NOT IN ('cancelled', 'reassigned', 'blocked')
  AND COALESCE(l.is_test_lead, false) = false;

DROP VIEW IF EXISTS public.real_leads;
CREATE VIEW public.real_leads
WITH (security_invoker = true)
AS
SELECT *
FROM leads
WHERE is_test_lead = false
  AND COALESCE(is_simulation, false) = false;
