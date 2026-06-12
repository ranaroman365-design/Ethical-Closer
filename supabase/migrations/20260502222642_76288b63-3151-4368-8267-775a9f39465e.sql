
-- 1. Fix event_logs INSERT: allow authenticated + anon
DROP POLICY IF EXISTS "Authenticated insert event logs" ON public.event_logs;

CREATE POLICY "Anyone can insert event logs"
ON public.event_logs
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- 2. Fix capture_lead_attribution overload ambiguity
DROP FUNCTION IF EXISTS public.capture_lead_attribution(text, text, text, text, text, text, text, text, text, text, text);

-- 3. Set operator_unit_id on Daniel's team appointments
UPDATE appointments
SET operator_unit_id = 'a1000000-0000-0000-0000-000000000002'
WHERE operator_unit_id IS NULL
  AND (setter_id IN ('366e7808-35c7-4329-bd36-323f0f58361e','e37a93c6-46d7-4aa3-a581-73bfbe299ce3')
    OR closer_id = '366e7808-35c7-4329-bd36-323f0f58361e');

UPDATE appointments
SET operator_unit_id = 'a1000000-0000-0000-0000-000000000001'
WHERE operator_unit_id IS NULL
  AND (setter_id = '53df5aed-eab8-463a-9cee-0ba6ffa17d4b'
    OR closer_id = '15c91e19-1659-4832-9c43-52fa1ae8b91e');
