-- 1. Access flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS community_access BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_community_access
  ON public.profiles(community_access) WHERE community_access = true;

-- 2. Optional deal value column on messages (for deal/placement post types)
ALTER TABLE public.community_messages
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC NULL;

-- 3. RPC for webhook to unlock access
CREATE OR REPLACE FUNCTION public.unlock_community_access(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_locked BOOLEAN;
BEGIN
  SELECT NOT community_access INTO v_was_locked
    FROM public.profiles WHERE id = p_user_id;

  IF v_was_locked IS NULL THEN
    RETURN false; -- profile missing
  END IF;

  UPDATE public.profiles
     SET community_access = true,
         updated_at = now()
   WHERE id = p_user_id;

  IF v_was_locked THEN
    INSERT INTO public.audit_logs (action, actor_id, source_type, note, after_state)
    VALUES ('community_access_unlocked', p_user_id, 'system',
            'Community access unlocked',
            jsonb_build_object('user_id', p_user_id));
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_community_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_community_access(UUID) TO service_role;