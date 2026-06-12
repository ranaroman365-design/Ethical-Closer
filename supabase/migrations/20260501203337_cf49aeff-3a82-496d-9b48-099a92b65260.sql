
-- 1. Columns (may already exist from failed partial run)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid REFERENCES public.appointments(id),
  ADD COLUMN IF NOT EXISTS rescheduled_to_id uuid REFERENCES public.appointments(id),
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_by uuid;

CREATE INDEX IF NOT EXISTS idx_appointments_rescheduled_from ON public.appointments(rescheduled_from_id);
CREATE INDEX IF NOT EXISTS idx_appointments_rescheduled_to ON public.appointments(rescheduled_to_id);

-- 2. reschedule_appointment RPC
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_start timestamptz,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old appointments%ROWTYPE;
  v_new_end timestamptz;
  v_new_id uuid;
  v_conflict int;
  v_dur interval;
BEGIN
  SELECT * INTO v_old FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_found');
  END IF;

  IF v_old.appointment_status IN ('rescheduled','cancelled','expired','superseded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_already_' || v_old.appointment_status);
  END IF;

  IF p_new_start <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'new_time_in_past');
  END IF;

  v_dur := v_old.ends_at - v_old.starts_at;
  v_new_end := p_new_start + v_dur;

  -- Double-booking check (same lead)
  SELECT COUNT(*) INTO v_conflict FROM appointments
  WHERE lead_id = v_old.lead_id AND id <> p_appointment_id
    AND appointment_status NOT IN ('rescheduled','cancelled','expired','superseded','no_show')
    AND starts_at < v_new_end AND ends_at > p_new_start;
  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'double_booking');
  END IF;

  -- Operator conflict check (closer)
  IF v_old.closer_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict FROM appointments
    WHERE closer_id = v_old.closer_id AND id <> p_appointment_id
      AND appointment_status NOT IN ('rescheduled','cancelled','expired','superseded','no_show')
      AND starts_at < v_new_end AND ends_at > p_new_start;
    IF v_conflict > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'operator_conflict');
    END IF;
  END IF;

  -- Operator conflict check (setter)
  IF v_old.setter_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict FROM appointments
    WHERE setter_id = v_old.setter_id AND id <> p_appointment_id
      AND appointment_status NOT IN ('rescheduled','cancelled','expired','superseded','no_show')
      AND starts_at < v_new_end AND ends_at > p_new_start;
    IF v_conflict > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'operator_conflict');
    END IF;
  END IF;

  -- Create new appointment
  INSERT INTO appointments (
    lead_id, call_type, appointment_status, starts_at, ends_at,
    setter_id, payment_status, booking_source, call_status,
    closer_id, current_owner_id, current_owner_role,
    original_owner_id, original_owner_role,
    assigned_operator_id, booking_timezone, booking_utc_offset,
    rescheduled_from_id, reminders_state,
    origin_source, attribution_snapshot, traffic_owner
  ) VALUES (
    v_old.lead_id, v_old.call_type, 'booked', p_new_start, v_new_end,
    v_old.setter_id, v_old.payment_status, 'reschedule', 'pending',
    v_old.closer_id, v_old.current_owner_id, v_old.current_owner_role,
    v_old.original_owner_id, v_old.original_owner_role,
    v_old.assigned_operator_id,
    COALESCE(v_old.booking_timezone, 'Europe/Berlin'),
    COALESCE(v_old.booking_utc_offset, '+02:00'),
    p_appointment_id, '{}'::jsonb,
    v_old.origin_source, v_old.attribution_snapshot, v_old.traffic_owner
  ) RETURNING id INTO v_new_id;

  -- Update old appointment
  UPDATE appointments SET
    appointment_status = 'rescheduled',
    rescheduled_to_id = v_new_id,
    rescheduled_at = now(),
    rescheduled_by = p_user_id,
    updated_at = now()
  WHERE id = p_appointment_id;

  -- Audit
  INSERT INTO audit_logs (action, source_type, note)
  VALUES ('appointment_rescheduled', 'appointment',
    format('Appointment %s → %s by %s. Lead: %s. %s → %s',
      p_appointment_id, v_new_id, p_user_id, v_old.lead_id,
      v_old.starts_at::text, p_new_start::text));

  RETURN jsonb_build_object(
    'success', true,
    'new_appointment_id', v_new_id,
    'old_appointment_id', p_appointment_id,
    'new_starts_at', p_new_start,
    'new_ends_at', v_new_end
  );
END;
$$;

-- 3. Update compute_talent_scores — add 'rescheduled' exclusion
CREATE OR REPLACE FUNCTION public.compute_talent_scores(
  p_range_days int DEFAULT 30, p_user_id uuid DEFAULT NULL,
  p_funnel text DEFAULT NULL, p_operator_id uuid DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid, full_name text, business_stage text, level_num int, operator_role text,
  tenure_days int, total_leads int, total_bookings int, total_shows int, total_closes int,
  total_revenue numeric, booking_rate numeric, show_rate numeric, close_rate numeric,
  revenue_per_lead numeric, consistency_score numeric, activity_score numeric,
  hygiene_score numeric, talent_score numeric, talent_category text,
  primary_bottleneck text, bottleneck_confidence numeric, trend_7d numeric,
  sparkline_data numeric[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cutoff timestamptz; v_cutoff_14d timestamptz; v_team_ids uuid[];
BEGIN
  v_cutoff := now() - (p_range_days || ' days')::interval;
  v_cutoff_14d := now() - interval '14 days';
  IF p_user_id IS NOT NULL THEN
    SELECT ARRAY_AGG(sub.id) INTO v_team_ids FROM (
      SELECT p_user_id AS id UNION SELECT gtm.id FROM get_team_member_ids(p_user_id) gtm
    ) sub;
  END IF;

  RETURN QUERY
  WITH level_map(stage_key, lvl, op_role) AS (VALUES
    ('prospect',0,'Lead'),('opener',1,'Opener'),('setter',2,'Setter'),
    ('associate_setter',2,'Setter'),('associate',2,'Setter'),
    ('senior_associate',3,'Senior Setter'),('senior_setter',3,'Senior Setter'),
    ('junior_manager',4,'Junior Closer'),('manager',5,'Closer'),('senior_manager',6,'Senior Closer'),
    ('trainee',1,'Opener'),('applicant',0,'Lead'),('director',7,'Director'),('partner',8,'Partner')
  ),
  operators AS (
    SELECT p.id, p.full_name, p.business_stage AS bstage,
      COALESCE(lm.lvl, COALESCE(p.current_phase,0)) AS lvl,
      COALESCE(lm.op_role,'Unknown') AS op_role,
      GREATEST(0, EXTRACT(EPOCH FROM (now()-p.created_at))/86400)::int AS tenure
    FROM profiles p LEFT JOIN level_map lm ON lm.stage_key=p.business_stage
    WHERE p.business_stage NOT IN ('prospect')
      AND p.full_name NOT ILIKE '%test%' AND p.full_name NOT ILIKE '%e2e%' AND p.full_name NOT ILIKE '%qa %'
      AND (v_team_ids IS NULL OR p.id = ANY(v_team_ids))
      AND (p_operator_id IS NULL OR p.id = p_operator_id)
  ),
  filtered_leads AS (
    SELECT rl.* FROM real_leads_view rl WHERE rl.created_at >= v_cutoff
      AND (p_funnel IS NULL OR canonical_funnel_source(rl.source)=p_funnel)
      AND rl.is_simulation IS NOT TRUE
      AND rl.name NOT ILIKE 'test%' AND rl.name NOT ILIKE '%kein lead%' AND rl.name NOT ILIKE '%test test%'
  ),
  lead_counts AS (SELECT COALESCE(fl.owner_id,fl.setter_id,fl.closer_id) AS op_id, COUNT(*) AS cnt FROM filtered_leads fl GROUP BY 1),
  booking_counts AS (
    SELECT COALESCE(a.assigned_operator_id,a.setter_id,a.closer_id) AS op_id, COUNT(*) AS cnt
    FROM appointments a WHERE a.starts_at >= v_cutoff
      AND a.appointment_status NOT IN ('rescheduled','superseded')
      AND (p_funnel IS NULL OR EXISTS (SELECT 1 FROM filtered_leads fl WHERE fl.id=a.lead_id))
    GROUP BY 1
  ),
  show_counts AS (
    SELECT COALESCE(a.assigned_operator_id,a.setter_id,a.closer_id) AS op_id, COUNT(*) AS cnt
    FROM appointments a WHERE a.starts_at >= v_cutoff AND a.starts_at <= now()
      AND a.appointment_status NOT IN ('no_show','cancelled','expired','superseded','rescheduled')
      AND (a.completed_at IS NOT NULL OR a.call_started_at IS NOT NULL)
      AND (p_funnel IS NULL OR EXISTS (SELECT 1 FROM filtered_leads fl WHERE fl.id=a.lead_id))
    GROUP BY 1
  ),
  close_counts AS (
    SELECT COALESCE(fl.closer_id,fl.owner_id) AS op_id, COUNT(*) AS cnt, SUM(COALESCE(fl.deal_value,0)) AS rev
    FROM filtered_leads fl WHERE (fl.outcome='won' OR fl.payment_status='paid') GROUP BY 1
  ),
  weekly AS (
    SELECT COALESCE(fl.closer_id,fl.owner_id) AS op_id, EXTRACT(WEEK FROM fl.created_at) AS wk, COUNT(*) AS cnt
    FROM filtered_leads fl WHERE (fl.outcome='won' OR fl.payment_status='paid') GROUP BY 1,2
  ),
  consistency AS (SELECT op_id, CASE WHEN COUNT(*)<2 THEN 0 ELSE GREATEST(0,100-(STDDEV(cnt)/NULLIF(AVG(cnt),0)*100)) END AS score FROM weekly GROUP BY 1),
  activity AS (SELECT COALESCE(fl.closer_id,fl.owner_id) AS op_id, COUNT(*) FILTER (WHERE fl.created_at >= now()-interval '7 days') AS last7 FROM filtered_leads fl GROUP BY 1),
  hygiene AS (
    SELECT p.id AS op_id, (
      CASE WHEN p.full_name IS NOT NULL AND LENGTH(TRIM(p.full_name))>2 THEN 20 ELSE 0 END
      + CASE WHEN p.email IS NOT NULL AND p.email LIKE '%@%' THEN 20 ELSE 0 END
      + CASE WHEN p.phone IS NOT NULL AND LENGTH(p.phone)>5 THEN 20 ELSE 0 END
      + CASE WHEN p.avatar_url IS NOT NULL THEN 20 ELSE 0 END
      + CASE WHEN p.business_stage IS NOT NULL AND p.business_stage<>'prospect' THEN 20 ELSE 0 END
    )::numeric AS score FROM profiles p
  ),
  sparkline_cte AS (
    SELECT c_agg.op_user AS op_id, ARRAY_AGG(COALESCE(c_agg.day_rev,0) ORDER BY c_agg.d) AS spark FROM (
      SELECT COALESCE(fl.closer_id,fl.owner_id) AS op_user, d::date AS d, SUM(COALESCE(fl.deal_value,0)) AS day_rev
      FROM generate_series(v_cutoff_14d,now(),'1 day') d
      LEFT JOIN filtered_leads fl ON fl.created_at::date=d::date AND (fl.outcome='won' OR fl.payment_status='paid')
      GROUP BY COALESCE(fl.closer_id,fl.owner_id), d::date
    ) c_agg WHERE c_agg.op_user IS NOT NULL GROUP BY c_agg.op_user
  ),
  combined AS (
    SELECT o.id, o.full_name, o.bstage, o.lvl, o.op_role, o.tenure,
      COALESCE(lc.cnt,0)::int AS leads, COALESCE(bc.cnt,0)::int AS bookings,
      COALESCE(sc.cnt,0)::int AS shows, COALESCE(cc.cnt,0)::int AS closes,
      COALESCE(cc.rev,0)::numeric AS rev,
      CASE WHEN COALESCE(lc.cnt,0)>0 THEN ROUND(COALESCE(bc.cnt,0)::numeric/lc.cnt*100,1) ELSE 0 END AS brate,
      CASE WHEN COALESCE(bc.cnt,0)>0 THEN ROUND(COALESCE(sc.cnt,0)::numeric/bc.cnt*100,1) ELSE 0 END AS srate,
      CASE WHEN COALESCE(sc.cnt,0)>0 THEN ROUND(COALESCE(cc.cnt,0)::numeric/sc.cnt*100,1) ELSE 0 END AS crate,
      CASE WHEN COALESCE(lc.cnt,0)>0 THEN ROUND(COALESCE(cc.rev,0)::numeric/lc.cnt,2) ELSE 0 END AS rpl,
      COALESCE(con.score,0)::numeric AS consist, LEAST(100,COALESCE(act.last7,0)*10)::numeric AS activ,
      COALESCE(h.score,0)::numeric AS hyg, COALESCE(sp.spark,ARRAY[]::numeric[]) AS spark
    FROM operators o
    LEFT JOIN lead_counts lc ON lc.op_id=o.id LEFT JOIN booking_counts bc ON bc.op_id=o.id
    LEFT JOIN show_counts sc ON sc.op_id=o.id LEFT JOIN close_counts cc ON cc.op_id=o.id
    LEFT JOIN consistency con ON con.op_id=o.id LEFT JOIN activity act ON act.op_id=o.id
    LEFT JOIN hygiene h ON h.op_id=o.id LEFT JOIN sparkline_cte sp ON sp.op_id=o.id
  ),
  scored AS (SELECT *, ROUND(crate*0.25+srate*0.20+brate*0.15+LEAST(rpl,100)*0.15+consist*0.10+activ*0.10+hyg*0.05,1) AS tscore FROM combined)
  SELECT s.id, s.full_name, s.bstage, s.lvl, s.op_role, s.tenure,
    s.leads, s.bookings, s.shows, s.closes, s.rev,
    s.brate, s.srate, s.crate, s.rpl, s.consist, s.activ, s.hyg, s.tscore,
    CASE WHEN s.tscore>=80 THEN 'a_player' WHEN s.tscore>=60 THEN 'stable' WHEN s.tscore>=40 THEN 'risk' ELSE 'critical' END,
    CASE WHEN s.crate<s.srate AND s.crate<s.brate THEN 'Closing Skill' WHEN s.srate<s.brate THEN 'Expectation Setting'
         WHEN s.brate<20 AND s.leads>0 THEN 'Lead Engagement' WHEN s.activ<30 THEN 'Activity Volume' ELSE 'No Major Issue' END,
    CASE WHEN s.tscore<25 THEN 90 WHEN s.tscore<50 THEN 70 ELSE 40 END::numeric, 0::numeric, s.spark
  FROM scored s ORDER BY s.tscore DESC;
END;
$$;

-- 4. Chain helper (forward-only, simpler)
CREATE OR REPLACE FUNCTION public.get_reschedule_chain(p_appointment_id uuid)
RETURNS TABLE(
  appointment_id uuid, appointment_status text,
  starts_at timestamptz, ends_at timestamptz,
  rescheduled_from_id uuid, rescheduled_to_id uuid,
  rescheduled_at timestamptz, chain_position int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_root_id uuid;
  v_cur_id uuid;
BEGIN
  -- Walk backwards to find root
  v_root_id := p_appointment_id;
  LOOP
    SELECT a.rescheduled_from_id INTO v_cur_id FROM appointments a WHERE a.id = v_root_id;
    EXIT WHEN v_cur_id IS NULL;
    v_root_id := v_cur_id;
  END LOOP;

  -- Walk forwards from root
  RETURN QUERY
  WITH RECURSIVE fwd AS (
    SELECT a.id, a.appointment_status, a.starts_at, a.ends_at,
           a.rescheduled_from_id, a.rescheduled_to_id, a.rescheduled_at, 1 AS pos
    FROM appointments a WHERE a.id = v_root_id
    UNION ALL
    SELECT a.id, a.appointment_status, a.starts_at, a.ends_at,
           a.rescheduled_from_id, a.rescheduled_to_id, a.rescheduled_at, f.pos + 1
    FROM appointments a JOIN fwd f ON a.id = f.rescheduled_to_id
    WHERE f.pos < 20
  )
  SELECT f.id, f.appointment_status, f.starts_at, f.ends_at,
         f.rescheduled_from_id, f.rescheduled_to_id, f.rescheduled_at, f.pos
  FROM fwd f ORDER BY f.pos;
END;
$$;
