
CREATE OR REPLACE FUNCTION public.record_payment_revenue(p_session_id text, p_stripe_payment_intent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link RECORD;
  v_call_id UUID;
  v_result jsonb;
  v_referral_result jsonb;
  v_commission_result jsonb;
BEGIN
  SELECT * INTO v_link FROM payment_links WHERE session_id = p_session_id LIMIT 1;

  IF v_link IS NULL THEN
    RETURN jsonb_build_object('error', 'payment_link_not_found');
  END IF;

  IF v_link.status = 'paid' THEN
    SELECT id INTO v_call_id FROM calls WHERE payment_link_id = v_link.id LIMIT 1;
    RETURN jsonb_build_object('status', 'already_processed', 'call_id', v_call_id);
  END IF;

  UPDATE payment_links
  SET status = 'paid', paid_at = now(),
      payment_intent_id = COALESCE(p_stripe_payment_intent, payment_intent_id)
  WHERE id = v_link.id;

  INSERT INTO payment_events (payment_link_id, event_type, stripe_event_id, status, payload)
  VALUES (v_link.id, 'paid', p_stripe_payment_intent, 'success', jsonb_build_object('session_id', p_session_id, 'amount', v_link.amount));

  -- FIX: Set booked_at + showed_at so validate_call_lifecycle trigger doesn't nullify closed_at
  INSERT INTO calls (
    user_id, lead_id, appointment_id, payment_link_id,
    call_type, funnel_stage, offer_type, result,
    revenue, status, booked_at, showed_at, closed_at, is_simulation,
    provider, provider_call_id
  ) VALUES (
    v_link.closer_id, v_link.lead_id, v_link.appointment_id, v_link.id,
    'payment_link', 'close', v_link.deal_type, 'closed_won',
    v_link.amount / 100.0, 'completed', now(), now(), now(), false,
    'stripe', COALESCE(p_stripe_payment_intent, p_session_id)
  )
  RETURNING id INTO v_call_id;

  UPDATE payment_links SET call_id = v_call_id WHERE id = v_link.id;

  IF v_link.lead_id IS NOT NULL THEN
    UPDATE leads
    SET lead_status = 'closed_won', outcome = 'won', payment_status = 'paid',
        deal_value = v_link.amount / 100.0, closed_at = now(),
        closer_id = COALESCE(closer_id, v_link.closer_id)
    WHERE id = v_link.lead_id AND COALESCE(lead_status, '') != 'closed_won';
  END IF;

  INSERT INTO audit_logs (action, source_type, note, after_state)
  VALUES ('payment_completed', 'system',
    format('Payment completed for link %s, call %s created', v_link.id, v_call_id),
    jsonb_build_object('payment_link_id', v_link.id, 'call_id', v_call_id, 'lead_id', v_link.lead_id, 'closer_id', v_link.closer_id, 'amount_cents', v_link.amount, 'deal_type', v_link.deal_type));

  SELECT distribute_commissions(v_call_id) INTO v_commission_result;

  -- Trigger referral earning creation
  IF v_link.lead_id IS NOT NULL THEN
    BEGIN
      SELECT create_referral_earning_for_lead(v_link.lead_id) INTO v_referral_result;
    EXCEPTION WHEN OTHERS THEN
      v_referral_result := jsonb_build_object('error', SQLERRM);
    END;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'call_id', v_call_id,
    'revenue', v_link.amount / 100.0,
    'commissions', v_commission_result,
    'referral', COALESCE(v_referral_result, jsonb_build_object('skipped', true))
  );
END;
$function$;
