
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- =========================================================
-- 1) Magic tokens for playbook downloads via email
-- =========================================================
CREATE TABLE IF NOT EXISTS public.playbook_magic_tokens (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  playbook_key  TEXT NOT NULL,
  version       INT,
  recipient_email TEXT NOT NULL,
  user_id       UUID,
  lead_id       UUID,
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  used_at       TIMESTAMPTZ,
  used_ip       TEXT,
  used_user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_pmt_token ON public.playbook_magic_tokens (token);
CREATE INDEX IF NOT EXISTS idx_pmt_email ON public.playbook_magic_tokens (recipient_email);
CREATE INDEX IF NOT EXISTS idx_pmt_expires ON public.playbook_magic_tokens (expires_at);

ALTER TABLE public.playbook_magic_tokens ENABLE ROW LEVEL SECURITY;

-- Only admins can read; nothing else (service role bypasses RLS)
DROP POLICY IF EXISTS "Admins read magic tokens" ON public.playbook_magic_tokens;
CREATE POLICY "Admins read magic tokens"
ON public.playbook_magic_tokens
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 2) Promotion outbox (L3 reached → email queue feed)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.playbook_promotion_outbox (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL,
  playbook_key TEXT NOT NULL,
  trigger_level INT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed | skipped
  enqueued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ,
  error_message TEXT,
  UNIQUE (user_id, playbook_key, trigger_level)
);

ALTER TABLE public.playbook_promotion_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read promo outbox" ON public.playbook_promotion_outbox;
CREATE POLICY "Admins read promo outbox"
ON public.playbook_promotion_outbox
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 3) Token creation (admin / service only)
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_playbook_magic_token(
  _playbook_key TEXT,
  _recipient_email TEXT,
  _user_id UUID DEFAULT NULL,
  _lead_id UUID DEFAULT NULL,
  _version INT DEFAULT NULL,
  _source TEXT DEFAULT 'manual',
  _ttl_hours INT DEFAULT 24
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Allow only admins or service_role (auth.uid() is null for service)
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Verify playbook exists
  IF NOT EXISTS (
    SELECT 1 FROM public.playbook_access_registry WHERE playbook_key = _playbook_key
  ) THEN
    RAISE EXCEPTION 'playbook_not_found: %', _playbook_key;
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.playbook_magic_tokens (
    token, playbook_key, version, recipient_email, user_id, lead_id, source, expires_at
  ) VALUES (
    v_token, _playbook_key, _version, lower(_recipient_email), _user_id, _lead_id, _source,
    now() + make_interval(hours => GREATEST(1, _ttl_hours))
  );

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_playbook_magic_token(TEXT, TEXT, UUID, UUID, INT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_playbook_magic_token(TEXT, TEXT, UUID, UUID, INT, TEXT, INT) TO authenticated, service_role;

-- =========================================================
-- 4) Token redemption (service-only — used by public edge fn)
-- =========================================================
CREATE OR REPLACE FUNCTION public.redeem_playbook_magic_token(
  _token TEXT,
  _ip TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  playbook_key TEXT,
  required_level INT,
  resolved_file_name TEXT,
  resolved_version INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.playbook_magic_tokens%ROWTYPE;
  v_reg RECORD;
  v_file TEXT;
  v_ver  INT;
BEGIN
  SELECT * INTO v_row FROM public.playbook_magic_tokens
  WHERE token = _token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalid';
  END IF;

  IF v_row.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'token_used';
  END IF;

  IF v_row.expires_at < now() THEN
    RAISE EXCEPTION 'token_expired';
  END IF;

  SELECT current_file_name, required_level
    INTO v_reg
  FROM public.playbook_access_registry
  WHERE playbook_key = v_row.playbook_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'playbook_not_found';
  END IF;

  IF v_row.version IS NOT NULL THEN
    SELECT file_name, version INTO v_file, v_ver
    FROM public.playbook_versions
    WHERE playbook_key = v_row.playbook_key AND version = v_row.version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'version_not_found';
    END IF;
  ELSE
    v_file := v_reg.current_file_name;
    SELECT version INTO v_ver FROM public.playbook_versions
    WHERE playbook_key = v_row.playbook_key AND is_current = true;
  END IF;

  UPDATE public.playbook_magic_tokens
  SET used_at = now(), used_ip = _ip, used_user_agent = _user_agent
  WHERE id = v_row.id;

  -- Audit (best-effort) — reuse existing log table
  BEGIN
    INSERT INTO public.playbook_access_log (
      user_id, playbook_key, result, required_level, user_level, ip, user_agent
    ) VALUES (
      v_row.user_id, v_row.playbook_key, 'granted', v_reg.required_level, NULL, _ip, _user_agent
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN QUERY SELECT v_row.playbook_key, v_reg.required_level, v_file, v_ver;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_playbook_magic_token(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_playbook_magic_token(TEXT, TEXT, TEXT) TO service_role;

-- =========================================================
-- 5) Trigger: enqueue promotion email when L3 (setter) reached
-- =========================================================
CREATE OR REPLACE FUNCTION public.enqueue_playbook_promotion_l3()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_level INT;
  v_new_level INT;
BEGIN
  v_old_level := COALESCE(public.stage_to_level(OLD.business_stage), 0);
  v_new_level := COALESCE(public.stage_to_level(NEW.business_stage), 0);

  -- Only fire on actual upward crossing into L3+
  IF v_new_level >= 3 AND v_old_level < 3 THEN
    INSERT INTO public.playbook_promotion_outbox (user_id, playbook_key, trigger_level)
    VALUES (NEW.id, 'auszahlungspolitik', 3)
    ON CONFLICT (user_id, playbook_key, trigger_level) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_playbook_promotion_l3 ON public.profiles;
CREATE TRIGGER trg_enqueue_playbook_promotion_l3
AFTER UPDATE OF business_stage ON public.profiles
FOR EACH ROW
WHEN (OLD.business_stage IS DISTINCT FROM NEW.business_stage)
EXECUTE FUNCTION public.enqueue_playbook_promotion_l3();
