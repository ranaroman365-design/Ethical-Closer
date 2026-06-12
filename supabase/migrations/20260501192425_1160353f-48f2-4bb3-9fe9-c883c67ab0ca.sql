
-- ============================================================
-- FIX 1: distribute_commissions result check
-- The function checks v_call.result != 'won' but record_payment_revenue
-- sets result = 'closed_won'. Accept BOTH values.
-- ============================================================
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

  -- FIXED: accept both 'won' and 'closed_won' as valid close results
  IF v_call.result NOT IN ('won', 'closed_won') OR v_call.closed_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_closed_won');
  END IF;

  v_revenue := COALESCE(v_call.revenue, v_call.deal_size, 0);
  IF v_revenue <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_revenue');
  END IF;

  v_original_handler_id := v_call.user_id;

  -- ── LOCK PHASE ──────────────────────────────────────────────────────────
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
        VALUES (
          'commission_closer_locked',
          'system',
          format('Closer locked at deal close for appointment %s', v_appt.id),
          jsonb_build_object(
            'call_id', p_call_id,
            'appointment_id', v_appt.id,
            'locked_closer_id', v_locked_closer_id,
            'original_handler_id', v_original_handler_id
          )
        );
      ELSE
        v_locked_closer_id := v_appt.locked_closer_id;
      END IF;
    END IF;
  END IF;

  IF v_locked_closer_id IS NULL THEN
    v_locked_closer_id := v_original_handler_id;
  END IF;

  -- Audit reassignment effect
  IF v_locked_closer_id IS DISTINCT FROM v_original_handler_id
     AND v_original_handler_id IS NOT NULL THEN
    INSERT INTO audit_logs (action, source_type, note, after_state)
    VALUES (
      'commission_reassigned_close',
      'system',
      format('Commission routed to locked closer %s instead of original handler %s',
             v_locked_closer_id, v_original_handler_id),
      jsonb_build_object(
        'call_id', p_call_id,
        'appointment_id', v_call.appointment_id,
        'original_handler_id', v_original_handler_id,
        'locked_closer_id', v_locked_closer_id
      )
    );
  END IF;

  -- ── PAYOUT PHASE ──────────────────────────────────────────────────────
  IF v_locked_closer_id IS NOT NULL THEN
    v_product_key := get_user_product_key(v_locked_closer_id);
    SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;
    SELECT current_stage INTO v_user_stage FROM profiles WHERE id = v_locked_closer_id;

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
          v_amount, 'direct', 'pending',
          jsonb_build_object(
            'locked_closer_id', v_locked_closer_id,
            'locked_at', COALESCE(v_appt.locked_at, now()),
            'original_handler_id', v_original_handler_id,
            'appointment_id', v_call.appointment_id
          )
        )
        ON CONFLICT DO NOTHING;

        v_results := v_results || jsonb_build_object(
          'role', CASE WHEN v_override_active THEN 'director_override' ELSE 'closer' END,
          'user_id', v_locked_closer_id,
          'amount', v_amount,
          'rate', v_rate
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'call_id', p_call_id,
    'locked_closer_id', v_locked_closer_id,
    'commissions', v_results
  );
END;
$function$;

-- ============================================================
-- FIX 2: Add missing columns to payment_links
-- ============================================================
ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_intent_id text,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- ============================================================
-- FIX 3: Create payment_events table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_link_id uuid NOT NULL REFERENCES public.payment_links(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- created, opened, paid, failed, refunded, disputed
  stripe_event_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_link ON public.payment_events(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON public.payment_events(event_type);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Closer who owns the link or admins can see events
CREATE POLICY "Closer sees own payment events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM payment_links pl
      WHERE pl.id = payment_events.payment_link_id
        AND pl.closer_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- Only system (service role) inserts events
CREATE POLICY "System inserts payment events"
  ON public.payment_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================
-- FIX 4: Update record_payment_revenue to set paid_at, payment_intent_id, deal_value, payment_status
-- ============================================================
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

  -- Update payment link status + paid_at + payment_intent_id
  UPDATE payment_links
  SET status = 'paid',
      paid_at = now(),
      payment_intent_id = COALESCE(p_stripe_payment_intent, payment_intent_id)
  WHERE id = v_link.id;

  -- Log payment event
  INSERT INTO payment_events (payment_link_id, event_type, stripe_event_id, metadata)
  VALUES (v_link.id, 'paid', p_stripe_payment_intent, jsonb_build_object(
    'session_id', p_session_id,
    'amount', v_link.amount
  ));

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
    'payment_link',
    'close',
    v_link.deal_type,
    'closed_won',
    v_link.amount / 100.0,
    'completed',
    now(),
    false,
    'stripe',
    COALESCE(p_stripe_payment_intent, p_session_id)
  )
  RETURNING id INTO v_call_id;

  -- Update lead status + deal_value + payment_status
  IF v_link.lead_id IS NOT NULL THEN
    UPDATE leads
    SET status = 'closed_won',
        payment_status = 'paid',
        deal_value = v_link.amount / 100.0,
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
$function$;

-- ============================================================
-- FIX 5: Update reverse_payment_revenue to log events
-- ============================================================
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

  -- Update payment link status
  UPDATE payment_links
  SET status = CASE WHEN p_reason = 'dispute' THEN 'disputed' ELSE 'refunded' END
  WHERE id = v_link.id;

  -- Log event
  INSERT INTO payment_events (payment_link_id, event_type, metadata)
  VALUES (v_link.id, p_reason, jsonb_build_object(
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
    SET status = 'reversed'
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

  RETURN jsonb_build_object(
    'status', 'reversed',
    'reason', p_reason,
    'call_id', v_call.id,
    'commissions_reversed', v_reversed_count
  );
END;
$function$;

-- ============================================================
-- FIX 6: Auto-insert 'created' event when payment_link is created
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_payment_link_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO payment_events (payment_link_id, event_type, metadata)
  VALUES (NEW.id, 'created', jsonb_build_object(
    'deal_type', NEW.deal_type,
    'amount', NEW.amount,
    'closer_id', NEW.closer_id
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_link_created ON public.payment_links;
CREATE TRIGGER trg_payment_link_created
  AFTER INSERT ON public.payment_links
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_payment_link_created();
