
-- Drop old incompatible table
DROP TABLE IF EXISTS public.operator_team_members CASCADE;

-- operator_units already created by previous partial migration, skip if exists
CREATE TABLE IF NOT EXISTS public.operator_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  unit_name text NOT NULL,
  funnel_path text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  max_team_size int NOT NULL DEFAULT 8,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operator_units ENABLE ROW LEVEL SECURITY;

-- Policies (IF NOT EXISTS not supported, use DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operator_units' AND policyname = 'Authenticated users can view operator units') THEN
    CREATE POLICY "Authenticated users can view operator units"
      ON public.operator_units FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'operator_units' AND policyname = 'Admins can manage operator units') THEN
    CREATE POLICY "Admins can manage operator units"
      ON public.operator_units FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND current_phase >= 6)
      );
  END IF;
END $$;

-- Recreate team member assignments
CREATE TABLE public.operator_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.operator_units(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_role text NOT NULL CHECK (team_role IN ('opener', 'setter', 'closer', 'operator')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(unit_id, member_id)
);

ALTER TABLE public.operator_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view team assignments"
  ON public.operator_team_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and L6+ can manage team assignments"
  ON public.operator_team_members FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND current_phase >= 6)
  );

-- Funnel routing config
CREATE TABLE IF NOT EXISTS public.funnel_routing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_path text NOT NULL UNIQUE,
  unit_id uuid NOT NULL REFERENCES public.operator_units(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funnel_routing_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'funnel_routing_config' AND policyname = 'Authenticated users can view routing config') THEN
    CREATE POLICY "Authenticated users can view routing config"
      ON public.funnel_routing_config FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'funnel_routing_config' AND policyname = 'Admins can manage routing config') THEN
    CREATE POLICY "Admins can manage routing config"
      ON public.funnel_routing_config FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- RPC: operator unit performance
CREATE OR REPLACE FUNCTION public.get_operator_unit_performance(p_range_days int DEFAULT 30)
RETURNS TABLE(
  unit_id uuid,
  unit_name text,
  funnel_path text,
  operator_name text,
  operator_id uuid,
  team_size int,
  total_leads bigint,
  total_bookings bigint,
  total_shows bigint,
  total_closes bigint,
  total_revenue numeric,
  close_rate numeric,
  show_rate numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  v_cutoff := now() - (p_range_days || ' days')::interval;

  RETURN QUERY
  WITH unit_members AS (
    SELECT otm.unit_id AS uid, otm.member_id
    FROM operator_team_members otm
  )
  SELECT
    ou.id,
    ou.unit_name,
    ou.funnel_path,
    COALESCE(p.full_name, 'Unassigned'),
    ou.operator_id,
    (SELECT COUNT(*)::int FROM unit_members um WHERE um.uid = ou.id),
    COALESCE((
      SELECT COUNT(*) FROM leads l
      WHERE l.created_at >= v_cutoff AND NOT COALESCE(l.is_simulation, false)
        AND (l.owner_id IN (SELECT um.member_id FROM unit_members um WHERE um.uid = ou.id)
          OR l.setter_id IN (SELECT um.member_id FROM unit_members um WHERE um.uid = ou.id)
          OR l.closer_id IN (SELECT um.member_id FROM unit_members um WHERE um.uid = ou.id)
          OR l.owner_id = ou.operator_id)
    ), 0),
    COALESCE((
      SELECT COUNT(*) FROM appointments a
      WHERE a.starts_at >= v_cutoff
        AND (a.setter_id IN (SELECT um.member_id FROM unit_members um WHERE um.uid = ou.id)
          OR a.closer_id IN (SELECT um.member_id FROM unit_members um WHERE um.uid = ou.id)
          OR a.assigned_operator_id = ou.operator_id)
    ), 0),
    COALESCE((
      SELECT COUNT(*) FROM appointments a
      WHERE a.starts_at >= v_cutoff AND a.starts_at <= now()
        AND a.appointment_status NOT IN ('no_show','cancelled','expired','superseded')
        AND (a.completed_at IS NOT NULL OR a.call_started_at IS NOT NULL)
        AND (a.setter_id IN (SELECT um.member_id FROM unit_members um WHERE um.uid = ou.id)
          OR a.closer_id IN (SELECT um.member_id FROM unit_members um WHERE um.uid = ou.id)
          OR a.assigned_operator_id = ou.operator_id)
    ), 0),
    COALESCE((
      SELECT COUNT(*) FROM calls c
      WHERE c.created_at >= v_cutoff AND NOT COALESCE(c.is_simulation, false)
        AND (c.closed_at IS NOT NULL OR c.result = 'closed')
        AND c.user_id IN (
          SELECT um.member_id FROM unit_members um WHERE um.uid = ou.id
          UNION ALL SELECT ou.operator_id WHERE ou.operator_id IS NOT NULL
        )
    ), 0),
    COALESCE((
      SELECT SUM(COALESCE(c.revenue, 0)) FROM calls c
      WHERE c.created_at >= v_cutoff AND NOT COALESCE(c.is_simulation, false)
        AND (c.closed_at IS NOT NULL OR c.result = 'closed')
        AND c.user_id IN (
          SELECT um.member_id FROM unit_members um WHERE um.uid = ou.id
          UNION ALL SELECT ou.operator_id WHERE ou.operator_id IS NOT NULL
        )
    ), 0),
    0::numeric,
    0::numeric
  FROM operator_units ou
  LEFT JOIN profiles p ON p.id = ou.operator_id
  WHERE ou.status = 'active'
  ORDER BY ou.unit_name;
END;
$$;
