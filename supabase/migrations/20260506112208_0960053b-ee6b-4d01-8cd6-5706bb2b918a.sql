
CREATE OR REPLACE FUNCTION public.create_manual_appointment(
  p_lead_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_call_type text DEFAULT 'setter'::text,
  p_confirmed boolean DEFAULT false,
  p_reason text DEFAULT NULL::text,
  p_closer_id uuid DEFAULT NULL::uuid,
  p_setter_notes text DEFAULT NULL::text,
  p_setter_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_level integer := 0;
  v_appointment_id uuid;
  v_has_active boolean;
  v_initial_status text;
  v_setter_id uuid;
  v_owner_id uuid;
  v_owner_role text;
  v_lead_exists boolean;
  v_resolved_call_type text;
  v_is_admin boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required', 'message', 'Bitte melde dich erneut an.');
  END IF;

  IF p_lead_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_lead', 'message', 'Es fehlt ein gültiger Lead.');
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_time_range', 'message', 'Bitte wähle eine gültige Start- und Endzeit.');
  END IF;

  -- Normalize legacy call_type values
  v_resolved_call_type := CASE COALESCE(NULLIF(p_call_type, ''), 'setter')
    WHEN 'setter_call' THEN 'setter'
    WHEN 'closer_call' THEN 'closer'
    WHEN 'priority_call' THEN 'priority'
    ELSE COALESCE(NULLIF(p_call_type, ''), 'setter')
  END;

  SELECT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) INTO v_lead_exists;
  IF NOT v_lead_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found', 'message', 'Dieser Lead existiert nicht mehr.');
  END IF;

  SELECT COALESCE(current_level, 0) INTO v_caller_level
  FROM public.user_level_status WHERE user_id = v_caller;
  v_caller_level := COALESCE(v_caller_level, 0);

  -- Check admin
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_caller AND role = 'admin') INTO v_is_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE lead_id = p_lead_id
      AND appointment_status IN ('scheduled', 'booked', 'pending_confirmation', 'confirmed')
  ) INTO v_has_active;

  IF v_has_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_has_active_appointment', 'message', 'Dieser Lead hat bereits einen aktiven Termin.');
  END IF;

  -- Resolve setter: explicit p_setter_id > caller (for setter-level) > NULL
  v_setter_id := COALESCE(p_setter_id, CASE WHEN v_caller_level < 4 AND NOT v_is_admin THEN v_caller ELSE NULL END);

  -- Determine ownership: use CANONICAL role values only (setter/closer/operator/admin)
  IF p_closer_id IS NOT NULL THEN
    v_initial_status := 'booked';
    v_owner_id := p_closer_id;
    v_owner_role := 'closer';
  ELSIF v_is_admin THEN
    v_initial_status := CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending_confirmation' END;
    v_owner_id := v_caller;
    v_owner_role := 'admin';
  ELSIF v_caller_level >= 6 THEN
    v_initial_status := CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending_confirmation' END;
    v_owner_id := v_caller;
    v_owner_role := 'operator';
  ELSIF v_caller_level >= 4 THEN
    v_initial_status := CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending_confirmation' END;
    v_owner_id := v_caller;
    v_owner_role := 'closer';
  ELSE
    v_initial_status := CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending_confirmation' END;
    v_setter_id := COALESCE(v_setter_id, v_caller);
    v_owner_id := v_caller;
    v_owner_role := 'setter';
  END IF;

  INSERT INTO public.appointments (
    lead_id, starts_at, ends_at, call_type,
    appointment_status, booking_source,
    setter_id, closer_id,
    current_owner_id, current_owner_role,
    original_owner_id, original_owner_role,
    setter_notes
  ) VALUES (
    p_lead_id, p_starts_at, p_ends_at, v_resolved_call_type,
    v_initial_status, 'manual',
    v_setter_id, p_closer_id,
    v_owner_id, v_owner_role,
    v_owner_id, v_owner_role,
    p_setter_notes
  )
  RETURNING id INTO v_appointment_id;

  -- Mark lead as booked + update ownership
  UPDATE public.leads SET
    has_booking = true,
    booking_id = v_appointment_id,
    booking_status = v_initial_status,
    appointment_date = p_starts_at,
    setter_id = COALESCE(v_setter_id, leads.setter_id),
    closer_id = COALESCE(p_closer_id, leads.closer_id),
    owner_id = COALESCE(p_closer_id, leads.owner_id),
    owner_role = CASE WHEN p_closer_id IS NOT NULL THEN 'closer' ELSE leads.owner_role END
  WHERE id = p_lead_id;

  -- Audit trail
  INSERT INTO public.calendar_events (
    event_type, appointment_id, lead_id,
    new_owner_id, actor_user_id, reason, metadata
  ) VALUES (
    'appointment_created_manual', v_appointment_id, p_lead_id,
    v_owner_id, v_caller,
    p_reason,
    jsonb_build_object(
      'confirmed', p_confirmed,
      'call_type', v_resolved_call_type,
      'closer_id', p_closer_id,
      'setter_id', v_setter_id,
      'setter_notes', p_setter_notes
    )
  );

  INSERT INTO public.lead_events (lead_id, event_type, actor_user_id, notes, metadata)
  VALUES (
    p_lead_id,
    CASE WHEN p_closer_id IS NOT NULL THEN 'closer_assigned' ELSE 'appointment_created' END,
    v_caller,
    CASE WHEN p_closer_id IS NOT NULL
      THEN 'Closer-Call via Setter Handoff'
      ELSE 'Manueller Termin erstellt'
    END,
    jsonb_build_object('appointment_id', v_appointment_id, 'closer_id', p_closer_id, 'setter_id', v_setter_id, 'call_type', v_resolved_call_type)
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'status', v_initial_status
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'exception', 'message', SQLERRM);
END;
$function$;
