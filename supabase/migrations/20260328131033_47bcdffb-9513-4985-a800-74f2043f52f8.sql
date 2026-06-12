
-- Drop old distribute_commissions (returns void, we need jsonb)
DROP FUNCTION IF EXISTS public.distribute_commissions(uuid);

-- 5.3 distribute_commissions — config-driven, NO hardcoded rates
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

    SELECT business_stage INTO v_user_stage FROM profiles WHERE id = v_call.user_id;
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
        VALUES (v_call.opener_id, p_call_id, 'opener', v_amount, v_call.is_simulation)
        ON CONFLICT DO NOTHING;
        v_results := v_results || jsonb_build_object('user_id', v_call.opener_id, 'role', 'opener', 'rate', v_rate, 'amount', v_amount);
      END IF;
    ELSE
      INSERT INTO audit_logs (action, source_type, note, after_state)
      VALUES ('commission_failed', 'system',
        format('No product_config for opener product=%s', v_product_key),
        jsonb_build_object('call_id', p_call_id, 'opener_id', v_call.opener_id));
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'call_id', p_call_id, 'revenue', v_revenue, 'distributions', v_results);
END;
$function$;

-- Also rewrite promote_user (drop+create since it may have different signature)
DROP FUNCTION IF EXISTS public.promote_user(uuid, int);

CREATE OR REPLACE FUNCTION public.promote_user(p_user_id uuid, p_target_level int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_key text;
  v_config jsonb;
  v_level_entry jsonb;
  v_role_label text;
  v_stage text;
BEGIN
  v_product_key := get_user_product_key(p_user_id);
  SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;

  IF v_config IS NULL THEN
    INSERT INTO audit_logs (action, source_type, actor_id, note, after_state)
    VALUES ('promote_user_failed', 'system', p_user_id,
      format('No product_config found for product_key=%s — promotion aborted', v_product_key),
      jsonb_build_object('user_id', p_user_id, 'product_key', v_product_key, 'target_level', p_target_level));
    RETURN jsonb_build_object('success', false, 'error', 'missing_product_config', 'product_key', v_product_key);
  END IF;

  SELECT elem INTO v_level_entry
  FROM jsonb_array_elements(v_config->'levels') AS elem
  WHERE (elem->>'level')::int = p_target_level;

  IF v_level_entry IS NULL THEN
    INSERT INTO audit_logs (action, source_type, actor_id, note, after_state)
    VALUES ('promote_user_failed', 'system', p_user_id,
      format('Level %s not defined in product_config for product=%s', p_target_level, v_product_key),
      jsonb_build_object('user_id', p_user_id, 'product_key', v_product_key, 'target_level', p_target_level));
    RETURN jsonb_build_object('success', false, 'error', 'level_not_defined', 'level', p_target_level);
  END IF;

  v_role_label := v_level_entry->>'role';
  v_stage := v_level_entry->>'stage';

  UPDATE profiles SET business_stage = v_stage WHERE id = p_user_id;

  UPDATE user_level_status SET
    current_level = p_target_level,
    current_role_label = v_role_label,
    promotion_status = 'promoted',
    promoted_at = now(),
    last_evaluated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_level_status (user_id, current_level, current_role_label, promotion_status, promoted_at, last_evaluated_at)
    VALUES (p_user_id, p_target_level, v_role_label, 'promoted', now(), now());
  END IF;

  INSERT INTO audit_logs (action, source_type, actor_id, note, after_state)
  VALUES ('user_promoted', 'system', p_user_id,
    format('Promoted to L%s (%s) via product_config[%s]', p_target_level, v_role_label, v_product_key),
    jsonb_build_object('user_id', p_user_id, 'level', p_target_level, 'role', v_role_label, 'stage', v_stage, 'product', v_product_key));

  RETURN jsonb_build_object('success', true, 'level', p_target_level, 'role', v_role_label, 'stage', v_stage, 'product', v_product_key);
END;
$function$;
