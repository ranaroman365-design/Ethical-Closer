CREATE OR REPLACE FUNCTION public.get_appointment_full_context(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  v_appt appointments%ROWTYPE;
  v_lead leads%ROWTYPE;
  v_calls_count int := 0;
  v_messages_count int := 0;
  v_appointments_count int := 0;
  v_quiz jsonb := NULL;
  v_last_call jsonb := NULL;
  v_truly_exists boolean;
  v_avg_response_minutes numeric := NULL;
  v_has_lead_replied boolean := false;
  v_first_contact_minutes numeric := NULL;
  v_lead_reply_count int := 0;
BEGIN
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    v_truly_exists := public.appointment_exists_unsafe(p_appointment_id);
    IF v_truly_exists THEN
      RETURN jsonb_build_object(
        'error', 'forbidden',
        'message', 'Keine Berechtigung für diesen Termin.'
      );
    ELSE
      RETURN jsonb_build_object(
        'error', 'not_found',
        'message', 'Termin existiert nicht.'
      );
    END IF;
  END IF;

  IF v_appt.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_appt.lead_id;
  END IF;

  IF v_lead.id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_calls_count          FROM calls          WHERE user_id = v_lead.id;
    SELECT COUNT(*) INTO v_messages_count       FROM wa_messages    WHERE lead_id = v_lead.id;
    SELECT COUNT(*) INTO v_appointments_count   FROM appointments   WHERE lead_id = v_lead.id;

    SELECT to_jsonb(qs.*) INTO v_quiz
      FROM quiz_submissions qs
      WHERE qs.lead_id = v_lead.id
      ORDER BY qs.created_at DESC
      LIMIT 1;

    SELECT to_jsonb(c.*) INTO v_last_call
      FROM calls c
      WHERE c.user_id = v_lead.id
      ORDER BY c.created_at DESC
      LIMIT 1;

    -- Check if lead has ever replied
    SELECT COUNT(*) INTO v_lead_reply_count
      FROM wa_messages
      WHERE lead_id = v_lead.id AND direction = 'inbound';
    v_has_lead_replied := v_lead_reply_count > 0;

    -- Calculate avg response time: for each outbound message, find the next inbound reply
    -- and compute the time difference in minutes
    SELECT AVG(response_min) INTO v_avg_response_minutes
    FROM (
      SELECT EXTRACT(EPOCH FROM (reply.created_at - outbound.created_at)) / 60.0 AS response_min
      FROM wa_messages outbound
      CROSS JOIN LATERAL (
        SELECT created_at
        FROM wa_messages inbound
        WHERE inbound.lead_id = v_lead.id
          AND inbound.direction = 'inbound'
          AND inbound.created_at > outbound.created_at
        ORDER BY inbound.created_at ASC
        LIMIT 1
      ) reply
      WHERE outbound.lead_id = v_lead.id
        AND outbound.direction = 'outbound'
    ) pairs;

    -- First contact: time from lead creation to first outbound message
    SELECT EXTRACT(EPOCH FROM (MIN(wm.created_at) - v_lead.created_at)) / 60.0
      INTO v_first_contact_minutes
      FROM wa_messages wm
      WHERE wm.lead_id = v_lead.id AND wm.direction = 'outbound';
  END IF;

  RETURN jsonb_build_object(
    'appointment', to_jsonb(v_appt),
    'lead',        CASE WHEN v_lead.id IS NOT NULL THEN to_jsonb(v_lead) ELSE NULL END,
    'lead_missing', v_lead.id IS NULL,
    'stats', jsonb_build_object(
      'calls_count',              v_calls_count,
      'messages_count',           v_messages_count,
      'appointments_count',       v_appointments_count,
      'avg_response_time_minutes', ROUND(v_avg_response_minutes, 1),
      'has_lead_replied',          v_has_lead_replied,
      'first_contact_minutes',     ROUND(v_first_contact_minutes, 1),
      'lead_reply_count',          v_lead_reply_count
    ),
    'last_quiz', v_quiz,
    'last_call', v_last_call
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', 'exception', 'message', SQLERRM);
END;
$function$;