-- ============================================================================
-- L6+ Senior Closer: read-only global appointment + lead visibility
-- ROOT CAUSE of "forbidden": team-subtree empty (no director_id links).
-- DECISION: L6+ = operator level → read-only global scope per user spec.
-- Booking / write logic untouched.
-- ============================================================================

DROP POLICY IF EXISTS "L6+ read all appointments" ON public.appointments;
CREATE POLICY "L6+ read all appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (public.is_operator_l6plus(auth.uid()));

DROP POLICY IF EXISTS "L6+ read all leads" ON public.leads;
CREATE POLICY "L6+ read all leads"
ON public.leads
FOR SELECT
TO authenticated
USING (public.is_operator_l6plus(auth.uid()));
