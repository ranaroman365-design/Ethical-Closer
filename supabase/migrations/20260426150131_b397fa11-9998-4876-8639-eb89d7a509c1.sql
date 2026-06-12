-- 1. Applicants can read their own lead row (matched by auth email).
CREATE POLICY "Applicants see own lead by email"
ON public.leads
FOR SELECT
TO authenticated
USING (lower(email) = lower((auth.jwt() ->> 'email')));

-- 2. Applicants can read appointments tied to a lead they own (by email match).
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

-- 3. Helper RPC: backfill leads.owner_id when the applicant's auth email matches
-- but owner_id is empty. Idempotent, scoped to the calling user, no-op otherwise.
CREATE OR REPLACE FUNCTION public.backfill_my_lead_ownership()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text := lower(coalesce(auth.jwt() ->> 'email',''));
  updated_count int;
BEGIN
  IF uid IS NULL OR uemail = '' THEN
    RETURN 0;
  END IF;

  UPDATE public.leads
  SET owner_id = uid, updated_at = now()
  WHERE lower(email) = uemail
    AND owner_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_my_lead_ownership() TO authenticated;