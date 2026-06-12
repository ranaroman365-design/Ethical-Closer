
-- Phase 1: Extend payment_links with missing columns
ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id),
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.calls(id),
  ADD COLUMN IF NOT EXISTS net_amount integer,
  ADD COLUMN IF NOT EXISTS stripe_fee integer;

-- Phase 2: Extend payment_events with status and payload columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_events' AND column_name='status') THEN
    ALTER TABLE public.payment_events ADD COLUMN status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payment_events' AND column_name='payload') THEN
    ALTER TABLE public.payment_events ADD COLUMN payload jsonb;
  END IF;
END $$;

-- Phase 3: Add indexes
CREATE INDEX IF NOT EXISTS idx_payment_events_link ON public.payment_events(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON public.payment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON public.payment_events(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON public.payment_links(status);
CREATE INDEX IF NOT EXISTS idx_payment_links_closer ON public.payment_links(closer_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_lead ON public.payment_links(lead_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_paid ON public.payment_links(paid_at);

-- Phase 4: Update record_payment_revenue to set call_id on payment_links
CREATE OR REPLACE FUNCTION public.record_payment_revenue(
  p_session_id text,
  p_stripe_payment_intent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link RECORD;
  v_call_id UUID;
  v_result jsonb;
BEGIN
  SELECT * INTO v_link
  FROM payment_links
  WHERE session_id = p_session_id
  LIMIT 1;

  IF v_link IS NULL THEN
    RETURN jsonb_build_object('error', 'payment_link_not_found');
  END IF;

  IF v_link.status = 'paid' THEN
    SELECT id INTO v_call_id FROM calls WHERE payment_link_id = v_link.id LIMIT 1;
    RETURN jsonb_build_object('status', 'already_processed', 'call_id', v_call_id);
  END IF;

  -- Update payment link status
  UPDATE payment_links
  SET status = 'paid',
      paid_at = now(),
      payment_intent_id = COALESCE(p_stripe_payment_intent, payment_intent_id)
  WHERE id = v_link.id;

  -- Log payment event
  INSERT INTO payment_events (payment_link_id, event_type, stripe_event_id, status, payload)
  VALUES (v_link.id, 'paid', p_stripe_payment_intent, 'success', jsonb_build_object(
    'session_id', p_session_id,
    'amount', v_link.amount
  ));

  -- Create calls entry (Revenue Truth)
  INSERT INTO calls (
    user_id, lead_id, appointment_id, payment_link_id,
    call_type, funnel_stage, offer_type, result,
    revenue, status, closed_at, is_simulation,
    provider, provider_call_id
  ) VALUES (
    v_link.closer_id, v_link.lead_id, v_link.appointment_id, v_link.id,
    'payment_link', 'close', v_link.deal_type, 'closed_won',
    v_link.amount / 100.0, 'completed', now(), false,
    'stripe', COALESCE(p_stripe_payment_intent, p_session_id)
  )
  RETURNING id INTO v_call_id;

  -- Set call_id back on payment_links for cross-reference
  UPDATE payment_links SET call_id = v_call_id WHERE id = v_link.id;

  -- Update lead status
  IF v_link.lead_id IS NOT NULL THEN
    UPDATE leads
    SET status = 'closed_won',
        payment_status = 'paid',
        deal_value = v_link.amount / 100.0,
        closed_at = now(),
        closer_id = COALESCE(closer_id, v_link.closer_id)
    WHERE id = v_link.lead_id
      AND status != 'closed_won';
  END IF;

  -- Audit log
  INSERT INTO audit_logs (action, source_type, note, after_state)
  VALUES (
    'payment_completed',
    'system',
    format('Payment completed for link %s, call %s created', v_link.id, v_call_id),
    jsonb_build_object(
      'payment_link_id', v_link.id,
      'call_id', v_call_id,
      'lead_id', v_link.lead_id,
      'closer_id', v_link.closer_id,
      'amount_cents', v_link.amount,
      'deal_type', v_link.deal_type
    )
  );

  -- Trigger commission distribution
  SELECT distribute_commissions(v_call_id) INTO v_result;

  RETURN jsonb_build_object(
    'status', 'success',
    'call_id', v_call_id,
    'revenue', v_link.amount / 100.0,
    'commissions', v_result
  );
END;
$$;

-- Phase 5: Update reverse_payment_revenue for refunded_at / disputed_at
CREATE OR REPLACE FUNCTION public.reverse_payment_revenue(
  p_session_id text,
  p_reason text DEFAULT 'refund'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Update payment link status + timestamps
  UPDATE payment_links
  SET status = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END,
      refunded_at = CASE WHEN p_reason != 'dispute' THEN now() ELSE refunded_at END,
      disputed_at = CASE WHEN p_reason = 'dispute' THEN now() ELSE disputed_at END
  WHERE id = v_link.id;

  -- Log event
  INSERT INTO payment_events (payment_link_id, event_type, status, payload)
  VALUES (v_link.id, p_reason, 'processed', jsonb_build_object(
    'session_id', p_session_id,
    'call_id', v_call.id
  ));

  -- Reverse call revenue
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

  -- Update lead status
  IF v_link.lead_id IS NOT NULL THEN
    UPDATE leads
    SET status = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END,
        payment_status = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END
    WHERE id = v_link.lead_id;
  END IF;

  -- Audit log
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
$$;
