CREATE OR REPLACE FUNCTION public.get_team_member_calendar(_member uuid, _from timestamp with time zone, _to timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'owner'::public.app_role);
  v_caller_level int;
  v_member_level int;
  v_appts jsonb;
  v_slots jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _member IS NULL OR _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'member, from, to required';
  END IF;
  IF _to <= _from OR _to > _from + interval '60 days' THEN
    RAISE EXCEPTION 'invalid range (max 60 days)';
  END IF;

  IF NOT v_is_admin AND v_caller <> _member THEN
    IF NOT public.is_operator_l6plus(v_caller) THEN
      RAISE EXCEPTION 'forbidden: requires Level 6+';
    END IF;

    SELECT current_level INTO v_caller_level FROM public.user_level_status WHERE user_id = v_caller;
    SELECT current_level INTO v_member_level FROM public.user_level_status WHERE user_id = _member;

    IF NOT (
      public.is_in_team_subtree(_member, v_caller)
      OR (
        public.same_workspace(v_caller, _member)
        AND COALESCE(v_member_level, 99) < COALESCE(v_caller_level, 0)
      )
    ) THEN
      RAISE EXCEPTION 'forbidden: target user not in your team';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'call_type', a.call_type,
    'appointment_status', a.appointment_status,
    'call_status', a.call_status,
    'outcome', a.outcome,
    'pricing_tier', a.pricing_tier,
    'attendance_flag', a.attendance_flag,
    'lead_id', a.lead_id,
    'setter_id', a.setter_id,
    'closer_id', a.closer_id,
    'current_owner_id', a.current_owner_id,
    'assigned_operator_id', a.assigned_operator_id,
    'booking_timezone', a.booking_timezone,
    'original_local_date', a.original_local_date,
    'original_local_time', a.original_local_time,
    'video_call_link', a.video_call_link,
    'meeting_provider', a.meeting_provider,
    'meeting_id', a.meeting_id,
    'join_clicked_at', a.join_clicked_at
  ) ORDER BY a.starts_at), '[]'::jsonb)
  INTO v_appts
  FROM public.appointments a
  WHERE a.starts_at >= _from
    AND a.starts_at < _to
    AND (
      a.setter_id = _member
      OR a.closer_id = _member
      OR a.current_owner_id = _member
      OR a.assigned_operator_id = _member
      OR a.original_owner_id = _member
      OR a.locked_closer_id = _member
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', s.date,
    'max_bookings', s.max_bookings,
    'current_bookings', s.current_bookings,
    'is_active', s.is_active
  ) ORDER BY s.date), '[]'::jsonb)
  INTO v_slots
  FROM public.availability_slots s
  WHERE s.date >= _from::date AND s.date < _to::date;

  RETURN jsonb_build_object(
    'appointments', v_appts,
    'slots', v_slots,
    'member_id', _member,
    'from', _from,
    'to', _to
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_manual_appointment(
  p_lead_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_call_type text DEFAULT 'standard'::text,
  p_confirmed boolean DEFAULT false,
  p_reason text DEFAULT NULL::text,
  p_closer_id uuid DEFAULT NULL::uuid,
  p_setter_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id uuid;
  v_owner_id uuid;
  v_setter_id uuid;
  v_appointment_id uuid;
  v_existing_active uuid;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_daily_count integer;
  v_daily_capacity integer;
  v_blocker_collision integer;
  v_owner_role text;
  v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'p_lead_id', p_lead_id, 'p_starts_at', p_starts_at, 'p_ends_at', p_ends_at,
    'p_call_type', p_call_type, 'p_confirmed', p_confirmed, 'p_reason', p_reason,
    'p_closer_id', p_closer_id, 'p_setter_id', p_setter_id
  );

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', NULL, 'auth_required', 'No authenticated user', v_payload,
            jsonb_build_object('auth_uid', NULL));
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', v_caller_id, 'missing_lead',
            format('Lead %s not found', p_lead_id), v_payload,
            jsonb_build_object('auth_uid', v_caller_id));
    RETURN jsonb_build_object('success', false, 'error', 'missing_lead');
  END IF;

  IF p_ends_at <= p_starts_at THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', v_caller_id, 'invalid_time_range',
            format('ends_at %s <= starts_at %s', p_ends_at, p_starts_at), v_payload,
            jsonb_build_object('auth_uid', v_caller_id));
    RETURN jsonb_build_object('success', false, 'error', 'invalid_time_range');
  END IF;

  SELECT id INTO v_existing_active
  FROM public.appointments
  WHERE lead_id = p_lead_id
    AND appointment_status NOT IN ('cancelled', 'reassigned', 'completed', 'no_show')
  LIMIT 1;

  IF v_existing_active IS NOT NULL THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', v_caller_id, 'lead_has_active_appointment',
            format('Lead %s has active appt %s', p_lead_id, v_existing_active), v_payload,
            jsonb_build_object('auth_uid', v_caller_id, 'existing_appointment_id', v_existing_active));
    RETURN jsonb_build_object('success', false, 'error', 'lead_has_active_appointment');
  END IF;

  v_setter_id := COALESCE(p_setter_id, v_caller_id);
  v_owner_id := COALESCE(p_closer_id, p_setter_id, v_caller_id);
  v_owner_role := CASE
    WHEN p_closer_id IS NOT NULL THEN 'closer'
    WHEN p_setter_id IS NOT NULL THEN 'setter'
    ELSE 'setter'
  END;

  v_day_start := date_trunc('day', p_starts_at AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin';
  v_day_end := v_day_start + interval '1 day';

  SELECT COALESCE(custom_daily_capacity, max_daily_capacity, 6)
  INTO v_daily_capacity
  FROM public.user_capacity_settings
  WHERE user_id = v_owner_id;
  IF v_daily_capacity IS NULL THEN v_daily_capacity := 6; END IF;

  SELECT COUNT(*) INTO v_daily_count
  FROM public.appointments
  WHERE current_owner_id = v_owner_id
    AND starts_at >= v_day_start AND starts_at < v_day_end
    AND appointment_status NOT IN ('cancelled', 'reassigned', 'completed', 'no_show', 'blocked');

  IF v_daily_count >= v_daily_capacity THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', v_caller_id, 'capacity_exceeded',
            format('%s/%s on %s for %s', v_daily_count, v_daily_capacity, v_day_start::date, v_owner_id),
            v_payload, jsonb_build_object('auth_uid', v_caller_id, 'owner_id', v_owner_id));
    RETURN jsonb_build_object('success', false, 'error', 'capacity_exceeded',
      'detail', format('Kapazität erreicht: %s/%s Termine am %s', v_daily_count, v_daily_capacity, v_day_start::date));
  END IF;

  SELECT COUNT(*) INTO v_blocker_collision
  FROM public.calendar_blockers
  WHERE user_id = v_owner_id
    AND blocker_type IN ('vacation', 'sick_leave', 'unavailable', 'full_day_block')
    AND starts_at < p_ends_at AND ends_at > p_starts_at;

  IF v_blocker_collision > 0 THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', v_caller_id, 'blocker_collision',
            format('Owner %s has %s blocker(s)', v_owner_id, v_blocker_collision),
            v_payload, jsonb_build_object('auth_uid', v_caller_id, 'owner_id', v_owner_id));
    RETURN jsonb_build_object('success', false, 'error', 'blocker_collision',
      'detail', 'Dieser Zeitraum ist durch einen Blocker gesperrt.');
  END IF;

  BEGIN
    INSERT INTO public.appointments (
      lead_id, current_owner_id, current_owner_role, original_owner_id, original_owner_role,
      assigned_operator_id, setter_id, closer_id, starts_at, ends_at, call_type,
      appointment_status, booking_source
    ) VALUES (
      p_lead_id, v_owner_id, v_owner_role, v_owner_id, v_owner_role, v_owner_id,
      v_setter_id, p_closer_id, p_starts_at, p_ends_at, p_call_type,
      CASE WHEN p_confirmed THEN 'confirmed' ELSE 'booked' END, 'manual'
    )
    RETURNING id INTO v_appointment_id;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', v_caller_id, 'insert_failed',
            format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), v_payload,
            jsonb_build_object('auth_uid', v_caller_id, 'owner_id', v_owner_id, 'owner_role', v_owner_role));
    RETURN jsonb_build_object('success', false, 'error', 'insert_failed', 'detail', SQLERRM);
  END;

  UPDATE public.leads SET
    has_booking = true,
    booking_id = v_appointment_id,
    appointment_date = p_starts_at,
    booking_status = CASE WHEN p_confirmed THEN 'confirmed' ELSE 'booked' END,
    stage = CASE WHEN stage IN ('new', 'unknown', '', 'assigned_setter') THEN 'booked' ELSE stage END,
    conversion_state = CASE WHEN conversion_state IN ('new_lead', 'contacted', 'engaged') THEN 'booked'::public.conversion_state ELSE conversion_state END,
    setter_id = COALESCE(setter_id, v_setter_id),
    closer_id = COALESCE(p_closer_id, closer_id),
    owner_id = COALESCE(p_closer_id, owner_id, v_setter_id),
    updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.calendar_events (event_type, appointment_id, actor_user_id, reason, metadata)
  VALUES ('appointment_created', v_appointment_id, v_caller_id, p_reason,
    jsonb_build_object('booking_source', 'manual', 'call_type', p_call_type,
      'setter_id', v_setter_id, 'closer_id', p_closer_id, 'owner_id', v_owner_id));

  RETURN jsonb_build_object('success', true, 'appointment_id', v_appointment_id, 'owner_id', v_owner_id);
END;
$function$;