-- Fix create_manual_appointment: honor lead state machine to prevent
-- illegal transitions like assigned_setter -> booked. Minimal-invasive:
-- only the final UPDATE on leads.stage / leads.conversion_state changes;
-- all guards, capacity, blocker and appointment insert logic remain identical.

CREATE OR REPLACE FUNCTION public.create_manual_appointment(
  p_lead_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_call_type text DEFAULT 'standard',
  p_confirmed boolean DEFAULT false,
  p_reason text DEFAULT NULL,
  p_closer_id uuid DEFAULT NULL,
  p_setter_id uuid DEFAULT NULL
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
  v_existing_active_id uuid;
  v_existing_starts_at timestamptz;
  v_existing_status text;
  v_lead_email text;
  v_lead_stage text;
  v_lead_state text;
  v_target_stage text;
  v_target_state text;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_daily_count integer;
  v_daily_capacity integer;
  v_blocker_collision integer;
  v_owner_role text;
  v_payload jsonb;
  v_intake_stages text[] := ARRAY['new','unknown','','quiz_completed'];
  v_setter_pipeline_stages text[] := ARRAY[
    'assigned_setter','setter_contacting','setter_attempting',
    'setter_no_response','backlog'
  ];
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

  SELECT email, COALESCE(stage,''), COALESCE(conversion_state::text,'')
  INTO v_lead_email, v_lead_stage, v_lead_state
  FROM public.leads WHERE id = p_lead_id;

  IF v_lead_email IS NULL THEN
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

  -- ═══ ONE ACTIVE APPOINTMENT CHECK ═══
  SELECT a.id, a.starts_at, a.appointment_status
  INTO v_existing_active_id, v_existing_starts_at, v_existing_status
  FROM public.appointments a
  WHERE a.lead_id = p_lead_id
    AND a.appointment_status IN ('booked','confirmed','pending_confirmation','pending_payment')
  ORDER BY a.starts_at DESC LIMIT 1;

  IF v_existing_active_id IS NULL AND v_lead_email IS NOT NULL THEN
    SELECT a.id, a.starts_at, a.appointment_status
    INTO v_existing_active_id, v_existing_starts_at, v_existing_status
    FROM public.appointments a
    INNER JOIN public.leads l ON l.id = a.lead_id
    WHERE lower(trim(l.email)) = lower(trim(v_lead_email))
      AND a.appointment_status IN ('booked','confirmed','pending_confirmation','pending_payment')
    ORDER BY a.starts_at DESC LIMIT 1;
  END IF;

  IF v_existing_active_id IS NOT NULL THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', v_caller_id, 'ACTIVE_APPOINTMENT_EXISTS',
            format('Email %s has active appt %s (status: %s)', v_lead_email, v_existing_active_id, v_existing_status),
            v_payload,
            jsonb_build_object('auth_uid', v_caller_id, 'existing_appointment_id', v_existing_active_id));
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ACTIVE_APPOINTMENT_EXISTS',
      'error', format('Diese E-Mail hat bereits einen aktiven Termin (%s).', v_existing_status),
      'existing_appointment_id', v_existing_active_id,
      'existing_starts_at', v_existing_starts_at,
      'existing_status', v_existing_status,
      'can_reschedule', true
    );
  END IF;

  -- ═══ OWNER / SETTER RESOLUTION ═══
  v_setter_id := COALESCE(p_setter_id, v_caller_id);
  v_owner_id := COALESCE(p_closer_id, p_setter_id, v_caller_id);
  v_owner_role := CASE
    WHEN p_closer_id IS NOT NULL THEN 'closer'
    WHEN p_setter_id IS NOT NULL THEN 'setter'
    ELSE 'setter'
  END;

  -- ═══ CAPACITY CHECK ═══
  v_day_start := date_trunc('day', p_starts_at AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin';
  v_day_end := v_day_start + interval '1 day';

  SELECT COALESCE(custom_daily_capacity, max_daily_capacity, 6) INTO v_daily_capacity
  FROM public.user_capacity_settings WHERE user_id = v_owner_id;
  IF v_daily_capacity IS NULL THEN v_daily_capacity := 6; END IF;

  SELECT COUNT(*) INTO v_daily_count FROM public.appointments
  WHERE current_owner_id = v_owner_id
    AND starts_at >= v_day_start AND starts_at < v_day_end
    AND appointment_status NOT IN ('cancelled','reassigned','completed','no_show','blocked');

  IF v_daily_count >= v_daily_capacity THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', v_caller_id, 'capacity_exceeded',
            format('%s/%s on %s for %s', v_daily_count, v_daily_capacity, v_day_start::date, v_owner_id),
            v_payload, jsonb_build_object('auth_uid', v_caller_id, 'owner_id', v_owner_id));
    RETURN jsonb_build_object('success', false, 'error', 'capacity_exceeded',
      'detail', format('Kapazität erreicht: %s/%s Termine am %s', v_daily_count, v_daily_capacity, v_day_start::date));
  END IF;

  -- ═══ BLOCKER CHECK ═══
  SELECT COUNT(*) INTO v_blocker_collision FROM public.calendar_blockers
  WHERE user_id = v_owner_id
    AND blocker_type IN ('vacation','sick_leave','unavailable','full_day_block')
    AND starts_at < p_ends_at AND ends_at > p_starts_at;

  IF v_blocker_collision > 0 THEN
    INSERT INTO rpc_error_log (rpc_name, caller_id, error_code, error_detail, request_payload, rls_context)
    VALUES ('create_manual_appointment', v_caller_id, 'blocker_collision',
            format('Owner %s has %s blocker(s)', v_owner_id, v_blocker_collision),
            v_payload, jsonb_build_object('auth_uid', v_caller_id, 'owner_id', v_owner_id));
    RETURN jsonb_build_object('success', false, 'error', 'blocker_collision',
      'detail', 'Dieser Zeitraum ist durch einen Blocker gesperrt.');
  END IF;

  -- ═══ INSERT APPOINTMENT ═══
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

  -- ═══ STATE-MACHINE-AWARE STAGE TARGETING ═══
  -- Intake stages → 'booked' (legal: validate_lead_transition allows it)
  -- Setter-pipeline stages → 'setter_booked' (canonical end-state when setter sets a meeting)
  -- Anything else (already past setter, closer pipeline, terminal) → leave untouched
  v_target_stage := CASE
    WHEN v_lead_stage = ANY(v_intake_stages) THEN 'booked'
    WHEN v_lead_stage = ANY(v_setter_pipeline_stages) THEN 'setter_booked'
    ELSE v_lead_stage
  END;

  -- canonical conversion_state: only the one legal predecessor (engaged) may auto-advance
  v_target_state := CASE
    WHEN v_lead_state IN ('engaged') THEN 'booked'
    ELSE v_lead_state
  END;

  -- If target stage requires walking the setter pipeline (e.g. assigned_setter → setter_booked
  -- needs intermediate setter_qualified per validate_lead_transition), walk safely.
  IF v_target_stage = 'setter_booked'
     AND v_lead_stage IN ('assigned_setter','setter_contacting','setter_attempting',
                          'setter_no_response','backlog') THEN
    BEGIN
      -- Step 1: -> setter_qualified (legal from all listed stages except setter_disqualified)
      UPDATE public.leads SET stage = 'setter_qualified', updated_at = now()
      WHERE id = p_lead_id AND stage = v_lead_stage;

      -- Step 2: -> setter_booked (legal from setter_qualified)
      UPDATE public.leads SET stage = 'setter_booked', updated_at = now()
      WHERE id = p_lead_id AND stage = 'setter_qualified';
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit_logs (action, source_type, note, before_state, after_state, created_at)
      VALUES ('lead_stage_walk_failed', 'create_manual_appointment',
              format('lead=%s from=%s -> setter_booked failed: %s', p_lead_id, v_lead_stage, SQLERRM),
              jsonb_build_object('stage', v_lead_stage),
              jsonb_build_object('target', 'setter_booked'),
              now());
      v_target_stage := v_lead_stage; -- give up stage advance, keep appointment
    END;
  END IF;

  -- Final mutation: booking flags + (possibly already updated) stage + conversion_state
  BEGIN
    UPDATE public.leads SET
      has_booking = true,
      booking_id = v_appointment_id,
      appointment_date = p_starts_at,
      booking_status = CASE WHEN p_confirmed THEN 'confirmed' ELSE 'booked' END,
      stage = CASE
                WHEN v_target_stage = 'setter_booked' THEN stage  -- already walked above
                ELSE v_target_stage
              END,
      conversion_state = v_target_state::public.conversion_state,
      updated_at = now()
    WHERE id = p_lead_id;
  EXCEPTION WHEN OTHERS THEN
    -- Validation triggers rejected the update. Log + keep appointment + don't fail RPC.
    INSERT INTO audit_logs (action, source_type, note, before_state, after_state, created_at)
    VALUES ('lead_transition_rejected', 'create_manual_appointment',
            format('lead=%s stage=%s->%s state=%s->%s rejected: %s',
                   p_lead_id, v_lead_stage, v_target_stage, v_lead_state, v_target_state, SQLERRM),
            jsonb_build_object('stage', v_lead_stage, 'conversion_state', v_lead_state),
            jsonb_build_object('stage', v_target_stage, 'conversion_state', v_target_state),
            now());

    -- Fallback: at minimum set booking flags without touching stage/state
    UPDATE public.leads SET
      has_booking = true,
      booking_id = v_appointment_id,
      appointment_date = p_starts_at,
      booking_status = CASE WHEN p_confirmed THEN 'confirmed' ELSE 'booked' END,
      updated_at = now()
    WHERE id = p_lead_id;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'status', CASE WHEN p_confirmed THEN 'confirmed' ELSE 'booked' END,
    'lead_stage_from', v_lead_stage,
    'lead_stage_to', v_target_stage,
    'lead_state_from', v_lead_state,
    'lead_state_to', v_target_state
  );
END;
$function$;