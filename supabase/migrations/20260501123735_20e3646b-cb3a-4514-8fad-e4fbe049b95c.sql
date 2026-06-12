
-- 1. Create SECURITY DEFINER helper to check if a lead is accessible
--    to a team member via their appointments, WITHOUT triggering RLS.
CREATE OR REPLACE FUNCTION public.lead_visible_to_team_member(_lead_id uuid, _caller_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM appointments a
    WHERE a.lead_id = _lead_id
      AND (
        is_in_team_scope(a.setter_id, _caller_id)
        OR is_in_team_scope(a.closer_id, _caller_id)
        OR is_in_team_scope(a.current_owner_id, _caller_id)
      )
  )
$$;

-- 2. Drop the broken policy that caused infinite recursion
DROP POLICY IF EXISTS "L6 team sees team leads" ON public.leads;

-- 3. Recreate with the safe helper function
CREATE POLICY "L6 team sees team leads"
ON public.leads
FOR SELECT
USING (
  is_operator_l6plus(auth.uid())
  AND lead_visible_to_team_member(id, auth.uid())
);
