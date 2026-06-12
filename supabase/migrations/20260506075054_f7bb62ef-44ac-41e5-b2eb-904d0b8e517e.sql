
-- Fix: drop existing policies before recreating
DROP POLICY IF EXISTS "Authenticated users can view state logs" ON public.lead_state_log;
DROP POLICY IF EXISTS "System can insert state logs" ON public.lead_state_log;

CREATE POLICY "Authenticated users can view state logs"
  ON public.lead_state_log
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert state logs"
  ON public.lead_state_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_lead_state_log_lead_id ON public.lead_state_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_state_log_created ON public.lead_state_log(created_at DESC);
