
-- Drop materialized view first
DROP MATERIALIZED VIEW IF EXISTS public.operator_team_performance CASCADE;

-- Also drop any refresh function that references it
DROP FUNCTION IF EXISTS public.refresh_team_performance_cache() CASCADE;

-- 1. Create operator_team_performance as regular VIEW
CREATE OR REPLACE VIEW public.operator_team_performance AS
WITH unit_operators AS (
  SELECT ou.id AS unit_id, ou.operator_id
  FROM public.operator_units ou
  WHERE ou.status = 'active'
),
members AS (
  SELECT
    uo.operator_id,
    otm.member_id AS team_member_id,
    otm.member_id AS member_id,
    otm.member_id AS user_id,
    otm.member_id AS traffic_owner,
    p.full_name,
    p.email,
    COALESCE(uls.current_role_label, 'Member') AS role_label,
    COALESCE(uls.current_level, 0) AS level,
    otm.active,
    otm.unit_id
  FROM public.operator_team_members otm
  JOIN unit_operators uo ON uo.unit_id = otm.unit_id
  JOIN public.profiles p ON p.id = otm.member_id
  LEFT JOIN public.user_level_status uls ON uls.user_id = otm.member_id
),
perf AS (
  SELECT
    a.setter_id,
    COUNT(*) FILTER (WHERE a.appointment_status IS NOT NULL) AS booked_count,
    COUNT(*) FILTER (WHERE a.attendance_flag = true) AS showed_count,
    COUNT(*) FILTER (WHERE a.outcome = 'won') AS closed_won_count,
    COALESCE(SUM(CASE WHEN a.outcome = 'won' THEN a.priority_price ELSE 0 END), 0) AS revenue_total,
    MAX(a.updated_at) AS last_activity_at
  FROM public.appointments a
  WHERE a.created_at >= now() - interval '90 days'
  GROUP BY a.setter_id
),
lead_perf AS (
  SELECT
    l.setter_id,
    COUNT(*) FILTER (WHERE l.outcome = 'started') AS started_count
  FROM public.leads l
  WHERE l.created_at >= now() - interval '90 days'
  GROUP BY l.setter_id
)
SELECT
  m.operator_id,
  m.team_member_id,
  m.member_id,
  m.user_id,
  m.traffic_owner,
  m.full_name,
  m.email,
  m.role_label,
  m.level,
  m.active,
  COALESCE(p.booked_count, 0)::bigint AS booked_count,
  COALESCE(p.showed_count, 0)::bigint AS showed_count,
  COALESCE(p.closed_won_count, 0)::bigint AS closed_won_count,
  COALESCE(lp.started_count, 0)::bigint AS started_count,
  COALESCE(p.revenue_total, 0)::numeric AS revenue_total,
  p.last_activity_at,
  COALESCE(p.booked_count, 0)::numeric AS bookings,
  COALESCE(p.showed_count, 0)::numeric AS shows,
  COALESCE(p.closed_won_count, 0)::numeric AS deals,
  CASE WHEN COALESCE(p.showed_count, 0) > 0
    THEN ROUND(COALESCE(p.closed_won_count, 0)::numeric / p.showed_count * 100, 1)
    ELSE 0 END AS close_rate
FROM members m
LEFT JOIN perf p ON p.setter_id = m.member_id
LEFT JOIN lead_perf lp ON lp.setter_id = m.member_id;

-- Stub refresh function (no-op since it's now a regular view)
CREATE OR REPLACE FUNCTION public.refresh_team_performance_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- No-op: operator_team_performance is now a regular view, not a materialized view.
  -- Kept for backward compatibility with callers that invoke this.
  NULL;
END;
$function$;

-- 2. Helper: get ALL unit_ids a user belongs to
CREATE OR REPLACE FUNCTION public.get_user_all_unit_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(otm.unit_id), ARRAY[]::uuid[])
  FROM public.operator_team_members otm
  WHERE otm.member_id = _user_id AND otm.active = true;
$$;

-- 3. Fix is_in_team_subtree to also check operator_team_members
CREATE OR REPLACE FUNCTION public.is_in_team_subtree(_member uuid, _root uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE sub AS (
    SELECT id FROM public.profiles WHERE director_id = _root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN sub s ON p.director_id = s.id
  )
  SELECT EXISTS (SELECT 1 FROM sub WHERE id = _member)
  OR EXISTS (
    SELECT 1 FROM public.operator_team_members otm
    JOIN public.operator_units ou ON ou.id = otm.unit_id
    WHERE otm.member_id = _member AND otm.active = true
      AND (ou.operator_id = _root
        OR otm.unit_id IN (
          SELECT otm2.unit_id FROM public.operator_team_members otm2
          WHERE otm2.member_id = _root AND otm2.active = true AND otm2.team_role = 'operator'
        ))
  )
$$;

-- 4. Fix get_operator_team to use operator_team_members as PRIMARY source
CREATE OR REPLACE FUNCTION public.get_operator_team(_director uuid DEFAULT NULL)
RETURNS TABLE(
  user_id uuid, full_name text, email text, level integer,
  role_label text, member_role text, appts_this_week bigint,
  show_rate numeric, close_rate numeric, bookings_total numeric,
  shows_total numeric, deals_total numeric, is_self boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_root uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT v_is_admin THEN
    IF v_root <> v_caller THEN
      RAISE EXCEPTION 'forbidden: cannot query other director teams';
    END IF;
    IF NOT public.is_operator_l6plus(v_caller) THEN
      RAISE EXCEPTION 'forbidden: requires Level 6+';
    END IF;
  END IF;

  RETURN QUERY
  WITH
  unit_members AS (
    SELECT DISTINCT otm.member_id AS id
    FROM public.operator_team_members otm
    JOIN public.operator_units ou ON ou.id = otm.unit_id AND ou.status = 'active'
    WHERE ou.operator_id = v_root
       OR otm.unit_id IN (
         SELECT otm2.unit_id FROM public.operator_team_members otm2
         WHERE otm2.member_id = v_root AND otm2.active = true AND otm2.team_role = 'operator'
       )
  ),
  dir_sub AS (
    SELECT p.id FROM public.profiles p WHERE p.director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN dir_sub s ON p.director_id = s.id
  ),
  members AS (
    SELECT id FROM unit_members UNION SELECT id FROM dir_sub UNION SELECT v_root
  ),
  week_appts AS (
    SELECT a.setter_id, COUNT(*)::bigint AS cnt
    FROM public.appointments a
    WHERE a.setter_id IN (SELECT id FROM members)
      AND a.starts_at >= date_trunc('week', now())
      AND a.starts_at < date_trunc('week', now()) + interval '7 days'
    GROUP BY a.setter_id
  )
  SELECT
    m.id, p.full_name, p.email,
    COALESCE(uls.current_level, 0),
    COALESCE(uls.current_role_label, p.business_stage),
    p.business_stage,
    COALESCE(wa.cnt, 0)::bigint,
    otp.close_rate, otp.close_rate,
    otp.bookings, otp.shows, otp.deals,
    (m.id = v_caller)
  FROM members m
  JOIN public.profiles p ON p.id = m.id
  LEFT JOIN public.user_level_status uls ON uls.user_id = m.id
  LEFT JOIN public.operator_team_performance otp ON otp.traffic_owner = m.id
  LEFT JOIN week_appts wa ON wa.setter_id = m.id
  ORDER BY
    (m.id = v_caller) DESC,
    otp.close_rate DESC NULLS LAST,
    COALESCE(uls.current_level, 0) DESC,
    COALESCE(p.full_name, p.email) NULLS LAST;
END;
$function$;

-- 5. Fix get_appointment_full_context to be SECURITY DEFINER with team-scope check
CREATE OR REPLACE FUNCTION public.get_appointment_full_context(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_appt appointments%ROWTYPE;
  v_lead leads%ROWTYPE;
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_caller_level int;
  v_has_access boolean := false;
  v_calls_count int := 0;
  v_messages_count int := 0;
  v_appointments_count int := 0;
  v_quiz jsonb := NULL;
  v_last_call jsonb := NULL;
  v_avg_response_minutes numeric := NULL;
  v_has_lead_replied boolean := false;
  v_first_contact_minutes numeric := NULL;
  v_lead_reply_count int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'auth_required', 'message', 'Nicht angemeldet.');
  END IF;

  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found', 'message', 'Termin existiert nicht.');
  END IF;

  v_is_admin := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role) OR has_role(v_caller, 'ops_admin'::app_role);

  IF v_is_admin THEN
    v_has_access := true;
  ELSIF v_appt.setter_id = v_caller OR v_appt.closer_id = v_caller
     OR v_appt.current_owner_id = v_caller OR v_appt.original_owner_id = v_caller THEN
    v_has_access := true;
  ELSE
    SELECT current_level INTO v_caller_level FROM user_level_status WHERE user_id = v_caller;
    IF COALESCE(v_caller_level, 0) >= 6 THEN
      IF (v_appt.setter_id IS NOT NULL AND is_in_team_subtree(v_appt.setter_id, v_caller))
         OR (v_appt.closer_id IS NOT NULL AND is_in_team_subtree(v_appt.closer_id, v_caller))
         OR (v_appt.current_owner_id IS NOT NULL AND is_in_team_subtree(v_appt.current_owner_id, v_caller))
         OR (v_appt.operator_unit_id IS NOT NULL AND v_appt.operator_unit_id = ANY(get_user_all_unit_ids(v_caller)))
      THEN
        v_has_access := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_has_access AND v_appt.lead_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM leads l WHERE l.id = v_appt.lead_id AND lower(l.email) = lower((auth.jwt() ->> 'email'))) THEN
      v_has_access := true;
    END IF;
  END IF;

  IF NOT v_has_access THEN
    RETURN jsonb_build_object(
      'error', 'forbidden',
      'message', 'Keine Berechtigung für diesen Termin.',
      'debug', jsonb_build_object(
        'caller', v_caller, 'caller_level', v_caller_level,
        'setter_id', v_appt.setter_id, 'closer_id', v_appt.closer_id,
        'current_owner_id', v_appt.current_owner_id, 'operator_unit_id', v_appt.operator_unit_id
      )
    );
  END IF;

  IF v_appt.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_appt.lead_id;
  END IF;

  IF v_lead.id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_calls_count FROM calls WHERE user_id = v_lead.id;
    SELECT COUNT(*) INTO v_messages_count FROM wa_messages WHERE lead_id = v_lead.id;
    SELECT COUNT(*) INTO v_appointments_count FROM appointments WHERE lead_id = v_lead.id;
    SELECT to_jsonb(qs.*) INTO v_quiz FROM quiz_submissions qs WHERE qs.lead_id = v_lead.id ORDER BY qs.created_at DESC LIMIT 1;
    SELECT to_jsonb(c.*) INTO v_last_call FROM calls c WHERE c.user_id = v_lead.id ORDER BY c.created_at DESC LIMIT 1;
    SELECT COUNT(*) INTO v_lead_reply_count FROM wa_messages WHERE lead_id = v_lead.id AND direction = 'inbound';
    v_has_lead_replied := v_lead_reply_count > 0;
    SELECT AVG(response_min) INTO v_avg_response_minutes
    FROM (
      SELECT EXTRACT(EPOCH FROM (reply.created_at - outbound.created_at)) / 60.0 AS response_min
      FROM wa_messages outbound
      CROSS JOIN LATERAL (
        SELECT created_at FROM wa_messages inbound
        WHERE inbound.lead_id = v_lead.id AND inbound.direction = 'inbound'
          AND inbound.created_at > outbound.created_at
        ORDER BY inbound.created_at ASC LIMIT 1
      ) reply
      WHERE outbound.lead_id = v_lead.id AND outbound.direction = 'outbound'
    ) pairs;
    SELECT EXTRACT(EPOCH FROM (MIN(wm.created_at) - v_lead.created_at)) / 60.0
      INTO v_first_contact_minutes FROM wa_messages wm
      WHERE wm.lead_id = v_lead.id AND wm.direction = 'outbound';
  END IF;

  RETURN jsonb_build_object(
    'appointment', to_jsonb(v_appt),
    'lead', CASE WHEN v_lead.id IS NOT NULL THEN to_jsonb(v_lead) ELSE NULL END,
    'lead_missing', v_lead.id IS NULL,
    'stats', jsonb_build_object(
      'calls_count', v_calls_count, 'messages_count', v_messages_count,
      'appointments_count', v_appointments_count,
      'avg_response_time_minutes', ROUND(v_avg_response_minutes, 1),
      'has_lead_replied', v_has_lead_replied,
      'first_contact_minutes', ROUND(v_first_contact_minutes, 1),
      'lead_reply_count', v_lead_reply_count
    ),
    'last_quiz', v_quiz, 'last_call', v_last_call
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', 'exception', 'message', SQLERRM);
END;
$function$;

-- 6. Fix get_team_today_overview to use operator_team_members
CREATE OR REPLACE FUNCTION public.get_team_today_overview(_director uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_root uuid := COALESCE(_director, auth.uid());
  v_is_admin boolean := has_role(v_caller, 'admin'::app_role) OR has_role(v_caller, 'owner'::app_role);
  v_total bigint;
  v_team_size int;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT v_is_admin THEN
    IF v_root <> v_caller THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF NOT public.is_operator_l6plus(v_caller) THEN RAISE EXCEPTION 'forbidden: requires Level 6+'; END IF;
  END IF;

  WITH
  unit_members AS (
    SELECT DISTINCT otm.member_id AS id
    FROM public.operator_team_members otm
    JOIN public.operator_units ou ON ou.id = otm.unit_id AND ou.status = 'active'
    WHERE ou.operator_id = v_root
       OR otm.unit_id IN (
         SELECT otm2.unit_id FROM public.operator_team_members otm2
         WHERE otm2.member_id = v_root AND otm2.active = true AND otm2.team_role = 'operator'
       )
  ),
  dir_sub AS (
    SELECT p.id FROM public.profiles p WHERE p.director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN dir_sub s ON p.director_id = s.id
  ),
  members AS (
    SELECT id FROM unit_members UNION SELECT id FROM dir_sub UNION SELECT v_root
  )
  SELECT COUNT(*) INTO v_team_size FROM members;

  WITH
  unit_members AS (
    SELECT DISTINCT otm.member_id AS id
    FROM public.operator_team_members otm
    JOIN public.operator_units ou ON ou.id = otm.unit_id AND ou.status = 'active'
    WHERE ou.operator_id = v_root
       OR otm.unit_id IN (
         SELECT otm2.unit_id FROM public.operator_team_members otm2
         WHERE otm2.member_id = v_root AND otm2.active = true AND otm2.team_role = 'operator'
       )
  ),
  dir_sub AS (
    SELECT p.id FROM public.profiles p WHERE p.director_id = v_root
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN dir_sub s ON p.director_id = s.id
  ),
  members AS (
    SELECT id FROM unit_members UNION SELECT id FROM dir_sub UNION SELECT v_root
  )
  SELECT COUNT(*) INTO v_total
  FROM public.appointments a
  WHERE a.setter_id IN (SELECT id FROM members)
    AND a.starts_at >= date_trunc('day', now())
    AND a.starts_at < date_trunc('day', now()) + interval '1 day';

  RETURN jsonb_build_object('team_size', v_team_size, 'appts_today', v_total);
END;
$function$;

-- 7. Update appointment RLS
DROP POLICY IF EXISTS "Unit scoped appointment access" ON public.appointments;

CREATE POLICY "Unit scoped appointment access"
ON public.appointments FOR SELECT
USING (
  setter_id = auth.uid()
  OR closer_id = auth.uid()
  OR current_owner_id = auth.uid()
  OR original_owner_id = auth.uid()
  OR (
    is_operator_l6plus(auth.uid())
    AND (
      operator_unit_id = ANY(get_user_all_unit_ids(auth.uid()))
      OR is_in_team_subtree(setter_id, auth.uid())
      OR is_in_team_subtree(closer_id, auth.uid())
      OR COALESCE((SELECT current_level >= 7 FROM user_level_status WHERE user_id = auth.uid()), false)
    )
  )
);

DROP POLICY IF EXISTS "L6 unit reassign appointments" ON public.appointments;

CREATE POLICY "L6 unit reassign appointments"
ON public.appointments FOR UPDATE
USING (
  closer_id = auth.uid()
  OR current_owner_id = auth.uid()
  OR (
    is_operator_l6plus(auth.uid())
    AND (
      operator_unit_id = ANY(get_user_all_unit_ids(auth.uid()))
      OR COALESCE((SELECT current_level >= 7 FROM user_level_status WHERE user_id = auth.uid()), false)
    )
  )
);
