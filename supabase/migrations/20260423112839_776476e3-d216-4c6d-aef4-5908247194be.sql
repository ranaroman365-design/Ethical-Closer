
CREATE OR REPLACE FUNCTION public.mark_appointment_attended(_appointment_id uuid, _completed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_appt.setter_id = v_uid THEN
    v_authorized := true;
  ELSIF public.is_perf_editor(v_uid) THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

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
         call_status        = 'completed',
         appointment_status = CASE
           WHEN appointment_status IN ('superseded','cancelled') THEN appointment_status
           ELSE 'completed' END,
         outcome            = COALESCE(outcome, 'showed'),
         updated_at         = now()
   WHERE id = _appointment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', _appointment_id,
    'attended_at', v_ts
  );
END;
$function$;
