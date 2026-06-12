-- =====================================================================
-- SOP Lead Recovery & Conversion Protocol — P1 state hygiene (Layer 47)
-- Surgical: adds 3 SECURITY DEFINER triggers that emit canonical
-- conversion_state transitions automatically. No new tables. No new sends.
-- =====================================================================

-- Helper: safe whitelist-checked transition. Returns true on success.
CREATE OR REPLACE FUNCTION public.sop_apply_transition(
  p_lead_id uuid,
  p_event   text,
  p_meta    jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from   text;
  v_to     text;
BEGIN
  IF p_lead_id IS NULL THEN RETURN false; END IF;

  SELECT conversion_state::text INTO v_from
  FROM public.leads WHERE id = p_lead_id;

  IF v_from IS NULL THEN v_from := 'new_lead'; END IF;

  SELECT to_state INTO v_to
  FROM public.canonical_state_transitions
  WHERE from_state = v_from AND event = p_event;

  IF v_to IS NULL THEN
    -- Not a valid transition from current state — silently no-op.
    RETURN false;
  END IF;

  UPDATE public.leads
     SET conversion_state = v_to::conversion_state,
         updated_at = now()
   WHERE id = p_lead_id;

  -- log trigger trg_lead_conversion_state_change already audits state change,
  -- but it logs event='state_change'. Append explicit canonical event row.
  INSERT INTO public.lead_state_log (lead_id, from_state, to_state, event, metadata)
  VALUES (p_lead_id, v_from::conversion_state, v_to::conversion_state, p_event, p_meta);

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------
-- P1.a — Auto NEW_LEAD → CONTACTED on first outbound (any channel).
-- Trigger fires after a successful dispatch row lands for the lead.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sop_trg_dispatch_marks_contacted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('sent','delivered','queued') THEN RETURN NEW; END IF;

  -- Only fire when the lead is still in new_lead (whitelist makes this a no-op otherwise).
  PERFORM public.sop_apply_transition(
    NEW.lead_id,
    'first_contact_sent',
    jsonb_build_object(
      'source','communication_dispatch_log',
      'dispatch_id', NEW.id,
      'channel', NEW.primary_channel,
      'event_key', NEW.event_key
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sop_dispatch_marks_contacted ON public.communication_dispatch_log;
CREATE TRIGGER trg_sop_dispatch_marks_contacted
AFTER INSERT ON public.communication_dispatch_log
FOR EACH ROW EXECUTE FUNCTION public.sop_trg_dispatch_marks_contacted();

-- ---------------------------------------------------------------------
-- P1.b — Auto → PRE_CALL_PENDING on appointment creation.
-- Walks engaged→booked→pre_call_pending if needed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sop_trg_appointment_advances_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.appointment_status NOT IN ('booked','rescheduled') THEN RETURN NEW; END IF;

  SELECT conversion_state::text INTO v_state FROM public.leads WHERE id = NEW.lead_id;
  v_state := COALESCE(v_state, 'new_lead');

  -- Walk forward: new_lead/contacted → engaged via lead_replied is wrong here;
  -- booking implies replied + booked. Force-set engaged when in new_lead/contacted
  -- (direct update, bypasses whitelist since it's pre-booking inference).
  IF v_state IN ('new_lead','contacted') THEN
    UPDATE public.leads SET conversion_state = 'engaged'::conversion_state WHERE id = NEW.lead_id;
    INSERT INTO public.lead_state_log (lead_id, from_state, to_state, event, metadata)
    VALUES (NEW.lead_id, v_state::conversion_state, 'engaged'::conversion_state,
            'lead_replied', jsonb_build_object('source','appointment_inferred','appointment_id', NEW.id));
    v_state := 'engaged';
  END IF;

  IF v_state = 'engaged' THEN
    PERFORM public.sop_apply_transition(NEW.lead_id, 'appointment_booked',
      jsonb_build_object('appointment_id', NEW.id, 'source','appointments_insert'));
    v_state := 'booked';
  END IF;

  IF v_state = 'booked' THEN
    PERFORM public.sop_apply_transition(NEW.lead_id, 'appointment_booked',
      jsonb_build_object('appointment_id', NEW.id, 'source','appointments_insert_phase2'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sop_appointment_advances_state ON public.appointments;
CREATE TRIGGER trg_sop_appointment_advances_state
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.sop_trg_appointment_advances_state();

-- ---------------------------------------------------------------------
-- P1.c — PRE_CALL_PENDING → PRE_CALL_COMPLETED when whatsapp_confirmed
-- flips true (= lead replied to pre-call confirmation).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sop_trg_lead_precall_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.whatsapp_confirmed, false) = false
     AND COALESCE(NEW.whatsapp_confirmed, false) = true
  THEN
    PERFORM public.sop_apply_transition(NEW.id, 'pre_call_answer_submitted',
      jsonb_build_object('source','whatsapp_confirmed_trigger'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sop_lead_precall_completed ON public.leads;
CREATE TRIGGER trg_sop_lead_precall_completed
AFTER UPDATE OF whatsapp_confirmed ON public.leads
FOR EACH ROW
WHEN (OLD.whatsapp_confirmed IS DISTINCT FROM NEW.whatsapp_confirmed)
EXECUTE FUNCTION public.sop_trg_lead_precall_completed();

COMMENT ON FUNCTION public.sop_apply_transition IS
  'SOP Lead Recovery & Conversion Protocol — canonical, whitelist-checked transition helper used by P1 triggers.';
COMMENT ON FUNCTION public.sop_trg_dispatch_marks_contacted IS
  'P1.a: first outbound dispatch promotes new_lead → contacted (first_contact_sent).';
COMMENT ON FUNCTION public.sop_trg_appointment_advances_state IS
  'P1.b: appointment insert advances lead to pre_call_pending (walks via engaged/booked when needed).';
COMMENT ON FUNCTION public.sop_trg_lead_precall_completed IS
  'P1.c: lead.whatsapp_confirmed=true promotes pre_call_pending → pre_call_completed.';