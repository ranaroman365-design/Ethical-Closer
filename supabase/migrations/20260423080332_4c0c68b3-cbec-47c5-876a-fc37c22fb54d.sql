-- CEO Dashboard snapshot RPC: aggregates revenue, funnel, sources, community, team, forecast, alerts
CREATE OR REPLACE FUNCTION public.ceo_dashboard_snapshot(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Admin guard
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','owner')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  -- ============ SECTION 1: REVENUE SNAPSHOT ============
  SELECT COALESCE(SUM(revenue),0) INTO v_rev_today
  FROM public.funnel_events_v2
  WHERE event_type = 'deal_won' AND timestamp >= date_trunc('day', v_now);

  SELECT COALESCE(SUM(revenue),0) INTO v_rev_7d
  FROM public.funnel_events_v2
  WHERE event_type = 'deal_won' AND timestamp >= v_now - interval '7 days';

  SELECT COALESCE(SUM(revenue),0) INTO v_rev_30d
  FROM public.funnel_events_v2
  WHERE event_type = 'deal_won' AND timestamp >= v_window_start;

  SELECT COALESCE(SUM(revenue),0) INTO v_rev_prev_30d
  FROM public.funnel_events_v2
  WHERE event_type = 'deal_won' AND timestamp >= v_prev_start AND timestamp < v_prev_end;

  IF v_rev_prev_30d > 0 THEN
    v_mom_growth := round(((v_rev_30d - v_rev_prev_30d) / v_rev_prev_30d) * 100, 1);
  ELSIF v_rev_30d > 0 THEN
    v_mom_growth := 100;
  END IF;

  -- ============ SECTION 2 & 3: FUNNEL + BOTTLENECK ============
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'stage', stage,
    'order', stage_order,
    'count', count,
    'rate_from_top', rate_from_top,
    'rate_from_prev', rate_from_prev
  ) ORDER BY stage_order), '[]'::jsonb) INTO v_funnel
  FROM public.perf_funnel_stages(_days);

  v_bottleneck := public.perf_bottleneck_detection(_days);

  -- ============ SECTION 4: REVENUE BY SOURCE ============
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'origin_id', origin_id,
    'origin_type', origin_type,
    'label', label,
    'leads', leads,
    'bookings', bookings,
    'shows', shows,
    'sales', sales,
    'revenue', revenue,
    'spend', spend,
    'cpl', cpl,
    'cac', cac,
    'roas', roas
  ) ORDER BY revenue DESC NULLS LAST), '[]'::jsonb) INTO v_sources
  FROM public.perf_origin_performance(_days);

  -- ============ SECTION 5: COMMUNITY IMPACT ============
  SELECT to_jsonb(c.*) INTO v_community
  FROM public.community_v2_conversion_funnel(_days) c;

  SELECT COALESCE(SUM(fe.revenue),0) AS revenue_from_community
  INTO STRICT v_community
  FROM public.funnel_events_v2 fe
  WHERE fe.event_type='deal_won'
    AND fe.timestamp >= v_window_start
    AND EXISTS (
      SELECT 1 FROM public.community_events ce
      WHERE ce.user_id IS NOT NULL
        AND ce.event_type IN ('upgrade_clicked','path_completed','community_entry')
        AND ce.created_at < fe.timestamp
        AND lower((SELECT email FROM public.profiles p WHERE p.id = ce.user_id)) = lower(fe.origin_email)
    );

  -- Re-fetch community KPIs and merge
  SELECT to_jsonb(c.*) || jsonb_build_object('revenue_from_community', v_community)
  INTO v_community
  FROM public.community_v2_conversion_funnel(_days) c;

  -- ============ SECTION 6: TEAM PERFORMANCE ============
  WITH setter_stats AS (
    SELECT
      a.setter_id AS user_id,
      COUNT(*) FILTER (WHERE a.created_at >= v_window_start) AS bookings,
      COUNT(*) FILTER (WHERE a.created_at >= v_window_start AND a.attendance_flag = true) AS shows
    FROM public.appointments a
    WHERE a.setter_id IS NOT NULL AND a.created_at >= v_window_start
    GROUP BY a.setter_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', s.user_id,
    'name', COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''),
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
      COALESCE(SUM(c.revenue) FILTER (WHERE c.created_at >= v_window_start AND c.result='won'),0) AS revenue
    FROM public.calls c
    WHERE c.is_simulation = false
    GROUP BY c.user_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', cs.user_id,
    'name', COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''),
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

  -- ============ FORECAST ============
  SELECT COUNT(*) INTO v_open_appointments
  FROM public.appointments
  WHERE starts_at >= v_now AND appointment_status NOT IN ('cancelled','no_show');

  SELECT
    CASE WHEN COUNT(*) FILTER (WHERE result IN ('won','lost')) > 0
      THEN round(COUNT(*) FILTER (WHERE result='won')::numeric / COUNT(*) FILTER (WHERE result IN ('won','lost')) * 100, 1)
      ELSE 0 END,
    COALESCE(AVG(revenue) FILTER (WHERE result='won'),0)
  INTO v_close_rate, v_avg_deal
  FROM public.calls
  WHERE created_at >= v_window_start AND is_simulation = false;

  SELECT
    CASE WHEN COUNT(*) > 0
      THEN round(COUNT(*) FILTER (WHERE attendance_flag=true)::numeric / COUNT(*) * 100, 1)
      ELSE 0 END
  INTO v_show_rate
  FROM public.appointments WHERE created_at >= v_window_start;

  -- forecast = open_appointments * show_rate * close_rate * avg_deal_value, prorated
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

  -- ============ FINAL ASSEMBLY ============
  RETURN jsonb_build_object(
    'days', _days,
    'generated_at', v_now,
    'revenue', jsonb_build_object(
      'today', v_rev_today,
      'last_7d', v_rev_7d,
      'last_30d', v_rev_30d,
      'previous_30d', v_rev_prev_30d,
      'mom_growth_pct', v_mom_growth
    ),
    'funnel', v_funnel,
    'bottleneck', v_bottleneck,
    'sources', v_sources,
    'community', v_community,
    'team', v_team,
    'forecast', v_forecast,
    'alerts', v_alerts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ceo_dashboard_snapshot(integer) TO authenticated;