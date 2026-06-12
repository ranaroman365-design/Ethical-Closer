
CREATE OR REPLACE FUNCTION public.get_assignable_operators(p_user_id uuid)
RETURNS TABLE(id uuid, full_name text, email text, current_phase int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller_unit AS (
    SELECT otm.unit_id, ou.operator_id
    FROM operator_team_members otm
    JOIN operator_units ou ON ou.id = otm.unit_id
    WHERE otm.member_id = p_user_id AND otm.active = true
  ),
  caller_info AS (
    SELECT p.id, p.current_phase
    FROM profiles p
    WHERE p.id = p_user_id
  )
  SELECT DISTINCT p.id, p.full_name, p.email, p.current_phase
  FROM profiles p
  JOIN caller_info ci ON true
  WHERE p.member_status IS DISTINCT FROM 'inactive'
    AND (
      -- Always include self
      p.id = p_user_id
      -- L8+: all active operators
      OR (ci.current_phase >= 8 AND p.current_phase >= 1)
      -- L7: all members in units where caller is director or operator
      OR (ci.current_phase = 7 AND EXISTS (
        SELECT 1 FROM operator_team_members otm2
        JOIN operator_units ou2 ON ou2.id = otm2.unit_id
        WHERE otm2.member_id = p.id AND otm2.active = true
          AND (ou2.operator_id = p_user_id OR EXISTS (
            SELECT 1 FROM operator_team_members otm3
            WHERE otm3.unit_id = ou2.id AND otm3.member_id = p_user_id AND otm3.active = true
          ))
      ))
      -- L4-L6: same unit members
      OR (ci.current_phase >= 4 AND ci.current_phase <= 6 AND EXISTS (
        SELECT 1 FROM operator_team_members otm_me
        JOIN operator_team_members otm_them ON otm_them.unit_id = otm_me.unit_id
        WHERE otm_me.member_id = p_user_id AND otm_me.active = true
          AND otm_them.member_id = p.id AND otm_them.active = true
      ))
    )
  ORDER BY p.current_phase DESC, p.full_name;
$$;
