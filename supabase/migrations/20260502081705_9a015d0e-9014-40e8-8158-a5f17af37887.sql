-- 1. Create conversion_state enum
CREATE TYPE public.conversion_state AS ENUM (
  'new_lead', 'contacted', 'engaged', 'booked',
  'pre_call_pending', 'pre_call_completed',
  'showed', 'closed_won', 'closed_lost',
  'no_show', 'recovery_active', 'rebooked', 'second_no_show',
  'unresponsive', 'exit'
);

-- 2. Add conversion_state + pre-call + recovery columns to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS conversion_state public.conversion_state NOT NULL DEFAULT 'new_lead',
  ADD COLUMN IF NOT EXISTS pre_call_link_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS pre_call_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pre_call_answers jsonb,
  ADD COLUMN IF NOT EXISTS recovery_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_message_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rebooked_at timestamptz;

-- 3. Create lead_state_log (immutable audit trail)
CREATE TABLE public.lead_state_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_state public.conversion_state,
  to_state public.conversion_state NOT NULL,
  event text NOT NULL,
  triggered_by uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_state_log_lead ON public.lead_state_log(lead_id, created_at DESC);
CREATE INDEX idx_lead_state_log_event ON public.lead_state_log(event, created_at DESC);

-- 4. RLS for lead_state_log
ALTER TABLE public.lead_state_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view state logs"
  ON public.lead_state_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert state logs"
  ON public.lead_state_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5. Backfill conversion_state from legacy stage
UPDATE public.leads SET conversion_state = CASE stage
  WHEN 'new' THEN 'new_lead'::public.conversion_state
  WHEN 'assigned_setter' THEN 'contacted'::public.conversion_state
  WHEN 'qualified' THEN 'engaged'::public.conversion_state
  WHEN 'booked' THEN 'booked'::public.conversion_state
  WHEN 'showed' THEN 'showed'::public.conversion_state
  WHEN 'offer' THEN 'showed'::public.conversion_state
  WHEN 'won' THEN 'closed_won'::public.conversion_state
  WHEN 'closed_won' THEN 'closed_won'::public.conversion_state
  WHEN 'started' THEN 'closed_won'::public.conversion_state
  WHEN 'returned_to_pool' THEN 'unresponsive'::public.conversion_state
  ELSE 'new_lead'::public.conversion_state
END
WHERE conversion_state = 'new_lead' AND stage IS NOT NULL AND stage != 'new';

-- 6. Trigger: auto-log state transitions
CREATE OR REPLACE FUNCTION public.log_conversion_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.conversion_state IS DISTINCT FROM NEW.conversion_state THEN
    INSERT INTO public.lead_state_log (lead_id, from_state, to_state, event, triggered_by)
    VALUES (
      NEW.id,
      OLD.conversion_state,
      NEW.conversion_state,
      'state_change',
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_conversion_state_change
  AFTER UPDATE OF conversion_state ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_conversion_state_change();