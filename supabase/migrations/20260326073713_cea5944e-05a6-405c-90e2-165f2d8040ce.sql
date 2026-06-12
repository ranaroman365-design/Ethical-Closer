
-- Outbound events queue for GHL sync
CREATE TABLE IF NOT EXISTS public.outbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  event_name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'lead',
  entity_id uuid,
  email text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  destination text NOT NULL DEFAULT 'ghl',
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.outbound_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage outbound events" ON public.outbound_events
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_outbound_events_status ON public.outbound_events (status);
CREATE INDEX idx_outbound_events_created ON public.outbound_events (created_at DESC);

-- Trigger: auto-queue outbound events on lead stage changes
CREATE OR REPLACE FUNCTION public.queue_outbound_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_name text;
  v_user_state text;
BEGIN
  IF OLD.stage IS NOT DISTINCT FROM NEW.stage THEN
    RETURN NEW;
  END IF;

  CASE NEW.stage
    WHEN 'new' THEN v_event_name := 'new_lead';
    WHEN 'quiz_completed' THEN v_event_name := 'quiz_completed';
    WHEN 'booked' THEN v_event_name := 'booking_created';
    WHEN 'assigned_setter' THEN v_event_name := 'lead_assigned';
    WHEN 'setter_qualified' THEN v_event_name := 'setter_qualified';
    WHEN 'ready_for_closer' THEN v_event_name := 'moved_to_closer';
    WHEN 'assigned_closer' THEN v_event_name := 'lead_assigned';
    WHEN 'closed_won' THEN v_event_name := 'purchase_completed';
    WHEN 'offer_made' THEN v_event_name := 'offer_made';
    ELSE RETURN NEW; -- skip non-critical stages
  END CASE;

  -- Determine user state
  IF NEW.closer_id IS NOT NULL THEN v_user_state := 'closer';
  ELSIF NEW.setter_id IS NOT NULL THEN v_user_state := 'setter';
  ELSE v_user_state := 'applicant';
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
      'intent_level', CASE WHEN NEW.quiz_score >= 70 THEN 'high' WHEN NEW.quiz_score >= 40 THEN 'medium' ELSE 'low' END,
      'engagement_level', CASE WHEN NEW.contact_count >= 3 THEN 'high' WHEN NEW.contact_count >= 1 THEN 'medium' ELSE 'low' END,
      'last_action', v_event_name,
      'last_action_date', now()::date,
      'metadata', jsonb_build_object(
        'lead_id', NEW.id,
        'lead_name', NEW.name,
        'setter_id', NEW.setter_id,
        'closer_id', NEW.closer_id,
        'deal_value', NEW.deal_value,
        'lead_level', NEW.lead_level
      )
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_outbound_event
  AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_outbound_event();
