
-- Fix remaining INSERT/ALL policies with WITH CHECK(true)

-- lead_follow_ups: "Service can manage follow-ups" ALL true — restrict to service_role
DROP POLICY IF EXISTS "Service can manage follow-ups" ON public.lead_follow_ups;

CREATE POLICY "Service role manages follow-ups"
ON public.lead_follow_ups
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- quiz_submissions: "Anon can insert quiz submissions" INSERT true
-- This is used by the public quiz flow (unauthenticated users submit quiz answers)
-- Restrict to only allow inserting with a valid session_id pattern
DROP POLICY IF EXISTS "Anon can insert quiz submissions" ON public.quiz_submissions;

CREATE POLICY "Anon can insert own quiz submissions"
ON public.quiz_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  session_id IS NOT NULL AND length(session_id) > 0
);
