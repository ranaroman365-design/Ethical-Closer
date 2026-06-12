-- Temporary launch-blocker operability policies.
-- RLS remains enabled; these policies relax access for authenticated users only.

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TEMP launch authenticated appointment access" ON public.appointments;
CREATE POLICY "TEMP launch authenticated appointment access"
ON public.appointments
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "TEMP launch authenticated lead access" ON public.leads;
CREATE POLICY "TEMP launch authenticated lead access"
ON public.leads
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "TEMP launch authenticated quiz attempts access" ON public.quiz_attempts;
CREATE POLICY "TEMP launch authenticated quiz attempts access"
ON public.quiz_attempts
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "TEMP launch authenticated quiz submissions access" ON public.quiz_submissions;
CREATE POLICY "TEMP launch authenticated quiz submissions access"
ON public.quiz_submissions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);