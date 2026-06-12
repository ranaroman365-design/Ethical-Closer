
-- Fix evaluate_user_for_promotion: remove fallback, add audit log on missing config
CREATE OR REPLACE FUNCTION public.evaluate_user_for_promotion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Load product config — NO FALLBACK
  v_product_key := get_user_product_key(p_user_id);
  SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;

  IF v_config IS NULL THEN
    INSERT INTO audit_logs (action, source_type, note, after_state)
    VALUES ('promotion_eval_failed', 'system',
      format('No product_config for product=%s — evaluation aborted for user %s', v_product_key, p_user_id),
      jsonb_build_object('user_id', p_user_id, 'product_key', v_product_key));
    RETURN jsonb_build_object(
      'user_id', p_user_id, 'current_level', v_current_level, 'target_level', v_target_level,
      'passed', false, 'reason', 'No product_config found — evaluation aborted',
      'product', v_product_key, 'error', 'missing_product_config'
    );
  END IF;

  -- Get role label from config
  SELECT elem INTO v_level_entry
  FROM jsonb_array_elements(v_config->'levels') AS elem
  WHERE (elem->>'level')::int = v_target_level;
  v_role_label := COALESCE(v_level_entry->>'role', 'Unknown');

  -- Get KPIs
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
  ELSE
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
$function$;
