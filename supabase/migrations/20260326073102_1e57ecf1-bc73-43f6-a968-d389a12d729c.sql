
-- Auto-log events on lead stage changes for webhook dispatch
CREATE OR REPLACE FUNCTION public.log_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_name text;
BEGIN
  IF OLD.stage IS NOT DISTINCT FROM NEW.stage THEN
    RETURN NEW;
  END IF;

  -- Map stage transitions to event names
  CASE NEW.stage
    WHEN 'new' THEN v_event_name := 'new_lead';
    WHEN 'quiz_completed' THEN v_event_name := 'quiz_completed';
    WHEN 'booked' THEN v_event_name := 'booking_created';
    WHEN 'assigned_setter' THEN v_event_name := 'lead_assigned';
    WHEN 'setter_qualified' THEN v_event_name := 'setter_qualified';
    WHEN 'ready_for_closer' THEN v_event_name := 'moved_to_closer';
    WHEN 'assigned_closer' THEN v_event_name := 'lead_assigned';
    WHEN 'offer_made' THEN v_event_name := 'offer_made';
    WHEN 'closed_won' THEN v_event_name := 'purchase_completed';
    WHEN 'closed_lost' THEN v_event_name := 'lead_lost';
    ELSE v_event_name := 'stage_changed';
  END CASE;

  INSERT INTO event_logs (event_name, email, payload, status)
  VALUES (
    v_event_name,
    NEW.email,
    jsonb_build_object(
      'lead_id', NEW.id,
      'lead_name', NEW.name,
      'previous_stage', OLD.stage,
      'new_stage', NEW.stage,
      'lead_level', NEW.lead_level,
      'setter_id', NEW.setter_id,
      'closer_id', NEW.closer_id,
      'deal_value', NEW.deal_value,
      'source', NEW.source
    ),
    'received'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_lead_event
  AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lead_event();
