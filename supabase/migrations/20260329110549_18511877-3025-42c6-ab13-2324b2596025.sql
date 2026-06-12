
-- =============================================
-- PHASE A — EVENT INTEGRITY + DATA HYGIENE
-- =============================================

-- A1: processed_events table
CREATE TABLE IF NOT EXISTS public.processed_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key    text UNIQUE NOT NULL,
  event_type   text NOT NULL,
  source_table text NOT NULL,
  source_ref   text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  result       jsonb
);

ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "processed_events_admin_only" ON public.processed_events;
CREATE POLICY "processed_events_admin_only"
  ON public.processed_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_processed_events_key ON public.processed_events (event_key);
CREATE INDEX IF NOT EXISTS idx_processed_events_age ON public.processed_events (processed_at);

-- A2: Idempotent KPI snapshot trigger
CREATE OR REPLACE FUNCTION public.trg_refresh_kpi_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_key text;
  v_row_count integer;
BEGIN
  v_event_key := 'kpi:'
    || NEW.user_id::text || ':'
    || NEW.id::text || ':'
    || COALESCE(NEW.result, 'pending') || ':'
    || COALESCE(NEW.closed_at::text, 'open');

  INSERT INTO processed_events
    (event_key, event_type, source_table, source_ref)
  VALUES
    (v_event_key, 'kpi_snapshot_refresh', 'calls', NEW.id::text)
  ON CONFLICT (event_key) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM recalc_user_kpi_snapshot(NEW.user_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO audit_logs (action, source_type, note)
  VALUES (
    'kpi_snapshot_trigger_error', 'system',
    format('user=%s call=%s err=%s', NEW.user_id, NEW.id, SQLERRM)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calls_refresh_snapshot ON public.calls;
CREATE TRIGGER trg_calls_refresh_snapshot
  AFTER INSERT OR UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_kpi_snapshot();

-- A3: Idempotent certification sync trigger
CREATE OR REPLACE FUNCTION public.trg_sync_cert_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_key text;
  v_row_count integer;
BEGIN
  IF NEW.certification_title != 'Certified'
     OR NEW.certified_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_event_key := 'cert_sync:'
    || NEW.user_id::text || ':'
    || COALESCE(NEW.certified_at::text, 'null');

  INSERT INTO processed_events
    (event_key, event_type, source_table, source_ref)
  VALUES
    (v_event_key, 'cert_profile_sync',
     'certification_status', NEW.user_id::text)
  ON CONFLICT (event_key) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles SET
    certified                   = true,
    certification_status        = 'certified',
    placement_ready             = true,
    employer_visibility_enabled = true,
    updated_at                  = now()
  WHERE id = NEW.user_id
    AND (
      certified = false
      OR placement_ready = false
      OR employer_visibility_enabled = false
    );

  INSERT INTO audit_logs (action, source_type, note, after_state)
  VALUES (
    'certification_synced_to_profile', 'system',
    format('user=%s certified at %s', NEW.user_id, NEW.certified_at),
    jsonb_build_object(
      'user_id', NEW.user_id,
      'certified_at', NEW.certified_at
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO audit_logs (action, source_type, note)
  VALUES (
    'cert_sync_trigger_error', 'system',
    format('user=%s err=%s', NEW.user_id, SQLERRM)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cert_sync_profile ON public.certification_status;
CREATE TRIGGER trg_cert_sync_profile
  AFTER INSERT OR UPDATE ON public.certification_status
  FOR EACH ROW EXECUTE FUNCTION trg_sync_cert_to_profile();

-- A4: is_simulation already exists, just tag old data
UPDATE public.calls
SET is_simulation = true
WHERE is_simulation = false
  AND created_at < '2025-06-01'::timestamptz;

-- A5: real_kpi_snapshot view
CREATE OR REPLACE VIEW public.real_kpi_snapshot AS
SELECT
  c.user_id,
  count(*) FILTER (WHERE booked_at IS NOT NULL) AS total_calls,
  CASE
    WHEN (
      count(*) FILTER (WHERE showed_at IS NOT NULL) +
      count(*) FILTER (WHERE no_show_at IS NOT NULL)
    ) >= 5
    THEN LEAST(ROUND(
      count(*) FILTER (WHERE showed_at IS NOT NULL)::numeric /
      GREATEST(
        count(*) FILTER (WHERE showed_at IS NOT NULL) +
        count(*) FILTER (WHERE no_show_at IS NOT NULL), 1
      ) * 100, 1), 100)
    ELSE NULL
  END AS show_rate,
  CASE
    WHEN count(*) FILTER (WHERE showed_at IS NOT NULL) >= 5
    THEN LEAST(ROUND(
      count(*) FILTER (WHERE result = 'won')::numeric /
      count(*) FILTER (WHERE showed_at IS NOT NULL) * 100, 1), 100)
    ELSE NULL
  END AS close_rate,
  COALESCE(SUM(CASE WHEN result = 'won' THEN revenue END), 0) AS total_revenue
FROM public.calls c
WHERE is_simulation = false
GROUP BY c.user_id;

-- A6: Stripe idempotency DB guard
CREATE OR REPLACE FUNCTION public.guard_stripe_idempotency(
  p_stripe_event_id text,
  p_event_type      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row_count integer;
BEGIN
  INSERT INTO processed_events (
    event_key, event_type, source_table, source_ref
  )
  VALUES (
    'stripe:' || p_stripe_event_id,
    p_event_type,
    'stripe_events',
    p_stripe_event_id
  )
  ON CONFLICT (event_key) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.guard_stripe_idempotency(text, text) TO service_role;

-- =============================================
-- PHASE B — PROMOTION + CERTIFICATION HARDENING
-- =============================================

-- B1: Safe user_level_status initialization
INSERT INTO public.user_level_status (
  user_id, current_level, current_role_label, next_level,
  promotion_status, eligible_for_next_level
)
SELECT
  p.id,
  CASE p.business_stage
    WHEN 'prospect'       THEN 0
    WHEN 'applicant'      THEN 0
    WHEN 'opener'         THEN 1
    WHEN 'setter'         THEN 2
    WHEN 'associate_setter' THEN 2
    WHEN 'senior_associate' THEN 3
    WHEN 'senior_setter'  THEN 4
    WHEN 'junior_manager' THEN 5
    WHEN 'manager'        THEN 6
    WHEN 'senior_manager' THEN 7
    WHEN 'director'       THEN 8
    WHEN 'partner'        THEN 9
    ELSE 0
  END,
  COALESCE(p.business_stage, 'Bewerber'),
  CASE p.business_stage
    WHEN 'prospect'       THEN 1
    WHEN 'applicant'      THEN 1
    WHEN 'opener'         THEN 2
    WHEN 'setter'         THEN 3
    WHEN 'associate_setter' THEN 3
    WHEN 'senior_associate' THEN 4
    WHEN 'senior_setter'  THEN 5
    WHEN 'junior_manager' THEN 6
    WHEN 'manager'        THEN 7
    WHEN 'senior_manager' THEN 8
    WHEN 'director'       THEN 9
    WHEN 'partner'        THEN 9
    ELSE 1
  END,
  'not_eligible',
  false
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM user_level_status uls WHERE uls.user_id = p.id
)
ON CONFLICT (user_id) DO NOTHING;

-- B2: Promotion debug function
CREATE OR REPLACE FUNCTION public.get_promotion_blockers(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_config      jsonb;
  v_thresholds  jsonb;
  v_level       int;
  v_target      int;
  v_snapshot    record;
  v_modules     int;
  v_onboarding  boolean;
  v_certified   boolean;
  v_blockers    jsonb := '[]'::jsonb;
  v_product_key text;
BEGIN
  BEGIN
    v_product_key := get_user_product_key(p_user_id);
  EXCEPTION WHEN undefined_function THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason',  'get_user_product_key() function not found'
    );
  END;

  SELECT config INTO v_config
  FROM product_config WHERE product_key = v_product_key;

  IF v_config IS NULL THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'No product config for: ' || v_product_key
    );
  END IF;

  SELECT COALESCE(current_level, 0), COALESCE(next_level, 1)
  INTO v_level, v_target
  FROM user_level_status WHERE user_id = p_user_id;

  IF v_level IS NULL THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'No user_level_status row found'
    );
  END IF;

  v_thresholds := v_config->'promotion_thresholds'->v_target::text;

  IF v_thresholds IS NULL THEN
    RETURN jsonb_build_object(
      'blocked', false,
      'reason', 'No thresholds defined for L' || v_target
    );
  END IF;

  IF (v_thresholds->>'invitation_only')::boolean IS TRUE THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'L' || v_target || ' is invitation-only'
    );
  END IF;

  IF (v_thresholds->>'manual_review')::boolean IS TRUE THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'L' || v_target || ' requires manual admin review'
    );
  END IF;

  SELECT * INTO v_snapshot
  FROM users_kpi_snapshot WHERE user_id = p_user_id;

  SELECT onboarding_completed, certified
  INTO v_onboarding, v_certified
  FROM profiles WHERE id = p_user_id;

  SELECT count(*) INTO v_modules
  FROM member_progress
  WHERE user_id = p_user_id AND completed = true;

  IF v_thresholds ? 'requires_onboarding'
     AND NOT COALESCE(v_onboarding, false) THEN
    v_blockers := v_blockers || jsonb_build_array('Onboarding not completed');
  END IF;

  IF v_thresholds ? 'requires_certification'
     AND NOT COALESCE(v_certified, false) THEN
    v_blockers := v_blockers || jsonb_build_array('Certification required');
  END IF;

  IF v_thresholds ? 'modules_done'
     AND v_modules < (v_thresholds->>'modules_done')::int THEN
    v_blockers := v_blockers || jsonb_build_array(
      format('Modules: %s/%s', v_modules, (v_thresholds->>'modules_done'))
    );
  END IF;

  IF v_thresholds ? 'calls'
     AND COALESCE(v_snapshot.total_calls, 0) < (v_thresholds->>'calls')::int THEN
    v_blockers := v_blockers || jsonb_build_array(
      format('Calls: %s/%s', COALESCE(v_snapshot.total_calls, 0), (v_thresholds->>'calls'))
    );
  END IF;

  IF v_thresholds ? 'show_rate'
     AND COALESCE(v_snapshot.show_rate, 0) < (v_thresholds->>'show_rate')::numeric THEN
    v_blockers := v_blockers || jsonb_build_array(
      format('Show rate: %s%%/%s%%', COALESCE(v_snapshot.show_rate, 0), (v_thresholds->>'show_rate'))
    );
  END IF;

  IF v_thresholds ? 'close_rate'
     AND COALESCE(v_snapshot.close_rate, 0) < (v_thresholds->>'close_rate')::numeric THEN
    v_blockers := v_blockers || jsonb_build_array(
      format('Close rate: %s%%/%s%%', COALESCE(v_snapshot.close_rate, 0), (v_thresholds->>'close_rate'))
    );
  END IF;

  IF v_thresholds ? 'epc'
     AND COALESCE(v_snapshot.earnings_per_call, 0) < (v_thresholds->>'epc')::numeric THEN
    v_blockers := v_blockers || jsonb_build_array(
      format('EPC: €%s/€%s', COALESCE(v_snapshot.earnings_per_call, 0), (v_thresholds->>'epc'))
    );
  END IF;

  IF v_thresholds ? 'revenue'
     AND COALESCE(v_snapshot.total_revenue, 0) < (v_thresholds->>'revenue')::numeric THEN
    v_blockers := v_blockers || jsonb_build_array(
      format('Revenue: €%s/€%s', COALESCE(v_snapshot.total_revenue, 0), (v_thresholds->>'revenue'))
    );
  END IF;

  RETURN jsonb_build_object(
    'user_id',       p_user_id,
    'current_level', v_level,
    'target_level',  v_target,
    'product',       v_product_key,
    'blocked',       jsonb_array_length(v_blockers) > 0,
    'blockers',      v_blockers,
    'snapshot', jsonb_build_object(
      'calls',      COALESCE(v_snapshot.total_calls, 0),
      'show_rate',  COALESCE(v_snapshot.show_rate, 0),
      'close_rate', COALESCE(v_snapshot.close_rate, 0),
      'epc',        COALESCE(v_snapshot.earnings_per_call, 0),
      'revenue',    COALESCE(v_snapshot.total_revenue, 0)
    )
  );
END;
$$;

-- B3: auto_promote_eligible_users (ETC-scoped)
CREATE OR REPLACE FUNCTION public.auto_promote_eligible_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r             record;
  v_config      jsonb;
  v_level_entry jsonb;
  v_role_label  text;
  v_stage       text;
  v_promoted    int := 0;
  v_results     jsonb := '[]'::jsonb;
BEGIN
  SELECT config INTO v_config
  FROM product_config WHERE product_key = 'etc';

  IF v_config IS NULL THEN
    RETURN jsonb_build_object('error', 'No product config found for etc');
  END IF;

  FOR r IN
    SELECT uls.user_id, uls.current_level, uls.next_level
    FROM user_level_status uls
    WHERE uls.eligible_for_next_level = true
      AND uls.promotion_status = 'eligible'
      AND uls.next_level <= 6
      AND uls.next_level IS NOT NULL
  LOOP
    SELECT elem INTO v_level_entry
    FROM jsonb_array_elements(v_config->'levels') AS elem
    WHERE (elem->>'level')::int = r.next_level;

    v_role_label := COALESCE(v_level_entry->>'role', 'Unknown');
    v_stage      := COALESCE(v_level_entry->>'stage', 'opener');

    UPDATE user_level_status SET
      current_level           = r.next_level,
      current_role_label      = v_role_label,
      eligible_for_next_level = false,
      promotion_status        = 'promoted',
      promoted_at             = now(),
      last_evaluated_at       = now()
    WHERE user_id = r.user_id;

    UPDATE profiles SET
      business_stage = v_stage,
      updated_at     = now()
    WHERE id = r.user_id;

    INSERT INTO audit_logs (action, source_type, note, after_state)
    VALUES (
      'auto_promotion', 'system',
      format('Promoted user %s from L%s to L%s (%s)',
        r.user_id, r.current_level, r.next_level, v_role_label),
      jsonb_build_object(
        'user_id',    r.user_id,
        'from_level', r.current_level,
        'to_level',   r.next_level,
        'role',       v_role_label,
        'stage',      v_stage
      )
    );

    v_promoted := v_promoted + 1;
    v_results  := v_results || jsonb_build_object(
      'user_id',    r.user_id,
      'from_level', r.current_level,
      'to_level',   r.next_level,
      'role',       v_role_label
    );
  END LOOP;

  RETURN jsonb_build_object(
    'promoted_count', v_promoted,
    'details',        v_results
  );
END;
$$;

-- B4: safe_recalculate_all
CREATE OR REPLACE FUNCTION public.safe_recalculate_all()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r         record;
  v_result  jsonb;
  v_success int := 0;
  v_failed  int := 0;
  v_errors  jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id FROM calls
    WHERE is_simulation = false
  LOOP
    BEGIN
      v_result  := recalculate_certification(r.user_id);
      v_success := v_success + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object(
        'user_id', r.user_id,
        'error',   SQLERRM
      );
      INSERT INTO audit_logs (action, source_type, note)
      VALUES (
        'cert_recalc_failed', 'system',
        format('user=%s err=%s', r.user_id, SQLERRM)
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', v_success,
    'failed',  v_failed,
    'errors',  v_errors
  );
END;
$$;

-- B5: Employer system consistency
UPDATE public.profiles
SET
  employer_visibility_enabled = true,
  placement_ready             = true
WHERE certified = true
  AND (
    employer_visibility_enabled = false
    OR placement_ready = false
  );

DELETE FROM public.employer_saved_profiles
WHERE candidate_user_id NOT IN (
  SELECT id FROM profiles WHERE certified = true
);

DELETE FROM public.employer_contacts
WHERE candidate_user_id NOT IN (
  SELECT id FROM profiles
  WHERE employer_visibility_enabled = true
);
