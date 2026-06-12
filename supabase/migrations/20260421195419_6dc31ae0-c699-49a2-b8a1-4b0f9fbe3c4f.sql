-- ============================================
-- 1. RAW WEBHOOK EVENTS (audit / debugging)
-- ============================================
CREATE TABLE IF NOT EXISTS public.raw_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'ghl',
  event_name text,
  payload jsonb NOT NULL,
  mapped boolean NOT NULL DEFAULT false,
  mapped_event_type text,
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_webhook_events_received_at
  ON public.raw_webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_webhook_events_mapped
  ON public.raw_webhook_events (mapped, received_at DESC);

ALTER TABLE public.raw_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "raw_webhook_events_admin_read" ON public.raw_webhook_events;
CREATE POLICY "raw_webhook_events_admin_read"
  ON public.raw_webhook_events FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
  );

-- ============================================
-- 2. COMMUNITY ONBOARDING STATE
-- ============================================
CREATE TABLE IF NOT EXISTS public.community_onboarding_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  first_login_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_onboarding_user
  ON public.community_onboarding_state (user_id);

ALTER TABLE public.community_onboarding_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_self_read" ON public.community_onboarding_state;
CREATE POLICY "onboarding_self_read"
  ON public.community_onboarding_state FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "onboarding_self_insert" ON public.community_onboarding_state;
CREATE POLICY "onboarding_self_insert"
  ON public.community_onboarding_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "onboarding_self_update" ON public.community_onboarding_state;
CREATE POLICY "onboarding_self_update"
  ON public.community_onboarding_state FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. FUNNEL_EVENTS_V2 HARDENING (SoT)
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'funnel_events_v2') THEN

    -- add dedup + source_system if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='funnel_events_v2'
                     AND column_name='dedup_key') THEN
      ALTER TABLE public.funnel_events_v2 ADD COLUMN dedup_key text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='funnel_events_v2'
                     AND column_name='source_system') THEN
      ALTER TABLE public.funnel_events_v2 ADD COLUMN source_system text DEFAULT 'internal';
    END IF;

    -- Partial UNIQUE index: only enforce when dedup_key is present.
    -- This is migration-safe: existing rows without dedup_key are unaffected.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_funnel_events_v2_dedup
      ON public.funnel_events_v2 (dedup_key)
      WHERE dedup_key IS NOT NULL;
  END IF;
END $$;

-- ============================================
-- 4. IDEMPOTENT INGEST RPC (used by Edge Function)
-- ============================================
CREATE OR REPLACE FUNCTION public.ingest_funnel_event(
  _lead_id uuid,
  _event_type text,
  _dedup_key text,
  _source_system text DEFAULT 'ghl',
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(inserted boolean, event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id uuid;
  _new_id uuid;
BEGIN
  -- Short-circuit on duplicate
  IF _dedup_key IS NOT NULL THEN
    SELECT id INTO _existing_id
    FROM public.funnel_events_v2
    WHERE dedup_key = _dedup_key
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT false, _existing_id;
      RETURN;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.funnel_events_v2 (lead_id, event_type, dedup_key, source_system, payload)
    VALUES (_lead_id, _event_type, _dedup_key, _source_system, _payload)
    RETURNING id INTO _new_id;

    RETURN QUERY SELECT true, _new_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO _existing_id
    FROM public.funnel_events_v2
    WHERE dedup_key = _dedup_key
    LIMIT 1;
    RETURN QUERY SELECT false, _existing_id;
  END;
END;
$$;

-- ============================================
-- 5. DATA INTEGRITY STRIP (Trust Layer)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_data_integrity_strip()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last_event timestamptz;
  _last_webhook timestamptz;
  _total_24h int;
  _mapped_24h int;
  _unmapped_24h int;
  _dupes_prevented int;
BEGIN
  -- gate to L6+ / admin
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.user_has_min_level(auth.uid(), 6)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT MAX(occurred_at) INTO _last_event FROM public.funnel_events_v2;

  SELECT MAX(received_at),
         COUNT(*) FILTER (WHERE received_at > now() - interval '24 hours'),
         COUNT(*) FILTER (WHERE mapped = true  AND received_at > now() - interval '24 hours'),
         COUNT(*) FILTER (WHERE mapped = false AND received_at > now() - interval '24 hours')
    INTO _last_webhook, _total_24h, _mapped_24h, _unmapped_24h
  FROM public.raw_webhook_events;

  -- duplicates prevented = raw mapped events that did not produce a new funnel row
  SELECT COUNT(*) INTO _dupes_prevented
  FROM public.raw_webhook_events r
  WHERE r.mapped = true
    AND r.received_at > now() - interval '24 hours'
    AND (r.payload->>'duplicate')::boolean IS TRUE;

  RETURN jsonb_build_object(
    'last_event_at',        _last_event,
    'last_webhook_at',      _last_webhook,
    'events_24h',           COALESCE(_total_24h, 0),
    'mapped_24h',           COALESCE(_mapped_24h, 0),
    'unmapped_24h',         COALESCE(_unmapped_24h, 0),
    'mapped_pct',           CASE WHEN COALESCE(_total_24h,0) = 0 THEN NULL
                                 ELSE ROUND((_mapped_24h::numeric / _total_24h) * 100, 1) END,
    'duplicates_prevented', COALESCE(_dupes_prevented, 0),
    'webhook_health',       CASE
                              WHEN _last_webhook IS NULL THEN 'no_data'
                              WHEN _last_webhook > now() - interval '1 hour'  THEN 'healthy'
                              WHEN _last_webhook > now() - interval '24 hours' THEN 'degraded'
                              ELSE 'stale'
                            END
  );
END;
$$;

-- ============================================
-- 6. user_has_min_level fallback (only if missing)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_has_min_level'
  ) THEN
    CREATE OR REPLACE FUNCTION public.user_has_min_level(_user_id uuid, _min_level int)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
      SELECT COALESCE(
        (SELECT current_level >= _min_level
           FROM public.user_level_status
          WHERE user_id = _user_id
          LIMIT 1),
        false
      );
    $fn$;
  END IF;
END $$;