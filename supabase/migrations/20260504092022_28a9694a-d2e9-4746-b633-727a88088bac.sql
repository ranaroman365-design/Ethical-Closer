
-- 1. Fix existing active appointments with NULL current_owner_id
UPDATE appointments 
SET current_owner_id = COALESCE(closer_id, setter_id),
    current_owner_role = CASE WHEN closer_id IS NOT NULL THEN 'closer' ELSE 'setter' END,
    updated_at = now()
WHERE appointment_status IN ('booked','confirmed','scheduled') 
  AND current_owner_id IS NULL 
  AND COALESCE(closer_id, setter_id) IS NOT NULL;

-- 2. Replace reassign_appointment to also sync leads table
CREATE OR REPLACE FUNCTION public.reassign_appointment(
  p_appointment_id uuid,
  p_new_owner_id uuid,
  p_new_owner_role text,
  p_reassignment_type text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Update appointment
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

  -- ★ Sync leads table (the critical fix)
  UPDATE public.leads
     SET owner_id   = p_new_owner_id,
         setter_id  = CASE WHEN p_new_owner_role = 'setter' THEN p_new_owner_id ELSE setter_id END,
         closer_id  = CASE WHEN p_new_owner_role = 'closer' THEN p_new_owner_id ELSE closer_id END,
         updated_at = now()
   WHERE id = v_appt.lead_id;

  -- Audit log
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

  -- Log to lead_events
  INSERT INTO public.lead_events (lead_id, event_type, metadata)
  VALUES (
    v_appt.lead_id,
    'owner_reassigned',
    jsonb_build_object(
      'appointment_id', p_appointment_id,
      'previous_owner_id', v_prev_owner_id,
      'new_owner_id', p_new_owner_id,
      'new_owner_role', p_new_owner_role,
      'reassignment_type', p_reassignment_type,
      'actor', v_caller
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

-- 3. Replace reschedule_appointment to also sync leads table
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  _old_id uuid,
  _new_starts_at timestamptz,
  _new_ends_at timestamptz DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- Also allow L6+ team members
    IF NOT public.user_has_min_level(v_caller, 6) THEN
      RETURN jsonb_build_object('success', false, 'error', 'forbidden');
    END IF;
  END IF;

  IF v_old.appointment_status IN ('rescheduled','cancelled','expired','superseded','completed','closed_won','closed_lost') THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_already_' || v_old.appointment_status);
  END IF;

  IF _new_starts_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'new_time_in_past');
  END IF;

  -- Duration
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

  -- ★ Sync leads table (appointment_date + reschedule_count)
  UPDATE public.leads
     SET appointment_date = _new_starts_at,
         reschedule_count = COALESCE(reschedule_count, 0) + 1,
         updated_at = now()
   WHERE id = v_old.lead_id;

  -- Slot management
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

  -- ★ Log to lead_events
  INSERT INTO public.lead_events (lead_id, event_type, metadata)
  VALUES (
    v_old.lead_id,
    'appointment_rescheduled',
    jsonb_build_object(
      'old_appointment_id', _old_id,
      'new_appointment_id', v_new_id,
      'old_starts_at', v_old.starts_at,
      'new_starts_at', _new_starts_at,
      'actor', v_caller
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

-- 4. Create combined reassign_and_reschedule_appointment RPC
CREATE OR REPLACE FUNCTION public.reassign_and_reschedule_appointment(
  p_appointment_id uuid,
  p_new_owner_id uuid,
  p_new_starts_at timestamptz,
  p_new_ends_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_appt record;
  v_new_id uuid;
  v_prev_owner_id uuid;
  v_prev_owner_role text;
  v_dur interval;
  v_conflict int;
  v_new_owner_level int;
  v_new_owner_role text;
  v_old_date date;
  v_new_date date;
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

  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appt.appointment_status IN ('rescheduled','cancelled','expired','superseded','completed','closed_won','closed_lost') THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_active');
  END IF;

  IF p_new_starts_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'new_time_in_past');
  END IF;

  -- Determine new owner role from their level
  SELECT COALESCE(current_phase, 0) INTO v_new_owner_level FROM profiles WHERE id = p_new_owner_id;
  v_new_owner_role := CASE WHEN v_new_owner_level >= 4 THEN 'closer' ELSE 'setter' END;

  -- Duration
  IF p_new_ends_at IS NOT NULL AND p_new_ends_at > p_new_starts_at THEN
    v_dur := p_new_ends_at - p_new_starts_at;
  ELSE
    v_dur := v_appt.ends_at - v_appt.starts_at;
  END IF;

  -- Double-booking check (same lead)
  SELECT COUNT(*) INTO v_conflict FROM appointments
  WHERE lead_id = v_appt.lead_id AND id <> p_appointment_id
    AND appointment_status NOT IN ('rescheduled','cancelled','expired','superseded','no_show')
    AND starts_at < (p_new_starts_at + v_dur) AND ends_at > p_new_starts_at;
  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'double_booking');
  END IF;

  -- Operator conflict for new owner
  SELECT COUNT(*) INTO v_conflict FROM appointments
  WHERE (closer_id = p_new_owner_id OR setter_id = p_new_owner_id OR current_owner_id = p_new_owner_id)
    AND id <> p_appointment_id
    AND appointment_status NOT IN ('rescheduled','cancelled','expired','superseded','no_show')
    AND starts_at < (p_new_starts_at + v_dur) AND ends_at > p_new_starts_at;
  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'operator_conflict');
  END IF;

  v_prev_owner_id := COALESCE(v_appt.current_owner_id, v_appt.setter_id);
  v_prev_owner_role := COALESCE(v_appt.current_owner_role, 'setter');

  -- Create new appointment with new owner AND new time
  INSERT INTO appointments (
    lead_id, call_type, appointment_status, starts_at, ends_at,
    setter_id, payment_status, booking_source, call_status,
    closer_id, current_owner_id, current_owner_role,
    original_owner_id, original_owner_role,
    assigned_operator_id, booking_timezone, booking_utc_offset,
    rescheduled_from_id, reminders_state,
    reassigned_at, reassigned_by, reassignment_reason,
    origin_source, attribution_snapshot, traffic_owner
  ) VALUES (
    v_appt.lead_id, v_appt.call_type, 'booked', p_new_starts_at, p_new_starts_at + v_dur,
    CASE WHEN v_new_owner_role = 'setter' THEN p_new_owner_id ELSE v_appt.setter_id END,
    v_appt.payment_status, 'reschedule_reassign', 'pending',
    CASE WHEN v_new_owner_role = 'closer' THEN p_new_owner_id ELSE v_appt.closer_id END,
    p_new_owner_id, v_new_owner_role,
    COALESCE(v_appt.original_owner_id, v_prev_owner_id),
    COALESCE(v_appt.original_owner_role, v_prev_owner_role),
    v_appt.assigned_operator_id,
    COALESCE(v_appt.booking_timezone, 'Europe/Berlin'),
    COALESCE(v_appt.booking_utc_offset, '+02:00'),
    p_appointment_id, '{}'::jsonb,
    now(), v_caller, p_reason,
    v_appt.origin_source, v_appt.attribution_snapshot, v_appt.traffic_owner
  ) RETURNING id INTO v_new_id;

  -- Update old appointment
  UPDATE appointments SET
    appointment_status = 'rescheduled',
    rescheduled_to_id = v_new_id,
    rescheduled_at = now(),
    rescheduled_by = v_caller,
    updated_at = now()
  WHERE id = p_appointment_id;

  -- Sync leads table
  UPDATE public.leads
     SET owner_id = p_new_owner_id,
         setter_id = CASE WHEN v_new_owner_role = 'setter' THEN p_new_owner_id ELSE setter_id END,
         closer_id = CASE WHEN v_new_owner_role = 'closer' THEN p_new_owner_id ELSE closer_id END,
         appointment_date = p_new_starts_at,
         reschedule_count = COALESCE(reschedule_count, 0) + 1,
         updated_at = now()
   WHERE id = v_appt.lead_id;

  -- Slot management
  v_old_date := (v_appt.starts_at AT TIME ZONE COALESCE(v_appt.booking_timezone, 'Europe/Berlin'))::date;
  v_new_date := (p_new_starts_at AT TIME ZONE COALESCE(v_appt.booking_timezone, 'Europe/Berlin'))::date;

  UPDATE availability_slots
    SET current_bookings = GREATEST(current_bookings - 1, 0), updated_at = now()
    WHERE date = v_old_date AND is_active = true;
  UPDATE availability_slots
    SET current_bookings = current_bookings + 1, updated_at = now()
    WHERE date = v_new_date AND is_active = true;

  -- Audit: reassignment log
  INSERT INTO public.appointment_reassignment_log (
    appointment_id, previous_owner_id, previous_owner_role,
    new_owner_id, new_owner_role, reassignment_type, reason, reassigned_by
  ) VALUES (
    p_appointment_id, v_prev_owner_id, v_prev_owner_role,
    p_new_owner_id, v_new_owner_role, 'reassignment', p_reason, v_caller
  );

  -- calendar_events: reassigned + rescheduled
  INSERT INTO public.calendar_events (event_type, appointment_id, lead_id, previous_owner_id, new_owner_id, actor_user_id, reason, metadata)
  VALUES (
    'appointment_reassigned_and_rescheduled', v_new_id, v_appt.lead_id,
    v_prev_owner_id, p_new_owner_id, v_caller, p_reason,
    jsonb_build_object(
      'old_appointment_id', p_appointment_id,
      'old_starts_at', v_appt.starts_at,
      'new_starts_at', p_new_starts_at,
      'previous_owner_role', v_prev_owner_role,
      'new_owner_role', v_new_owner_role
    )
  );

  -- lead_events
  INSERT INTO public.lead_events (lead_id, event_type, metadata)
  VALUES (
    v_appt.lead_id,
    'owner_reassigned_and_rescheduled',
    jsonb_build_object(
      'old_appointment_id', p_appointment_id,
      'new_appointment_id', v_new_id,
      'previous_owner_id', v_prev_owner_id,
      'new_owner_id', p_new_owner_id,
      'new_starts_at', p_new_starts_at,
      'actor', v_caller
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_appointment_id', v_new_id,
    'old_appointment_id', p_appointment_id,
    'previous_owner_id', v_prev_owner_id,
    'new_owner_id', p_new_owner_id,
    'new_starts_at', p_new_starts_at,
    'new_ends_at', p_new_starts_at + v_dur
  );
END;
$$;
