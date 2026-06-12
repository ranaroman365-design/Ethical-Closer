-- =========================================================================
-- FUNNEL SOURCE + TRAFFIC OWNER ASSIGNMENT SYSTEM
-- =========================================================================
-- Adds a strict, immutable funnel_source on every lead + an optional
-- traffic_owner that must reference an L6 user. Introduces a mapping
-- table so utm_campaign patterns can resolve to L6 owners.
-- =========================================================================

-- 1. Allowed funnel sources -------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.funnel_source_t AS ENUM (
    'apply_direct',
    'qualify_filter',
    'high_income_angle',
    'external_inbound'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add column (nullable initially so we can backfill) --------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS funnel_source public.funnel_source_t,
  ADD COLUMN IF NOT EXISTS traffic_owner uuid;

-- 3. Backfill from source_funnel + lead_origins.landing_url -----------------
-- Heuristic ladder: explicit source_funnel → landing path → external_inbound
WITH origin_path AS (
  SELECT lo.lead_id,
         CASE
           WHEN lo.landing_url ILIKE '%/apply%'              THEN 'apply_direct'::public.funnel_source_t
           WHEN lo.landing_url ILIKE '%/qualify%'            THEN 'qualify_filter'::public.funnel_source_t
           WHEN lo.landing_url ILIKE '%/high-income-skill%' THEN 'high_income_angle'::public.funnel_source_t
           ELSE NULL
         END AS fs
  FROM public.lead_origins lo
)
UPDATE public.leads l
SET funnel_source = COALESCE(
  CASE lower(coalesce(l.source_funnel,''))
    WHEN 'apply'             THEN 'apply_direct'::public.funnel_source_t
    WHEN 'apply_direct'      THEN 'apply_direct'::public.funnel_source_t
    WHEN 'qualify'           THEN 'qualify_filter'::public.funnel_source_t
    WHEN 'qualify_filter'    THEN 'qualify_filter'::public.funnel_source_t
    WHEN 'high_income'       THEN 'high_income_angle'::public.funnel_source_t
    WHEN 'high_income_skill' THEN 'high_income_angle'::public.funnel_source_t
    WHEN 'high_income_angle' THEN 'high_income_angle'::public.funnel_source_t
    ELSE NULL
  END,
  op.fs,
  'external_inbound'::public.funnel_source_t
)
FROM origin_path op
WHERE op.lead_id = l.id AND l.funnel_source IS NULL;

-- Catch any leads without an origin row.
UPDATE public.leads
SET funnel_source = 'external_inbound'::public.funnel_source_t
WHERE funnel_source IS NULL;

-- 4. Enforce NOT NULL + immutability ---------------------------------------
ALTER TABLE public.leads
  ALTER COLUMN funnel_source SET NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_funnel_source_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.funnel_source IS NOT NULL
     AND NEW.funnel_source IS DISTINCT FROM OLD.funnel_source THEN
    RAISE EXCEPTION
      'funnel_source is immutable (lead %, % → %)',
      OLD.id, OLD.funnel_source, NEW.funnel_source
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_funnel_source_immutable ON public.leads;
CREATE TRIGGER trg_leads_funnel_source_immutable
  BEFORE UPDATE OF funnel_source ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_funnel_source_immutable();

CREATE INDEX IF NOT EXISTS idx_leads_funnel_source
  ON public.leads (funnel_source);
CREATE INDEX IF NOT EXISTS idx_leads_traffic_owner
  ON public.leads (traffic_owner) WHERE traffic_owner IS NOT NULL;

-- 5. traffic_owner must be an L6 user --------------------------------------
CREATE OR REPLACE FUNCTION public.validate_traffic_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF NEW.traffic_owner IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = NEW.traffic_owner
  ORDER BY (role::text = 'L6') DESC
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'traffic_owner % does not reference a known user', NEW.traffic_owner
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_role <> 'L6' AND v_role <> 'admin' AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'traffic_owner % is not an L6 user (role=%)', NEW.traffic_owner, v_role
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_validate_traffic_owner ON public.leads;
CREATE TRIGGER trg_leads_validate_traffic_owner
  BEFORE INSERT OR UPDATE OF traffic_owner ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_traffic_owner();

-- 6. UTM-campaign → L6 owner mapping table ---------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_owner_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utm_campaign    text NOT NULL,
  utm_source      text,
  owner_user_id   uuid NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  CONSTRAINT uq_traffic_owner_mapping UNIQUE (utm_campaign, utm_source)
);

CREATE INDEX IF NOT EXISTS idx_traffic_owner_mappings_active
  ON public.traffic_owner_mappings (utm_campaign) WHERE is_active;

ALTER TABLE public.traffic_owner_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "traffic_owner_mappings_admin_all"
  ON public.traffic_owner_mappings;
CREATE POLICY "traffic_owner_mappings_admin_all"
  ON public.traffic_owner_mappings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'owner'::public.app_role));

DROP POLICY IF EXISTS "traffic_owner_mappings_authenticated_read"
  ON public.traffic_owner_mappings;
CREATE POLICY "traffic_owner_mappings_authenticated_read"
  ON public.traffic_owner_mappings
  FOR SELECT
  TO authenticated
  USING (is_active);

-- 7. Resolver RPC (SECURITY DEFINER, callable from client) ------------------
CREATE OR REPLACE FUNCTION public.resolve_traffic_owner(
  p_utm_campaign text,
  p_utm_source   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_user_id
  FROM public.traffic_owner_mappings
  WHERE is_active
    AND utm_campaign = p_utm_campaign
    AND (utm_source IS NULL OR utm_source = p_utm_source)
  ORDER BY (utm_source = p_utm_source) DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_traffic_owner(text, text) TO anon, authenticated;

-- 8. Update upsert_funnel_lead to take + enforce funnel_source --------------
CREATE OR REPLACE FUNCTION public.upsert_funnel_lead(
  p_name           text,
  p_email          text,
  p_phone          text DEFAULT NULL,
  p_funnel_source  text DEFAULT 'lifestyle',
  p_quiz_answers   jsonb DEFAULT NULL,
  p_session_id     text DEFAULT NULL,
  p_traffic_owner  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id   uuid;
  v_fs        public.funnel_source_t;
BEGIN
  -- Map legacy/alias values onto the strict enum. Reject anything else.
  v_fs := CASE lower(coalesce(p_funnel_source, ''))
    WHEN 'apply'             THEN 'apply_direct'::public.funnel_source_t
    WHEN 'apply_direct'      THEN 'apply_direct'::public.funnel_source_t
    WHEN 'qualify'           THEN 'qualify_filter'::public.funnel_source_t
    WHEN 'qualify_filter'    THEN 'qualify_filter'::public.funnel_source_t
    WHEN 'high_income'       THEN 'high_income_angle'::public.funnel_source_t
    WHEN 'high_income_skill' THEN 'high_income_angle'::public.funnel_source_t
    WHEN 'high_income_angle' THEN 'high_income_angle'::public.funnel_source_t
    WHEN 'external'          THEN 'external_inbound'::public.funnel_source_t
    WHEN 'external_inbound'  THEN 'external_inbound'::public.funnel_source_t
    -- Backwards compat for already-shipped client value:
    WHEN 'lifestyle'         THEN 'apply_direct'::public.funnel_source_t
    ELSE NULL
  END;

  IF v_fs IS NULL THEN
    RAISE EXCEPTION 'invalid funnel_source: %', p_funnel_source
      USING ERRCODE = 'check_violation';
  END IF;

  -- Find existing lead by email (case-insensitive) to keep idempotent.
  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE lower(email) = lower(p_email)
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    INSERT INTO public.leads (
      name, email, phone, source, source_funnel,
      funnel_source, traffic_owner, quiz_answers
    ) VALUES (
      p_name, p_email, p_phone, 'funnel', p_funnel_source,
      v_fs, p_traffic_owner, p_quiz_answers
    )
    RETURNING id INTO v_lead_id;
  ELSE
    -- funnel_source is IMMUTABLE — only fill traffic_owner if still empty.
    UPDATE public.leads
    SET name          = COALESCE(NULLIF(p_name, ''), name),
        phone         = COALESCE(NULLIF(p_phone, ''), phone),
        quiz_answers  = COALESCE(p_quiz_answers, quiz_answers),
        traffic_owner = COALESCE(traffic_owner, p_traffic_owner),
        updated_at    = now()
    WHERE id = v_lead_id;
  END IF;

  -- Close the anonymous attribution session → lead link if provided.
  IF p_session_id IS NOT NULL AND p_session_id <> '' THEN
    BEGIN
      PERFORM public.link_lead_attribution(p_session_id, v_lead_id);
    EXCEPTION WHEN OTHERS THEN
      -- never fail the upsert because of attribution linking
      NULL;
    END;
  END IF;

  RETURN v_lead_id;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_funnel_lead(
  text, text, text, text, jsonb, text, uuid
) TO anon, authenticated;
