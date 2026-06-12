DROP FUNCTION IF EXISTS public.unlock_community_access(uuid);

CREATE OR REPLACE FUNCTION public.unlock_community_access(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET community_access = true
  WHERE id = p_user_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_user_id
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'community_member'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;
