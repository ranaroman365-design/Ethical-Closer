
CREATE OR REPLACE FUNCTION public.distribute_commissions(p_call_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_call                 record;
  v_appt                 record;
  v_revenue              numeric;
  v_locked_closer_id     uuid;
  v_original_handler_id  uuid;
  v_results              jsonb := '[]'::jsonb;
  v_product_key          text;
  v_config               jsonb;
  v_user_stage           text;
  v_rate                 numeric;
  v_amount               numeric;
  v_override_active      boolean;
  v_override_stages      text[] := ARRAY['director','partner'];
BEGIN
  SELECT * INTO v_call FROM calls WHERE id = p_call_id;
  IF v_call IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  IF v_call.result NOT IN ('won', 'closed_won') OR v_call.closed_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_closed_won');
  END IF;

  v_revenue := COALESCE(v_call.revenue, v_call.deal_size, 0);
  IF v_revenue <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_revenue');
  END IF;

  v_original_handler_id := v_call.user_id;

  -- LOCK PHASE
  IF v_call.appointment_id IS NOT NULL THEN
    SELECT * INTO v_appt FROM appointments WHERE id = v_call.appointment_id FOR UPDATE;
    IF v_appt.id IS NOT NULL THEN
      IF v_appt.locked_closer_id IS NULL THEN
        UPDATE appointments
           SET locked_closer_id = COALESCE(v_appt.current_closer_id, v_appt.current_owner_id, v_original_handler_id),
               locked_at        = now()
         WHERE id = v_appt.id
         RETURNING locked_closer_id INTO v_locked_closer_id;
        INSERT INTO audit_logs (action, source_type, note, after_state)
        VALUES ('commission_closer_locked', 'system',
          format('Closer locked at deal close for appointment %s', v_appt.id),
          jsonb_build_object('call_id', p_call_id, 'appointment_id', v_appt.id, 'locked_closer_id', v_locked_closer_id, 'original_handler_id', v_original_handler_id));
      ELSE
        v_locked_closer_id := v_appt.locked_closer_id;
      END IF;
    END IF;
  END IF;

  IF v_locked_closer_id IS NULL THEN
    v_locked_closer_id := v_original_handler_id;
  END IF;

  IF v_locked_closer_id IS DISTINCT FROM v_original_handler_id AND v_original_handler_id IS NOT NULL THEN
    INSERT INTO audit_logs (action, source_type, note, after_state)
    VALUES ('commission_reassigned_close', 'system',
      format('Commission routed to locked closer %s instead of original handler %s', v_locked_closer_id, v_original_handler_id),
      jsonb_build_object('call_id', p_call_id, 'appointment_id', v_call.appointment_id, 'original_handler_id', v_original_handler_id, 'locked_closer_id', v_locked_closer_id));
  END IF;

  -- PAYOUT PHASE
  IF v_locked_closer_id IS NOT NULL THEN
    v_product_key := get_user_product_key(v_locked_closer_id);
    SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;
    -- FIX: use current_phase instead of non-existent current_stage
    SELECT current_phase INTO v_user_stage FROM profiles WHERE id = v_locked_closer_id;

    IF v_config IS NOT NULL AND v_user_stage IS NOT NULL THEN
      v_rate := COALESCE(
        (v_config->'commission_rates'->'closer'->>v_user_stage)::numeric,
        (v_config->'commission_rates'->'closer'->>'default')::numeric,
        0
      );
      v_override_active := v_user_stage = ANY(v_override_stages);

      IF v_rate > 0 THEN
        v_amount := round(v_revenue * v_rate / 100.0, 2);
        INSERT INTO commissions (
          call_id, user_id, role, amount, source_type, payout_status, closer_lock_snapshot
        ) VALUES (
          p_call_id, v_locked_closer_id,
          CASE WHEN v_override_active THEN 'director_override' ELSE 'closer' END,
          v_amount, 'payment', 'pending',
          jsonb_build_object('locked_closer_id', v_locked_closer_id, 'original_handler_id', v_original_handler_id, 'product_key', v_product_key, 'rate', v_rate)
        );
        v_results := v_results || jsonb_build_object('user_id', v_locked_closer_id, 'role', 'closer', 'amount', v_amount, 'rate', v_rate);
      END IF;

      -- Setter commission
      IF v_call.lead_id IS NOT NULL THEN
        DECLARE
          v_setter_id uuid;
          v_setter_rate numeric;
          v_setter_amount numeric;
          v_setter_stage text;
        BEGIN
          SELECT setter_id INTO v_setter_id FROM leads WHERE id = v_call.lead_id;
          IF v_setter_id IS NOT NULL AND v_setter_id IS DISTINCT FROM v_locked_closer_id THEN
            SELECT current_phase INTO v_setter_stage FROM profiles WHERE id = v_setter_id;
            v_setter_rate := COALESCE(
              (v_config->'commission_rates'->'setter'->>COALESCE(v_setter_stage, 'default'))::numeric,
              (v_config->'commission_rates'->'setter'->>'default')::numeric,
              0
            );
            IF v_setter_rate > 0 THEN
              v_setter_amount := round(v_revenue * v_setter_rate / 100.0, 2);
              INSERT INTO commissions (call_id, user_id, role, amount, source_type, payout_status)
              VALUES (p_call_id, v_setter_id, 'setter', v_setter_amount, 'payment', 'pending');
              v_results := v_results || jsonb_build_object('user_id', v_setter_id, 'role', 'setter', 'amount', v_setter_amount, 'rate', v_setter_rate);
            END IF;
          END IF;
        END;
      END IF;
    ELSE
      -- Fallback: no product_config or no current_phase → use default 10%
      v_rate := 10;
      v_amount := round(v_revenue * v_rate / 100.0, 2);
      INSERT INTO commissions (
        call_id, user_id, role, amount, source_type, payout_status, closer_lock_snapshot
      ) VALUES (
        p_call_id, v_locked_closer_id, 'closer', v_amount, 'payment', 'pending',
        jsonb_build_object('locked_closer_id', v_locked_closer_id, 'fallback', true, 'rate', v_rate)
      );
      v_results := v_results || jsonb_build_object('user_id', v_locked_closer_id, 'role', 'closer', 'amount', v_amount, 'rate', v_rate, 'fallback', true);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'revenue', v_revenue, 'commissions', v_results);
END;
$function$;
