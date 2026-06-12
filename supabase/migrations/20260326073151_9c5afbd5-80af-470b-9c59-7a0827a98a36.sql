
-- Update state machine to include ALL stages used by UI
CREATE OR REPLACE FUNCTION public.validate_lead_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  allowed text[];
BEGIN
  IF OLD.stage = NEW.stage THEN
    RETURN NEW;
  END IF;

  CASE OLD.stage
    WHEN 'new' THEN allowed := ARRAY['quiz_completed', 'booked', 'in_pool', 'assigned_setter', 'cancelled'];
    WHEN 'quiz_completed' THEN allowed := ARRAY['booked', 'in_pool', 'assigned_setter', 'cancelled'];
    WHEN 'booked' THEN allowed := ARRAY['in_pool', 'assigned_setter', 'cancelled'];
    WHEN 'in_pool' THEN allowed := ARRAY['assigned_setter', 'cancelled', 'recycled'];
    WHEN 'assigned_setter' THEN allowed := ARRAY['setter_contacting', 'setter_attempting', 'backlog', 'recycled', 'returned_to_pool', 'cancelled'];
    WHEN 'backlog' THEN allowed := ARRAY['setter_contacting', 'setter_attempting', 'assigned_setter', 'recycled', 'returned_to_pool'];
    WHEN 'setter_contacting' THEN allowed := ARRAY['setter_qualified', 'setter_disqualified', 'setter_no_response', 'recycled', 'returned_to_pool'];
    WHEN 'setter_attempting' THEN allowed := ARRAY['setter_qualified', 'setter_no_response', 'setter_disqualified', 'recycled', 'returned_to_pool'];
    WHEN 'setter_no_response' THEN allowed := ARRAY['setter_attempting', 'setter_contacting', 'recycled', 'returned_to_pool'];
    WHEN 'setter_qualified' THEN allowed := ARRAY['setter_booked', 'ready_for_closer', 'recycled', 'returned_to_pool'];
    WHEN 'setter_booked' THEN allowed := ARRAY['ready_for_closer', 'recycled', 'returned_to_pool'];
    WHEN 'setter_disqualified' THEN allowed := ARRAY['recycled', 'returned_to_pool', 'in_pool'];
    WHEN 'ready_for_closer' THEN allowed := ARRAY['assigned_closer', 'recycled', 'returned_to_pool'];
    WHEN 'assigned_closer' THEN allowed := ARRAY['closer_in_progress', 'offer_made', 'closed_lost', 'recycled', 'returned_to_pool'];
    WHEN 'closer_in_progress' THEN allowed := ARRAY['offer_made', 'follow_up', 'closed_won', 'closed_lost', 'recycled'];
    WHEN 'offer_made' THEN allowed := ARRAY['closed_won', 'closed_lost', 'follow_up', 'recycled'];
    WHEN 'follow_up' THEN allowed := ARRAY['closer_in_progress', 'offer_made', 'closed_won', 'closed_lost', 'recycled'];
    WHEN 'closed_won' THEN allowed := ARRAY['converted_to_L1', 'cancelled'];
    WHEN 'closed_lost' THEN allowed := ARRAY['recycled', 'in_pool', 'returned_to_pool'];
    WHEN 'recycled' THEN allowed := ARRAY['in_pool', 'new'];
    WHEN 'returned_to_pool' THEN allowed := ARRAY['in_pool', 'assigned_setter', 'new'];
    WHEN 'converted_to_L1' THEN allowed := ARRAY[]::text[];
    WHEN 'cancelled' THEN allowed := ARRAY['new', 'in_pool'];
    ELSE allowed := ARRAY[]::text[];
  END CASE;

  IF NEW.stage = ANY(allowed) THEN
    RETURN NEW;
  END IF;

  INSERT INTO audit_logs (action, source_type, note, before_state, after_state)
  VALUES (
    'invalid_transition_rejected',
    'system',
    format('Rejected: %s → %s for lead %s', OLD.stage, NEW.stage, OLD.id),
    jsonb_build_object('stage', OLD.stage, 'lead_id', OLD.id),
    jsonb_build_object('attempted_stage', NEW.stage)
  );

  RAISE EXCEPTION 'Invalid lead transition: % → % is not allowed', OLD.stage, NEW.stage;
END;
$$;
