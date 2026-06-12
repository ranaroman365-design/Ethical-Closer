
CREATE OR REPLACE FUNCTION public.mark_appointment_attended(
  _appointment_id uuid,
  _completed_at  timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt RECORD;
  v_authorized boolean := false;
  v_ts timestamptz := COALESCE(_completed_at, now());
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT id, lead_id, setter_id, attendance_flag, call_completed_at, appointment_status
    INTO v_appt
    FROM public.appointments
   WHERE id = _appointment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Authorization
  IF v_appt.setter_id = v_uid THEN
    v_authorized := true;
  ELSIF public.is_perf_editor(v_uid) THEN
    v_authorized := true;
  ELSE
    -- closer/opener on a related call
    IF EXISTS (
      SELECT 1 FROM public.calls c
       WHERE c.id::text = ''  -- placeholder; real link via lead
    ) THEN NULL; END IF;
    IF EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = v_uid
         AND p.id IN (
           SELECT user_id FROM public.user_roles
            WHERE role IN ('admin','owner','director','operator','closer','setter')
         )
         AND v_appt.setter_id IS NOT NULL
    ) THEN
      v_authorized := false; -- still require explicit assignment for non-admins
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Idempotent: if already attended, return ok without re-write
  IF COALESCE(v_appt.attendance_flag,false) = true
     OR v_appt.call_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'already_attended', true
    );
  END IF;

  UPDATE public.appointments
     SET attendance_flag    = true,
         call_completed_at  = v_ts,
         appointment_status = CASE
           WHEN appointment_status IN ('superseded','cancelled') THEN appointment_status
           ELSE 'completed' END,
         outcome            = COALESCE(outcome, 'showed'),
         updated_at         = now()
   WHERE id = _appointment_id;

  -- Canonical `showed` event is emitted by trg_emit_showed (idempotent via unique index).

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', _appointment_id,
    'attended_at', v_ts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_appointment_no_show(
  _appointment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appt RECORD;
  v_authorized boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT id, setter_id, attendance_flag, call_completed_at
    INTO v_appt
    FROM public.appointments
   WHERE id = _appointment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_appt.setter_id = v_uid OR public.is_perf_editor(v_uid) THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Refuse to flip a real attended call to no-show
  IF COALESCE(v_appt.attendance_flag,false) = true
     OR v_appt.call_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_attended');
  END IF;

  UPDATE public.appointments
     SET attendance_flag      = false,
         call_status          = 'no_show',
         outcome              = COALESCE(outcome, 'no_show'),
         no_show_detected_at  = COALESCE(no_show_detected_at, now()),
         appointment_status   = CASE
           WHEN appointment_status IN ('superseded','cancelled','completed') THEN appointment_status
           ELSE 'no_show' END,
         updated_at           = now()
   WHERE id = _appointment_id;

  RETURN jsonb_build_object('ok', true, 'appointment_id', _appointment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_appointment_attended(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_appointment_no_show(uuid)               FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_appointment_attended(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_appointment_no_show(uuid)               TO authenticated;
