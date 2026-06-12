
-- 1. STATE MACHINE: Define allowed transitions and validate on UPDATE
CREATE OR REPLACE FUNCTION public.validate_lead_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  allowed text[];
BEGIN
  -- Only validate when stage actually changes
  IF OLD.stage = NEW.stage THEN
    RETURN NEW;
  END IF;

  -- Define allowed transition map
  CASE OLD.stage
    WHEN 'new' THEN allowed := ARRAY['quiz_completed', 'booked', 'in_pool', 'assigned_setter', 'cancelled'];
    WHEN 'quiz_completed' THEN allowed := ARRAY['booked', 'in_pool', 'assigned_setter', 'cancelled'];
    WHEN 'booked' THEN allowed := ARRAY['in_pool', 'assigned_setter', 'cancelled'];
    WHEN 'in_pool' THEN allowed := ARRAY['assigned_setter', 'cancelled', 'recycled'];
    WHEN 'assigned_setter' THEN allowed := ARRAY['setter_contacting', 'backlog', 'recycled', 'returned_to_pool', 'cancelled'];
    WHEN 'backlog' THEN allowed := ARRAY['setter_contacting', 'assigned_setter', 'recycled', 'returned_to_pool'];
    WHEN 'setter_contacting' THEN allowed := ARRAY['setter_qualified', 'setter_disqualified', 'recycled', 'returned_to_pool'];
    WHEN 'setter_qualified' THEN allowed := ARRAY['ready_for_closer', 'recycled', 'returned_to_pool'];
    WHEN 'setter_disqualified' THEN allowed := ARRAY['recycled', 'returned_to_pool', 'in_pool'];
    WHEN 'ready_for_closer' THEN allowed := ARRAY['assigned_closer', 'recycled', 'returned_to_pool'];
    WHEN 'assigned_closer' THEN allowed := ARRAY['offer_made', 'closed_lost', 'recycled', 'returned_to_pool'];
    WHEN 'offer_made' THEN allowed := ARRAY['closed_won', 'closed_lost', 'recycled'];
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

  -- Log the rejected transition
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

-- Create the trigger (BEFORE UPDATE so we can reject)
CREATE TRIGGER trg_validate_lead_transition
  BEFORE UPDATE OF stage ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_lead_transition();
