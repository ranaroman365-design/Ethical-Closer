-- Community Access Audit Log
-- Tracks every manual repair action on community_access flag
CREATE TABLE IF NOT EXISTS public.community_access_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_user_id UUID NOT NULL,
  target_email TEXT NOT NULL,
  actor_user_id UUID NOT NULL,
  actor_email TEXT,
  action TEXT NOT NULL CHECK (action IN ('grant', 'revoke', 'inspect')),
  previous_state BOOLEAN,
  new_state BOOLEAN,
  reason TEXT,
  stripe_status JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_access_audit_target ON public.community_access_audit(target_user_id);
CREATE INDEX IF NOT EXISTS idx_community_access_audit_created ON public.community_access_audit(created_at DESC);

ALTER TABLE public.community_access_audit ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit log
CREATE POLICY "Admins can view community access audit"
ON public.community_access_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert audit entries (via backend RPC/function)
CREATE POLICY "Admins can insert community access audit"
ON public.community_access_audit
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_user_id = auth.uid());

-- RPC: admin_repair_community_access
-- Allows admin to grant/revoke community_access flag with full audit trail
CREATE OR REPLACE FUNCTION public.admin_repair_community_access(
  p_target_email TEXT,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_target_id UUID;
  v_previous BOOLEAN;
  v_new_state BOOLEAN;
  v_actor_email TEXT;
BEGIN
  -- Authorization
  IF NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  IF p_action NOT IN ('grant', 'revoke', 'inspect') THEN
    RAISE EXCEPTION 'Invalid action: must be grant, revoke, or inspect';
  END IF;

  -- Resolve target user by email
  SELECT id, community_access INTO v_target_id, v_previous
  FROM public.profiles
  WHERE lower(email) = lower(p_target_email)
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'User not found for email: %', p_target_email;
  END IF;

  SELECT email INTO v_actor_email FROM public.profiles WHERE id = v_actor;

  -- Apply action
  IF p_action = 'grant' THEN
    UPDATE public.profiles SET community_access = TRUE WHERE id = v_target_id;
    v_new_state := TRUE;
  ELSIF p_action = 'revoke' THEN
    UPDATE public.profiles SET community_access = FALSE WHERE id = v_target_id;
    v_new_state := FALSE;
  ELSE
    v_new_state := v_previous;
  END IF;

  -- Audit
  INSERT INTO public.community_access_audit (
    target_user_id, target_email, actor_user_id, actor_email,
    action, previous_state, new_state, reason
  ) VALUES (
    v_target_id, p_target_email, v_actor, v_actor_email,
    p_action, v_previous, v_new_state, p_reason
  );

  RETURN jsonb_build_object(
    'success', true,
    'target_user_id', v_target_id,
    'previous_state', v_previous,
    'new_state', v_new_state,
    'action', p_action
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_repair_community_access(TEXT, TEXT, TEXT) TO authenticated;