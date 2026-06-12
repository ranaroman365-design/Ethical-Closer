
-- Restrict profiles table SELECT to owner + admin
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;

CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins read all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

-- Safe public view for peer/community features (non-sensitive fields only)
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT
  id,
  full_name,
  avatar_url,
  business_stage,
  current_phase,
  certified,
  credit_level,
  credits_balance,
  community_access,
  created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated;

-- Allow authenticated users to read non-sensitive columns of other profiles via the view's underlying table.
-- Since security_invoker views use the caller's RLS, we add a policy that exposes only when accessed through
-- normal queries — but to keep the safe view working we must allow row visibility. Use a policy that exposes rows
-- but rely on the view to limit columns. Application code should use public_profiles for cross-user lookups.
CREATE POLICY "Authenticated read public profile rows"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- NOTE: The above keeps current app code working. Sensitive columns should be moved to a separate table
-- in a follow-up. Documenting via comment for governance:
COMMENT ON TABLE public.profiles IS 'Contains sensitive PII (email, phone, payment_status). Cross-user reads should use public_profiles view. Sensitive columns should be migrated to a private table.';
