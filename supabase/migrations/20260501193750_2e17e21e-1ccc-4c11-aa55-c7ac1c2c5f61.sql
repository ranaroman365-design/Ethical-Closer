
-- ═══════════════════════════════════════════════════════════════
-- RPC: get_setter_intelligence
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_setter_intelligence(
  p_range_days int DEFAULT 30,
  p_user_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  business_stage text,
  level_num int,
  assigned_leads bigint,
  contacted_leads bigint,
  response_rate numeric,
  bookings_created bigint,
  booking_rate numeric,
  shows bigint,
  show_rate numeric,
  no_shows bigint,
  no_show_rate numeric,
  reschedules bigint,
  reschedule_rate numeric,
  avg_time_to_first_touch_hours numeric,
  total_revenue numeric,
  trend_7d numeric,
  talent_score numeric,
  ranking text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_team_ids uuid[];
BEGIN
  v_cutoff := now() - (p_range_days || ' days')::interval;

  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(sub.id) INTO v_team_ids
    FROM (SELECT p_user_id AS id UNION SELECT gtm.id FROM get_team_member_ids(p_user_id) gtm) sub;
  END IF;

  RETURN QUERY
  WITH setter_profiles AS (
    SELECT p.id, p.full_name, p.business_stage,
      CASE p.business_stage
        WHEN 'setter' THEN 2 WHEN 'associate_setter' THEN 2 WHEN 'associate' THEN 2
        WHEN 'senior_setter' THEN 3 WHEN 'senior_associate' THEN 3
        ELSE 2
      END AS lvl
    FROM profiles p
    WHERE p.business_stage IN ('setter','associate_setter','associate','senior_setter','senior_associate')
      AND p.full_name NOT ILIKE '%test%'
      AND (v_team_ids IS NULL OR p.id = ANY(v_team_ids))
      AND (p_operator_id IS NULL OR p.id = p_operator_id)
  ),
  setter_leads AS (
    SELECT l.setter_id AS sid,
      COUNT(*) AS assigned,
      COUNT(*) FILTER (WHERE l.first_action_at IS NOT NULL OR l.contact_count > 0) AS contacted,
      AVG(CASE WHEN l.first_action_at IS NOT NULL THEN EXTRACT(EPOCH FROM (l.first_action_at - l.created_at))/3600.0 END) AS avg_ftt
    FROM leads l
    WHERE l.setter_id IS NOT NULL AND l.created_at >= v_cutoff
      AND l.is_simulation IS NOT TRUE
    GROUP BY l.setter_id
  ),
  setter_appts AS (
    SELECT a.setter_id AS sid,
      COUNT(*) AS total_bookings,
      COUNT(*) FILTER (WHERE a.completed_at IS NOT NULL OR a.call_started_at IS NOT NULL) AS total_shows,
      COUNT(*) FILTER (WHERE a.appointment_status = 'no_show' OR a.no_show_detected_at IS NOT NULL) AS total_no_shows,
      COUNT(*) FILTER (WHERE a.reassigned_at IS NOT NULL OR a.reschedule_count > 0) AS total_reschedules
    FROM appointments a
    WHERE a.setter_id IS NOT NULL AND a.starts_at >= v_cutoff
    GROUP BY a.setter_id
  ),
  setter_rev AS (
    SELECT l.setter_id AS sid, SUM(COALESCE(l.deal_value, 0)) AS rev
    FROM leads l
    WHERE l.setter_id IS NOT NULL AND l.created_at >= v_cutoff
      AND (l.outcome = 'won' OR l.payment_status = 'paid')
    GROUP BY l.setter_id
  ),
  setter_trend AS (
    SELECT l.setter_id AS sid,
      COUNT(*) FILTER (WHERE l.created_at >= now() - interval '7 days' AND (l.outcome='won' OR l.payment_status='paid')) AS cur7,
      COUNT(*) FILTER (WHERE l.created_at >= now() - interval '14 days' AND l.created_at < now() - interval '7 days' AND (l.outcome='won' OR l.payment_status='paid')) AS prev7
    FROM leads l WHERE l.setter_id IS NOT NULL AND l.created_at >= v_cutoff GROUP BY 1
  ),
  scores AS (
    SELECT sp.id AS sid,
      COALESCE(sl.assigned, 0) AS assigned,
      COALESCE(sl.contacted, 0) AS contacted,
      COALESCE(sa.total_bookings, 0) AS bookings,
      COALESCE(sa.total_shows, 0) AS shows,
      COALESCE(sa.total_no_shows, 0) AS no_shows,
      COALESCE(sa.total_reschedules, 0) AS reschedules,
      COALESCE(sl.avg_ftt, 0) AS avg_ftt,
      COALESCE(sr.rev, 0) AS rev,
      CASE WHEN COALESCE(st.prev7,0)=0 THEN CASE WHEN COALESCE(st.cur7,0)>0 THEN 100 ELSE 0 END
           ELSE ROUND(((st.cur7-st.prev7)::numeric/st.prev7)*100,1) END AS trend,
      -- Simple talent score for setters
      ROUND(
        CASE WHEN COALESCE(sl.assigned,0)>0 THEN COALESCE(sa.total_bookings,0)::numeric/sl.assigned*100 ELSE 0 END * 0.30 +
        CASE WHEN COALESCE(sa.total_bookings,0)>0 THEN COALESCE(sa.total_shows,0)::numeric/sa.total_bookings*100 ELSE 0 END * 0.25 +
        CASE WHEN COALESCE(sl.assigned,0)>0 THEN COALESCE(sl.contacted,0)::numeric/sl.assigned*100 ELSE 0 END * 0.20 +
        LEAST(100, COALESCE(sl.assigned,0)*5) * 0.15 +
        CASE WHEN COALESCE(sl.avg_ftt,0) <= 1 THEN 100 WHEN sl.avg_ftt <= 4 THEN 70 WHEN sl.avg_ftt <= 24 THEN 40 ELSE 10 END * 0.10
      , 1) AS tscore
    FROM setter_profiles sp
    LEFT JOIN setter_leads sl ON sl.sid = sp.id
    LEFT JOIN setter_appts sa ON sa.sid = sp.id
    LEFT JOIN setter_rev sr ON sr.sid = sp.id
    LEFT JOIN setter_trend st ON st.sid = sp.id
  )
  SELECT sp.id, sp.full_name, sp.business_stage, sp.lvl,
    s.assigned, s.contacted,
    CASE WHEN s.assigned > 0 THEN ROUND(s.contacted::numeric/s.assigned*100,1) ELSE 0 END,
    s.bookings, 
    CASE WHEN s.assigned > 0 THEN ROUND(s.bookings::numeric/s.assigned*100,1) ELSE 0 END,
    s.shows,
    CASE WHEN s.bookings > 0 THEN ROUND(s.shows::numeric/s.bookings*100,1) ELSE 0 END,
    s.no_shows,
    CASE WHEN s.bookings > 0 THEN ROUND(s.no_shows::numeric/s.bookings*100,1) ELSE 0 END,
    s.reschedules,
    CASE WHEN s.bookings > 0 THEN ROUND(s.reschedules::numeric/s.bookings*100,1) ELSE 0 END,
    ROUND(s.avg_ftt, 1),
    s.rev,
    s.trend,
    s.tscore,
    CASE WHEN s.tscore >= 70 THEN 'top' WHEN s.tscore >= 50 THEN 'rising' WHEN s.tscore >= 30 THEN 'stable' ELSE 'at_risk' END
  FROM setter_profiles sp
  JOIN scores s ON s.sid = sp.id
  ORDER BY s.tscore DESC;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_closer_intelligence
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_closer_intelligence(
  p_range_days int DEFAULT 30,
  p_user_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  business_stage text,
  level_num int,
  calls_assigned bigint,
  calls_completed bigint,
  close_rate numeric,
  revenue_closed numeric,
  avg_deal_value numeric,
  lost_count bigint,
  refund_count bigint,
  refund_rate numeric,
  shows bigint,
  show_to_close_rate numeric,
  trend_7d numeric,
  talent_score numeric,
  primary_bottleneck text,
  ranking text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_team_ids uuid[];
BEGIN
  v_cutoff := now() - (p_range_days || ' days')::interval;

  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(sub.id) INTO v_team_ids
    FROM (SELECT p_user_id AS id UNION SELECT gtm.id FROM get_team_member_ids(p_user_id) gtm) sub;
  END IF;

  RETURN QUERY
  WITH closer_profiles AS (
    SELECT p.id, p.full_name, p.business_stage,
      CASE p.business_stage
        WHEN 'junior_manager' THEN 4 WHEN 'manager' THEN 5 WHEN 'senior_manager' THEN 6
        WHEN 'director' THEN 7 WHEN 'partner' THEN 8
        ELSE 4
      END AS lvl
    FROM profiles p
    WHERE p.business_stage IN ('junior_manager','manager','senior_manager','director','partner')
      AND p.full_name NOT ILIKE '%test%'
      AND (v_team_ids IS NULL OR p.id = ANY(v_team_ids))
      AND (p_operator_id IS NULL OR p.id = p_operator_id)
  ),
  closer_appts AS (
    SELECT COALESCE(a.closer_id, a.current_owner_id) AS cid,
      COUNT(*) AS assigned,
      COUNT(*) FILTER (WHERE a.completed_at IS NOT NULL OR a.call_started_at IS NOT NULL) AS completed
    FROM appointments a
    WHERE COALESCE(a.closer_id, a.current_owner_id) IS NOT NULL AND a.starts_at >= v_cutoff
    GROUP BY 1
  ),
  closer_calls AS (
    SELECT c.user_id AS cid,
      COUNT(*) AS total_calls,
      COUNT(*) FILTER (WHERE c.result IN ('closed_won','won')) AS wins,
      COUNT(*) FILTER (WHERE c.result IN ('lost','no_close','objection')) AS losses,
      COUNT(*) FILTER (WHERE c.result IN ('refunded','disputed')) AS refunds,
      SUM(CASE WHEN c.result IN ('closed_won','won') THEN COALESCE(c.revenue, 0) ELSE 0 END) AS rev
    FROM calls c
    WHERE c.user_id IS NOT NULL AND c.created_at >= v_cutoff AND c.is_simulation IS NOT TRUE
    GROUP BY c.user_id
  ),
  closer_trend AS (
    SELECT c.user_id AS cid,
      COUNT(*) FILTER (WHERE c.created_at >= now()-interval '7 days' AND c.result IN ('closed_won','won')) AS cur7,
      COUNT(*) FILTER (WHERE c.created_at >= now()-interval '14 days' AND c.created_at < now()-interval '7 days' AND c.result IN ('closed_won','won')) AS prev7
    FROM calls c WHERE c.user_id IS NOT NULL AND c.created_at >= v_cutoff AND c.is_simulation IS NOT TRUE GROUP BY 1
  ),
  combined AS (
    SELECT cp.id, cp.full_name, cp.business_stage, cp.lvl,
      COALESCE(ca.assigned, 0) AS assigned,
      COALESCE(ca.completed, 0) AS completed,
      COALESCE(cc.wins, 0) AS wins,
      COALESCE(cc.losses, 0) AS losses,
      COALESCE(cc.refunds, 0) AS refunds,
      COALESCE(cc.rev, 0) AS rev,
      CASE WHEN COALESCE(ca.completed,0)>0 THEN ROUND(COALESCE(cc.wins,0)::numeric/ca.completed*100,1) ELSE 0 END AS crate,
      CASE WHEN COALESCE(cc.wins,0)>0 THEN ROUND(COALESCE(cc.rev,0)/cc.wins,0) ELSE 0 END AS avg_deal,
      CASE WHEN COALESCE(ct.prev7,0)=0 THEN CASE WHEN COALESCE(ct.cur7,0)>0 THEN 100 ELSE 0 END
           ELSE ROUND(((ct.cur7-ct.prev7)::numeric/ct.prev7)*100,1) END AS trend
    FROM closer_profiles cp
    LEFT JOIN closer_appts ca ON ca.cid = cp.id
    LEFT JOIN closer_calls cc ON cc.cid = cp.id
    LEFT JOIN closer_trend ct ON ct.cid = cp.id
  ),
  scored AS (
    SELECT *,
      ROUND(
        crate * 0.30 +
        CASE WHEN assigned > 0 THEN completed::numeric/assigned*100 ELSE 0 END * 0.20 +
        LEAST(100, rev / NULLIF(GREATEST(assigned,1), 0)) * 0.20 +
        LEAST(100, wins * 10) * 0.15 +
        CASE WHEN wins+losses > 0 THEN (wins::numeric/(wins+losses)*100) ELSE 0 END * 0.15
      , 1) AS tscore,
      CASE
        WHEN crate < CASE WHEN assigned>0 THEN completed::numeric/assigned*100 ELSE 0 END THEN 'Closing Skill'
        WHEN CASE WHEN assigned>0 THEN completed::numeric/assigned*100 ELSE 0 END < 50 THEN 'Show Attendance'
        WHEN assigned < 5 THEN 'Lead Volume'
        ELSE 'No Major Issue'
      END AS bottleneck
    FROM combined
  )
  SELECT s.id, s.full_name, s.business_stage, s.lvl,
    s.assigned, s.completed, s.crate, s.rev, s.avg_deal,
    s.losses, s.refunds,
    CASE WHEN s.wins+s.refunds > 0 THEN ROUND(s.refunds::numeric/(s.wins+s.refunds)*100,1) ELSE 0 END,
    s.completed,  -- shows = completed appointments
    CASE WHEN s.completed > 0 THEN ROUND(s.wins::numeric/s.completed*100,1) ELSE 0 END,
    s.trend, s.tscore, s.bottleneck,
    CASE WHEN s.tscore >= 70 THEN 'top' WHEN s.tscore >= 50 THEN 'rising' WHEN s.tscore >= 30 THEN 'stable' ELSE 'at_risk' END
  FROM scored s
  ORDER BY s.tscore DESC;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_talent_alerts
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_talent_alerts(
  p_range_days int DEFAULT 30,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  alert_type text,
  subject_type text,
  subject_id uuid,
  subject_name text,
  severity text,
  metric_name text,
  metric_value numeric,
  threshold numeric,
  reason text,
  recommended_action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_ids uuid[];
BEGIN
  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(sub.id) INTO v_team_ids
    FROM (SELECT p_user_id AS id UNION SELECT gtm.id FROM get_team_member_ids(p_user_id) gtm) sub;
  END IF;

  RETURN QUERY
  WITH talent AS (
    SELECT * FROM compute_talent_scores(p_range_days, p_user_id, NULL, NULL)
  )
  -- High no-show rate
  SELECT 'high_no_show'::text, 'person'::text, t.user_id, t.full_name,
    CASE WHEN t.show_rate < 30 THEN 'critical' ELSE 'warning' END::text,
    'show_rate'::text, t.show_rate, 50::numeric,
    format('%s hat eine Show Rate von nur %s%% bei %s Bookings', t.full_name, t.show_rate, t.total_bookings)::text,
    'Reminder-Compliance und Qualifikations-Script prüfen. Evtl. Lead-Qualität verbessern.'::text
  FROM talent t
  WHERE t.show_rate < 50 AND t.total_bookings >= 3

  UNION ALL

  -- Low booking rate
  SELECT 'low_booking'::text, 'person'::text, t.user_id, t.full_name,
    CASE WHEN t.booking_rate < 10 THEN 'critical' ELSE 'warning' END::text,
    'booking_rate'::text, t.booking_rate, 20::numeric,
    format('%s hat eine Booking Rate von nur %s%% bei %s Leads', t.full_name, t.booking_rate, t.total_leads)::text,
    'Lead-Engagement und Erstansprache optimieren. Touchpoint-Compliance prüfen.'::text
  FROM talent t
  WHERE t.booking_rate < 20 AND t.total_leads >= 5

  UNION ALL

  -- Low close rate
  SELECT 'low_close'::text, 'person'::text, t.user_id, t.full_name,
    CASE WHEN t.close_rate < 10 THEN 'critical' ELSE 'warning' END::text,
    'close_rate'::text, t.close_rate, 20::numeric,
    format('%s hat eine Close Rate von nur %s%% bei %s Shows', t.full_name, t.close_rate, t.total_shows)::text,
    'Objection Handling und Call Recordings analysieren. Coaching-Session planen.'::text
  FROM talent t
  WHERE t.close_rate < 20 AND t.total_shows >= 3

  UNION ALL

  -- Declining revenue (negative 7d trend)
  SELECT 'declining_revenue'::text, 'person'::text, t.user_id, t.full_name,
    CASE WHEN t.trend_7d < -50 THEN 'critical' ELSE 'warning' END::text,
    'trend_7d'::text, t.trend_7d, 0::numeric,
    format('%s hat einen 7-Tage Revenue-Rückgang von %s%%', t.full_name, t.trend_7d)::text,
    'Ursache analysieren: Lead-Qualität, Aktivitätslevel oder externe Faktoren.'::text
  FROM talent t
  WHERE t.trend_7d < -20 AND t.total_revenue > 0

  UNION ALL

  -- Low activity
  SELECT 'low_activity'::text, 'person'::text, t.user_id, t.full_name,
    CASE WHEN t.activity_score < 10 THEN 'critical' ELSE 'warning' END::text,
    'activity_score'::text, t.activity_score, 30::numeric,
    format('%s hat einen Aktivitätsscore von nur %s%%', t.full_name, t.activity_score)::text,
    'Kontaktaufnahme: Verfügbarkeit klären, ggf. Leads umverteilen.'::text
  FROM talent t
  WHERE t.activity_score < 30

  ORDER BY
    CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
    metric_value ASC;
END;
$$;
