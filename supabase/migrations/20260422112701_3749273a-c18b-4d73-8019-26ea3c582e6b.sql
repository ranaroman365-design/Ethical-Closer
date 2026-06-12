
DROP POLICY IF EXISTS "public_insert_own_commitment" ON public.appointment_commitments;

CREATE POLICY "public_insert_valid_commitment"
  ON public.appointment_commitments FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_commitments.appointment_id
        AND a.lead_id = appointment_commitments.lead_id
        AND a.appointment_status = 'booked'
    )
  );
