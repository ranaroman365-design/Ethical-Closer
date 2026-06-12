
-- 1. Update reassign_appointment to also log to calendar_events
CREATE OR REPLACE FUNCTION public.reassign_appointment(
  p_appointment_id uuid,
  p_new_owner_id uuid,
  p_new_owner_role text,
  p_reassignment_type text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller            uuid := auth.uid();
  v_appt              record;
  v_prev_owner_id     uuid;
  v_prev_owner_role   text;
  v_is_first          boolean;
  v_active_statuses   text[] := ARRAY['booked','confirmed','scheduled','pending_payment'];
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  IF NOT (
    public.user_has_min_level(v_caller, 6)
    OR public.has_role(v_caller, 'admin'::app_role)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden_level_below_l6');
  END IF;

  IF p_new_owner_role NOT IN ('setter','closer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_owner_role');
  END IF;

  IF p_reassignment_type NOT IN ('self_takeover','reassignment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_reassignment_type');
  END IF;

  IF p_reassignment_type = 'self_takeover' AND p_new_owner_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_takeover_must_target_caller');
  END IF;

  IF p_new_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_new_owner');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_new_owner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'new_owner_not_found');
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_found');
  END IF;

  IF NOT (v_appt.appointment_status = ANY(v_active_statuses)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'appointment_not_active',
      'status', v_appt.appointment_status
    );
  END IF;

  v_prev_owner_id   := COALESCE(v_appt.current_owner_id, v_appt.setter_id);
  v_prev_owner_role := COALESCE(v_appt.current_owner_role, 'setter');

  IF v_prev_owner_id = p_new_owner_id AND v_prev_owner_role = p_new_owner_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owner');
  END IF;

  v_is_first := (v_appt.original_owner_id IS NULL);

  UPDATE public.appointments
     SET current_owner_id    = p_new_owner_id,
         current_owner_role  = p_new_owner_role,
         original_owner_id   = COALESCE(original_owner_id, v_prev_owner_id),
         original_owner_role = COALESCE(original_owner_role, v_prev_owner_role),
         setter_id  = CASE WHEN p_new_owner_role = 'setter' THEN p_new_owner_id ELSE setter_id END,
         closer_id  = CASE WHEN p_new_owner_role = 'closer' THEN p_new_owner_id ELSE closer_id END,
         reassigned_at       = now(),
         reassigned_by       = v_caller,
         reassignment_reason = p_reason,
         updated_at          = now()
   WHERE id = p_appointment_id;

  -- Audit log (existing)
  INSERT INTO public.appointment_reassignment_log (
    appointment_id, previous_owner_id, previous_owner_role,
    new_owner_id, new_owner_role, reassignment_type, reason, reassigned_by
  ) VALUES (
    p_appointment_id, v_prev_owner_id, v_prev_owner_role,
    p_new_owner_id, p_new_owner_role, p_reassignment_type, p_reason, v_caller
  );

  -- Log to calendar_events
  INSERT INTO public.calendar_events (
    event_type, appointment_id, lead_id,
    previous_owner_id, new_owner_id, actor_user_id,
    reason, metadata
  ) VALUES (
    'appointment_reassigned', p_appointment_id, v_appt.lead_id,
    v_prev_owner_id, p_new_owner_id, v_caller,
    p_reason,
    jsonb_build_object(
      'previous_owner_role', v_prev_owner_role,
      'new_owner_role', p_new_owner_role,
      'reassignment_type', p_reassignment_type,
      'first_reassignment', v_is_first
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', p_appointment_id,
    'previous_owner_id', v_prev_owner_id,
    'previous_owner_role', v_prev_owner_role,
    'new_owner_id', p_new_owner_id,
    'new_owner_role', p_new_owner_role,
    'first_reassignment', v_is_first,
    'reassigned_at', now()
  );
END;
$$;

-- 2. Drop old overloaded reschedule_appointment(uuid, timestamptz, uuid)
DROP FUNCTION IF EXISTS public.reschedule_appointment(uuid, timestamptz, uuid);

-- 3. Replace canonical reschedule_appointment with slot management + calendar_events logging
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  _old_id uuid,
  _new_starts_at timestamptz,
  _new_ends_at timestamptz,
  _reason text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old public.appointments%ROWTYPE;
  v_new_id uuid;
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_dur interval;
  v_conflict int;
  v_old_date date;
  v_new_date date;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_admin := has_role(v_caller,'admin') OR has_role(v_caller,'owner') OR has_role(v_caller,'ops_admin');

  SELECT * INTO v_old FROM public.appointments WHERE id = _old_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_found');
  END IF;

  -- Permission: must be setter, closer, operator, or admin
  IF NOT v_is_admin
     AND v_old.setter_id IS DISTINCT FROM v_caller
     AND v_old.closer_id IS DISTINCT FROM v_caller
     AND v_old.current_owner_id IS DISTINCT FROM v_caller
     AND v_old.assigned_operator_id IS DISTINCT FROM v_caller
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF v_old.appointment_status IN ('rescheduled','cancelled','expired','superseded','completed','closed_won','closed_lost') THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_already_' || v_old.appointment_status);
  END IF;

  IF _new_starts_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'new_time_in_past');
  END IF;

  -- Duration: use provided end or original duration
  IF _new_ends_at IS NOT NULL AND _new_ends_at > _new_starts_at THEN
    v_dur := _new_ends_at - _new_starts_at;
  ELSE
    v_dur := v_old.ends_at - v_old.starts_at;
  END IF;

  -- Double-booking check (same lead)
  SELECT COUNT(*) INTO v_conflict FROM appointments
  WHERE lead_id = v_old.lead_id AND id <> _old_id
    AND appointment_status NOT IN ('rescheduled','cancelled','expired','superseded','no_show')
    AND starts_at < (_new_starts_at + v_dur) AND ends_at > _new_starts_at;
  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'double_booking');
  END IF;

  -- Operator conflict (closer)
  IF v_old.closer_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict FROM appointments
    WHERE closer_id = v_old.closer_id AND id <> _old_id
      AND appointment_status NOT IN ('rescheduled','cancelled','expired','superseded','no_show')
      AND starts_at < (_new_starts_at + v_dur) AND ends_at > _new_starts_at;
    IF v_conflict > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'operator_conflict');
    END IF;
  END IF;

  -- Operator conflict (setter)
  IF v_old.setter_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict FROM appointments
    WHERE setter_id = v_old.setter_id AND id <> _old_id
      AND appointment_status NOT IN ('rescheduled','cancelled','expired','superseded','no_show')
      AND starts_at < (_new_starts_at + v_dur) AND ends_at > _new_starts_at;
    IF v_conflict > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'operator_conflict');
    END IF;
  END IF;

  -- Create new appointment
  INSERT INTO appointments (
    lead_id, call_type, appointment_status, starts_at, ends_at,
    setter_id, payment_status, booking_source, call_status,
    closer_id, current_owner_id, current_owner_role,
    original_owner_id, original_owner_role,
    assigned_operator_id, booking_timezone, booking_utc_offset,
    rescheduled_from_id, reminders_state,
    origin_source, attribution_snapshot, traffic_owner
  ) VALUES (
    v_old.lead_id, v_old.call_type, 'booked', _new_starts_at, _new_starts_at + v_dur,
    v_old.setter_id, v_old.payment_status, 'reschedule', 'pending',
    v_old.closer_id, v_old.current_owner_id, v_old.current_owner_role,
    v_old.original_owner_id, v_old.original_owner_role,
    v_old.assigned_operator_id,
    COALESCE(v_old.booking_timezone, 'Europe/Berlin'),
    COALESCE(v_old.booking_utc_offset, '+02:00'),
    _old_id, '{}'::jsonb,
    v_old.origin_source, v_old.attribution_snapshot, v_old.traffic_owner
  ) RETURNING id INTO v_new_id;

  -- Update old appointment
  UPDATE appointments SET
    appointment_status = 'rescheduled',
    rescheduled_to_id = v_new_id,
    rescheduled_at = now(),
    rescheduled_by = v_caller,
    updated_at = now()
  WHERE id = _old_id;

  -- Slot management: free old slot, occupy new slot
  v_old_date := (v_old.starts_at AT TIME ZONE COALESCE(v_old.booking_timezone, 'Europe/Berlin'))::date;
  v_new_date := (_new_starts_at AT TIME ZONE COALESCE(v_old.booking_timezone, 'Europe/Berlin'))::date;

  UPDATE availability_slots
    SET current_bookings = GREATEST(current_bookings - 1, 0), updated_at = now()
    WHERE date = v_old_date AND is_active = true;

  UPDATE availability_slots
    SET current_bookings = current_bookings + 1, updated_at = now()
    WHERE date = v_new_date AND is_active = true;

  -- Log to calendar_events
  INSERT INTO public.calendar_events (
    event_type, appointment_id, lead_id,
    previous_owner_id, new_owner_id, actor_user_id,
    reason, metadata
  ) VALUES (
    'appointment_rescheduled', v_new_id, v_old.lead_id,
    NULL, NULL, v_caller,
    _reason,
    jsonb_build_object(
      'old_appointment_id', _old_id,
      'old_starts_at', v_old.starts_at,
      'new_starts_at', _new_starts_at,
      'new_ends_at', _new_starts_at + v_dur
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_appointment_id', v_new_id,
    'old_appointment_id', _old_id,
    'new_starts_at', _new_starts_at,
    'new_ends_at', _new_starts_at + v_dur
  );
END;
$$;

-- 4. Trigger: auto-log appointment status changes to calendar_events
CREATE OR REPLACE FUNCTION public.trg_fn_appointment_status_calendar_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event_type text;
BEGIN
  -- Only fire when status actually changes
  IF OLD.appointment_status IS NOT DISTINCT FROM NEW.appointment_status THEN
    RETURN NEW;
  END IF;

  -- Map status transitions to event types
  CASE NEW.appointment_status
    WHEN 'cancelled' THEN v_event_type := 'appointment_cancelled';
    WHEN 'completed' THEN v_event_type := 'appointment_completed';
    WHEN 'no_show'   THEN v_event_type := 'lead_no_show';
    WHEN 'confirmed' THEN v_event_type := 'appointment_confirmed';
    WHEN 'booked'    THEN
      -- Only log if transitioning FROM something (not initial insert)
      IF OLD.appointment_status IS NOT NULL THEN
        v_event_type := 'appointment_booked';
      ELSE
        RETURN NEW;
      END IF;
    ELSE
      RETURN NEW; -- Don't log unmapped transitions
  END CASE;

  INSERT INTO public.calendar_events (
    event_type, appointment_id, lead_id,
    previous_owner_id, new_owner_id, actor_user_id,
    reason, metadata
  ) VALUES (
    v_event_type, NEW.id, NEW.lead_id,
    OLD.current_owner_id, NEW.current_owner_id,
    COALESCE(auth.uid(), NEW.current_owner_id, '00000000-0000-0000-0000-000000000000'::uuid),
    NULL,
    jsonb_build_object(
      'old_status', OLD.appointment_status,
      'new_status', NEW.appointment_status
    )
  );

  -- Free slot on cancellation/no_show
  IF NEW.appointment_status IN ('cancelled', 'no_show') THEN
    UPDATE availability_slots
      SET current_bookings = GREATEST(current_bookings - 1, 0), updated_at = now()
      WHERE date = (NEW.starts_at AT TIME ZONE COALESCE(NEW.booking_timezone, 'Europe/Berlin'))::date
        AND is_active = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_status_calendar_event ON public.appointments;
CREATE TRIGGER trg_appointment_status_calendar_event
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_appointment_status_calendar_event();
