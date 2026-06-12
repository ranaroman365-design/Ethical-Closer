
-- 1. Create a broader team scope function that covers:
--    a) Direct reports (existing subtree logic)
--    b) Peers (same director_id)
--    c) Members whose director_id matches the caller
--    d) Fallback: if caller has no director_id, only own + direct reports
-- SECURITY DEFINER to avoid RLS recursion on profiles
CREATE OR REPLACE FUNCTION public.is_in_team_scope(_member uuid, _caller uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _member = _caller
    OR
    -- _member is a direct report of _caller
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = _member AND director_id = _caller
    )
    OR
    -- _member is a peer (same director_id, both non-null)
    EXISTS (
      SELECT 1
      FROM public.profiles AS caller_p, public.profiles AS member_p
      WHERE caller_p.id = _caller
        AND member_p.id = _member
        AND caller_p.director_id IS NOT NULL
        AND caller_p.director_id = member_p.director_id
    )
    OR
    -- _member is in caller's recursive subtree (existing logic)
    public.is_in_team_subtree(_member, _caller)
$$;

-- 2. Drop the old restrictive SELECT policy
DROP POLICY IF EXISTS "Closers and L6 team see appointments" ON public.appointments;

-- 3. Create the fixed SELECT policy using the new scope function
CREATE POLICY "Closers and L6 team see appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  setter_id = auth.uid()
  OR closer_id = auth.uid()
  OR current_owner_id = auth.uid()
  OR original_owner_id = auth.uid()
  OR (
    is_operator_l6plus(auth.uid())
    AND (
      is_in_team_scope(setter_id, auth.uid())
      OR is_in_team_scope(closer_id, auth.uid())
      OR is_in_team_scope(current_owner_id, auth.uid())
    )
  )
);

-- 4. Drop and recreate the UPDATE policy with same scope
DROP POLICY IF EXISTS "L6 team can reassign appointments" ON public.appointments;

CREATE POLICY "L6 team can reassign appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  is_operator_l6plus(auth.uid())
  AND (
    closer_id = auth.uid()
    OR current_owner_id = auth.uid()
    OR original_owner_id = auth.uid()
    OR is_in_team_scope(setter_id, auth.uid())
    OR is_in_team_scope(closer_id, auth.uid())
    OR is_in_team_scope(current_owner_id, auth.uid())
  )
)
WITH CHECK (
  is_operator_l6plus(auth.uid())
  AND (
    closer_id = auth.uid()
    OR current_owner_id = auth.uid()
    OR original_owner_id = auth.uid()
    OR is_in_team_scope(setter_id, auth.uid())
    OR is_in_team_scope(closer_id, auth.uid())
    OR is_in_team_scope(current_owner_id, auth.uid())
  )
);

-- 5. Ensure leads table has matching scope for L6
-- (appointment detail loads lead data via RLS)
DROP POLICY IF EXISTS "L6 team sees team leads" ON public.leads;

CREATE POLICY "L6 team sees team leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  is_operator_l6plus(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.lead_id = leads.id
    AND (
      is_in_team_scope(a.setter_id, auth.uid())
      OR is_in_team_scope(a.closer_id, auth.uid())
      OR is_in_team_scope(a.current_owner_id, auth.uid())
    )
  )
);
