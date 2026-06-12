-- ═══════════════════════════════════════════════════════════
-- 1. DROP OVERLOADED RPCs (keep only the canonical versions)
-- ═══════════════════════════════════════════════════════════

-- Drop the OLD 9-arg create_manual_appointment (the one with p_setter_notes that lacks capacity/blocker guards)
DROP FUNCTION IF EXISTS public.create_manual_appointment(uuid, timestamptz, timestamptz, text, boolean, text, uuid, text, uuid);

-- Drop the OLD 5-arg reassign_appointment (lacks p_retain_block and _action_source)
DROP FUNCTION IF EXISTS public.reassign_appointment(uuid, uuid, text, text, text);

-- Drop the OLD 3-arg get_team_performance_kpis (lacks p_role_filter)
DROP FUNCTION IF EXISTS public.get_team_performance_kpis(uuid, integer, uuid);

-- Drop the OLD 5-arg performance_revenue_kpis (lacks p_user_id)
DROP FUNCTION IF EXISTS public.performance_revenue_kpis(integer, uuid, integer, text, text);

-- ═══════════════════════════════════════════════════════════
-- 2. PATCH ceo_dashboard_snapshot — exclude test leads & inactive appointments
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ceo_dashboard_snapshot(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_now timestamptz := now();
  v_window_start timestamptz := v_now - (_days || ' days')::interval;
  v_prev_start  timestamptz := v_now - (2 * _days || ' days')::interval;
  v_prev_end    timestamptz := v_window_start;

  v_rev_today numeric := 0;
  v_rev_7d numeric := 0;
  v_rev_30d numeric := 0;
  v_rev_prev_30d numeric := 0;
  v_mom_growth numeric := 0;

  v_funnel jsonb;
  v_bottleneck jsonb;
  v_sources jsonb;
  v_community jsonb;
  v_team jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_forecast jsonb;

  v_setters jsonb;
  v_closers jsonb;

  v_pipeline_value numeric := 0;
  v_avg_deal numeric := 0;
  v_close_rate numeric := 0;
  v_show_rate numeric := 0;
  v_book_rate numeric := 0;
  v_open_appointments int := 0;
  v_forecast_7d numeric := 0;
  v_forecast_30d numeric := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','owner')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  -- ============ SECTION 1: REVENUE ============
  SELECT COALESCE(SUM(revenue_amount),0) INTO v_rev_today
  FROM public.revenue_truth_view WHERE revenue_at >= date_trunc('day', v_now);

  SELECT COALESCE(SUM(revenue_amount),0) INTO v_rev_7d
  FROM public.revenue_truth_view WHERE revenue_at >= v_now - interval '7 days';

  SELECT COALESCE(SUM(revenue_amount),0) INTO v_rev_30d
  FROM public.revenue_truth_view WHERE revenue_at >= v_window_start;

  SELECT COALESCE(SUM(revenue_amount),0) INTO v_rev_prev_30d
  FROM public.revenue_truth_view WHERE revenue_at >= v_prev_start AND revenue_at < v_prev_end;

  IF v_rev_prev_30d > 0 THEN
    v_mom_growth := round(((v_rev_30d - v_rev_prev_30d) / v_rev_prev_30d) * 100, 1);
  ELSIF v_rev_30d > 0 THEN
    v_mom_growth := 100;
  END IF;

  -- ============ SECTION 2 & 3: FUNNEL + BOTTLENECK ============
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'stage', stage, 'order', stage_order, 'count', count,
    'rate_from_top', rate_from_top, 'rate_from_prev', rate_from_prev
  ) ORDER BY stage_order), '[]'::jsonb) INTO v_funnel
  FROM public.perf_funnel_stages(_days);

  v_bottleneck := public.perf_bottleneck_detection(_days);

  -- ============ SECTION 4: REVENUE BY SOURCE ============
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'origin_id', origin_id, 'origin_type', origin_type, 'label', label,
    'leads', leads, 'bookings', bookings, 'shows', shows,
    'sales', sales, 'revenue', revenue, 'spend', spend,
    'cpl', cpl, 'cac', cac, 'roas', roas
  ) ORDER BY revenue DESC NULLS LAST), '[]'::jsonb) INTO v_sources
  FROM public.perf_origin_performance(_days);

  -- ============ SECTION 5: COMMUNITY IMPACT ============
  SELECT to_jsonb(c.*) INTO v_community
  FROM public.community_v2_conversion_funnel(_days) c;

  SELECT COALESCE(SUM(rtv.revenue_amount),0) AS revenue_from_community
  INTO STRICT v_community
  FROM public.revenue_truth_view rtv
  WHERE rtv.revenue_at >= v_window_start
    AND EXISTS (
      SELECT 1 FROM public.community_events ce
      WHERE ce.user_id IS NOT NULL
        AND ce.event_type IN ('upgrade_clicked','path_completed','community_entry')
        AND ce.created_at < rtv.revenue_at
        AND lower((SELECT email FROM public.profiles p WHERE p.id = ce.user_id)) = lower((SELECT email FROM public.leads ld WHERE ld.id = rtv.lead_id))
    );

  SELECT to_jsonb(c.*) || jsonb_build_object('revenue_from_community', v_community)
  INTO v_community
  FROM public.community_v2_conversion_funnel(_days) c;

  -- ============ SECTION 6: TEAM PERFORMANCE (FIXED: uses active_appointments to exclude test+inactive) ============
  WITH setter_stats AS (
    SELECT
      a.setter_id AS user_id,
      COUNT(*) FILTER (WHERE a.created_at >= v_window_start) AS bookings,
      COUNT(*) FILTER (WHERE a.created_at >= v_window_start AND a.attendance_flag = true) AS shows
    FROM public.active_appointments a
    WHERE a.setter_id IS NOT NULL AND a.created_at >= v_window_start
    GROUP BY a.setter_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', s.user_id,
    'name', COALESCE(p.full_name, p.email),
    'email', p.email,
    'bookings', s.bookings,
    'shows', s.shows,
    'show_rate', CASE WHEN s.bookings > 0 THEN round((s.shows::numeric / s.bookings) * 100, 1) ELSE 0 END
  ) ORDER BY s.bookings DESC), '[]'::jsonb)
  INTO v_setters
  FROM setter_stats s
  LEFT JOIN public.profiles p ON p.id = s.user_id;

  WITH closer_stats AS (
    SELECT
      c.user_id,
      COUNT(*) FILTER (WHERE c.created_at >= v_window_start) AS calls,
      COUNT(*) FILTER (WHERE c.created_at >= v_window_start AND c.result = 'won') AS wins,
      COALESCE((
        SELECT SUM(rtv.revenue_amount)
        FROM revenue_truth_view rtv
        WHERE rtv.closer_id = c.user_id
          AND rtv.revenue_at >= v_window_start
          AND rtv.revenue_at < v_now
      ), 0) AS revenue
    FROM public.calls c
    WHERE c.is_simulation = false
    GROUP BY c.user_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', cs.user_id,
    'name', COALESCE(p.full_name, p.email),
    'email', p.email,
    'calls', cs.calls,
    'wins', cs.wins,
    'close_rate', CASE WHEN cs.calls > 0 THEN round((cs.wins::numeric / cs.calls) * 100, 1) ELSE 0 END,
    'revenue', cs.revenue
  ) ORDER BY cs.revenue DESC), '[]'::jsonb)
  INTO v_closers
  FROM closer_stats cs
  LEFT JOIN public.profiles p ON p.id = cs.user_id
  WHERE cs.calls > 0;

  v_team := jsonb_build_object('setters', COALESCE(v_setters,'[]'::jsonb), 'closers', COALESCE(v_closers,'[]'::jsonb));

  -- ============ FORECAST (FIXED: uses active_appointments) ============
  SELECT COUNT(*) INTO v_open_appointments
  FROM public.active_appointments
  WHERE starts_at >= v_now AND appointment_status NOT IN ('cancelled','no_show');

  SELECT
    CASE WHEN COUNT(*) FILTER (WHERE result IN ('won','lost')) > 0
      THEN round(COUNT(*) FILTER (WHERE result='won')::numeric / COUNT(*) FILTER (WHERE result IN ('won','lost')) * 100, 1)
      ELSE 0 END
  INTO v_close_rate
  FROM public.calls
  WHERE created_at >= v_window_start AND is_simulation = false;

  SELECT COALESCE(AVG(revenue_amount), 0) INTO v_avg_deal
  FROM public.revenue_truth_view WHERE revenue_at >= v_window_start;

  SELECT
    CASE WHEN COUNT(*) > 0
      THEN round(COUNT(*) FILTER (WHERE attendance_flag=true)::numeric / COUNT(*) * 100, 1)
      ELSE 0 END
  INTO v_show_rate
  FROM public.active_appointments WHERE created_at >= v_window_start;

  v_pipeline_value := v_open_appointments * (v_show_rate/100.0) * (v_close_rate/100.0) * v_avg_deal;
  v_forecast_7d := v_pipeline_value * LEAST(1.0, 7.0 / GREATEST(_days, 1));
  v_forecast_30d := v_pipeline_value;

  v_forecast := jsonb_build_object(
    'open_appointments', v_open_appointments,
    'avg_deal_value', round(v_avg_deal, 0),
    'expected_show_rate', v_show_rate,
    'expected_close_rate', v_close_rate,
    'forecast_7d', round(v_forecast_7d, 0),
    'forecast_30d', round(v_forecast_30d, 0)
  );

  -- ============ ALERTS ============
  IF v_show_rate < 60 AND v_show_rate > 0 THEN
    v_alerts := v_alerts || jsonb_build_object('severity','high','metric','show_rate','message',
      format('Show rate at %s%% — below 60%% threshold', v_show_rate));
  END IF;
  IF v_close_rate < 20 AND v_close_rate > 0 THEN
    v_alerts := v_alerts || jsonb_build_object('severity','high','metric','close_rate','message',
      format('Close rate at %s%% — below 20%% threshold', v_close_rate));
  END IF;
  IF v_mom_growth < -10 THEN
    v_alerts := v_alerts || jsonb_build_object('severity','critical','metric','revenue','message',
      format('Revenue down %s%% MoM', abs(v_mom_growth)));
  END IF;
  IF v_rev_prev_30d > 0 AND v_rev_30d < v_rev_prev_30d * 0.85 THEN
    v_alerts := v_alerts || jsonb_build_object('severity','high','metric','revenue_drop','message',
      'Revenue declined > 15% vs previous period');
  END IF;

  RETURN jsonb_build_object(
    'days', _days, 'generated_at', v_now,
    'revenue', jsonb_build_object(
      'today', v_rev_today, 'last_7d', v_rev_7d, 'last_30d', v_rev_30d,
      'previous_30d', v_rev_prev_30d, 'mom_growth_pct', v_mom_growth
    ),
    'funnel', v_funnel, 'bottleneck', v_bottleneck,
    'sources', v_sources, 'community', v_community,
    'team', v_team, 'forecast', v_forecast, 'alerts', v_alerts
  );
END;
$function$;

-- Add canonical usage comment
COMMENT ON FUNCTION public.ceo_dashboard_snapshot IS 'CEO Dashboard — uses active_appointments (excludes test leads + inactive statuses). RULE: All new KPI queries MUST use real_leads / active_appointments views.';

-- ═══════════════════════════════════════════════════════════
-- 3. PATCH get_revenue_acceleration_kpis — exclude test leads
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_revenue_acceleration_kpis(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(days => p_days);
  v_quiz_completed int;
  v_retarget_sends int;
  v_bookings_after_retarget int;
  v_reminder_sends int;
  v_appts_due int;
  v_appts_attended int;
  v_show_rate numeric;
  v_payment_at_risk int;
  v_payments_recovered int;
  v_commitments int;
  v_no_shows int;
  v_upsell_offers int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- FIXED: use real_leads instead of leads
  SELECT count(*) INTO v_quiz_completed
  FROM public.real_leads WHERE quiz_completed_at >= v_since;

  SELECT count(*) INTO v_retarget_sends
  FROM public.outbound_events
  WHERE event_name LIKE 'retargeting.%' AND created_at >= v_since
    AND status IN ('sent','pending','processing');

  SELECT count(DISTINCT l.id) INTO v_bookings_after_retarget
  FROM public.real_leads l
  WHERE l.has_booking = true
    AND EXISTS (
      SELECT 1 FROM public.outbound_events oe
      WHERE oe.entity_id = l.id
        AND oe.event_name LIKE 'retargeting.%'
        AND oe.created_at >= v_since
    );

  SELECT count(*) INTO v_reminder_sends
  FROM public.outbound_events
  WHERE event_name LIKE 'appointment.reminder%' AND created_at >= v_since
    AND status IN ('sent','pending','processing');

  -- FIXED: use active_appointments instead of appointments
  SELECT count(*) INTO v_appts_due
  FROM public.active_appointments
  WHERE starts_at >= v_since AND starts_at <= now();

  SELECT count(*) INTO v_appts_attended
  FROM public.active_appointments
  WHERE starts_at >= v_since AND starts_at <= now() AND attendance_flag = true;

  v_show_rate := CASE WHEN v_appts_due > 0
    THEN round((v_appts_attended::numeric / v_appts_due::numeric) * 100, 1)
    ELSE 0 END;

  SELECT count(*) INTO v_payment_at_risk
  FROM public.real_leads WHERE payment_status = 'at_risk';

  SELECT count(*) INTO v_payments_recovered
  FROM public.real_leads
  WHERE payment_status = 'paid'
    AND payment_recovery_state ? 'recovered_at'
    AND (payment_recovery_state->>'recovered_at')::timestamptz >= v_since;

  SELECT count(*) INTO v_commitments
  FROM public.appointment_commitments WHERE confirmed_at >= v_since;

  -- FIXED: use active_appointments
  SELECT count(*) INTO v_no_shows
  FROM public.active_appointments
  WHERE no_show_detected_at >= v_since;

  SELECT count(*) INTO v_upsell_offers
  FROM public.upsell_offers WHERE created_at >= v_since;

  RETURN jsonb_build_object(
    'quiz_completed', v_quiz_completed,
    'retargeting_sends', v_retarget_sends,
    'bookings_after_retarget', v_bookings_after_retarget,
    'reminder_sends', v_reminder_sends,
    'show_rate_pct', v_show_rate,
    'payment_at_risk', v_payment_at_risk,
    'payments_recovered', v_payments_recovered,
    'commitments_confirmed', v_commitments,
    'no_shows', v_no_shows,
    'upsell_offers', v_upsell_offers
  );
END;
$function$;

COMMENT ON FUNCTION public.get_revenue_acceleration_kpis IS 'Revenue Acceleration KPIs — uses real_leads + active_appointments. RULE: All new KPI queries MUST use these canonical views.';

-- ═══════════════════════════════════════════════════════════
-- 4. PATCH l6_attendance_dashboard — exclude test leads
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.l6_attendance_dashboard(_operator_id uuid, _funnel_key text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  scoped_appts uuid[];
BEGIN
  -- FIXED: join real_leads to exclude test leads, and filter inactive statuses
  SELECT ARRAY_AGG(a.id) INTO scoped_appts
  FROM public.appointments a
  JOIN public.real_leads l ON l.id = a.lead_id
  WHERE (a.setter_id = _operator_id OR l.setter_id = _operator_id OR l.closer_id = _operator_id OR l.owner_id = _operator_id)
    AND a.starts_at > now() - interval '30 days'
    AND a.appointment_status NOT IN ('cancelled', 'reassigned', 'blocked');

  scoped_appts := COALESCE(scoped_appts, ARRAY[]::uuid[]);

  result := jsonb_build_object(
    'kpis', jsonb_build_object(
      'booked', (SELECT count(*) FROM public.appointments WHERE id = ANY(scoped_appts) AND appointment_status IN ('booked','confirmed')),
      'reminders_sent', (SELECT count(*) FROM public.attendance_jobs WHERE appointment_id = ANY(scoped_appts) AND status = 'sent'),
      'failed_messages', (SELECT count(*) FROM public.attendance_jobs WHERE appointment_id = ANY(scoped_appts) AND status = 'failed'),
      'unknown_replies', (SELECT count(*) FROM public.lead_message_intents WHERE appointment_id = ANY(scoped_appts) AND intent = 'unknown'),
      'reschedule_requests', (SELECT count(*) FROM public.lead_message_intents WHERE appointment_id = ANY(scoped_appts) AND intent = 'reschedule'),
      'confirmed_replies', (SELECT count(*) FROM public.lead_message_intents WHERE appointment_id = ANY(scoped_appts) AND intent = 'confirmed')
    ),
    'upcoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',a.id,'starts_at',a.starts_at,'status',a.appointment_status,'lead_name',l.name) ORDER BY a.starts_at ASC)
      FROM public.appointments a JOIN public.real_leads l ON l.id=a.lead_id
      WHERE a.id = ANY(scoped_appts) AND a.starts_at > now() AND a.appointment_status IN ('booked','confirmed','pending_payment')
      LIMIT 20
    ), '[]'::jsonb),
    'recent_replies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',i.id,'intent',i.intent,'body',LEFT(i.raw_body,140),'created_at',i.created_at) ORDER BY i.created_at DESC)
      FROM public.lead_message_intents i
      WHERE i.appointment_id = ANY(scoped_appts)
      LIMIT 20
    ), '[]'::jsonb),
    'failed_jobs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',j.id,'trigger',j.trigger,'channel',j.channel,'last_error',j.last_error,'attempts',j.attempts) ORDER BY j.updated_at DESC)
      FROM public.attendance_jobs j
      WHERE j.appointment_id = ANY(scoped_appts) AND j.status = 'failed'
      LIMIT 20
    ), '[]'::jsonb)
  );
  RETURN result;
END;
$function$;

COMMENT ON FUNCTION public.l6_attendance_dashboard IS 'L6 Attendance Dashboard — uses real_leads + excludes inactive appointments. RULE: All new KPI queries MUST use real_leads / active_appointments.';

-- ═══════════════════════════════════════════════════════════
-- 5. CANONICAL USAGE RULE (as DB comments on views)
-- ═══════════════════════════════════════════════════════════

COMMENT ON VIEW public.active_appointments IS 'CANONICAL VIEW for appointment-based KPIs. Excludes cancelled/reassigned/blocked appointments and test leads. All new KPI queries MUST use this view instead of the appointments table directly.';
COMMENT ON VIEW public.real_leads IS 'CANONICAL VIEW for lead-based KPIs. Excludes test leads and simulations. All new KPI queries MUST use this view instead of the leads table directly.';