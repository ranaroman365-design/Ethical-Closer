
-- Update event logger to handle all stages
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

  CASE NEW.stage
    WHEN 'new' THEN v_event_name := 'new_lead';
    WHEN 'quiz_completed' THEN v_event_name := 'quiz_completed';
    WHEN 'booked' THEN v_event_name := 'booking_created';
    WHEN 'assigned_setter' THEN v_event_name := 'lead_assigned';
    WHEN 'setter_attempting' THEN v_event_name := 'setter_contacting';
    WHEN 'setter_contacting' THEN v_event_name := 'setter_contacting';
    WHEN 'setter_qualified' THEN v_event_name := 'setter_qualified';
    WHEN 'setter_booked' THEN v_event_name := 'call_booked';
    WHEN 'ready_for_closer' THEN v_event_name := 'moved_to_closer';
    WHEN 'assigned_closer' THEN v_event_name := 'lead_assigned';
    WHEN 'closer_in_progress' THEN v_event_name := 'closer_started';
    WHEN 'offer_made' THEN v_event_name := 'offer_made';
    WHEN 'follow_up' THEN v_event_name := 'follow_up_scheduled';
    WHEN 'closed_won' THEN v_event_name := 'purchase_completed';
    WHEN 'closed_lost' THEN v_event_name := 'lead_lost';
    WHEN 'converted_to_L1' THEN v_event_name := 'converted_to_L1';
    WHEN 'recycled' THEN v_event_name := 'lead_recycled';
    WHEN 'returned_to_pool' THEN v_event_name := 'lead_returned';
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
