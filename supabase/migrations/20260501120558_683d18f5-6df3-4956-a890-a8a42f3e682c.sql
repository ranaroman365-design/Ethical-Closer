
-- 1. Remove overly broad L6+ global read policy
--    The more targeted "Closers and L6 team see appointments" policy already
--    covers L6 team visibility without opening ALL appointments globally.
DROP POLICY IF EXISTS "L6+ read all appointments" ON public.appointments;

-- 2. Add UPDATE policy for L6+ team reassignment (mirrors existing SELECT scope)
--    Allows L6+ to update appointments where they are the closer/owner
--    OR the setter/closer/current_owner is in their team subtree.
CREATE POLICY "L6 team can reassign appointments"
  ON public.appointments
  FOR UPDATE
  USING (
    is_operator_l6plus(auth.uid())
    AND (
      closer_id = auth.uid()
      OR current_owner_id = auth.uid()
      OR original_owner_id = auth.uid()
      OR is_in_team_subtree(setter_id, auth.uid())
      OR is_in_team_subtree(closer_id, auth.uid())
      OR is_in_team_subtree(current_owner_id, auth.uid())
    )
  )
  WITH CHECK (
    is_operator_l6plus(auth.uid())
    AND (
      closer_id = auth.uid()
      OR current_owner_id = auth.uid()
      OR original_owner_id = auth.uid()
      OR is_in_team_subtree(setter_id, auth.uid())
      OR is_in_team_subtree(closer_id, auth.uid())
      OR is_in_team_subtree(current_owner_id, auth.uid())
    )
  );
