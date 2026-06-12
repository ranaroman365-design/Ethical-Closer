-- 1. Extend registry with version pointer
ALTER TABLE public.playbook_access_registry
  ADD COLUMN IF NOT EXISTS current_version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_file_name text;

-- Backfill current_file_name from existing file_name
UPDATE public.playbook_access_registry
SET current_file_name = file_name
WHERE current_file_name IS NULL;

ALTER TABLE public.playbook_access_registry
  ALTER COLUMN current_file_name SET NOT NULL;

-- 2. Versions history table
CREATE TABLE IF NOT EXISTS public.playbook_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_key  text NOT NULL REFERENCES public.playbook_access_registry(playbook_key) ON DELETE CASCADE,
  version       int  NOT NULL CHECK (version >= 1),
  file_name     text NOT NULL,
  notes         text,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_current    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playbook_key, version),
  UNIQUE (file_name)
);

-- Only one current version per playbook (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS playbook_versions_one_current
  ON public.playbook_versions (playbook_key)
  WHERE is_current;

CREATE INDEX IF NOT EXISTS idx_playbook_versions_lookup
  ON public.playbook_versions (playbook_key, version DESC);

ALTER TABLE public.playbook_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "versions_read_authenticated" ON public.playbook_versions;
CREATE POLICY "versions_read_authenticated"
  ON public.playbook_versions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "versions_admin_write" ON public.playbook_versions;
CREATE POLICY "versions_admin_write"
  ON public.playbook_versions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Backfill v1 for every existing playbook
INSERT INTO public.playbook_versions (playbook_key, version, file_name, is_current, notes)
SELECT r.playbook_key, 1, r.current_file_name, true, 'Initial version (auto-seeded)'
FROM public.playbook_access_registry r
ON CONFLICT (playbook_key, version) DO NOTHING;

-- 4. Trigger: when a version is marked current, demote siblings AND sync registry pointer.
CREATE OR REPLACE FUNCTION public.sync_playbook_current_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_current THEN
    -- Demote previous current
    UPDATE public.playbook_versions
       SET is_current = false
     WHERE playbook_key = NEW.playbook_key
       AND id <> NEW.id
       AND is_current = true;

    -- Sync registry pointer
    UPDATE public.playbook_access_registry
       SET current_version   = NEW.version,
           current_file_name = NEW.file_name,
           file_name         = NEW.file_name,  -- keep legacy column in sync
           updated_at        = now()
     WHERE playbook_key = NEW.playbook_key;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_playbook_current_version ON public.playbook_versions;
CREATE TRIGGER trg_sync_playbook_current_version
  AFTER INSERT OR UPDATE OF is_current ON public.playbook_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_playbook_current_version();

-- 5. Replace storage RLS: allow ANY historical version file (not just current).
DROP POLICY IF EXISTS "playbooks_select_by_level" ON storage.objects;
CREATE POLICY "playbooks_select_by_level"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'playbooks'
    AND EXISTS (
      SELECT 1
      FROM public.playbook_versions v
      JOIN public.playbook_access_registry r
        ON r.playbook_key = v.playbook_key
      WHERE v.file_name = storage.objects.name
        AND public.can_access_playbook_level(auth.uid(), r.required_level)
    )
  );

-- 6. Helper RPC: register a newly uploaded version (admin only).
-- Auto-increments version, marks as current. Returns new version row id.
CREATE OR REPLACE FUNCTION public.register_playbook_version(
  _playbook_key text,
  _file_name    text,
  _notes        text DEFAULT NULL,
  _make_current boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next_version int;
  _new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.playbook_access_registry WHERE playbook_key = _playbook_key
  ) THEN
    RAISE EXCEPTION 'unknown playbook_key: %', _playbook_key;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO _next_version
    FROM public.playbook_versions
   WHERE playbook_key = _playbook_key;

  INSERT INTO public.playbook_versions (playbook_key, version, file_name, notes, uploaded_by, is_current)
  VALUES (_playbook_key, _next_version, _file_name, _notes, auth.uid(), _make_current)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_playbook_version(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_playbook_version(text, text, text, boolean) TO authenticated;