
-- Function to resolve team member IDs based on hierarchy
CREATE OR REPLACE FUNCTION public.get_team_member_ids(p_user_id uuid)
RETURNS TABLE(member_id uuid, member_name text, member_level int, member_role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level int;
  v_director_id uuid;
BEGIN
  SELECT p.current_phase, p.director_id
  INTO v_level, v_director_id
  FROM profiles p WHERE p.id = p_user_id;

  IF v_level IS NULL THEN RETURN; END IF;

  -- L8/Admin: everyone
  IF v_level >= 8 THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.current_phase,
        CASE p.current_phase
          WHEN 1 THEN 'Trainee' WHEN 2 THEN 'Setter' WHEN 3 THEN 'Setter'
          WHEN 4 THEN 'Junior Closer' WHEN 5 THEN 'Managing Closer'
          WHEN 6 THEN 'Senior Closer' WHEN 7 THEN 'Director' WHEN 8 THEN 'Partner/Admin'
          ELSE 'Unknown'
        END
      FROM profiles p WHERE p.id <> p_user_id;
    RETURN;
  END IF;

  -- L7 Director: all L6 teams under them (profiles where director_id = this user, plus their sub-teams)
  IF v_level >= 7 THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.current_phase,
        CASE p.current_phase
          WHEN 1 THEN 'Trainee' WHEN 2 THEN 'Setter' WHEN 3 THEN 'Setter'
          WHEN 4 THEN 'Junior Closer' WHEN 5 THEN 'Managing Closer'
          WHEN 6 THEN 'Senior Closer' WHEN 7 THEN 'Director' WHEN 8 THEN 'Partner/Admin'
          ELSE 'Unknown'
        END
      FROM profiles p
      WHERE p.director_id = p_user_id
         OR p.director_id IN (SELECT pp.id FROM profiles pp WHERE pp.director_id = p_user_id AND pp.current_phase >= 6)
      ORDER BY p.current_phase DESC, p.full_name;
    RETURN;
  END IF;

  -- L4-L6: same director, lower level
  IF v_level >= 4 THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.current_phase,
        CASE p.current_phase
          WHEN 1 THEN 'Trainee' WHEN 2 THEN 'Setter' WHEN 3 THEN 'Setter'
          WHEN 4 THEN 'Junior Closer' WHEN 5 THEN 'Managing Closer'
          WHEN 6 THEN 'Senior Closer' WHEN 7 THEN 'Director' WHEN 8 THEN 'Partner/Admin'
          ELSE 'Unknown'
        END
      FROM profiles p
      WHERE p.director_id = v_director_id
        AND p.current_phase < v_level
        AND p.id <> p_user_id
      ORDER BY p.current_phase DESC, p.full_name;
    RETURN;
  END IF;
END;
$$;

-- Function to get team performance KPIs
CREATE OR REPLACE FUNCTION public.get_team_performance_kpis(
  p_user_id uuid,
  p_days int DEFAULT 30,
  p_member_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
  IF v_level IS NULL OR v_level < 4 THEN
    RETURN jsonb_build_object('error', 'forbidden', 'level', COALESCE(v_level, 0));
  END IF;

  v_cutoff := now() - (p_days || ' days')::interval;

  -- Resolve team
  IF p_member_id IS NOT NULL THEN
    v_team_ids := ARRAY[p_member_id];
  ELSE
    SELECT array_agg(m.member_id) INTO v_team_ids
    FROM get_team_member_ids(p_user_id) m;
    -- Include self
    v_team_ids := array_append(COALESCE(v_team_ids, ARRAY[]::uuid[]), p_user_id);
  END IF;

  -- Leads
  SELECT count(*) INTO v_total_leads
  FROM leads l
  WHERE (l.owner_id = ANY(v_team_ids) OR l.setter_id = ANY(v_team_ids) OR l.closer_id = ANY(v_team_ids))
    AND l.created_at >= v_cutoff;

  -- Appointments
  SELECT
    count(*) FILTER (WHERE true),
    count(*) FILTER (WHERE a.appointment_status = 'showed' OR a.call_status = 'completed'),
    count(*) FILTER (WHERE a.appointment_status = 'no_show' OR a.attendance_flag = 'no_show'),
    count(*) FILTER (WHERE a.outcome = 'closed_won')
  INTO v_booked, v_shows, v_no_shows, v_closed
  FROM appointments a
  WHERE (a.setter_id = ANY(v_team_ids) OR a.closer_id = ANY(v_team_ids) OR a.assigned_operator_id = ANY(v_team_ids) OR a.current_owner_id = ANY(v_team_ids))
    AND a.starts_at >= v_cutoff;

  -- Revenue from calls
  SELECT COALESCE(sum(c.revenue), 0) INTO v_revenue
  FROM calls c
  WHERE c.user_id = ANY(v_team_ids)
    AND c.result = 'close'
    AND c.created_at >= v_cutoff;

  -- TTFC (Time to First Contact)
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
    'team_size', array_length(v_team_ids, 1),
    'user_level', v_level,
    'period_days', p_days
  );

  RETURN v_result;
END;
$$;
