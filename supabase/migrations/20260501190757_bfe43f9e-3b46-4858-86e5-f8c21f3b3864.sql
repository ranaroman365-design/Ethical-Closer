
-- Add lead_id and payment_link_id to calls
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id);
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS payment_link_id UUID;

CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON public.calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_payment_link_id ON public.calls(payment_link_id);

-- Function: Record revenue from a successful payment
CREATE OR REPLACE FUNCTION public.record_payment_revenue(
  p_session_id TEXT,
  p_stripe_payment_intent TEXT DEFAULT NULL
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
  -- Find the payment link
  SELECT * INTO v_link
  FROM payment_links
  WHERE session_id = p_session_id
  LIMIT 1;

  IF v_link IS NULL THEN
    RETURN jsonb_build_object('error', 'payment_link_not_found');
  END IF;

  -- Idempotency: check if already processed
  IF v_link.status = 'paid' THEN
    SELECT id INTO v_call_id FROM calls WHERE payment_link_id = v_link.id LIMIT 1;
    RETURN jsonb_build_object('status', 'already_processed', 'call_id', v_call_id);
  END IF;

  -- Update payment link status
  UPDATE payment_links SET status = 'paid' WHERE id = v_link.id;

  -- Create calls entry (Revenue Truth)
  INSERT INTO calls (
    user_id,
    lead_id,
    payment_link_id,
    call_type,
    funnel_stage,
    offer_type,
    result,
    revenue,
    status,
    closed_at,
    is_simulation,
    provider,
    provider_call_id
  ) VALUES (
    v_link.closer_id,
    v_link.lead_id,
    v_link.id,
    'closing',
    'close',
    v_link.deal_type,
    'closed_won',
    v_link.amount / 100.0, -- cents to EUR
    'completed',
    now(),
    false,
    'stripe',
    COALESCE(p_stripe_payment_intent, p_session_id)
  )
  RETURNING id INTO v_call_id;

  -- Update lead status if lead exists
  IF v_link.lead_id IS NOT NULL THEN
    UPDATE leads
    SET status = 'closed_won',
        closed_at = now()
    WHERE id = v_link.lead_id
      AND status != 'closed_won';
  END IF;

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

-- Function: Reverse revenue (refund/chargeback)
CREATE OR REPLACE FUNCTION public.reverse_payment_revenue(
  p_session_id TEXT,
  p_reason TEXT DEFAULT 'refund'
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
  -- Find payment link
  SELECT * INTO v_link
  FROM payment_links
  WHERE session_id = p_session_id
  LIMIT 1;

  IF v_link IS NULL THEN
    RETURN jsonb_build_object('error', 'payment_link_not_found');
  END IF;

  -- Find associated call
  SELECT * INTO v_call
  FROM calls
  WHERE payment_link_id = v_link.id
  LIMIT 1;

  -- Update payment link status
  UPDATE payment_links
  SET status = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END
  WHERE id = v_link.id;

  -- Reverse call revenue
  IF v_call IS NOT NULL THEN
    UPDATE calls
    SET result = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END,
        revenue = 0,
        status = 'reversed'
    WHERE id = v_call.id;

    -- Reverse commissions
    UPDATE commissions
    SET status = 'reversed'
    WHERE call_id = v_call.id
      AND status != 'reversed';

    GET DIAGNOSTICS v_reversed_count = ROW_COUNT;
  END IF;

  -- Update lead status
  IF v_link.lead_id IS NOT NULL THEN
    UPDATE leads
    SET status = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END
    WHERE id = v_link.lead_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'reversed',
    'reason', p_reason,
    'call_id', v_call.id,
    'commissions_reversed', v_reversed_count
  );
END;
$$;
