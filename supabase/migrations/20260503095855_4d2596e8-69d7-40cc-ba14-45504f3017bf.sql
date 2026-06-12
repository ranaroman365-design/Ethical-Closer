
CREATE OR REPLACE FUNCTION public.get_team_performance_kpis(
  p_user_id uuid,
  p_days int DEFAULT 30,
  p_member_id uuid DEFAULT NULL,
  p_role_filter text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_level int;
  v_team_ids uuid[];
  v_cutoff timestamptz;
  v_result jsonb;
  v_total_leads int;
  v_booked int;
  v_shows int;
  v_no_shows int;
  v_closed int;
  v_revenue numeric;
  v_ttfc_avg numeric;
  v_response_count int;
  v_contacted_count int;
BEGIN
  SELECT current_phase INTO v_level FROM profiles WHERE id = p_user_id;
  IF v_level IS NULL OR v_level < 1 THEN
    RETURN jsonb_build_object('error', 'forbidden', 'level', COALESCE(v_level, 0));
  END IF;

  v_cutoff := now() - (p_days || ' days')::interval;

  -- Resolve team
  IF p_member_id IS NOT NULL THEN
    v_team_ids := ARRAY[p_member_id];
  ELSIF v_level >= 4 THEN
    SELECT array_agg(m.member_id) INTO v_team_ids
    FROM get_team_member_ids(p_user_id) m;
    v_team_ids := array_append(COALESCE(v_team_ids, ARRAY[]::uuid[]), p_user_id);
  ELSE
    v_team_ids := ARRAY[p_user_id];
  END IF;

  -- Apply role filter: filter team_ids by level range
  IF p_role_filter IS NOT NULL AND p_role_filter <> 'all' AND p_role_filter <> '' THEN
    v_team_ids := ARRAY(
      SELECT p.id FROM profiles p
      WHERE p.id = ANY(v_team_ids)
        AND CASE p_role_filter
          WHEN 'setter' THEN p.current_phase BETWEEN 1 AND 3
          WHEN 'closer' THEN p.current_phase BETWEEN 4 AND 5
          WHEN 'senior_closer' THEN p.current_phase = 6
          WHEN 'director' THEN p.current_phase >= 7
          ELSE true
        END
    );
    -- If filter removes everyone, return zeros
    IF v_team_ids IS NULL OR array_length(v_team_ids, 1) IS NULL THEN
      RETURN jsonb_build_object(
        'total_leads', 0, 'booked_calls', 0, 'booking_rate', 0,
        'shows', 0, 'show_rate', 0, 'no_shows', 0, 'no_show_rate', 0,
        'closed_deals', 0, 'close_rate', 0, 'revenue', 0,
        'revenue_per_lead', 0, 'revenue_per_show', 0,
        'ttfc_minutes', 0, 'response_rate', 0,
        'team_size', 0, 'user_level', v_level, 'period_days', p_days
      );
    END IF;
  END IF;

  -- Leads
  SELECT count(*) INTO v_total_leads
  FROM leads l
  WHERE (l.owner_id = ANY(v_team_ids) OR l.setter_id = ANY(v_team_ids) OR l.closer_id = ANY(v_team_ids))
    AND l.created_at >= v_cutoff
    AND COALESCE(l.is_simulation, false) = false;

  -- Appointments
  SELECT
    count(*),
    count(*) FILTER (WHERE a.attendance_flag = true OR a.call_status = 'completed' OR a.appointment_status = 'showed'),
    count(*) FILTER (WHERE a.attendance_flag = false OR a.appointment_status = 'no_show'),
    count(*) FILTER (WHERE a.outcome = 'closed_won')
  INTO v_booked, v_shows, v_no_shows, v_closed
  FROM appointments a
  WHERE (a.setter_id = ANY(v_team_ids) OR a.closer_id = ANY(v_team_ids) OR a.assigned_operator_id = ANY(v_team_ids) OR a.current_owner_id = ANY(v_team_ids))
    AND a.starts_at >= v_cutoff;

  -- Revenue
  SELECT COALESCE(sum(rtv.revenue_amount), 0) INTO v_revenue
  FROM revenue_truth_view rtv
  WHERE (rtv.closer_id = ANY(v_team_ids) OR rtv.assigned_operator_id = ANY(v_team_ids))
    AND rtv.revenue_at >= v_cutoff;

  -- TTFC
  SELECT avg(EXTRACT(EPOCH FROM (l.first_action_at - l.created_at)) / 60.0)
  INTO v_ttfc_avg
  FROM leads l
  WHERE l.owner_id = ANY(v_team_ids)
    AND l.first_action_at IS NOT NULL
    AND l.created_at >= v_cutoff;

  -- Response rate
  SELECT count(*) FILTER (WHERE l.contact_count > 0), count(*)
  INTO v_response_count, v_contacted_count
  FROM leads l
  WHERE l.owner_id = ANY(v_team_ids)
    AND l.created_at >= v_cutoff;

  v_result := jsonb_build_object(
    'total_leads', v_total_leads,
    'booked_calls', v_booked,
    'booking_rate', CASE WHEN v_total_leads > 0 THEN round((v_booked::numeric / v_total_leads) * 100, 1) ELSE 0 END,
    'shows', v_shows,
    'show_rate', CASE WHEN v_booked > 0 THEN round((v_shows::numeric / v_booked) * 100, 1) ELSE 0 END,
    'no_shows', v_no_shows,
    'no_show_rate', CASE WHEN v_booked > 0 THEN round((v_no_shows::numeric / v_booked) * 100, 1) ELSE 0 END,
    'closed_deals', v_closed,
    'close_rate', CASE WHEN v_shows > 0 THEN round((v_closed::numeric / v_shows) * 100, 1) ELSE 0 END,
    'revenue', v_revenue,
    'revenue_per_lead', CASE WHEN v_total_leads > 0 THEN round(v_revenue / v_total_leads, 2) ELSE 0 END,
    'revenue_per_show', CASE WHEN v_shows > 0 THEN round(v_revenue / v_shows, 2) ELSE 0 END,
    'ttfc_minutes', round(COALESCE(v_ttfc_avg, 0), 1),
    'response_rate', CASE WHEN v_contacted_count > 0 THEN round((v_response_count::numeric / v_contacted_count) * 100, 1) ELSE 0 END,
    'team_size', COALESCE(array_length(v_team_ids, 1), 0),
    'user_level', v_level,
    'period_days', p_days
  );

  RETURN v_result;
END;
$$;
