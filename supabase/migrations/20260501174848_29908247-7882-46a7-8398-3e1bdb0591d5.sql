
-- 1. Canonical funnel source mapping
CREATE OR REPLACE FUNCTION public.canonical_funnel_source(raw_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN raw_source IN ('funnel_apply', 'funnel', 'apply_direct', '/apply', 'funnel_apply-test') THEN 'Apply'
    WHEN raw_source IN ('qualify_filter', 'qualify', '/qualify') THEN 'Qualify'
    WHEN raw_source IN ('high_income_angle', 'high-income-skill', '/high-income-skill') THEN 'High-Income Skill'
    WHEN raw_source IN ('quiz', '/quiz') THEN 'Quiz'
    WHEN raw_source IN ('fastlane', 'fast_track') THEN 'Fastlane'
    WHEN raw_source IN ('website', 'organic', 'direct') THEN 'Organic'
    WHEN raw_source IN ('root', '/') THEN 'Root'
    WHEN raw_source = 'referral' THEN 'Referral'
    WHEN raw_source = 'instagram' THEN 'Instagram'
    WHEN raw_source = 'cold_outreach' THEN 'Cold Outreach'
    WHEN raw_source = 'webinar' THEN 'Webinar'
    WHEN raw_source IS NULL OR raw_source = '' THEN 'Unknown'
    ELSE raw_source
  END;
$$;

-- 2. Test lead detection
CREATE OR REPLACE FUNCTION public.is_test_lead(
  p_is_simulation boolean,
  p_source text,
  p_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_is_simulation = true
    OR p_source = 'go_live_simulation:meta'
    OR p_source ILIKE '%test%'
    OR p_source ILIKE '%simulation%'
    OR p_name ILIKE 'test%'
    OR p_name ILIKE '%test test%'
    OR p_name ILIKE '%kein lead%'
    OR p_name ILIKE '%requal test%';
$$;

-- 3. Sync lead fields from appointments (trigger function)
CREATE OR REPLACE FUNCTION public.sync_lead_from_appointments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_booked int;
  v_attended int;
  v_has_show boolean;
  v_has_noshow boolean;
  v_last_at timestamptz;
BEGIN
  -- Determine which lead_id to sync
  IF TG_OP = 'DELETE' THEN
    v_lead_id := OLD.lead_id;
  ELSE
    v_lead_id := NEW.lead_id;
  END IF;

  -- Aggregate from all appointments for this lead
  SELECT
    count(*),
    count(*) FILTER (WHERE attendance_flag = true OR appointment_status = 'completed'),
    bool_or(attendance_flag = true OR appointment_status = 'completed'),
    bool_or(appointment_status = 'no_show' OR (attendance_flag = false AND appointment_status NOT IN ('expired','superseded','cancelled','pending','scheduled'))),
    max(starts_at)
  INTO v_booked, v_attended, v_has_show, v_has_noshow, v_last_at
  FROM appointments
  WHERE lead_id = v_lead_id;

  -- Show overrides no-show
  IF v_has_show THEN
    v_has_noshow := false;
  END IF;

  UPDATE leads SET
    has_booking = (v_booked > 0),
    total_calls_booked = COALESCE(v_booked, 0),
    total_calls_attended = COALESCE(v_attended, 0),
    no_show_flag = COALESCE(v_has_noshow, false),
    appointment_date = v_last_at
  WHERE id = v_lead_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Attach trigger to appointments
DROP TRIGGER IF EXISTS trg_sync_lead_from_appointments ON public.appointments;
CREATE TRIGGER trg_sync_lead_from_appointments
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_from_appointments();

-- 5. Real leads view (SECURITY INVOKER)
CREATE OR REPLACE VIEW public.real_leads_view
WITH (security_invoker = true)
AS
SELECT
  l.*,
  canonical_funnel_source(l.source) AS canonical_source
FROM leads l
WHERE NOT is_test_lead(l.is_simulation, l.source, l.name);

-- 6. Real appointments view (SECURITY INVOKER)
CREATE OR REPLACE VIEW public.real_appointments_view
WITH (security_invoker = true)
AS
SELECT a.*
FROM appointments a
WHERE EXISTS (
  SELECT 1 FROM leads l
  WHERE l.id = a.lead_id
    AND NOT is_test_lead(l.is_simulation, l.source, l.name)
);

-- 7. Revenue truth view (30d default, SECURITY INVOKER)
CREATE OR REPLACE VIEW public.revenue_truth_view
WITH (security_invoker = true)
AS
WITH rl AS (
  SELECT id FROM real_leads_view
  WHERE created_at >= now() - interval '30 days'
),
stats AS (
  SELECT
    (SELECT count(*) FROM rl) AS total_leads,
    count(DISTINCT a.lead_id) AS booked,
    count(DISTINCT a.lead_id) FILTER (WHERE a.attendance_flag = true OR a.appointment_status = 'completed') AS shows,
    count(DISTINCT a.lead_id) FILTER (
      WHERE (a.appointment_status = 'no_show' OR (a.attendance_flag = false AND a.appointment_status NOT IN ('expired','superseded','cancelled','pending','scheduled')))
        AND a.lead_id NOT IN (
          SELECT lead_id FROM appointments
          WHERE attendance_flag = true OR appointment_status = 'completed'
        )
    ) AS no_shows
  FROM rl
  LEFT JOIN appointments a ON a.lead_id = rl.id
),
rev AS (
  SELECT
    count(*) FILTER (WHERE l.outcome = 'won' OR l.payment_status = 'paid') AS closed,
    COALESCE(sum(l.deal_value) FILTER (WHERE l.outcome = 'won' OR l.payment_status = 'paid'), 0) AS revenue
  FROM real_leads_view l
  WHERE l.created_at >= now() - interval '30 days'
)
SELECT
  s.total_leads,
  s.booked,
  s.shows,
  s.no_shows,
  r.closed,
  CASE WHEN s.total_leads > 0 THEN s.booked - s.shows - s.no_shows ELSE 0 END AS no_close,
  r.revenue,
  CASE WHEN s.total_leads > 0 THEN r.revenue / s.total_leads ELSE 0 END AS revenue_per_lead,
  CASE WHEN s.shows > 0 THEN r.revenue / s.shows ELSE 0 END AS revenue_per_show,
  CASE WHEN s.total_leads > 0 THEN round(s.booked::numeric / s.total_leads * 100, 1) ELSE 0 END AS booking_rate,
  CASE WHEN s.booked > 0 THEN round(s.shows::numeric / s.booked * 100, 1) ELSE 0 END AS show_rate,
  CASE WHEN s.shows > 0 THEN round(r.closed::numeric / s.shows * 100, 1) ELSE 0 END AS close_rate
FROM stats s, rev r;
