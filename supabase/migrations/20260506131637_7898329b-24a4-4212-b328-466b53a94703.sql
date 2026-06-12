
-- ═══ cancel_appointment_governed ═══
-- Only L6+ or admin may cancel. Audit-logged, lead returned to pool.

CREATE OR REPLACE FUNCTION public.cancel_appointment_governed(
  p_appointment_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_level int;
  v_is_admin boolean;
  v_appt record;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Level check
  SELECT current_phase INTO v_caller_level FROM profiles WHERE id = v_user_id;
  v_caller_level := COALESCE(v_caller_level, 0);

  SELECT EXISTS(
    SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'moderator')
  ) INTO v_is_admin;

  IF v_caller_level < 6 AND NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_level', 'message', 'Nur L6+ oder Admin dürfen Termine stornieren.');
  END IF;

  -- Fetch appointment
  SELECT id, lead_id, appointment_status, setter_id, closer_id
  INTO v_appt
  FROM appointments
  WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appt.appointment_status IN ('cancelled', 'completed', 'closed_won', 'closed_lost') THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_terminal', 'status', v_appt.appointment_status);
  END IF;

  -- Cancel the appointment (soft delete)
  UPDATE appointments SET
    appointment_status = 'cancelled',
    outcome = 'cancelled_by_operator',
    updated_at = now()
  WHERE id = p_appointment_id;

  -- Return lead to pool with needs_reschedule
  IF v_appt.lead_id IS NOT NULL THEN
    UPDATE leads SET
      stage = 'needs_reschedule',
      updated_at = now()
    WHERE id = v_appt.lead_id;
  END IF;

  -- Audit log via attendance_events
  INSERT INTO attendance_events (event_type, appointment_id, payload)
  VALUES (
    'appointment_cancelled_by_operator',
    p_appointment_id,
    jsonb_build_object(
      'cancelled_by', v_user_id,
      'cancelled_at', now(),
      'reason', p_reason,
      'lead_id', v_appt.lead_id,
      'caller_level', v_caller_level
    )
  );

  -- Insert notification event for lead communication
  INSERT INTO outbound_events (event_name, entity_type, entity_id, payload, status)
  VALUES (
    'appointment_cancelled',
    'lead',
    v_appt.lead_id,
    jsonb_build_object(
      'appointment_id', p_appointment_id,
      'cancelled_by', v_user_id,
      'reason', p_reason,
      'source', 'cancel_appointment_governed'
    ),
    'pending'
  );

  RETURN jsonb_build_object('success', true, 'appointment_id', p_appointment_id, 'lead_id', v_appt.lead_id);
END;
$$;

-- ═══ delete_calendar_blocker ═══
-- Owner or L6+ may delete a calendar blocker.

CREATE OR REPLACE FUNCTION public.delete_calendar_blocker(
  p_blocker_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_level int;
  v_is_admin boolean;
  v_blocker record;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT current_phase INTO v_caller_level FROM profiles WHERE id = v_user_id;
  v_caller_level := COALESCE(v_caller_level, 0);

  SELECT EXISTS(
    SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'moderator')
  ) INTO v_is_admin;

  SELECT id, user_id, starts_at, ends_at, title
  INTO v_blocker
  FROM calendar_blockers
  WHERE id = p_blocker_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'blocker_not_found');
  END IF;

  -- Only owner or L6+/admin
  IF v_blocker.user_id != v_user_id AND v_caller_level < 6 AND NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Audit
  INSERT INTO attendance_events (event_type, payload)
  VALUES (
    'blocker_deleted',
    jsonb_build_object(
      'blocker_id', p_blocker_id,
      'deleted_by', v_user_id,
      'deleted_at', now(),
      'title', v_blocker.title,
      'starts_at', v_blocker.starts_at,
      'ends_at', v_blocker.ends_at
    )
  );

  -- Hard delete
  DELETE FROM calendar_blockers WHERE id = p_blocker_id;

  RETURN jsonb_build_object('success', true, 'blocker_id', p_blocker_id);
END;
$$;
