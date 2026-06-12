
-- Canonical state transitions whitelist (materialized for DB-level validation)
CREATE TABLE IF NOT EXISTS public.canonical_state_transitions (
  from_state text NOT NULL,
  to_state text NOT NULL,
  event text NOT NULL,
  PRIMARY KEY (from_state, event)
);

-- Populate from the canonical state machine definition
INSERT INTO public.canonical_state_transitions (from_state, to_state, event) VALUES
  ('new_lead', 'contacted', 'first_contact_sent'),
  ('contacted', 'engaged', 'lead_replied'),
  ('engaged', 'booked', 'appointment_booked'),
  ('engaged', 'unresponsive', 'lead_exited'),
  ('booked', 'pre_call_pending', 'appointment_booked'),
  ('pre_call_pending', 'pre_call_completed', 'pre_call_answer_submitted'),
  ('pre_call_pending', 'showed', 'call_showed'),
  ('pre_call_pending', 'no_show', 'call_no_show'),
  ('pre_call_completed', 'showed', 'call_showed'),
  ('pre_call_completed', 'no_show', 'call_no_show'),
  ('showed', 'closed_won', 'call_closed_won'),
  ('showed', 'closed_lost', 'call_closed_lost'),
  ('closed_lost', 'exit', 'lead_exited'),
  ('no_show', 'recovery_active', 'recovery_started'),
  ('recovery_active', 'rebooked', 'rebooked'),
  ('recovery_active', 'second_no_show', 'call_no_show'),
  ('recovery_active', 'exit', 'lead_exited'),
  ('rebooked', 'showed', 'call_showed'),
  ('rebooked', 'second_no_show', 'call_no_show'),
  ('second_no_show', 'exit', 'lead_exited'),
  ('unresponsive', 'exit', 'lead_exited')
ON CONFLICT (from_state, event) DO NOTHING;

-- RPC to detect state violations with details
CREATE OR REPLACE FUNCTION public.detect_state_violations(p_window_hours int DEFAULT 24)
RETURNS TABLE(
  log_id uuid,
  lead_id uuid,
  from_state text,
  to_state text,
  event text,
  triggered_by uuid,
  violation_type text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Type 1: Explicit INVALID_TRANSITION logged by the DB trigger
  SELECT
    l.id AS log_id,
    l.lead_id,
    l.from_state::text,
    l.to_state::text,
    l.event,
    l.triggered_by,
    'explicit_invalid' AS violation_type,
    l.created_at
  FROM lead_state_log l
  WHERE l.created_at >= now() - (p_window_hours || ' hours')::interval
    AND l.event = 'INVALID_TRANSITION'

  UNION ALL

  -- Type 2: Transitions that don't match the canonical whitelist
  SELECT
    l.id AS log_id,
    l.lead_id,
    l.from_state::text,
    l.to_state::text,
    l.event,
    l.triggered_by,
    'non_canonical' AS violation_type,
    l.created_at
  FROM lead_state_log l
  WHERE l.created_at >= now() - (p_window_hours || ' hours')::interval
    AND l.event != 'INVALID_TRANSITION'
    AND l.from_state IS NOT NULL
    AND l.to_state IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM canonical_state_transitions c
      WHERE c.from_state = l.from_state::text
        AND c.to_state = l.to_state::text
        AND c.event = l.event
    )

  ORDER BY created_at DESC
  LIMIT 100;
$$;
