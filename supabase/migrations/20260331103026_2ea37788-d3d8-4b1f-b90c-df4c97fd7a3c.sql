
-- Fix permissive INSERT on security_events: restrict to authenticated users only
DROP POLICY IF EXISTS "sec_events_insert" ON public.security_events;
CREATE POLICY "sec_events_insert" ON public.security_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
