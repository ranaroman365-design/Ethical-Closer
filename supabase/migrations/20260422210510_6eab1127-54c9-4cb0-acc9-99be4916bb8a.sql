-- ============================================================
-- COMMISSION NORMALIZATION (Phase 1: role widening, Phase 3: override semantics)
-- ============================================================

-- ── Phase 1: widen commissions.role to support all canonical payout roles ──
ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_role_check;

ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_role_check
  CHECK (role = ANY (ARRAY[
    'opener'::text,
    'setter'::text,
    'closer'::text,
    'referrer'::text,
    'referrer_l2'::text,
    'operator'::text,
    'director_override'::text
  ]));

COMMENT ON COLUMN public.commissions.role IS
  'Canonical payout role. Active: opener|setter|closer (direct), referrer|referrer_l2 (Stripe partner ladder). Reserved for future use: operator, director_override (currently inactive — see product_config.override_active).';

-- ── Phase 3: explicitly mark L7/L8 (director, partner) override semantics as not yet active ──
UPDATE public.product_config
SET config = jsonb_set(
  config,
  '{override_active}',
  'false'::jsonb,
  true
)
WHERE product_key = 'etc'
  AND NOT (config ? 'override_active');

-- ── Phase 3: harden distribute_commissions so override-style stages do not silently pay out ──
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

  -- Closer commission
  IF v_call.user_id IS NOT NULL THEN
    v_product_key := get_user_product_key(v_call.user_id);
    SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;

    IF v_config IS NULL THEN
      INSERT INTO audit_logs (action, source_type, note, after_state)
      VALUES ('commission_failed', 'system',
        format('No product_config for product=%s — commission skipped for closer %s', v_product_key, v_call.user_id),
        jsonb_build_object('call_id', p_call_id, 'user_id', v_call.user_id, 'product_key', v_product_key));
      RETURN jsonb_build_object('success', false, 'error', 'missing_product_config', 'product_key', v_product_key);
    END IF;

    v_override_active := COALESCE((v_config->>'override_active')::boolean, false);

    SELECT business_stage INTO v_user_stage FROM profiles WHERE id = v_call.user_id;

    -- Phase 3: skip override-style stages unless explicitly activated
    IF v_user_stage = ANY(v_override_stages) AND NOT v_override_active THEN
      INSERT INTO audit_logs (action, source_type, note, after_state)
      VALUES ('commission_override_skipped', 'system',
        format('Override stage=%s skipped (override_active=false)', v_user_stage),
        jsonb_build_object('call_id', p_call_id, 'user_id', v_call.user_id, 'stage', v_user_stage));
    ELSE
      v_rate := (v_config->'commission_rates'->>COALESCE(v_user_stage, ''))::numeric;

      IF v_rate IS NOT NULL AND v_rate > 0 THEN
        v_amount := ROUND(v_revenue * v_rate, 2);
        INSERT INTO commissions (user_id, call_id, role, amount, is_simulation)
        VALUES (v_call.user_id, p_call_id, 'closer', v_amount, v_call.is_simulation)
        ON CONFLICT DO NOTHING;
        v_results := v_results || jsonb_build_object('user_id', v_call.user_id, 'role', 'closer', 'rate', v_rate, 'amount', v_amount);
      ELSE
        INSERT INTO audit_logs (action, source_type, note, after_state)
        VALUES ('commission_rate_missing', 'system',
          format('No commission rate for stage=%s in product=%s', v_user_stage, v_product_key),
          jsonb_build_object('call_id', p_call_id, 'user_id', v_call.user_id, 'stage', v_user_stage));
      END IF;
    END IF;
  END IF;

  -- Opener/setter commission
  IF v_call.opener_id IS NOT NULL AND v_call.opener_id != v_call.user_id THEN
    v_product_key := get_user_product_key(v_call.opener_id);
    SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;

    IF v_config IS NOT NULL THEN
      SELECT business_stage INTO v_user_stage FROM profiles WHERE id = v_call.opener_id;
      v_rate := (v_config->'commission_rates'->>COALESCE(v_user_stage, ''))::numeric;

      IF v_rate IS NOT NULL AND v_rate > 0 THEN
        v_amount := ROUND(v_revenue * v_rate, 2);
        INSERT INTO commissions (user_id, call_id, role, amount, is_simulation)
        VALUES (v_call.opener_id, p_call_id, 'setter', v_amount, v_call.is_simulation)
        ON CONFLICT DO NOTHING;
        v_results := v_results || jsonb_build_object('user_id', v_call.opener_id, 'role', 'setter', 'rate', v_rate, 'amount', v_amount);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'distributed', v_results);
END;
$function$;

COMMENT ON FUNCTION public.distribute_commissions(uuid) IS
  'Canonical payout function for direct closer/setter commissions. Reads rates from product_config.config.commission_rates. Override-style stages (director, partner) are skipped unless product_config.override_active = true. Partner referrer commissions are handled separately by the distribute-partner-commissions edge function.';