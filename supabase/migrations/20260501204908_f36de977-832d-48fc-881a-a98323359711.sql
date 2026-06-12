
CREATE OR REPLACE FUNCTION public.reverse_payment_revenue(p_session_id text, p_reason text DEFAULT 'refund'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link RECORD;
  v_call RECORD;
  v_reversed_count INT := 0;
BEGIN
  SELECT * INTO v_link
  FROM payment_links
  WHERE session_id = p_session_id
  LIMIT 1;

  IF v_link IS NULL THEN
    RETURN jsonb_build_object('error', 'payment_link_not_found');
  END IF;

  SELECT * INTO v_call
  FROM calls
  WHERE payment_link_id = v_link.id
  LIMIT 1;

  UPDATE payment_links
  SET status = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END,
      refunded_at = CASE WHEN p_reason != 'dispute' THEN now() ELSE refunded_at END,
      disputed_at = CASE WHEN p_reason = 'dispute' THEN now() ELSE disputed_at END
  WHERE id = v_link.id;

  INSERT INTO payment_events (payment_link_id, event_type, status, payload)
  VALUES (v_link.id, p_reason, 'processed', jsonb_build_object(
    'session_id', p_session_id,
    'call_id', v_call.id
  ));

  IF v_call IS NOT NULL THEN
    UPDATE calls
    SET result = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END,
        revenue = 0,
        status = 'reversed'
    WHERE id = v_call.id;

    UPDATE commissions
    SET status = 'reversed',
        reversed_at = now(),
        reversed_reason = p_reason
    WHERE call_id = v_call.id
      AND status != 'reversed';

    GET DIAGNOSTICS v_reversed_count = ROW_COUNT;
  END IF;

  -- FIXED: use lead_status instead of status, also update outcome
  IF v_link.lead_id IS NOT NULL THEN
    UPDATE leads
    SET lead_status = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END,
        outcome = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END,
        payment_status = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END
    WHERE id = v_link.lead_id;
  END IF;

  INSERT INTO audit_logs (action, source_type, note, after_state)
  VALUES (
    CASE WHEN p_reason = 'dispute' THEN 'payment_disputed' ELSE 'payment_refunded' END,
    'system',
    format('Payment %s for link %s', p_reason, v_link.id),
    jsonb_build_object(
      'payment_link_id', v_link.id,
      'call_id', v_call.id,
      'lead_id', v_link.lead_id,
      'reason', p_reason,
      'commissions_reversed', v_reversed_count
    )
  );

  RETURN jsonb_build_object(
    'status', 'reversed',
    'reason', p_reason,
    'call_id', v_call.id,
    'commissions_reversed', v_reversed_count
  );
END;
$function$;
