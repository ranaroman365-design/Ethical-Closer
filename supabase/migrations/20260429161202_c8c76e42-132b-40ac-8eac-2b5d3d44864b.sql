CREATE OR REPLACE FUNCTION public.get_appointment_full_context(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_appt appointments%ROWTYPE;
  v_lead leads%ROWTYPE;
  v_calls_count int := 0;
  v_messages_count int := 0;
  v_appointments_count int := 0;
  v_quiz jsonb := NULL;
  v_last_call jsonb := NULL;
BEGIN
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = v_appt.lead_id;

  IF v_lead.id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_calls_count FROM calls WHERE user_id = v_lead.id;
    SELECT COUNT(*) INTO v_messages_count FROM wa_messages WHERE lead_id = v_lead.id;
    SELECT COUNT(*) INTO v_appointments_count FROM appointments WHERE lead_id = v_lead.id;
    SELECT to_jsonb(qs.*) INTO v_quiz FROM quiz_submissions qs
      WHERE qs.lead_id = v_lead.id ORDER BY qs.created_at DESC LIMIT 1;
    SELECT to_jsonb(c.*) INTO v_last_call FROM calls c
      WHERE c.user_id = v_lead.id ORDER BY c.created_at DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'appointment', to_jsonb(v_appt),
    'lead', to_jsonb(v_lead),
    'stats', jsonb_build_object(
      'calls_count', v_calls_count,
      'messages_count', v_messages_count,
      'appointments_count', v_appointments_count
    ),
    'last_quiz', v_quiz,
    'last_call', v_last_call
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;