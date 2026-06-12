
-- ============================================================
-- 1. Add unit_id + assigned_operator_id to leads
-- ============================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.operator_units(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_operator_id uuid;

CREATE INDEX IF NOT EXISTS idx_leads_unit_id ON public.leads(unit_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_operator_id ON public.leads(assigned_operator_id);

-- ============================================================
-- 2. Lead routing trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.route_lead_to_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit record;
  v_funnel text;
BEGIN
  v_funnel := CASE
    WHEN NEW.source ILIKE '%apply%'            THEN '/apply'
    WHEN NEW.source ILIKE '%qualify%'           THEN '/qualify'
    WHEN NEW.source ILIKE '%high-income%'
      OR NEW.source ILIKE '%his%'              THEN '/high-income-skill'
    WHEN NEW.source ILIKE '%partner%'           THEN '/partners'
    ELSE NULL
  END;

  IF v_funnel IS NOT NULL THEN
    SELECT id, operator_id INTO v_unit
    FROM operator_units
    WHERE funnel_path = v_funnel AND status = 'active'
    LIMIT 1;

    IF v_unit.id IS NOT NULL THEN
      NEW.unit_id := v_unit.id;
      NEW.assigned_operator_id := v_unit.operator_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_lead_to_unit ON public.leads;
CREATE TRIGGER trg_route_lead_to_unit
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.route_lead_to_unit();

-- Backfill existing leads
UPDATE public.leads l SET
  unit_id = ou.id,
  assigned_operator_id = ou.operator_id
FROM operator_units ou
WHERE l.unit_id IS NULL
  AND ou.status = 'active'
  AND (
    (l.source ILIKE '%apply%' AND ou.funnel_path = '/apply') OR
    (l.source ILIKE '%qualify%' AND ou.funnel_path = '/qualify') OR
    ((l.source ILIKE '%high-income%' OR l.source ILIKE '%his%') AND ou.funnel_path = '/high-income-skill') OR
    (l.source ILIKE '%partner%' AND ou.funnel_path = '/partners')
  );

-- ============================================================
-- 3. Security helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_unit_member(_user_id uuid, _unit_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM operator_team_members
    WHERE member_id = _user_id AND unit_id = _unit_id
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_unit_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT unit_id FROM operator_team_members WHERE member_id = _user_id
  UNION
  SELECT id FROM operator_units WHERE operator_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_director_unit_ids(_director_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM operator_units WHERE operator_id = _director_id
  UNION
  SELECT ou.id FROM operator_units ou
  JOIN profiles p ON p.id = ou.operator_id
  WHERE p.director_id = _director_id;
$$;

-- ============================================================
-- 4. Harden RLS on operator_team_members
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view team assignments" ON public.operator_team_members;
DROP POLICY IF EXISTS "Admins and L6+ can manage team assignments" ON public.operator_team_members;

CREATE POLICY "Admin sees all team members"
  ON public.operator_team_members FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 8)
  );

CREATE POLICY "L7 sees director area team members"
  ON public.operator_team_members FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 7)
    AND unit_id IN (SELECT public.get_director_unit_ids(auth.uid()))
  );

CREATE POLICY "L6 sees own unit team members"
  ON public.operator_team_members FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 6)
    AND unit_id IN (SELECT public.get_user_unit_ids(auth.uid()))
  );

CREATE POLICY "Admins and L6+ manage team assignments"
  ON public.operator_team_members FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 6)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 6)
  );

-- ============================================================
-- 5. Harden RLS on operator_units
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view operator units" ON public.operator_units;
DROP POLICY IF EXISTS "Admins can manage operator units" ON public.operator_units;

CREATE POLICY "Admin sees all units"
  ON public.operator_units FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 8)
  );

CREATE POLICY "L7 sees director area units"
  ON public.operator_units FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 7)
    AND id IN (SELECT public.get_director_unit_ids(auth.uid()))
  );

CREATE POLICY "L6 sees own units"
  ON public.operator_units FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase = 6)
    AND id IN (SELECT public.get_user_unit_ids(auth.uid()))
  );

CREATE POLICY "Admins manage operator units"
  ON public.operator_units FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 6)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND current_phase >= 6)
  );

-- ============================================================
-- 6. Drop + Rewrite get_operator_unit_performance using Truth Views
-- ============================================================
DROP FUNCTION IF EXISTS public.get_operator_unit_performance(int);

CREATE OR REPLACE FUNCTION public.get_operator_unit_performance(p_range_days int DEFAULT 30)
RETURNS TABLE(
  unit_id uuid, unit_name text, funnel_path text, operator_name text,
  operator_id uuid, team_size int, total_leads bigint, total_appointments bigint,
  total_shows bigint, total_closes bigint, total_revenue numeric,
  close_rate numeric, show_rate numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - (p_range_days || ' days')::interval;
  v_caller uuid := auth.uid();
  v_level int;
  v_is_admin boolean;
BEGIN
  SELECT current_phase INTO v_level FROM profiles WHERE id = v_caller;
  v_is_admin := has_role(v_caller, 'admin') OR has_role(v_caller, 'owner') OR COALESCE(v_level, 0) >= 8;

  RETURN QUERY
  WITH accessible_units AS (
    SELECT ou.id, ou.unit_name, ou.funnel_path, ou.operator_id
    FROM operator_units ou
    WHERE ou.status = 'active'
      AND (
        v_is_admin
        OR (v_level = 7 AND ou.id IN (SELECT get_director_unit_ids(v_caller)))
        OR (v_level = 6 AND ou.id IN (SELECT get_user_unit_ids(v_caller)))
      )
  ),
  unit_member_ids AS (
    SELECT otm.unit_id AS uid, otm.member_id
    FROM operator_team_members otm
    WHERE otm.unit_id IN (SELECT au.id FROM accessible_units au)
  ),
  lead_counts AS (
    SELECT rl.unit_id AS uid, COUNT(*)::bigint AS cnt
    FROM real_leads_view rl
    WHERE rl.created_at >= v_cutoff
      AND rl.unit_id IN (SELECT au.id FROM accessible_units au)
    GROUP BY rl.unit_id
  ),
  appt_stats AS (
    SELECT
      um.uid,
      COUNT(*)::bigint AS total_appts,
      COUNT(*) FILTER (
        WHERE ra.appointment_status NOT IN ('no_show','cancelled','expired','superseded')
          AND (ra.completed_at IS NOT NULL OR ra.call_started_at IS NOT NULL)
          AND ra.starts_at <= now()
      )::bigint AS showed
    FROM real_appointments_view ra
    JOIN unit_member_ids um ON (ra.setter_id = um.member_id OR ra.closer_id = um.member_id)
    WHERE ra.starts_at >= v_cutoff
    GROUP BY um.uid
  ),
  call_stats AS (
    SELECT
      um.uid,
      COUNT(*) FILTER (WHERE c.closed_at IS NOT NULL OR c.result = 'closed')::bigint AS closes,
      COALESCE(SUM(c.revenue) FILTER (WHERE c.closed_at IS NOT NULL OR c.result = 'closed'), 0)::numeric AS rev
    FROM calls c
    JOIN unit_member_ids um ON c.user_id = um.member_id
    WHERE c.created_at >= v_cutoff AND NOT COALESCE(c.is_simulation, false)
    GROUP BY um.uid
  )
  SELECT
    au.id,
    au.unit_name,
    au.funnel_path,
    COALESCE(p.full_name, 'Unassigned'),
    au.operator_id,
    (SELECT COUNT(*)::int FROM unit_member_ids um WHERE um.uid = au.id),
    COALESCE(lc.cnt, 0),
    COALESCE(ast.total_appts, 0),
    COALESCE(ast.showed, 0),
    COALESCE(cs.closes, 0),
    COALESCE(cs.rev, 0),
    CASE WHEN COALESCE(ast.showed, 0) > 0
      THEN ROUND(COALESCE(cs.closes, 0)::numeric / ast.showed * 100, 1)
      ELSE 0 END,
    CASE WHEN COALESCE(ast.total_appts, 0) > 0
      THEN ROUND(COALESCE(ast.showed, 0)::numeric / ast.total_appts * 100, 1)
      ELSE 0 END
  FROM accessible_units au
  LEFT JOIN profiles p ON p.id = au.operator_id
  LEFT JOIN lead_counts lc ON lc.uid = au.id
  LEFT JOIN appt_stats ast ON ast.uid = au.id
  LEFT JOIN call_stats cs ON cs.uid = au.id
  ORDER BY au.unit_name;
END;
$$;

-- ============================================================
-- 7. Drilldown RPC: Unit → Members → Leads → Calls
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_unit_drilldown(
  p_unit_id uuid,
  p_range_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_level int;
  v_is_admin boolean;
  v_result jsonb;
  v_cutoff timestamptz := now() - (p_range_days || ' days')::interval;
BEGIN
  SELECT current_phase INTO v_level FROM profiles WHERE id = v_caller;
  v_is_admin := has_role(v_caller, 'admin') OR has_role(v_caller, 'owner') OR COALESCE(v_level, 0) >= 8;

  IF NOT v_is_admin THEN
    IF v_level = 7 AND p_unit_id NOT IN (SELECT get_director_unit_ids(v_caller)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF v_level = 6 AND p_unit_id NOT IN (SELECT get_user_unit_ids(v_caller)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF COALESCE(v_level, 0) < 6 THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'unit', (SELECT row_to_json(ou.*) FROM operator_units ou WHERE ou.id = p_unit_id),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'member_id', otm.member_id,
        'team_role', otm.team_role,
        'full_name', p.full_name,
        'email', p.email,
        'level', p.current_phase,
        'leads_count', (SELECT COUNT(*) FROM real_leads_view rl
          WHERE rl.created_at >= v_cutoff
            AND (rl.owner_id = otm.member_id OR rl.setter_id = otm.member_id OR rl.closer_id = otm.member_id)),
        'appointments_count', (SELECT COUNT(*) FROM real_appointments_view ra
          WHERE ra.starts_at >= v_cutoff
            AND (ra.setter_id = otm.member_id OR ra.closer_id = otm.member_id)),
        'calls_count', (SELECT COUNT(*) FROM calls c
          WHERE c.created_at >= v_cutoff AND NOT COALESCE(c.is_simulation, false)
            AND c.user_id = otm.member_id),
        'revenue', (SELECT COALESCE(SUM(c.revenue), 0) FROM calls c
          WHERE c.created_at >= v_cutoff AND NOT COALESCE(c.is_simulation, false)
            AND c.user_id = otm.member_id
            AND (c.closed_at IS NOT NULL OR c.result = 'closed'))
      ))
      FROM operator_team_members otm
      JOIN profiles p ON p.id = otm.member_id
      WHERE otm.unit_id = p_unit_id
    ), '[]'::jsonb),
    'recent_leads', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', rl.id, 'name', rl.name, 'source', rl.source,
        'stage', rl.stage, 'created_at', rl.created_at,
        'deal_value', rl.deal_value
      ) ORDER BY rl.created_at DESC)
      FROM (SELECT * FROM real_leads_view rl2
        WHERE rl2.unit_id = p_unit_id AND rl2.created_at >= v_cutoff
        ORDER BY rl2.created_at DESC LIMIT 50) rl
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
