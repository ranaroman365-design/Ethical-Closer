
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
  v_active_statuses   text[] := ARRAY['booked','confirmed','scheduled','pending_payment','pending_confirmation'];
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

  -- Update appointment: ownership + clear stale assigned_operator_id to prevent ghost entries
  UPDATE public.appointments
     SET current_owner_id    = p_new_owner_id,
         current_owner_role  = p_new_owner_role,
         original_owner_id   = COALESCE(original_owner_id, v_prev_owner_id),
         original_owner_role = COALESCE(original_owner_role, v_prev_owner_role),
         setter_id  = CASE WHEN p_new_owner_role = 'setter' THEN p_new_owner_id ELSE setter_id END,
         closer_id  = CASE WHEN p_new_owner_role = 'closer' THEN p_new_owner_id ELSE closer_id END,
         -- Clear assigned_operator_id if it pointed to the previous owner (prevents ghost)
         assigned_operator_id = CASE
           WHEN assigned_operator_id = v_prev_owner_id THEN p_new_owner_id
           ELSE assigned_operator_id
         END,
         reassigned_at       = now(),
         reassigned_by       = v_caller,
         reassignment_reason = p_reason,
         updated_at          = now()
   WHERE id = p_appointment_id;

  -- Sync lead ownership to match appointment
  IF v_appt.lead_id IS NOT NULL THEN
    UPDATE public.leads
       SET setter_id = CASE WHEN p_new_owner_role = 'setter' THEN p_new_owner_id ELSE leads.setter_id END,
           closer_id = CASE WHEN p_new_owner_role = 'closer' THEN p_new_owner_id ELSE leads.closer_id END,
           owner_id  = CASE WHEN p_new_owner_role = 'closer' THEN p_new_owner_id ELSE leads.owner_id END,
           owner_role = CASE WHEN p_new_owner_role = 'closer' THEN 'closer' ELSE leads.owner_role END
     WHERE id = v_appt.lead_id;
  END IF;

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
      'first_reassignment', v_is_first,
      'assigned_operator_id_updated', (v_appt.assigned_operator_id = v_prev_owner_id),
      'lead_synced', (v_appt.lead_id IS NOT NULL)
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
