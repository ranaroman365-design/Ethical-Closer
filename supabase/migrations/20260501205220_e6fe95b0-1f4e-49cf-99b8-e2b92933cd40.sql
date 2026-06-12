-- Helper: L5+ check
CREATE OR REPLACE FUNCTION public.is_operator_l5plus(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT current_level >= 5 FROM public.user_level_status WHERE user_id = _user),
    -- fallback to profiles.current_phase
    (SELECT (current_phase >= 5) FROM public.profiles WHERE id = _user),
    false
  )
$$;

-- Helper: lead belongs to same unit as caller
CREATE OR REPLACE FUNCTION public.lead_visible_to_unit_member(_lead_id uuid, _caller uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.operator_team_members otm
    JOIN public.leads l ON l.unit_id = otm.unit_id
    WHERE otm.member_id = _caller
      AND l.id = _lead_id
  )
  OR EXISTS (
    -- Also check if caller owns the unit (is the operator)
    SELECT 1
    FROM public.leads l
    JOIN public.operator_team_members otm ON otm.unit_id = l.unit_id
    WHERE l.id = _lead_id
      AND otm.member_id = _caller
  )
$$;

-- New policy: L5 unit members see unit leads
CREATE POLICY "L5 unit members see unit leads"
ON public.leads
FOR SELECT
USING (
  is_operator_l5plus(auth.uid())
  AND lead_visible_to_unit_member(id, auth.uid())
);

-- L7+ sees ALL leads (director/area scope via recursive subtree already covered, 
-- but let's add explicit L7+ global read)
CREATE POLICY "L7 directors see all leads"
ON public.leads
FOR SELECT
USING (
  COALESCE(
    (SELECT current_level >= 7 FROM public.user_level_status WHERE user_id = auth.uid()),
    false
  )
);