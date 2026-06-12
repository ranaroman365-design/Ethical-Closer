
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
  v_owner_role text;
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

  -- Resolve owner and role
  v_owner_id := COALESCE(p_closer_id, p_setter_id, v_caller_id);
  v_owner_role := CASE
    WHEN p_closer_id IS NOT NULL THEN 'closer'
    WHEN p_setter_id IS NOT NULL THEN 'setter'
    ELSE 'setter'
  END;

  -- ── CAPACITY ENFORCEMENT ──
  v_day_start := date_trunc('day', p_starts_at AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin';
  v_day_end := v_day_start + interval '1 day';

  SELECT COALESCE(custom_daily_capacity, max_daily_capacity, 6)
  INTO v_daily_capacity
  FROM user_capacity_settings
  WHERE user_id = v_owner_id;

  IF v_daily_capacity IS NULL THEN
    v_daily_capacity := 6;
  END IF;

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

  -- Create appointment (only existing columns)
  INSERT INTO appointments (
    lead_id,
    current_owner_id,
    current_owner_role,
    original_owner_id,
    original_owner_role,
    assigned_operator_id,
    setter_id,
    closer_id,
    starts_at,
    ends_at,
    call_type,
    appointment_status,
    booking_source
  ) VALUES (
    p_lead_id,
    v_owner_id,
    v_owner_role,
    v_owner_id,
    v_owner_role,
    v_owner_id,
    COALESCE(p_setter_id, v_caller_id),
    p_closer_id,
    p_starts_at,
    p_ends_at,
    p_call_type,
    CASE WHEN p_confirmed THEN 'confirmed' ELSE 'booked' END,
    'manual'
  )
  RETURNING id INTO v_appointment_id;

  -- Update lead booking fields
  UPDATE leads SET
    has_booking = true,
    stage = CASE WHEN stage IN ('new', 'unknown', '') THEN 'booked' ELSE stage END,
    booking_id = v_appointment_id
  WHERE id = p_lead_id;

  -- Log calendar event (correct column: actor_user_id)
  INSERT INTO calendar_events (event_type, appointment_id, actor_user_id, reason, metadata)
  VALUES (
    'appointment_created',
    v_appointment_id,
    v_caller_id,
    p_reason,
    jsonb_build_object(
      'booking_source', 'manual',
      'call_type', p_call_type,
      'setter_id', COALESCE(p_setter_id, v_caller_id),
      'closer_id', p_closer_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'owner_id', v_owner_id
  );
END;
$$;
