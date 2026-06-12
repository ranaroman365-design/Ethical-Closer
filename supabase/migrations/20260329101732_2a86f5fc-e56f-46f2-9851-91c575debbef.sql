
-- 1. Fix Sarah's profile mismatch (certified in profiles but not in cert_status)
UPDATE profiles SET 
  certified = false, 
  certification_status = 'not_started',
  updated_at = now()
WHERE id = '0065205e-b2bf-423a-8ca0-38897f6613b5' 
  AND certified = true;

-- 2. Create recalc_user_kpi_snapshot function for automation
CREATE OR REPLACE FUNCTION public.recalc_user_kpi_snapshot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booked int;
  v_showed int;
  v_no_show int;
  v_won int;
  v_revenue numeric;
  v_show_rate numeric;
  v_close_rate numeric;
  v_epc numeric;
BEGIN
  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE no_show_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_no_show, v_won, v_revenue
  FROM calls WHERE user_id = p_user_id;

  v_show_rate := CASE WHEN (v_showed + v_no_show) > 0
    THEN LEAST(ROUND((v_showed::numeric / (v_showed + v_no_show)) * 100, 1), 100) ELSE 0 END;
  v_close_rate := CASE WHEN v_showed > 0
    THEN LEAST(ROUND((v_won::numeric / v_showed) * 100, 1), 100) ELSE 0 END;
  v_epc := CASE WHEN v_booked > 0
    THEN ROUND(v_revenue / v_booked, 2) ELSE 0 END;

  INSERT INTO users_kpi_snapshot (user_id, total_calls, total_revenue, show_rate, close_rate, earnings_per_call, updated_at)
  VALUES (p_user_id, v_booked, v_revenue, v_show_rate, v_close_rate, v_epc, now())
  ON CONFLICT (user_id) DO UPDATE SET
    total_calls = EXCLUDED.total_calls,
    total_revenue = EXCLUDED.total_revenue,
    show_rate = EXCLUDED.show_rate,
    close_rate = EXCLUDED.close_rate,
    earnings_per_call = EXCLUDED.earnings_per_call,
    updated_at = now();
END;
$$;

-- 3. Trigger to auto-refresh snapshot on call changes
CREATE OR REPLACE FUNCTION public.trg_refresh_kpi_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM recalc_user_kpi_snapshot(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calls_refresh_snapshot ON calls;
CREATE TRIGGER trg_calls_refresh_snapshot
  AFTER INSERT OR UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_kpi_snapshot();

-- 4. Trigger to auto-sync certification to profiles
CREATE OR REPLACE FUNCTION public.trg_sync_cert_to_profile()
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
    WHERE id = NEW.user_id AND (certified = false OR placement_ready = false OR employer_visibility_enabled = false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cert_sync_profile ON certification_status;
CREATE TRIGGER trg_cert_sync_profile
  AFTER INSERT OR UPDATE ON certification_status
  FOR EACH ROW EXECUTE FUNCTION trg_sync_cert_to_profile();
