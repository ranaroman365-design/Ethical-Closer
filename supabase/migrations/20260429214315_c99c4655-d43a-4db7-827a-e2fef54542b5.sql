-- ============================================================================
-- Reassignment-aware Closer Commission (Layer 17 untouched)
-- ============================================================================

-- 1. Add appointment_id to calls
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS appointment_id uuid
    REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_appointment_id
  ON public.calls(appointment_id)
  WHERE appointment_id IS NOT NULL;

-- 2. Backfill: link existing calls to nearest appointment for same lead
-- Strategy: match by lead_id (via calls relationship if available), pick appointment
-- with starts_at closest to call.closed_at. If no lead bridge possible, leave NULL
-- and the function falls back to legacy behaviour.
DO $$
DECLARE
  v_has_lead_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='calls' AND column_name='lead_id'
  ) INTO v_has_lead_id;

  IF v_has_lead_id THEN
    EXECUTE $sql$
      UPDATE public.calls c
      SET appointment_id = sub.appointment_id
      FROM (
        SELECT DISTINCT ON (c2.id)
          c2.id AS call_id,
          a.id AS appointment_id
        FROM public.calls c2
        JOIN public.appointments a ON a.lead_id = c2.lead_id
        WHERE c2.appointment_id IS NULL
          AND c2.closed_at IS NOT NULL
          AND c2.lead_id IS NOT NULL
        ORDER BY c2.id, ABS(EXTRACT(EPOCH FROM (a.starts_at - c2.closed_at)))
      ) sub
      WHERE c.id = sub.call_id
        AND c.appointment_id IS NULL;
    $sql$;
  END IF;
END $$;

-- 3. Patch distribute_commissions: route closer commission to current_closer_id
CREATE OR REPLACE FUNCTION public.distribute_commissions(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_call record;
  v_user_stage text;
  v_product_key text;
  v_config jsonb;
  v_rate numeric;
  v_amount numeric;
  v_revenue numeric;
  v_results jsonb := '[]'::jsonb;
  v_override_active boolean;
  v_override_stages text[] := ARRAY['director', 'partner'];
  v_effective_closer_id uuid;
  v_original_handler_id uuid;
BEGIN
  SELECT * INTO v_call FROM calls WHERE id = p_call_id;
  IF v_call IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  IF v_call.result != 'won' OR v_call.closed_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_closed_won');
  END IF;

  v_revenue := COALESCE(v_call.revenue, v_call.deal_size, 0);
  IF v_revenue <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_revenue');
  END IF;

  -- Reassignment-aware closer resolution
  v_original_handler_id := v_call.user_id;
  IF v_call.appointment_id IS NOT NULL THEN
    SELECT current_closer_id INTO v_effective_closer_id
    FROM appointments
    WHERE id = v_call.appointment_id;
  END IF;

  -- Fallback: legacy behaviour
  IF v_effective_closer_id IS NULL THEN
    v_effective_closer_id := v_original_handler_id;
  END IF;

  -- Audit when effective closer differs from original call handler
  IF v_effective_closer_id IS DISTINCT FROM v_original_handler_id
     AND v_original_handler_id IS NOT NULL THEN
    INSERT INTO audit_logs (action, source_type, note, after_state)
    VALUES (
      'commission_reassigned_close',
      'system',
      format('Commission routed to current owner %s instead of original handler %s',
             v_effective_closer_id, v_original_handler_id),
      jsonb_build_object(
        'call_id', p_call_id,
        'appointment_id', v_call.appointment_id,
        'original_handler_id', v_original_handler_id,
        'effective_closer_id', v_effective_closer_id
      )
    );
  END IF;

  -- Closer commission (now uses effective closer)
  IF v_effective_closer_id IS NOT NULL THEN
    v_product_key := get_user_product_key(v_effective_closer_id);
    SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;

    IF v_config IS NULL THEN
      INSERT INTO audit_logs (action, source_type, note, after_state)
      VALUES ('commission_failed', 'system',
        format('No product_config for product=%s — commission skipped for closer %s', v_product_key, v_effective_closer_id),
        jsonb_build_object('call_id', p_call_id, 'user_id', v_effective_closer_id, 'product_key', v_product_key));
      RETURN jsonb_build_object('success', false, 'error', 'missing_product_config', 'product_key', v_product_key);
    END IF;

    v_override_active := COALESCE((v_config->>'override_active')::boolean, false);

    SELECT business_stage INTO v_user_stage FROM profiles WHERE id = v_effective_closer_id;

    IF v_user_stage = ANY(v_override_stages) AND NOT v_override_active THEN
      INSERT INTO audit_logs (action, source_type, note, after_state)
      VALUES ('commission_override_skipped', 'system',
        format('Override stage=%s skipped (override_active=false)', v_user_stage),
        jsonb_build_object('call_id', p_call_id, 'user_id', v_effective_closer_id, 'stage', v_user_stage));
    ELSE
      v_rate := (v_config->'commission_rates'->>COALESCE(v_user_stage, ''))::numeric;

      IF v_rate IS NOT NULL AND v_rate > 0 THEN
        v_amount := ROUND(v_revenue * v_rate, 2);
        INSERT INTO commissions (user_id, call_id, role, amount, is_simulation)
        VALUES (v_effective_closer_id, p_call_id, 'closer', v_amount, v_call.is_simulation)
        ON CONFLICT DO NOTHING;
        v_results := v_results || jsonb_build_object(
          'user_id', v_effective_closer_id,
          'role', 'closer',
          'rate', v_rate,
          'amount', v_amount,
          'reassigned', v_effective_closer_id IS DISTINCT FROM v_original_handler_id
        );
      ELSE
        INSERT INTO audit_logs (action, source_type, note, after_state)
        VALUES ('commission_rate_missing', 'system',
          format('No commission rate for stage=%s in product=%s', v_user_stage, v_product_key),
          jsonb_build_object('call_id', p_call_id, 'user_id', v_effective_closer_id, 'stage', v_user_stage));
      END IF;
    END IF;
  END IF;

  -- Referral / mentor commissions remain unchanged: they flow through
  -- calc_referral_payout based on the effective closer (current owner).
  -- We don't touch that logic here.
  IF v_effective_closer_id IS NOT NULL THEN
    PERFORM calc_referral_payout(v_effective_closer_id, p_call_id, v_revenue, v_call.is_simulation);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'call_id', p_call_id,
    'effective_closer_id', v_effective_closer_id,
    'original_handler_id', v_original_handler_id,
    'reassigned', v_effective_closer_id IS DISTINCT FROM v_original_handler_id,
    'commissions', v_results
  );
END;
$function$;