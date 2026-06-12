
-- Fix overly permissive INSERT policy on event_logs
DROP POLICY IF EXISTS "System insert event logs" ON public.event_logs;

CREATE POLICY "Authenticated insert event logs" ON public.event_logs
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
