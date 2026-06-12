
CREATE OR REPLACE FUNCTION public.queue_outbound_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_name text;
  v_user_state text;
  v_ghl_setter text;
  v_ghl_closer text;
BEGIN
  -- Guard: skip if stage unchanged
  IF OLD.stage IS NOT DISTINCT FROM NEW.stage THEN
    RETURN NEW;
  END IF;

  -- Guard: skip if email is NULL (prevents silent CRM failures)
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.stage
    WHEN 'new' THEN v_event_name := 'new_lead';
    WHEN 'quiz_completed' THEN v_event_name := 'quiz_completed';
    WHEN 'booked' THEN v_event_name := 'booking_created';
    WHEN 'assigned_setter' THEN v_event_name := 'lead_assigned';
    WHEN 'setter_contacting' THEN v_event_name := 'setter_contacting';
    WHEN 'setter_qualified' THEN v_event_name := 'setter_qualified';
    WHEN 'setter_disqualified' THEN v_event_name := 'setter_disqualified';
    WHEN 'setter_booked' THEN v_event_name := 'call_booked';
    WHEN 'ready_for_closer' THEN v_event_name := 'moved_to_closer';
    WHEN 'assigned_closer' THEN v_event_name := 'lead_assigned_closer';
    WHEN 'closer_in_progress' THEN v_event_name := 'closer_started';
    WHEN 'offer_made' THEN v_event_name := 'offer_presented';
    WHEN 'follow_up' THEN v_event_name := 'follow_up_scheduled';
    WHEN 'closed_won' THEN v_event_name := 'deal_won';
    WHEN 'closed_lost' THEN v_event_name := 'deal_lost';
    WHEN 'converted_to_L1' THEN v_event_name := 'converted_to_L1';
    WHEN 'recycled' THEN v_event_name := 'lead_recycled';
    WHEN 'returned_to_pool' THEN v_event_name := 'lead_returned';
    WHEN 'cancelled' THEN v_event_name := 'lead_cancelled';
    ELSE v_event_name := 'stage_changed';
  END CASE;

  -- Determine user state
  IF NEW.closer_id IS NOT NULL THEN v_user_state := 'closer';
  ELSIF NEW.setter_id IS NOT NULL THEN v_user_state := 'setter';
  ELSE v_user_state := 'applicant';
  END IF;

  -- Get GHL contact IDs for setter/closer
  IF NEW.setter_id IS NOT NULL THEN
    SELECT ghl_contact_id INTO v_ghl_setter FROM profiles WHERE id = NEW.setter_id;
  END IF;
  IF NEW.closer_id IS NOT NULL THEN
    SELECT ghl_contact_id INTO v_ghl_closer FROM profiles WHERE id = NEW.closer_id;
  END IF;

  INSERT INTO outbound_events (event_name, entity_type, entity_id, email, payload)
  VALUES (
    v_event_name,
    'lead',
    NEW.id,
    NEW.email,
    jsonb_build_object(
      'event_name', v_event_name,
      'email', NEW.email,
      'timestamp', now(),
      'product_type', 'etc',
      'organization_id', 'etc_main',
      'user_state', v_user_state,
      'previous_stage', OLD.stage,
      'new_stage', NEW.stage,
      'intent_level', CASE WHEN NEW.quiz_score >= 70 THEN 'high' WHEN NEW.quiz_score >= 40 THEN 'medium' ELSE 'low' END,
      'engagement_level', CASE WHEN NEW.contact_count >= 3 THEN 'high' WHEN NEW.contact_count >= 1 THEN 'medium' ELSE 'low' END,
      'metadata', jsonb_build_object(
        'lead_id', NEW.id,
        'lead_name', NEW.name,
        'lead_level', NEW.lead_level,
        'setter_id', NEW.setter_id,
        'closer_id', NEW.closer_id,
        'ghl_setter_id', v_ghl_setter,
        'ghl_closer_id', v_ghl_closer,
        'deal_value', NEW.deal_value,
        'source', NEW.source,
        'quiz_score', NEW.quiz_score,
        'quiz_result', NEW.quiz_result,
        'contact_count', NEW.contact_count
      )
    )
  );

  RETURN NEW;
END;
$function$;
