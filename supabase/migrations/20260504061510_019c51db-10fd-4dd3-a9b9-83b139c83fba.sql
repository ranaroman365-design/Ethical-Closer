
CREATE OR REPLACE FUNCTION public.create_manual_appointment(
  p_lead_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_call_type text DEFAULT 'setter_call',
  p_confirmed boolean DEFAULT false,
  p_reason text DEFAULT NULL,
  p_closer_id uuid DEFAULT NULL,
  p_setter_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_level integer;
  v_appointment_id uuid;
  v_has_active boolean;
  v_initial_status text;
  v_setter_id uuid;
  v_owner_id uuid;
  v_owner_role text;
BEGIN
  -- Check caller level
  SELECT COALESCE(current_level, 0) INTO v_caller_level
  FROM public.user_level_status WHERE user_id = v_caller;

  IF v_caller_level IS NULL OR (v_caller_level < 3 AND NOT has_role(v_caller, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_level');
  END IF;

  -- Check no active appointment for this lead
  SELECT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE lead_id = p_lead_id
      AND appointment_status IN ('booked', 'pending_confirmation', 'confirmed')
  ) INTO v_has_active;

  IF v_has_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_has_active_appointment');
  END IF;

  -- Determine initial status
  IF p_closer_id IS NOT NULL THEN
    v_initial_status := 'booked';
    v_setter_id := v_caller;
    v_owner_id := p_closer_id;
    v_owner_role := 'closer';
  ELSIF p_confirmed THEN
    v_initial_status := 'confirmed';
    v_setter_id := CASE WHEN v_caller_level < 4 THEN v_caller ELSE NULL END;
    v_owner_id := v_caller;
    v_owner_role := CASE
      WHEN v_caller_level >= 6 THEN 'senior_closer'
      WHEN v_caller_level >= 4 THEN 'closer'
      ELSE 'setter'
    END;
  ELSE
    v_initial_status := 'pending_confirmation';
    v_setter_id := CASE WHEN v_caller_level < 4 THEN v_caller ELSE NULL END;
    v_owner_id := v_caller;
    v_owner_role := CASE
      WHEN v_caller_level >= 6 THEN 'senior_closer'
      WHEN v_caller_level >= 4 THEN 'closer'
      ELSE 'setter'
    END;
  END IF;

  -- Create appointment
  INSERT INTO public.appointments (
    lead_id, starts_at, ends_at, call_type,
    appointment_status, booking_source,
    setter_id, closer_id,
    current_owner_id, current_owner_role,
    original_owner_id, original_owner_role,
    setter_notes
  ) VALUES (
    p_lead_id, p_starts_at, p_ends_at, p_call_type,
    v_initial_status, 'manual',
    v_setter_id, p_closer_id,
    v_owner_id, v_owner_role,
    v_owner_id, v_owner_role,
    p_setter_notes
  )
  RETURNING id INTO v_appointment_id;

  -- Update lead
  UPDATE public.leads SET
    has_booking = true,
    booking_id = v_appointment_id,
    booking_status = v_initial_status,
    appointment_date = p_starts_at,
    closer_id = COALESCE(p_closer_id, leads.closer_id),
    owner_id = COALESCE(p_closer_id, leads.owner_id),
    owner_role = CASE WHEN p_closer_id IS NOT NULL THEN 'closer' ELSE leads.owner_role END
  WHERE id = p_lead_id;

  -- Log calendar event
  INSERT INTO public.calendar_events (
    event_type, appointment_id, lead_id,
    new_owner_id, actor_user_id, reason, metadata
  ) VALUES (
    'appointment_created_manual', v_appointment_id, p_lead_id,
    v_owner_id, v_caller,
    p_reason,
    jsonb_build_object(
      'confirmed', p_confirmed,
      'call_type', p_call_type,
      'closer_id', p_closer_id,
      'setter_notes', p_setter_notes
    )
  );

  -- Log lead event
  INSERT INTO public.lead_events (lead_id, event_type, actor_user_id, notes, metadata)
  VALUES (
    p_lead_id,
    CASE WHEN p_closer_id IS NOT NULL THEN 'closer_assigned' ELSE 'appointment_created' END,
    v_caller,
    CASE WHEN p_closer_id IS NOT NULL
      THEN 'Closer-Call via Setter Handoff'
      ELSE 'Manueller Termin erstellt'
    END,
    jsonb_build_object('appointment_id', v_appointment_id, 'closer_id', p_closer_id, 'call_type', p_call_type)
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'status', v_initial_status
  );
END;
$$;
