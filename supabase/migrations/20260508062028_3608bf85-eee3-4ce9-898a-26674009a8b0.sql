
-- ═══════════════════════════════════════════════════════════════
-- 1. Insert production_kpi_start_at into system_config
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.system_config (id, config_key, config_value, sensitivity_level, owner_only, version_no)
VALUES (
  gen_random_uuid(),
  'production_kpi_start_at',
  '"2026-05-08T08:00:00Z"'::jsonb,
  'low',
  false,
  1
)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 2. Helper function: get_production_epoch()
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_production_epoch()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (config_value #>> '{}')::timestamptz
     FROM public.system_config
     WHERE config_key = 'production_kpi_start_at'
     LIMIT 1),
    '2026-05-08T08:00:00Z'::timestamptz
  );
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. Update real_leads_view — add epoch filter
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.real_leads_view AS
SELECT
  id, created_at, updated_at, name, email, phone, source, stage,
  owner_id, owner_role, setter_id, closer_id,
  qualification_checklist, setter_notes, closer_notes,
  appointment_date, deal_value, created_by,
  contact_count, first_action_at, last_action_at, timer_expires_at,
  referrer_user_id, lead_level, quiz_score, quiz_result,
  is_simulation, simulation_batch_id,
  lead_score, lead_quality, scored_at,
  quiz_funnel_source, quiz_answers, lead_status, booking_status,
  source_funnel, has_booking, booking_id,
  next_action_type, next_action_at, priority_flag,
  reschedule_count, last_reschedule_at, outcome, close_reason,
  follow_up_date, closed_at,
  qualification_score, qualification_bucket, qualification_path,
  setter_budget_readiness, setter_decision_readiness,
  setter_problem_clarity, setter_recommendation,
  setter_qualification_score, setter_call_outcome,
  setter_follow_up_date, setter_call_completed_at,
  setter_lead_uniqueness, setter_closing_insights,
  total_calls_booked, total_calls_attended, total_no_shows,
  last_call_status, last_reminder_sent_at, reminder_count,
  no_show_flag, rebooked_flag, no_show_risk_score,
  origin_type, origin_id, funnel_id,
  quiz_completed_at, retargeting_state,
  payment_status, payment_recovery_state, retargeting_ab_variants,
  last_quiz_completed_at, quiz_attempt_count,
  funnel_source, traffic_owner,
  do_not_contact, consent_phone, suppression_reason, suppressed_at,
  preferred_calendar, unit_id, assigned_operator_id,
  canonical_funnel_source(source) AS canonical_source
FROM leads l
WHERE NOT is_test_lead(is_simulation, source, name)
  AND l.created_at >= get_production_epoch();

-- ═══════════════════════════════════════════════════════════════
-- 4. Update real_appointments_view — add epoch filter
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.real_appointments_view AS
SELECT
  a.id, a.lead_id, a.call_type, a.appointment_status,
  a.starts_at, a.ends_at, a.setter_id, a.payment_status,
  a.booking_source, a.acknowledged_at, a.completed_at,
  a.outcome, a.qualification_result, a.setter_notes,
  a.created_at, a.updated_at, a.priority_price, a.pricing_tier,
  a.video_call_link, a.join_clicked_at,
  a.call_started_at, a.call_completed_at,
  a.call_status, a.attendance_flag, a.late_flag,
  a.setter_reminder_sent_at, a.sla_escalated_at,
  a.no_show_detected_at, a.reminders_state,
  a.reservation_expires_at,
  a.stripe_checkout_session_id, a.stripe_payment_intent_id,
  a.fastlane_amount_cents,
  a.origin_source, a.attribution_snapshot, a.traffic_owner,
  a.closer_id, a.current_owner_id, a.current_owner_role,
  a.original_owner_id, a.original_owner_role,
  a.reassigned_at, a.reassigned_by, a.reassignment_reason,
  a.locked_closer_id, a.locked_at,
  a.booking_timezone, a.booking_utc_offset,
  a.original_local_date, a.original_local_time,
  a.assigned_operator_id, a.operator_unit_id,
  a.rescheduled_from_id, a.rescheduled_to_id, a.rescheduled_at
FROM appointments a
WHERE EXISTS (
  SELECT 1 FROM leads l
  WHERE l.id = a.lead_id
    AND NOT is_test_lead(l.is_simulation, l.source, l.name)
)
AND a.created_at >= get_production_epoch();

-- ═══════════════════════════════════════════════════════════════
-- 5. Update revenue_truth_view — add epoch filter
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.revenue_truth_view AS
WITH payment_revenue AS (
  SELECT pl.id AS source_id, 'payment_link'::text AS source_type,
    pl.lead_id, pl.closer_id, l.setter_id,
    l.unit_id AS operator_unit_id, l.assigned_operator_id,
    pl.amount::numeric / 100.0 AS revenue_amount, pl.currency,
    pl.paid_at AS revenue_at, pl.offer_title AS product,
    pl.call_id, pl.appointment_id
  FROM payment_links pl
  LEFT JOIN leads l ON l.id = pl.lead_id
  WHERE pl.status = 'paid' AND pl.paid_at IS NOT NULL
    AND (l.id IS NULL OR NOT is_test_lead(l.is_simulation, l.source, l.name))
    AND pl.paid_at >= get_production_epoch()
),
call_revenue AS (
  SELECT c.id AS source_id, 'call'::text AS source_type,
    c.lead_id, c.user_id AS closer_id, l.setter_id,
    l.unit_id AS operator_unit_id, l.assigned_operator_id,
    c.revenue AS revenue_amount, 'EUR'::text AS currency,
    c.closed_at AS revenue_at, c.offer_type AS product,
    c.id AS call_id, c.appointment_id
  FROM calls c
  LEFT JOIN leads l ON l.id = c.lead_id
  WHERE c.result = 'won' AND c.revenue > 0 AND c.is_simulation = false
    AND (l.id IS NULL OR NOT is_test_lead(l.is_simulation, l.source, l.name))
    AND NOT EXISTS (
      SELECT 1 FROM payment_links pl
      WHERE pl.call_id = c.id AND pl.status = 'paid'
    )
    AND c.closed_at >= get_production_epoch()
),
funnel_revenue AS (
  SELECT fe.id AS source_id, 'funnel_event'::text AS source_type,
    NULL::uuid AS lead_id, NULL::uuid AS closer_id,
    NULL::uuid AS setter_id, NULL::uuid AS operator_unit_id,
    NULL::uuid AS assigned_operator_id,
    fe.revenue AS revenue_amount, 'EUR'::text AS currency,
    fe."timestamp" AS revenue_at, NULL::text AS product,
    NULL::uuid AS call_id, NULL::uuid AS appointment_id
  FROM funnel_events_v2 fe
  WHERE fe.event_type = 'deal_won' AND fe.revenue > 0
    AND NOT EXISTS (
      SELECT 1 FROM payment_links pl
      WHERE pl.status = 'paid' AND pl.paid_at IS NOT NULL
        AND lower(pl.email) = lower(fe.origin_email)
        AND abs(EXTRACT(epoch FROM pl.paid_at - fe."timestamp")) < 86400
    )
    AND NOT EXISTS (
      SELECT 1 FROM calls c
      WHERE c.result = 'won' AND c.is_simulation = false AND c.revenue > 0
        AND abs(EXTRACT(epoch FROM c.closed_at - fe."timestamp")) < 86400
    )
    AND fe."timestamp" >= get_production_epoch()
)
SELECT * FROM payment_revenue
UNION ALL
SELECT * FROM call_revenue
UNION ALL
SELECT * FROM funnel_revenue;

-- ═══════════════════════════════════════════════════════════════
-- 6. Update recalc_kpis_from_call — add epoch filter
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recalc_kpis_from_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_showed int;
  v_no_show int;
  v_closed_won int;
  v_total_revenue numeric;
  v_show_rate numeric;
  v_close_rate numeric;
  v_booked int;
  v_epoch timestamptz;
BEGIN
  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  v_epoch := get_production_epoch();

  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE no_show_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_no_show, v_closed_won, v_total_revenue
  FROM calls
  WHERE user_id = v_user_id
    AND created_at >= v_epoch;

  v_show_rate := CASE WHEN (v_showed + v_no_show) > 0
    THEN LEAST(ROUND((v_showed::numeric / (v_showed + v_no_show)) * 100, 1), 100)
    ELSE 0 END;

  v_close_rate := CASE WHEN v_showed > 0
    THEN LEAST(ROUND((v_closed_won::numeric / v_showed) * 100, 1), 100)
    ELSE 0 END;

  INSERT INTO member_kpis (user_id, closing_rate, show_rate, calls_handled, revenue_closed, updated_at)
  VALUES (v_user_id, v_close_rate, v_show_rate, v_booked, v_total_revenue, now())
  ON CONFLICT (user_id) DO UPDATE SET
    closing_rate = EXCLUDED.closing_rate,
    show_rate = EXCLUDED.show_rate,
    calls_handled = EXCLUDED.calls_handled,
    revenue_closed = EXCLUDED.revenue_closed,
    updated_at = now();

  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- 7. Update recalc_user_kpi_snapshot — add epoch filter
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recalc_user_kpi_snapshot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booked int;
  v_showed int;
  v_no_show int;
  v_won int;
  v_revenue numeric;
  v_show_rate numeric;
  v_close_rate numeric;
  v_epc numeric;
  v_epoch timestamptz;
BEGIN
  v_epoch := get_production_epoch();

  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE no_show_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_no_show, v_won, v_revenue
  FROM calls
  WHERE user_id = p_user_id
    AND created_at >= v_epoch;

  v_show_rate := CASE WHEN (v_showed + v_no_show) > 0
    THEN LEAST(ROUND((v_showed::numeric / (v_showed + v_no_show)) * 100, 1), 100) ELSE 0 END;
  v_close_rate := CASE WHEN v_showed > 0
    THEN LEAST(ROUND((v_won::numeric / v_showed) * 100, 1), 100) ELSE 0 END;
  v_epc := CASE WHEN v_booked > 0
    THEN ROUND(v_revenue / v_booked, 2) ELSE 0 END;

  INSERT INTO users_kpi_snapshot (user_id, total_calls, total_revenue, show_rate, close_rate, earnings_per_call, last_updated)
  VALUES (p_user_id, v_booked, v_revenue, v_show_rate, v_close_rate, v_epc, now())
  ON CONFLICT (user_id) DO UPDATE SET
    total_calls = EXCLUDED.total_calls,
    total_revenue = EXCLUDED.total_revenue,
    show_rate = EXCLUDED.show_rate,
    close_rate = EXCLUDED.close_rate,
    earnings_per_call = EXCLUDED.earnings_per_call,
    last_updated = now();
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- 8. Update performance_revenue_kpis — add epoch floor + test filter
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.performance_revenue_kpis(
  p_days integer DEFAULT 30,
  p_operator_id uuid DEFAULT NULL,
  p_funnel text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_level_filter integer DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_since timestamptz;
  v_traffic bigint;
  v_engagement bigint;
  v_booking bigint;
  v_setter bigint;
  v_showing bigint;
  v_closer bigint;
  v_offer bigint;
  v_revenue_count bigint;
  v_revenue_total numeric;
  v_source_dist json;
BEGIN
  v_since := GREATEST(now() - (p_days || ' days')::interval, get_production_epoch());

  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.stage IS NOT NULL AND l.stage NOT IN ('new','unknown','')), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.has_booking = true), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.setter_id IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.total_calls_attended > 0), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.outcome IN ('closed_won','offer_made','payment_pending')), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.outcome = 'closed_won'), 0)
  INTO v_traffic, v_engagement, v_booking, v_setter, v_closer, v_offer, v_revenue_count
  FROM leads l
  WHERE l.created_at >= v_since
    AND (p_operator_id IS NULL OR l.setter_id = p_operator_id OR l.closer_id = p_operator_id OR l.owner_id = p_operator_id)
    AND (p_funnel IS NULL OR l.source ILIKE '%' || p_funnel || '%')
    AND (p_source IS NULL OR l.source = p_source)
    AND l.is_simulation IS NOT TRUE
    AND NOT is_test_lead(l.is_simulation, l.source, l.name);

  SELECT COUNT(DISTINCT a.lead_id)
  INTO v_showing
  FROM appointments a
  JOIN leads l2 ON l2.id = a.lead_id
  WHERE a.starts_at >= v_since
    AND a.attendance_flag = true
    AND (p_operator_id IS NULL OR l2.setter_id = p_operator_id OR l2.closer_id = p_operator_id OR l2.owner_id = p_operator_id)
    AND (p_funnel IS NULL OR l2.source ILIKE '%' || p_funnel || '%')
    AND (p_source IS NULL OR l2.source = p_source)
    AND l2.is_simulation IS NOT TRUE
    AND NOT is_test_lead(l2.is_simulation, l2.source, l2.name);

  SELECT COALESCE(SUM(c.revenue), 0)
  INTO v_revenue_total
  FROM calls c
  WHERE c.created_at >= v_since
    AND c.result = 'closed_won'
    AND c.is_simulation IS NOT TRUE
    AND (p_operator_id IS NULL OR c.user_id = p_operator_id);

  SELECT COALESCE(json_agg(row_to_json(sd)), '[]'::json)
  INTO v_source_dist
  FROM (
    SELECT
      COALESCE(l.source, 'unknown') as source,
      COUNT(*) as lead_count,
      COUNT(*) FILTER (WHERE l.has_booking = true) as booked,
      COUNT(*) FILTER (WHERE l.outcome = 'closed_won') as closed,
      ROUND(CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE l.has_booking = true)::numeric / COUNT(*)) * 100 ELSE 0 END, 1) as booking_rate,
      ROUND(CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE l.outcome = 'closed_won')::numeric / COUNT(*)) * 100 ELSE 0 END, 1) as close_rate
    FROM leads l
    WHERE l.created_at >= v_since
      AND (p_operator_id IS NULL OR l.setter_id = p_operator_id OR l.closer_id = p_operator_id OR l.owner_id = p_operator_id)
      AND (p_funnel IS NULL OR l.source ILIKE '%' || p_funnel || '%')
      AND (p_source IS NULL OR l.source = p_source)
      AND l.is_simulation IS NOT TRUE
      AND NOT is_test_lead(l.is_simulation, l.source, l.name)
    GROUP BY l.source
    ORDER BY COUNT(*) DESC
    LIMIT 20
  ) sd;

  SELECT json_build_object(
    'traffic', v_traffic,
    'engagement', v_engagement,
    'booking', v_booking,
    'setter', v_setter,
    'showing', v_showing,
    'closer', v_closer,
    'offer', v_offer,
    'revenue', v_revenue_count,
    'booking_rate', CASE WHEN v_traffic > 0 THEN ROUND((v_booking::numeric / v_traffic) * 100, 1) ELSE 0 END,
    'show_rate', CASE WHEN v_booking > 0 THEN ROUND((v_showing::numeric / v_booking) * 100, 1) ELSE 0 END,
    'close_rate', CASE WHEN v_showing > 0 THEN ROUND((v_revenue_count::numeric / v_showing) * 100, 1) ELSE 0 END,
    'revenue_total', v_revenue_total,
    'source_distribution', v_source_dist
  ) INTO result;

  RETURN result;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- 9. Update get_performance_dashboard — add epoch floor
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_performance_dashboard(start_date date, end_date date)
RETURNS TABLE(
  origin_email text, origin_display_name text,
  leads bigint, quiz_completed bigint, bookings bigint,
  shows bigint, offers bigint, sales bigint, losses bigint,
  revenue numeric, spend numeric,
  quiz_rate numeric, booking_rate numeric, show_rate numeric,
  offer_rate numeric, closing_rate numeric, offer_to_close_rate numeric,
  lead_to_sale_rate numeric,
  cpl numeric, cpql numeric, cac numeric, roas numeric,
  primary_bottleneck_type text, primary_bottleneck_metric text,
  primary_bottleneck_value numeric, bottleneck_summary text,
  recommended_focus text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days int;
  v_spend numeric;
  v_cfg performance_budget_config%ROWTYPE;
  v_epoch timestamptz;
BEGIN
  IF NOT (public.is_perf_viewer() OR public.is_perf_editor()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_days := GREATEST(1, (end_date - start_date) + 1);
  v_epoch := get_production_epoch();

  SELECT * INTO v_cfg
  FROM performance_budget_config
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_days <= 1 THEN
    v_spend := COALESCE(v_cfg.daily_budget_per_origin, 0);
  ELSIF v_days <= 7 THEN
    v_spend := COALESCE(v_cfg.weekly_budget_per_origin, 0);
  ELSE
    v_spend := COALESCE(v_cfg.monthly_budget_per_origin, 0);
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      fe.origin_email,
      MAX(fe.origin_display_name) AS origin_display_name,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'lead_created'    THEN fe.lead_id END) AS leads,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'quiz_completed'  THEN fe.lead_id END) AS quiz_completed,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'call_booked'     THEN fe.lead_id END) AS bookings,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'show_up'         THEN fe.lead_id END) AS shows,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'offer_made'      THEN fe.lead_id END) AS offers,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'deal_won'        THEN fe.lead_id END) AS sales,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'deal_lost'       THEN fe.lead_id END) AS losses,
      COALESCE(SUM(CASE WHEN fe.event_type = 'deal_won' THEN fe.revenue ELSE 0 END), 0) AS revenue
    FROM funnel_events_v2 fe
    WHERE fe.timestamp >= GREATEST(start_date::timestamptz, v_epoch)
      AND fe.timestamp <  (end_date + 1)::timestamptz
    GROUP BY fe.origin_email
  ),
  derived AS (
    SELECT
      a.*,
      v_spend AS spend,
      CASE WHEN a.leads     > 0 THEN a.quiz_completed::numeric / a.leads     END AS quiz_rate,
      CASE WHEN a.leads     > 0 THEN a.bookings::numeric       / a.leads     END AS booking_rate,
      CASE WHEN a.bookings  > 0 THEN a.shows::numeric          / a.bookings  END AS show_rate,
      CASE WHEN a.shows     > 0 THEN a.offers::numeric         / a.shows     END AS offer_rate,
      CASE WHEN a.shows     > 0 THEN a.sales::numeric          / a.shows     END AS closing_rate,
      CASE WHEN a.offers    > 0 THEN a.sales::numeric          / a.offers    END AS offer_to_close_rate,
      CASE WHEN a.leads     > 0 THEN a.sales::numeric          / a.leads     END AS lead_to_sale_rate,
      CASE WHEN a.leads          > 0 THEN v_spend / a.leads          END AS cpl,
      CASE WHEN a.quiz_completed > 0 THEN v_spend / a.quiz_completed END AS cpql,
      CASE WHEN a.sales          > 0 THEN v_spend / a.sales          END AS cac,
      CASE WHEN v_spend          > 0 THEN a.revenue / v_spend        END AS roas
    FROM agg a
  )
  SELECT
    d.origin_email, d.origin_display_name,
    d.leads, d.quiz_completed, d.bookings, d.shows, d.offers, d.sales, d.losses,
    d.revenue, d.spend,
    d.quiz_rate, d.booking_rate, d.show_rate, d.offer_rate, d.closing_rate,
    d.offer_to_close_rate, d.lead_to_sale_rate,
    d.cpl, d.cpql, d.cac, d.roas,
    CASE
      WHEN d.leads = 0 THEN 'NO_DATA'
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN 'TRAFFIC_OR_FRONTEND_FUNNEL'
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN 'BOOKING_CONVERSION'
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN 'SETTER_OR_SHOW_UP_PROCESS'
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN 'CLOSER_QUALIFICATION_OR_OFFER_CREATION'
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN 'CLOSING_OR_OFFER_CONVERSION'
      ELSE 'NO_CLEAR_BOTTLENECK'
    END AS primary_bottleneck_type,
    CASE
      WHEN d.leads = 0 THEN NULL
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN 'quiz_rate'
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN 'booking_rate'
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN 'show_rate'
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN 'offer_rate'
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN 'closing_rate'
      ELSE NULL
    END AS primary_bottleneck_metric,
    CASE
      WHEN d.leads = 0 THEN NULL
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN d.quiz_rate
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN d.booking_rate
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN d.show_rate
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN d.offer_rate
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN d.closing_rate
      ELSE NULL
    END AS primary_bottleneck_value,
    CASE
      WHEN d.leads = 0 THEN 'No funnel events in this period'
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN 'Weak front-end conversion before quiz completion'
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN 'Too many leads fail before booking'
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN 'Booked leads do not attend reliably'
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN 'Calls happen but too few offers are made'
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN 'Offers or calls do not convert into sales efficiently'
      ELSE 'No dominant bottleneck detected'
    END AS bottleneck_summary,
    CASE
      WHEN d.leads = 0 THEN 'Verify event ingestion and origin attribution'
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN 'Check traffic quality, ad-message match and quiz entry friction'
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN 'Check landing page, CTA clarity and booking flow'
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN 'Check setter expectation-setting, reminders and commitment process'
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN 'Check lead quality, call control and qualification-to-offer logic'
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN 'Check closer performance, offer strength and objection handling'
      ELSE 'Scale carefully and monitor changes'
    END AS recommended_focus
  FROM derived d
  ORDER BY d.revenue DESC NULLS LAST, d.origin_email;
END;
$function$;
