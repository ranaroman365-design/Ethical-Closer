
-- Add product_key column to profiles for multi-product support
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT 'etc';

-- Helper: get user's product key
CREATE OR REPLACE FUNCTION public.get_user_product_key(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT product_key FROM profiles WHERE id = p_user_id),
    'etc'
  )
$$;

-- 4. REFACTOR: promote_user() — config-driven
CREATE OR REPLACE FUNCTION public.promote_user(p_user_id uuid, p_admin_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status record;
  v_new_label text;
  v_new_stage text;
  v_product_key text;
  v_config jsonb;
  v_level_entry jsonb;
BEGIN
  SELECT * INTO v_status FROM user_level_status WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User level status not found');
  END IF;

  IF v_status.promotion_status NOT IN ('eligible', 'pending_review') THEN
    RETURN jsonb_build_object('error', 'User is not eligible for promotion');
  END IF;

  v_product_key := get_user_product_key(p_user_id);
  SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;
  IF v_config IS NULL THEN
    RETURN jsonb_build_object('error', 'Product config not found for: ' || v_product_key);
  END IF;

  SELECT elem INTO v_level_entry
  FROM jsonb_array_elements(v_config->'levels') AS elem
  WHERE (elem->>'level')::int = v_status.next_level;

  IF v_level_entry IS NULL THEN
    v_new_label := 'Unknown';
    v_new_stage := 'trainee';
  ELSE
    v_new_label := v_level_entry->>'role';
    v_new_stage := v_level_entry->>'stage';
  END IF;

  UPDATE user_level_status SET
    current_level = v_status.next_level,
    current_role_label = v_new_label,
    eligible_for_next_level = false,
    next_level = v_status.next_level + 1,
    promotion_status = 'promoted',
    promoted_at = now()
  WHERE user_id = p_user_id;

  UPDATE profiles SET
    business_stage = v_new_stage,
    updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO audit_logs (action, actor_id, source_type, note, before_state, after_state)
  VALUES (
    'user_promoted', p_admin_id, 'system',
    format('Promoted to L%s (%s) [product: %s]', v_status.next_level, v_new_label, v_product_key),
    jsonb_build_object('level', v_status.current_level, 'role', v_status.current_role_label),
    jsonb_build_object('level', v_status.next_level, 'role', v_new_label, 'stage', v_new_stage)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'new_level', v_status.next_level,
    'new_role', v_new_label,
    'new_stage', v_new_stage,
    'product', v_product_key
  );
END;
$$;

-- 5. REFACTOR: auto_welcome_community() — config-driven
CREATE OR REPLACE FUNCTION public.auto_welcome_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_community text;
  v_new_community text;
  v_name text;
  v_admin_id uuid;
  v_already_welcomed boolean;
  v_product_key text;
  v_config jsonb;
  v_community_map jsonb;
BEGIN
  IF OLD.business_stage IS NOT DISTINCT FROM NEW.business_stage THEN
    RETURN NEW;
  END IF;

  v_product_key := get_user_product_key(NEW.id);
  SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;

  IF v_config IS NOT NULL AND v_config ? 'community_mapping' THEN
    v_community_map := v_config->'community_mapping';
    v_old_community := COALESCE(v_community_map->>OLD.business_stage, 'trainee');
    v_new_community := COALESCE(v_community_map->>NEW.business_stage, 'trainee');
  ELSE
    v_old_community := CASE
      WHEN OLD.business_stage IN ('prospect','applicant','opener','trainee') THEN 'trainee'
      WHEN OLD.business_stage IN ('setter','associate_setter','associate','senior_associate','senior_setter') THEN 'setter'
      WHEN OLD.business_stage IN ('junior_manager','manager','senior_manager') THEN 'closer'
      WHEN OLD.business_stage IN ('director','partner') THEN 'manager'
      ELSE 'trainee'
    END;
    v_new_community := CASE
      WHEN NEW.business_stage IN ('prospect','applicant','opener','trainee') THEN 'trainee'
      WHEN NEW.business_stage IN ('setter','associate_setter','associate','senior_associate','senior_setter') THEN 'setter'
      WHEN NEW.business_stage IN ('junior_manager','manager','senior_manager') THEN 'closer'
      WHEN NEW.business_stage IN ('director','partner') THEN 'manager'
      ELSE 'trainee'
    END;
  END IF;

  IF v_old_community = v_new_community THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM community_messages
    WHERE message_type = 'system'
      AND community_type = v_new_community
      AND content LIKE '%' || NEW.id::text || '%'
  ) INTO v_already_welcomed;

  IF v_already_welcomed THEN RETURN NEW; END IF;

  v_name := COALESCE(NEW.full_name, 'Ein neues Mitglied');
  SELECT ur.user_id INTO v_admin_id FROM user_roles ur WHERE ur.role = 'admin' LIMIT 1;
  IF v_admin_id IS NULL THEN v_admin_id := NEW.id; END IF;

  INSERT INTO community_messages (user_id, community_type, message_type, content, post_category)
  VALUES (v_admin_id, v_new_community, 'system',
    'Willkommen ' || v_name || ' in der Community! 👋 [user:' || NEW.id::text || ']',
    'motivation');

  RETURN NEW;
END;
$$;

-- 6. REFACTOR: distribute_commissions() — config-driven
CREATE OR REPLACE FUNCTION public.distribute_commissions(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_call record;
  v_stage text;
  v_rate numeric;
  v_product_key text;
  v_config jsonb;
  v_commission_cfg jsonb;
  v_role_cfg jsonb;
BEGIN
  SELECT * INTO v_call FROM calls WHERE id = p_call_id;
  IF NOT FOUND OR v_call.result != 'won' OR v_call.closed_at IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM commissions WHERE call_id = p_call_id) THEN
    RETURN;
  END IF;

  v_product_key := get_user_product_key(v_call.user_id);
  SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;

  IF v_config IS NOT NULL AND v_config ? 'commission_rates' THEN
    v_commission_cfg := v_config->'commission_rates';
  ELSE
    v_commission_cfg := '{"opener":{"_default":0.01},"setter":{"_default":0.03,"senior_associate":0.05,"senior_setter":0.05},"closer":{"_default":0.08,"manager":0.10,"senior_manager":0.12}}'::jsonb;
  END IF;

  -- Opener
  IF v_call.opener_id IS NOT NULL THEN
    v_role_cfg := v_commission_cfg->'opener';
    SELECT business_stage INTO v_stage FROM profiles WHERE id = v_call.opener_id;
    v_rate := COALESCE((v_role_cfg->>v_stage)::numeric, (v_role_cfg->>'_default')::numeric, 0.01);
    INSERT INTO commissions (call_id, user_id, role, amount)
    VALUES (p_call_id, v_call.opener_id, 'opener', ROUND(COALESCE(v_call.revenue, 0) * v_rate, 2));
  END IF;

  -- Setter
  IF v_call.setter_id IS NOT NULL THEN
    v_role_cfg := v_commission_cfg->'setter';
    SELECT business_stage INTO v_stage FROM profiles WHERE id = v_call.setter_id;
    v_rate := COALESCE((v_role_cfg->>v_stage)::numeric, (v_role_cfg->>'_default')::numeric, 0.03);
    INSERT INTO commissions (call_id, user_id, role, amount)
    VALUES (p_call_id, v_call.setter_id, 'setter', ROUND(COALESCE(v_call.revenue, 0) * v_rate, 2));
  END IF;

  -- Closer
  IF v_call.user_id IS NOT NULL THEN
    v_role_cfg := v_commission_cfg->'closer';
    SELECT business_stage INTO v_stage FROM profiles WHERE id = v_call.user_id;
    v_rate := COALESCE((v_role_cfg->>v_stage)::numeric, (v_role_cfg->>'_default')::numeric, 0.08);
    INSERT INTO commissions (call_id, user_id, role, amount)
    VALUES (p_call_id, v_call.user_id, 'closer', ROUND(COALESCE(v_call.revenue, 0) * v_rate, 2));
  END IF;

  UPDATE member_kpis SET
    commission_earned = COALESCE((SELECT SUM(amount) FROM commissions WHERE user_id = member_kpis.user_id), 0),
    updated_at = now()
  WHERE user_id IN (v_call.opener_id, v_call.setter_id, v_call.user_id);
END;
$$;

-- 7. REFACTOR: evaluate_user_for_promotion() — config-driven
CREATE OR REPLACE FUNCTION public.evaluate_user_for_promotion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_level int;
  v_target_level int;
  v_show_rate numeric;
  v_close_rate numeric;
  v_epc numeric;
  v_ai_avg numeric;
  v_calls int;
  v_passed boolean := false;
  v_reason text;
  v_role_label text;
  v_onboarding boolean;
  v_certified boolean;
  v_modules_done int;
  v_has_integrity_issues boolean;
  v_product_key text;
  v_config jsonb;
  v_thresholds jsonb;
  v_level_entry jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM data_integrity_logs
    WHERE record_id IN (SELECT id::text FROM calls WHERE user_id = p_user_id)
      AND violation_type NOT IN ('resolved', 'ignored_with_reason')
  ) INTO v_has_integrity_issues;

  SELECT COALESCE(uls.current_level, 0) INTO v_current_level
  FROM user_level_status uls WHERE uls.user_id = p_user_id;

  IF v_current_level IS NULL THEN
    v_current_level := 0;
    INSERT INTO user_level_status (user_id, current_level, current_role_label)
    VALUES (p_user_id, 0, 'Bewerber')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  v_target_level := v_current_level + 1;

  v_product_key := get_user_product_key(p_user_id);
  SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;

  IF v_config IS NOT NULL THEN
    SELECT elem INTO v_level_entry
    FROM jsonb_array_elements(v_config->'levels') AS elem
    WHERE (elem->>'level')::int = v_target_level;
    v_role_label := COALESCE(v_level_entry->>'role', 'Unknown');
  ELSE
    v_role_label := 'Unknown';
  END IF;

  SELECT s.show_rate, s.close_rate, s.earnings_per_call, s.total_calls
  INTO v_show_rate, v_close_rate, v_epc, v_calls
  FROM users_kpi_snapshot s WHERE s.user_id = p_user_id;

  v_show_rate := COALESCE(v_show_rate, 0);
  v_close_rate := COALESCE(v_close_rate, 0);
  v_epc := COALESCE(v_epc, 0);
  v_calls := COALESCE(v_calls, 0);

  SELECT COALESCE(AVG(overall_call_score), 0) INTO v_ai_avg
  FROM call_ai_scores WHERE user_id = p_user_id AND scoring_status = 'scored';

  SELECT onboarding_completed, certified INTO v_onboarding, v_certified
  FROM profiles WHERE id = p_user_id;

  SELECT count(*) INTO v_modules_done
  FROM member_progress WHERE user_id = p_user_id AND completed = true;

  IF v_has_integrity_issues THEN
    v_reason := 'Unresolved data integrity issues — promotion blocked';
    v_passed := false;
  ELSIF v_config IS NOT NULL AND v_config ? 'promotion_thresholds' THEN
    v_thresholds := v_config->'promotion_thresholds'->v_target_level::text;

    IF v_thresholds IS NULL THEN
      v_passed := false;
      v_reason := 'No thresholds defined for level ' || v_target_level;
    ELSIF (v_thresholds->>'invitation_only')::boolean IS TRUE THEN
      v_passed := false;
      v_reason := v_role_label || ' status is invitation-only';
    ELSIF (v_thresholds->>'manual_review')::boolean IS TRUE THEN
      v_passed := false;
      v_reason := v_role_label || ' promotion requires manual review';
    ELSE
      v_passed := true;
      v_reason := '';

      IF v_thresholds ? 'requires_onboarding' AND NOT COALESCE(v_onboarding, false) THEN
        v_passed := false; v_reason := v_reason || 'Onboarding not completed. ';
      END IF;
      IF v_thresholds ? 'requires_certification' AND NOT COALESCE(v_certified, false) THEN
        v_passed := false; v_reason := v_reason || 'Certification required. ';
      END IF;
      IF v_thresholds ? 'modules_done' AND v_modules_done < (v_thresholds->>'modules_done')::int THEN
        v_passed := false; v_reason := v_reason || format('Modules: %s/%s. ', v_modules_done, (v_thresholds->>'modules_done')::int);
      END IF;
      IF v_thresholds ? 'calls' AND v_calls < (v_thresholds->>'calls')::int THEN
        v_passed := false; v_reason := v_reason || format('Calls: %s/%s. ', v_calls, (v_thresholds->>'calls')::int);
      END IF;
      IF v_thresholds ? 'show_rate' AND v_show_rate < (v_thresholds->>'show_rate')::numeric THEN
        v_passed := false; v_reason := v_reason || format('Show: %s%%/%s%%. ', v_show_rate, (v_thresholds->>'show_rate')::numeric);
      END IF;
      IF v_thresholds ? 'close_rate' AND v_close_rate < (v_thresholds->>'close_rate')::numeric THEN
        v_passed := false; v_reason := v_reason || format('Close: %s%%/%s%%. ', v_close_rate, (v_thresholds->>'close_rate')::numeric);
      END IF;
      IF v_thresholds ? 'epc' AND v_epc < (v_thresholds->>'epc')::numeric THEN
        v_passed := false; v_reason := v_reason || format('EPC: %s/%s. ', v_epc, (v_thresholds->>'epc')::numeric);
      END IF;
      IF v_thresholds ? 'revenue' AND COALESCE((SELECT total_revenue FROM users_kpi_snapshot WHERE user_id = p_user_id), 0) < (v_thresholds->>'revenue')::numeric THEN
        v_passed := false; v_reason := v_reason || 'Revenue threshold not met. ';
      END IF;

      IF v_passed THEN
        v_reason := 'All thresholds met for ' || v_role_label;
      ELSE
        v_reason := RTRIM(v_reason);
      END IF;
    END IF;
  ELSE
    v_passed := false;
    v_reason := 'No product config found — promotion evaluation skipped';
  END IF;

  INSERT INTO promotion_evaluations (user_id, current_level, target_level, show_rate, close_rate, earnings_per_call, ai_call_score_avg, threshold_passed, evaluation_reason)
  VALUES (p_user_id, v_current_level, v_target_level, v_show_rate, v_close_rate, v_epc, v_ai_avg, v_passed, v_reason);

  UPDATE user_level_status SET
    eligible_for_next_level = v_passed,
    next_level = v_target_level,
    promotion_status = CASE
      WHEN v_passed AND v_target_level <= 6 THEN 'eligible'
      WHEN v_passed AND v_target_level > 6 THEN 'pending_review'
      ELSE 'not_eligible'
    END,
    last_evaluated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_level_status (user_id, current_level, current_role_label, eligible_for_next_level, next_level, promotion_status, last_evaluated_at)
    VALUES (p_user_id, v_current_level, COALESCE(v_role_label, 'Bewerber'), v_passed, v_target_level,
      CASE WHEN v_passed AND v_target_level <= 6 THEN 'eligible' WHEN v_passed THEN 'pending_review' ELSE 'not_eligible' END, now());
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'current_level', v_current_level,
    'target_level', v_target_level,
    'passed', v_passed,
    'reason', v_reason,
    'show_rate', v_show_rate,
    'close_rate', v_close_rate,
    'epc', v_epc,
    'ai_avg', v_ai_avg,
    'integrity_issues', v_has_integrity_issues,
    'product', v_product_key
  );
END;
$$;
