
-- ═══════════════════════════════════════════════════════════════
-- build_operator_scorecards — closer revenue from revenue_truth_view
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.build_operator_scorecards(p_period_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := now() - (p_period_days || ' days')::interval;
  v_end timestamptz := now();
  v_count int := 0;
  v_setter_benchmark jsonb := '{"booking_rate":25,"show_rate":60,"qualification_rate":50}'::jsonb;
  v_closer_benchmark jsonb := '{"close_rate":25,"show_rate":70,"revenue_per_call":800}'::jsonb;
  r record;
  v_metrics jsonb;
  v_bottleneck text;
  v_actions jsonb;
  v_summary text;
BEGIN
  -- ══════════════════════════════════════════════════════════════
  -- SETTER SCORECARDS — canonical source: appointments + leads
  -- ══════════════════════════════════════════════════════════════
  FOR r IN
    SELECT
      p.id AS user_id,
      p.email,
      COUNT(DISTINCT l.id) FILTER (WHERE l.created_at BETWEEN v_start AND v_end) AS leads_assigned,
      COUNT(DISTINCT l.id) FILTER (WHERE l.contact_count > 0 AND l.created_at BETWEEN v_start AND v_end) AS contacted,
      COUNT(DISTINCT l.id) FILTER (WHERE l.qualification_checklist IS NOT NULL AND l.created_at BETWEEN v_start AND v_end) AS qualified,
      COUNT(DISTINCT a.id) FILTER (WHERE a.created_at BETWEEN v_start AND v_end) AS booked,
      COUNT(DISTINCT a.id) FILTER (WHERE (a.attendance_flag = true OR a.call_started_at IS NOT NULL) AND a.created_at BETWEEN v_start AND v_end) AS showed
    FROM profiles p
    LEFT JOIN leads l ON l.setter_id = p.id
    LEFT JOIN appointments a ON a.setter_id = p.id
    WHERE p.email IS NOT NULL
    GROUP BY p.id, p.email
    HAVING COUNT(DISTINCT l.id) FILTER (WHERE l.created_at BETWEEN v_start AND v_end) > 0
        OR COUNT(DISTINCT a.id) FILTER (WHERE a.created_at BETWEEN v_start AND v_end) > 0
  LOOP
    DECLARE
      v_book_rate numeric := CASE WHEN r.contacted > 0 THEN ROUND(r.booked::numeric * 100 / r.contacted, 1) ELSE 0 END;
      v_show_rate numeric := CASE WHEN r.booked > 0 THEN ROUND(r.showed::numeric * 100 / r.booked, 1) ELSE 0 END;
      v_qual_rate numeric := CASE WHEN r.contacted > 0 THEN ROUND(r.qualified::numeric * 100 / r.contacted, 1) ELSE 0 END;
    BEGIN
      v_metrics := jsonb_build_object(
        'leads_assigned', r.leads_assigned,
        'contacted', r.contacted,
        'qualified', r.qualified,
        'booked', r.booked,
        'showed', r.showed,
        'booking_rate', v_book_rate,
        'show_rate', v_show_rate,
        'qualification_rate', v_qual_rate
      );

      IF v_book_rate < 25 THEN v_bottleneck := 'booking_rate';
      ELSIF v_show_rate < 60 THEN v_bottleneck := 'show_rate';
      ELSIF v_qual_rate < 50 THEN v_bottleneck := 'qualification_rate';
      ELSE v_bottleneck := 'none'; END IF;

      v_actions := CASE v_bottleneck
        WHEN 'booking_rate' THEN '["Tighten qualification questions","Use harder commitment frames before pitch","Reduce friction in calendar step"]'::jsonb
        WHEN 'show_rate' THEN '["Add 24h + 2h reminder sequence","Send personal voice note before call","Confirm intent at booking"]'::jsonb
        WHEN 'qualification_rate' THEN '["Apply EEG framework strictly","Use 3-question filter on opener","Disqualify faster"]'::jsonb
        ELSE '["Maintain current standard","Mentor lower-performing setters"]'::jsonb
      END;

      v_summary := 'Setter ' || r.email || ': ' || r.leads_assigned || ' leads, '
        || r.booked || ' booked (' || v_book_rate || '%), '
        || r.showed || ' showed (' || v_show_rate || '%). Bottleneck: ' || v_bottleneck || '.';

      INSERT INTO operator_scorecards (operator_email, operator_role, period_start, period_end, metrics, benchmark_metrics, primary_bottleneck, coach_summary, recommended_actions)
      VALUES (r.email, 'setter', v_start, v_end, v_metrics, v_setter_benchmark, v_bottleneck, v_summary, v_actions);
      v_count := v_count + 1;
    END;
  END LOOP;

  -- ══════════════════════════════════════════════════════════════
  -- CLOSER SCORECARDS — revenue from revenue_truth_view
  -- ══════════════════════════════════════════════════════════════
  FOR r IN
    SELECT
      c.user_id,
      p.email,
      COUNT(*) FILTER (WHERE c.created_at >= v_start AND c.is_simulation = false) AS calls_total,
      COUNT(*) FILTER (WHERE c.showed_at IS NOT NULL AND c.created_at >= v_start AND c.is_simulation = false) AS showed,
      COUNT(*) FILTER (WHERE c.result = 'won' AND c.created_at >= v_start AND c.is_simulation = false) AS won,
      COUNT(*) FILTER (WHERE c.result IN ('won','lost') AND c.created_at >= v_start AND c.is_simulation = false) AS decided,
      COALESCE((
        SELECT SUM(rtv.revenue_amount)
        FROM revenue_truth_view rtv
        WHERE rtv.closer_id = c.user_id
          AND rtv.revenue_at >= v_start
          AND rtv.revenue_at < v_end
      ), 0) AS revenue
    FROM calls c
    JOIN profiles p ON p.id = c.user_id
    WHERE c.is_simulation = false
      AND c.created_at >= v_start
      AND p.email IS NOT NULL
    GROUP BY c.user_id, p.email
    HAVING COUNT(*) FILTER (WHERE c.created_at >= v_start AND c.is_simulation = false) > 0
  LOOP
    DECLARE
      v_close_rate numeric := CASE WHEN r.decided > 0 THEN ROUND(r.won::numeric * 100 / r.decided, 1) ELSE 0 END;
      v_show_rate numeric := CASE WHEN r.calls_total > 0 THEN ROUND(r.showed::numeric * 100 / r.calls_total, 1) ELSE 0 END;
      v_rev_per_call numeric := CASE WHEN r.calls_total > 0 THEN ROUND(r.revenue / r.calls_total, 2) ELSE 0 END;
    BEGIN
      v_metrics := jsonb_build_object(
        'calls_total', r.calls_total,
        'showed', r.showed,
        'won', r.won,
        'decided', r.decided,
        'revenue', r.revenue,
        'close_rate', v_close_rate,
        'show_rate', v_show_rate,
        'revenue_per_call', v_rev_per_call
      );

      IF v_close_rate < 25 THEN v_bottleneck := 'close_rate';
      ELSIF v_show_rate < 70 THEN v_bottleneck := 'show_rate';
      ELSIF v_rev_per_call < 800 THEN v_bottleneck := 'revenue_per_call';
      ELSE v_bottleneck := 'none'; END IF;

      v_actions := CASE v_bottleneck
        WHEN 'close_rate' THEN '["Drill objection handling daily","Review last 5 lost calls with mentor","Tighten ascension between offers"]'::jsonb
        WHEN 'show_rate' THEN '["Coordinate with setter on confirmation","Reduce time-to-call slot","Improve booking confirmation copy"]'::jsonb
        WHEN 'revenue_per_call' THEN '["Push higher tier first","Practice premium framing","Stop discounting"]'::jsonb
        ELSE '["Mentor closers with weaker close rate","Document winning frames"]'::jsonb
      END;

      v_summary := 'Closer ' || r.email || ': ' || r.calls_total || ' calls, '
        || r.won || ' won (' || v_close_rate || '% close), '
        || r.revenue || ' revenue (' || v_rev_per_call || ' EUR/call). Bottleneck: ' || v_bottleneck || '.';

      INSERT INTO operator_scorecards (operator_email, operator_role, period_start, period_end, metrics, benchmark_metrics, primary_bottleneck, coach_summary, recommended_actions)
      VALUES (r.email, 'closer', v_start, v_end, v_metrics, v_closer_benchmark, v_bottleneck, v_summary, v_actions);
      v_count := v_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('scorecards_built', v_count, 'period_start', v_start, 'period_end', v_end);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- ceo_dashboard_snapshot — all revenue from revenue_truth_view
-- ═══════════════════════════════════════════════════════════════
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
  -- Admin guard
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','owner')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  -- ============ SECTION 1: REVENUE SNAPSHOT (from revenue_truth_view) ============
  SELECT COALESCE(SUM(revenue_amount),0) INTO v_rev_today
  FROM public.revenue_truth_view
  WHERE revenue_at >= date_trunc('day', v_now);

  SELECT COALESCE(SUM(revenue_amount),0) INTO v_rev_7d
  FROM public.revenue_truth_view
  WHERE revenue_at >= v_now - interval '7 days';

  SELECT COALESCE(SUM(revenue_amount),0) INTO v_rev_30d
  FROM public.revenue_truth_view
  WHERE revenue_at >= v_window_start;

  SELECT COALESCE(SUM(revenue_amount),0) INTO v_rev_prev_30d
  FROM public.revenue_truth_view
  WHERE revenue_at >= v_prev_start AND revenue_at < v_prev_end;

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
    'name', COALESCE(p.full_name, p.email),
    'email', p.email,
    'bookings', s.bookings,
    'shows', s.shows,
    'show_rate', CASE WHEN s.bookings > 0 THEN round((s.shows::numeric / s.bookings) * 100, 1) ELSE 0 END
  ) ORDER BY s.bookings DESC), '[]'::jsonb)
  INTO v_setters
  FROM setter_stats s
  LEFT JOIN public.profiles p ON p.id = s.user_id;

  -- Closer stats: revenue from revenue_truth_view
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

  -- ============ FORECAST (avg deal from revenue_truth_view) ============
  SELECT COUNT(*) INTO v_open_appointments
  FROM public.appointments
  WHERE starts_at >= v_now AND appointment_status NOT IN ('cancelled','no_show');

  SELECT
    CASE WHEN COUNT(*) FILTER (WHERE result IN ('won','lost')) > 0
      THEN round(COUNT(*) FILTER (WHERE result='won')::numeric / COUNT(*) FILTER (WHERE result IN ('won','lost')) * 100, 1)
      ELSE 0 END
  INTO v_close_rate
  FROM public.calls
  WHERE created_at >= v_window_start AND is_simulation = false;

  SELECT COALESCE(AVG(revenue_amount), 0) INTO v_avg_deal
  FROM public.revenue_truth_view
  WHERE revenue_at >= v_window_start;

  SELECT
    CASE WHEN COUNT(*) > 0
      THEN round(COUNT(*) FILTER (WHERE attendance_flag=true)::numeric / COUNT(*) * 100, 1)
      ELSE 0 END
  INTO v_show_rate
  FROM public.appointments WHERE created_at >= v_window_start;

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
$function$;
