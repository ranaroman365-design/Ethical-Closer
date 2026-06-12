CREATE OR REPLACE FUNCTION public.build_operator_scorecards(p_period_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  FOR r IN
    SELECT
      p.id AS user_id,
      p.email,
      COUNT(DISTINCT l.id) FILTER (WHERE l.created_at BETWEEN v_start AND v_end) AS leads_assigned,
      COUNT(DISTINCT l.id) FILTER (WHERE l.contact_count > 0 AND l.created_at BETWEEN v_start AND v_end) AS contacted,
      COUNT(DISTINCT l.id) FILTER (WHERE l.qualification_checklist IS NOT NULL AND l.created_at BETWEEN v_start AND v_end) AS qualified,
      COUNT(DISTINCT a.id) FILTER (WHERE a.created_at BETWEEN v_start AND v_end) AS booked,
      COUNT(DISTINCT a.id) FILTER (WHERE (a.attendance_flag=true OR a.call_started_at IS NOT NULL) AND a.created_at BETWEEN v_start AND v_end) AS showed
    FROM profiles p
    LEFT JOIN leads l ON l.setter_id = p.id
    LEFT JOIN appointments a ON a.setter_id = p.id
    WHERE p.email IS NOT NULL
    GROUP BY p.id, p.email
    HAVING COUNT(DISTINCT l.id) FILTER (WHERE l.created_at BETWEEN v_start AND v_end) > 0
        OR COUNT(DISTINCT a.id) FILTER (WHERE a.created_at BETWEEN v_start AND v_end) > 0
  LOOP
    DECLARE
      v_book_rate numeric := CASE WHEN r.contacted>0 THEN ROUND(r.booked::numeric*100/r.contacted,1) ELSE 0 END;
      v_show_rate numeric := CASE WHEN r.booked>0 THEN ROUND(r.showed::numeric*100/r.booked,1) ELSE 0 END;
      v_qual_rate numeric := CASE WHEN r.contacted>0 THEN ROUND(r.qualified::numeric*100/r.contacted,1) ELSE 0 END;
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
      VALUES (r.email,'setter', v_start, v_end, v_metrics, v_setter_benchmark, v_bottleneck, v_summary, v_actions);
      v_count := v_count + 1;
    END;
  END LOOP;

  FOR r IN
    SELECT
      p.id AS user_id,
      p.email,
      COUNT(DISTINCT c.id) FILTER (WHERE c.created_at BETWEEN v_start AND v_end) AS calls_total,
      COUNT(DISTINCT c.id) FILTER (WHERE c.showed_at IS NOT NULL AND c.created_at BETWEEN v_start AND v_end) AS showed,
      COUNT(DISTINCT co.id) FILTER (WHERE co.outcome IN ('won','closed_won','sold') AND co.created_at BETWEEN v_start AND v_end) AS won,
      COUNT(DISTINCT co.id) FILTER (WHERE co.created_at BETWEEN v_start AND v_end) AS outcomes,
      COALESCE(SUM(co.deal_value) FILTER (WHERE co.outcome IN ('won','closed_won','sold') AND co.created_at BETWEEN v_start AND v_end),0) AS revenue
    FROM profiles p
    LEFT JOIN calls c ON c.user_id = p.id
    LEFT JOIN call_outcomes co ON co.user_id = p.id
    WHERE p.email IS NOT NULL
    GROUP BY p.id, p.email
    HAVING COUNT(DISTINCT c.id) FILTER (WHERE c.created_at BETWEEN v_start AND v_end) > 0
  LOOP
    DECLARE
      v_close_rate numeric := CASE WHEN r.outcomes>0 THEN ROUND(r.won::numeric*100/r.outcomes,1) ELSE 0 END;
      v_show_rate numeric := CASE WHEN r.calls_total>0 THEN ROUND(r.showed::numeric*100/r.calls_total,1) ELSE 0 END;
      v_rev_per_call numeric := CASE WHEN r.calls_total>0 THEN ROUND(r.revenue/r.calls_total,2) ELSE 0 END;
    BEGIN
      v_metrics := jsonb_build_object(
        'calls_total', r.calls_total,
        'showed', r.showed,
        'won', r.won,
        'outcomes_logged', r.outcomes,
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
      VALUES (r.email,'closer', v_start, v_end, v_metrics, v_closer_benchmark, v_bottleneck, v_summary, v_actions);
      v_count := v_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('scorecards_built', v_count, 'period_start', v_start, 'period_end', v_end);
END;
$$;