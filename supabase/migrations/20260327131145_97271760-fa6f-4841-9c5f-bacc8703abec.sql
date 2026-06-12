
-- 1. Add ghl_contact_id to profiles for bidirectional ID mapping
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ghl_contact_id text UNIQUE;

-- 2. Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_ghl_contact_id ON public.profiles(ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;

-- 3. Add user-level outbound event trigger for profile changes (business_stage, member_status)
CREATE OR REPLACE FUNCTION public.queue_user_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event_name text;
  v_ghl_contact_id text;
BEGIN
  -- Get ghl_contact_id
  v_ghl_contact_id := NEW.ghl_contact_id;

  -- Detect relevant changes
  IF OLD.business_stage IS DISTINCT FROM NEW.business_stage THEN
    v_event_name := 'user_stage_changed';
  ELSIF OLD.member_status IS DISTINCT FROM NEW.member_status THEN
    v_event_name := 'user_status_changed';
  ELSIF OLD.placement_ready IS DISTINCT FROM NEW.placement_ready AND NEW.placement_ready = true THEN
    v_event_name := 'placement_ready';
  ELSIF OLD.certified IS DISTINCT FROM NEW.certified AND NEW.certified = true THEN
    v_event_name := 'user_certified';
  ELSIF OLD.onboarding_completed IS DISTINCT FROM NEW.onboarding_completed AND NEW.onboarding_completed = true THEN
    v_event_name := 'onboarding_completed';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO outbound_events (event_name, entity_type, entity_id, email, payload)
  VALUES (
    v_event_name,
    'user',
    NEW.id,
    NEW.email,
    jsonb_build_object(
      'event_name', v_event_name,
      'user_id', NEW.id,
      'ghl_contact_id', v_ghl_contact_id,
      'email', NEW.email,
      'full_name', NEW.full_name,
      'timestamp', now(),
      'metadata', jsonb_build_object(
        'business_stage', NEW.business_stage,
        'member_status', NEW.member_status,
        'current_phase', NEW.current_phase,
        'placement_ready', NEW.placement_ready,
        'certified', NEW.certified,
        'previous_business_stage', OLD.business_stage,
        'previous_member_status', OLD.member_status
      )
    )
  );

  RETURN NEW;
END;
$function$;

-- 4. Attach user event trigger to profiles
DROP TRIGGER IF EXISTS trg_queue_user_event ON public.profiles;
CREATE TRIGGER trg_queue_user_event
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_user_event();

-- 5. Add module completion event trigger
CREATE OR REPLACE FUNCTION public.queue_progress_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_ghl_id text;
  v_module_title text;
BEGIN
  IF NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    SELECT p.email, p.ghl_contact_id INTO v_email, v_ghl_id
    FROM profiles p WHERE p.id = NEW.user_id;

    SELECT m.title INTO v_module_title FROM modules m WHERE m.id = NEW.module_id;

    INSERT INTO outbound_events (event_name, entity_type, entity_id, email, payload)
    VALUES (
      'module_completed',
      'user',
      NEW.user_id,
      v_email,
      jsonb_build_object(
        'event_name', 'module_completed',
        'user_id', NEW.user_id,
        'ghl_contact_id', v_ghl_id,
        'email', v_email,
        'timestamp', now(),
        'metadata', jsonb_build_object(
          'module_id', NEW.module_id,
          'module_title', v_module_title
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_queue_progress_event ON public.member_progress;
CREATE TRIGGER trg_queue_progress_event
  AFTER UPDATE ON public.member_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_progress_event();

-- 6. Enhance existing lead event trigger to include ghl_contact_id
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
  IF OLD.stage IS NOT DISTINCT FROM NEW.stage THEN
    RETURN NEW;
  END IF;

  CASE NEW.stage
    WHEN 'new' THEN v_event_name := 'new_lead';
    WHEN 'quiz_completed' THEN v_event_name := 'quiz_completed';
    WHEN 'booked' THEN v_event_name := 'booking_created';
    WHEN 'assigned_setter' THEN v_event_name := 'lead_assigned';
    WHEN 'setter_contacting' THEN v_event_name := 'setter_contacting';
    WHEN 'setter_qualified' THEN v_event_name := 'setter_qualified';
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
