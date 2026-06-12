-- Add SELECT policy for own profile
CREATE POLICY "cp_own_read"
ON public.closer_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Fix UPDATE policy: add WITH CHECK
DROP POLICY IF EXISTS "cp_own_update" ON public.closer_profiles;
CREATE POLICY "cp_own_update"
ON public.closer_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add unique constraint on user_id for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'closer_profiles_user_id_key'
  ) THEN
    ALTER TABLE public.closer_profiles ADD CONSTRAINT closer_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;