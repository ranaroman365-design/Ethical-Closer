-- Re-apply (idempotent) — previous attempt was reverted.
DROP POLICY IF EXISTS "Applicants see own lead by email" ON public.leads;
CREATE POLICY "Applicants see own lead by email"
ON public.leads
FOR SELECT
TO authenticated
USING (lower(email) = lower((auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS "Applicants see own appointment by lead email" ON public.appointments;
CREATE POLICY "Applicants see own appointment by lead email"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = appointments.lead_id
      AND lower(l.email) = lower((auth.jwt() ->> 'email'))
  )
);