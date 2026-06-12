
-- 1. Add active column to operator_team_members
ALTER TABLE public.operator_team_members 
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 2. Drop old hard unique on member_id, add partial unique for active only
ALTER TABLE public.operator_team_members 
  DROP CONSTRAINT IF EXISTS operator_team_members_member_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_operator_member 
  ON public.operator_team_members(member_id) 
  WHERE active = true;

-- 3. Expand team_role check to include director and admin
ALTER TABLE public.operator_team_members 
  DROP CONSTRAINT IF EXISTS operator_team_members_team_role_check;
ALTER TABLE public.operator_team_members 
  ADD CONSTRAINT operator_team_members_team_role_check 
  CHECK (team_role IN ('opener','setter','closer','operator','director','admin'));

-- 4. Add operator_unit_id to appointments
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS operator_unit_id uuid REFERENCES public.operator_units(id);

CREATE INDEX IF NOT EXISTS idx_appointments_operator_unit_id 
  ON public.appointments(operator_unit_id);

-- 5. Backfill appointments.operator_unit_id from lead's unit_id
UPDATE public.appointments a
SET operator_unit_id = l.unit_id
FROM public.leads l
WHERE a.lead_id = l.id 
  AND a.operator_unit_id IS NULL 
  AND l.unit_id IS NOT NULL;

-- 6. Helper: get user's active unit id
CREATE OR REPLACE FUNCTION public.get_user_unit_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unit_id FROM public.operator_team_members 
  WHERE member_id = _user_id AND active = true 
  LIMIT 1;
$$;

-- 7. Helper: canonical role for level
CREATE OR REPLACE FUNCTION public.canonical_role_for_level(_level int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _level
    WHEN 1 THEN 'opener'
    WHEN 2 THEN 'associate_setter'
    WHEN 3 THEN 'senior_setter'
    WHEN 4 THEN 'junior_closer'
    WHEN 5 THEN 'managing_closer'
    WHEN 6 THEN 'senior_closer'
    WHEN 7 THEN 'director'
    WHEN 8 THEN 'admin'
    ELSE 'unknown'
  END;
$$;

-- 8. Helper: is target user in same unit as viewer (for RLS)
CREATE OR REPLACE FUNCTION public.is_in_unit_scope(_target_user_id uuid, _viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.operator_team_members a
    JOIN public.operator_team_members b ON a.unit_id = b.unit_id
    WHERE a.member_id = _target_user_id 
      AND b.member_id = _viewer_id
      AND a.active = true 
      AND b.active = true
  );
$$;

-- 9. Helper: is lead in viewer's unit
CREATE OR REPLACE FUNCTION public.lead_in_viewer_unit(_lead_id uuid, _viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.operator_team_members otm ON otm.unit_id = l.unit_id
    WHERE l.id = _lead_id 
      AND otm.member_id = _viewer_id 
      AND otm.active = true
  );
$$;

-- 10. Fix RLS on leads: remove overly broad L6+ policy, replace with unit-scoped
DROP POLICY IF EXISTS "L6+ read all leads" ON public.leads;
DROP POLICY IF EXISTS "L6 team sees team leads" ON public.leads;
DROP POLICY IF EXISTS "L5 unit members see unit leads" ON public.leads;

-- L5-L6: see leads in own unit only
CREATE POLICY "L5_L6 see own unit leads"
  ON public.leads FOR SELECT TO authenticated
  USING (
    is_operator_l5plus(auth.uid()) 
    AND lead_in_viewer_unit(id, auth.uid())
  );

-- L7+: see all leads (director/admin scope)
CREATE POLICY "L7 plus see all leads"
  ON public.leads FOR SELECT TO authenticated
  USING (
    COALESCE((SELECT current_level >= 7 FROM user_level_status WHERE user_id = auth.uid()), false)
  );

-- 11. Fix appointment RLS: ensure L6 unit-scoped
DROP POLICY IF EXISTS "Closers and L6 team see appointments" ON public.appointments;

CREATE POLICY "Unit scoped appointment access"
  ON public.appointments FOR SELECT TO authenticated
  USING (
    setter_id = auth.uid()
    OR closer_id = auth.uid()
    OR current_owner_id = auth.uid()
    OR original_owner_id = auth.uid()
    OR (
      is_operator_l6plus(auth.uid()) 
      AND (
        operator_unit_id = get_user_unit_id(auth.uid())
        OR COALESCE((SELECT current_level >= 7 FROM user_level_status WHERE user_id = auth.uid()), false)
      )
    )
  );

-- 12. Fix appointment UPDATE policy for reassignment  
DROP POLICY IF EXISTS "L6 team can reassign appointments" ON public.appointments;

CREATE POLICY "L6 unit reassign appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (
    closer_id = auth.uid()
    OR current_owner_id = auth.uid()
    OR (
      is_operator_l6plus(auth.uid())
      AND (
        operator_unit_id = get_user_unit_id(auth.uid())
        OR COALESCE((SELECT current_level >= 7 FROM user_level_status WHERE user_id = auth.uid()), false)
      )
    )
  );
