
-- =============================================
-- SECURITY RLS HARDENING — FULL SPRINT
-- =============================================

-- 1. quiz_submissions: Remove dangerous anon read-all
DROP POLICY IF EXISTS "Read own by session" ON quiz_submissions;
CREATE POLICY "Admins read quiz submissions"
  ON quiz_submissions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. lead_follow_ups: Restrict to lead owners + admin
DROP POLICY IF EXISTS "Authenticated users can view follow-ups" ON lead_follow_ups;
CREATE POLICY "Lead owners and admins view follow-ups"
  ON lead_follow_ups FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_follow_ups.lead_id
        AND (leads.setter_id = auth.uid() OR leads.closer_id = auth.uid() OR leads.owner_id = auth.uid())
    )
  );

-- 3. director_recommendations: Admin only
DROP POLICY IF EXISTS "Directors read recommendations" ON director_recommendations;
CREATE POLICY "Admins read recommendations"
  ON director_recommendations FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. upgrade_proposals: Admin only
DROP POLICY IF EXISTS "Authenticated read proposals" ON upgrade_proposals;
CREATE POLICY "Admins read proposals"
  ON upgrade_proposals FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. monthly_version_proposals: Admin only
DROP POLICY IF EXISTS "Authenticated read monthly proposals" ON monthly_version_proposals;
CREATE POLICY "Admins read monthly proposals"
  ON monthly_version_proposals FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. Secure benefit redeem info function
CREATE OR REPLACE FUNCTION get_user_benefit_redeem_info(p_benefit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'redeem_code', b.redeem_code,
    'redeem_link', b.redeem_link
  ) INTO v_result
  FROM benefits b
  JOIN user_benefits ub ON ub.benefit_id = b.id
  WHERE b.id = p_benefit_id
    AND ub.user_id = auth.uid();
  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'Not unlocked');
  END IF;
  RETURN v_result;
END;
$$;

-- 7. Views: Enable security_invoker
ALTER VIEW view_director_team_kpis SET (security_invoker = on);
ALTER VIEW view_lead_pipeline_summary SET (security_invoker = on);
ALTER VIEW view_partner_summary SET (security_invoker = on);
ALTER VIEW view_performance_rankings SET (security_invoker = on);
ALTER VIEW view_user_promotion_status SET (security_invoker = on);

-- 8. Improved cert sync trigger — also handles de-certification
CREATE OR REPLACE FUNCTION trg_sync_cert_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.certification_title = 'Certified' AND NEW.certified_at IS NOT NULL THEN
    UPDATE profiles SET
      certified = true,
      certification_status = 'certified',
      placement_ready = true,
      employer_visibility_enabled = true,
      updated_at = now()
    WHERE id = NEW.user_id
      AND (certified = false OR placement_ready = false OR employer_visibility_enabled = false);
  ELSE
    UPDATE profiles SET
      certified = false,
      certification_status = CASE
        WHEN NEW.certification_title = 'Qualified' THEN 'qualified'
        ELSE 'not_started'
      END,
      updated_at = now()
    WHERE id = NEW.user_id AND certified = true;
  END IF;
  RETURN NEW;
END;
$$;

-- 9. Safe outbound event queuing with pre-flight check
CREATE OR REPLACE FUNCTION queue_outbound_event_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ghl_url text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_ghl_url
    FROM vault.decrypted_secrets
    WHERE name = 'GHL_WEBHOOK_URL';
  EXCEPTION WHEN OTHERS THEN
    v_ghl_url := NULL;
  END;
  IF v_ghl_url IS NOT NULL AND v_ghl_url != '' THEN
    INSERT INTO outbound_events (event_name, entity_type, entity_id, email, payload, destination, status)
    VALUES (
      TG_ARGV[0], 'lead', NEW.id, NEW.email,
      jsonb_build_object('lead_id', NEW.id, 'event', TG_ARGV[0], 'stage', NEW.stage, 'email', NEW.email, 'name', NEW.name),
      'ghl', 'pending'
    );
  END IF;
  RETURN NEW;
END;
$$;
