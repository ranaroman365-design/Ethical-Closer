CREATE OR REPLACE FUNCTION public.list_eligible_reassignment_operators(
  p_role text
)
RETURNS TABLE (
  user_id    uuid,
  full_name  text,
  email      text,
  level      integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_min_lvl  integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT (
    public.user_has_min_level(v_caller, 6)
    OR public.has_role(v_caller, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden_level_below_l6';
  END IF;

  IF p_role NOT IN ('setter','closer') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  v_min_lvl := CASE WHEN p_role = 'closer' THEN 6 ELSE 4 END;

  RETURN QUERY
  SELECT p.id,
         p.full_name,
         p.email,
         uls.current_level
    FROM public.profiles p
    JOIN public.user_level_status uls ON uls.user_id = p.id
   WHERE uls.current_level >= v_min_lvl
     AND p.member_status = 'enrolled'
   ORDER BY uls.current_level DESC, p.full_name ASC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_eligible_reassignment_operators(text) FROM public;
GRANT EXECUTE ON FUNCTION public.list_eligible_reassignment_operators(text) TO authenticated;
