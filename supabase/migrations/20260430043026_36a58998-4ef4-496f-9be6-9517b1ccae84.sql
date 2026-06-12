-- 1. Private bucket for playbooks (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('playbooks', 'playbooks', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 2. Canonical mapping: playbook file → required min level (1..6)
CREATE TABLE IF NOT EXISTS public.playbook_access_registry (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_key  text NOT NULL UNIQUE,
  file_name     text NOT NULL,
  required_level int  NOT NULL CHECK (required_level BETWEEN 1 AND 8),
  tier          text NOT NULL DEFAULT 'execution' CHECK (tier IN ('execution','control')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.playbook_access_registry ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated may READ the registry (it has no secrets, just the level map).
DROP POLICY IF EXISTS "registry_read_authenticated" ON public.playbook_access_registry;
CREATE POLICY "registry_read_authenticated"
  ON public.playbook_access_registry FOR SELECT
  TO authenticated
  USING (true);

-- Only admins may write.
DROP POLICY IF EXISTS "registry_admin_write" ON public.playbook_access_registry;
CREATE POLICY "registry_admin_write"
  ON public.playbook_access_registry FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed registry (matches src/pages/members/Playbooks.tsx)
INSERT INTO public.playbook_access_registry (playbook_key, file_name, required_level, tier) VALUES
  ('opener',             'opener_system.pdf',             1, 'execution'),
  ('setter',             'setter_script.pdf',             2, 'execution'),
  ('call-review',        'call_review_system.pdf',        3, 'execution'),
  ('auszahlungspolitik', 'auszahlungspolitik_etc_v2.pdf', 3, 'execution'),
  ('closer',             'closer_system.pdf',             4, 'execution'),
  ('operator',           'operator_playbook.pdf',         5, 'execution'),
  ('execution',          'execution_playbook.pdf',        6, 'control'),
  ('governance',         'governance_playbook.pdf',       6, 'control')
ON CONFLICT (playbook_key) DO UPDATE
  SET file_name = EXCLUDED.file_name,
      required_level = EXCLUDED.required_level,
      tier = EXCLUDED.tier,
      updated_at = now();

-- 3. Stage → numeric level helper (mirrors STAGE_INDEX_ORDER in frontend)
CREATE OR REPLACE FUNCTION public.stage_to_level(_stage text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE COALESCE(_stage, 'opener')
    WHEN 'prospect'         THEN 0
    WHEN 'opener'           THEN 1
    WHEN 'setter'           THEN 2
    WHEN 'associate_setter' THEN 2
    WHEN 'senior_associate' THEN 3
    WHEN 'junior_manager'   THEN 4
    WHEN 'manager'          THEN 5
    WHEN 'senior_manager'   THEN 6
    WHEN 'director'         THEN 7
    WHEN 'partner'          THEN 8
    ELSE 1
  END;
$$;

-- 4. Authoritative access check used by edge function + storage RLS
CREATE OR REPLACE FUNCTION public.can_access_playbook_level(_user_id uuid, _required_level int)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _stage    text;
  _level    int;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admins always pass
  SELECT public.has_role(_user_id, 'admin') INTO _is_admin;
  IF _is_admin THEN RETURN true; END IF;

  SELECT business_stage INTO _stage
  FROM public.profiles
  WHERE id = _user_id
  LIMIT 1;

  _level := public.stage_to_level(_stage);
  RETURN _level >= _required_level;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_playbook_level(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_playbook_level(uuid, int) TO authenticated;

-- 5. Storage RLS for the 'playbooks' bucket
-- Only authenticated users whose stage meets the registry requirement may SELECT objects.
DROP POLICY IF EXISTS "playbooks_select_by_level" ON storage.objects;
CREATE POLICY "playbooks_select_by_level"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'playbooks'
    AND EXISTS (
      SELECT 1
      FROM public.playbook_access_registry r
      WHERE r.file_name = storage.objects.name
        AND public.can_access_playbook_level(auth.uid(), r.required_level)
    )
  );

-- Only admins may INSERT/UPDATE/DELETE in the bucket.
DROP POLICY IF EXISTS "playbooks_admin_write" ON storage.objects;
CREATE POLICY "playbooks_admin_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'playbooks' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'playbooks' AND public.has_role(auth.uid(), 'admin'));

-- 6. Audit log for download attempts (allowed + denied)
CREATE TABLE IF NOT EXISTS public.playbook_access_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  playbook_key  text NOT NULL,
  required_level int,
  user_level    int,
  result        text NOT NULL CHECK (result IN ('granted','denied','not_found','unauth')),
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.playbook_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "log_admin_read" ON public.playbook_access_log;
CREATE POLICY "log_admin_read"
  ON public.playbook_access_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Owner may read own entries
DROP POLICY IF EXISTS "log_owner_read" ON public.playbook_access_log;
CREATE POLICY "log_owner_read"
  ON public.playbook_access_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No client INSERT path; edge function uses service role.