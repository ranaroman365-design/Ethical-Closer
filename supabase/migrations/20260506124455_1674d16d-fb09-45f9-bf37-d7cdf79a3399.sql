
-- ═══════════════════════════════════════════════════════════
-- 1. UPGRADE create_manual_appointment: Add capacity + blocker enforcement
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_manual_appointment(
  p_lead_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_call_type text,
  p_confirmed boolean DEFAULT false,
  p_reason text DEFAULT NULL,
  p_closer_id uuid DEFAULT NULL,
  p_setter_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_owner_id uuid;
  v_appointment_id uuid;
  v_existing_active uuid;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_daily_count integer;
  v_daily_capacity integer;
  v_blocker_collision integer;
BEGIN
  -- Auth check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'auth_required');
  END IF;

  -- Validate lead exists
  IF NOT EXISTS (SELECT 1 FROM leads WHERE id = p_lead_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_lead');
  END IF;

  -- Validate time range
  IF p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_time_range');
  END IF;

  -- Check for active appointment on this lead
  SELECT id INTO v_existing_active
  FROM appointments
  WHERE lead_id = p_lead_id
    AND appointment_status NOT IN ('cancelled', 'reassigned', 'completed', 'no_show')
  LIMIT 1;

  IF v_existing_active IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_has_active_appointment');
  END IF;

  -- Resolve owner
  v_owner_id := COALESCE(p_closer_id, p_setter_id, v_caller_id);

  -- ── CAPACITY ENFORCEMENT ──
  -- Compute day boundaries in appointment's timezone
  v_day_start := date_trunc('day', p_starts_at AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin';
  v_day_end := v_day_start + interval '1 day';

  -- Get capacity for the owner
  SELECT COALESCE(custom_daily_capacity, max_daily_capacity, 6)
  INTO v_daily_capacity
  FROM user_capacity_settings
  WHERE user_id = v_owner_id;

  -- Default capacity if no settings row
  IF v_daily_capacity IS NULL THEN
    v_daily_capacity := 6;
  END IF;

  -- Count active appointments for this owner on this day
  SELECT COUNT(*)
  INTO v_daily_count
  FROM appointments
  WHERE current_owner_id = v_owner_id
    AND starts_at >= v_day_start
    AND starts_at < v_day_end
    AND appointment_status NOT IN ('cancelled', 'reassigned', 'completed', 'no_show', 'blocked');

  IF v_daily_count >= v_daily_capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'capacity_exceeded',
      'detail', format('Kapazität erreicht: %s/%s Termine am %s', v_daily_count, v_daily_capacity, v_day_start::date));
  END IF;

  -- ── BLOCKER ENFORCEMENT ──
  -- Check for hard blockers (vacation, sick_leave, unavailable, full_day_block)
  SELECT COUNT(*)
  INTO v_blocker_collision
  FROM calendar_blockers
  WHERE user_id = v_owner_id
    AND blocker_type IN ('vacation', 'sick_leave', 'unavailable', 'full_day_block')
    AND starts_at < p_ends_at
    AND ends_at > p_starts_at;

  IF v_blocker_collision > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'blocker_collision',
      'detail', 'Dieser Zeitraum ist durch einen Blocker gesperrt.');
  END IF;

  -- Create appointment
  INSERT INTO appointments (
    lead_id,
    current_owner_id,
    setter_id,
    closer_id,
    starts_at,
    ends_at,
    call_type,
    appointment_status,
    booking_source,
    created_by
  ) VALUES (
    p_lead_id,
    v_owner_id,
    COALESCE(p_setter_id, v_caller_id),
    p_closer_id,
    p_starts_at,
    p_ends_at,
    p_call_type,
    CASE WHEN p_confirmed THEN 'confirmed' ELSE 'booked' END,
    'manual',
    v_caller_id
  )
  RETURNING id INTO v_appointment_id;

  -- Log calendar event
  INSERT INTO calendar_events (event_type, appointment_id, metadata, created_by)
  VALUES (
    'appointment_created',
    v_appointment_id,
    jsonb_build_object(
      'booking_source', 'manual',
      'call_type', p_call_type,
      'setter_id', COALESCE(p_setter_id, v_caller_id),
      'closer_id', p_closer_id,
      'reason', p_reason
    ),
    v_caller_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'owner_id', v_owner_id
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 2. UPGRADE reassign_appointment: Add retain_original_block param
-- ═══════════════════════════════════════════════════════════
-- Drop the old version first to avoid overload
DROP FUNCTION IF EXISTS public.reassign_appointment(uuid, uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.reassign_appointment(
  p_appointment_id uuid,
  p_new_owner_id uuid,
  p_new_owner_role text DEFAULT 'closer',
  p_reassignment_type text DEFAULT 'reassignment',
  p_reason text DEFAULT NULL,
  _action_source text DEFAULT 'manual',
  p_retain_block boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_level int;
  v_old_owner_id uuid;
  v_old_owner_role text;
  v_appt_status text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  -- Level check
  SELECT COALESCE(current_phase, 0) INTO v_caller_level
  FROM profiles WHERE id = v_caller_id;

  IF v_caller_level < 6 AND NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = v_caller_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden_level_below_l6');
  END IF;

  -- Validate role
  IF p_new_owner_role NOT IN ('setter', 'closer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_owner_role');
  END IF;

  -- Validate type
  IF p_reassignment_type NOT IN ('self_takeover', 'reassignment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_reassignment_type');
  END IF;

  -- Self-takeover check
  IF p_reassignment_type = 'self_takeover' AND p_new_owner_id != v_caller_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_takeover_must_target_caller');
  END IF;

  -- Validate new owner exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_new_owner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'new_owner_not_found');
  END IF;

  -- Get current appointment state
  SELECT current_owner_id, appointment_status,
    CASE WHEN closer_id = current_owner_id THEN 'closer' ELSE 'setter' END
  INTO v_old_owner_id, v_appt_status, v_old_owner_role
  FROM appointments WHERE id = p_appointment_id;

  IF v_old_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appt_status IN ('cancelled', 'completed', 'reassigned') THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_active');
  END IF;

  IF v_old_owner_id = p_new_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owner');
  END IF;

  -- Update the appointment
  UPDATE appointments
  SET current_owner_id = p_new_owner_id,
      setter_id = CASE WHEN p_new_owner_role = 'setter' THEN p_new_owner_id ELSE setter_id END,
      closer_id = CASE WHEN p_new_owner_role = 'closer' THEN p_new_owner_id ELSE closer_id END,
      retain_original_block = p_retain_block,
      updated_at = now()
  WHERE id = p_appointment_id;

  -- Log reassignment
  INSERT INTO appointment_reassignment_log (
    appointment_id, from_user_id, to_user_id, reassignment_type,
    reason, reassigned_by
  ) VALUES (
    p_appointment_id, v_old_owner_id, p_new_owner_id, p_reassignment_type,
    p_reason, v_caller_id
  );

  -- Log calendar event
  INSERT INTO calendar_events (event_type, appointment_id, metadata, created_by)
  VALUES (
    'ownership_reassigned',
    p_appointment_id,
    jsonb_build_object(
      'from_owner_id', v_old_owner_id,
      'to_owner_id', p_new_owner_id,
      'role', p_new_owner_role,
      'type', p_reassignment_type,
      'reason', p_reason,
      'action_source', _action_source,
      'retain_block', p_retain_block
    ),
    v_caller_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', p_appointment_id,
    'previous_owner_id', v_old_owner_id,
    'previous_owner_role', v_old_owner_role,
    'new_owner_id', p_new_owner_id,
    'new_owner_role', p_new_owner_role,
    'first_reassignment', true,
    'reassigned_at', now()
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 3. CANONICAL VIEW: Active appointments (excludes reassigned/cancelled/blocked)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.active_appointments AS
SELECT a.*
FROM appointments a
LEFT JOIN leads l ON l.id = a.lead_id
WHERE a.appointment_status NOT IN ('cancelled', 'reassigned', 'blocked')
  AND COALESCE(l.is_test_lead, false) = false;

-- ═══════════════════════════════════════════════════════════
-- 4. CANONICAL VIEW: Real leads (excludes test leads + simulation)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.real_leads AS
SELECT *
FROM leads
WHERE is_test_lead = false
  AND COALESCE(is_simulation, false) = false;
