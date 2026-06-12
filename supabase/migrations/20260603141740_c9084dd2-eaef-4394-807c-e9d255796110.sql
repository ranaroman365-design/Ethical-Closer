
-- ════════════════════════════════════════════════════════════════════════════
-- Bug B fix v2: ab_slots attribution >95% coverage (additive only)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ab_identity_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_funnel_id text,
  session_id       text,
  lead_id          uuid,
  email            text,
  email_hash       text,
  phone            text,
  phone_hash       text,
  fbp              text,
  fbc              text,
  fbclid           text,
  attribution_source text,
  ab_slots         text NOT NULL,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ab_identity_map TO anon;
GRANT SELECT, INSERT, UPDATE ON public.ab_identity_map TO authenticated;
GRANT ALL ON public.ab_identity_map TO service_role;

ALTER TABLE public.ab_identity_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ab_identity_map_read_all" ON public.ab_identity_map;
CREATE POLICY "ab_identity_map_read_all"
  ON public.ab_identity_map FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ab_identity_map_write_service" ON public.ab_identity_map;
CREATE POLICY "ab_identity_map_write_service"
  ON public.ab_identity_map FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ab_identity_mfi ON public.ab_identity_map(master_funnel_id) WHERE master_funnel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ab_identity_session ON public.ab_identity_map(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ab_identity_lead    ON public.ab_identity_map(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ab_identity_email   ON public.ab_identity_map(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ab_identity_phone   ON public.ab_identity_map(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ab_identity_fbp     ON public.ab_identity_map(fbp) WHERE fbp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ab_identity_fbc     ON public.ab_identity_map(fbc) WHERE fbc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ab_identity_fbclid  ON public.ab_identity_map(fbclid) WHERE fbclid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_logs_ab_lead    ON public.event_logs ((payload->>'lead_id'),          created_at DESC) WHERE (payload->>'ab_slots') IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_logs_ab_session ON public.event_logs ((payload->>'session_id'),       created_at DESC) WHERE (payload->>'ab_slots') IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_logs_ab_mfi     ON public.event_logs ((payload->>'master_funnel_id'), created_at DESC) WHERE (payload->>'ab_slots') IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_logs_ab_email   ON public.event_logs (email,                          created_at DESC) WHERE (payload->>'ab_slots') IS NOT NULL AND email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_logs_ab_phone   ON public.event_logs ((payload->>'phone'),            created_at DESC) WHERE (payload->>'ab_slots') IS NOT NULL;

-- ─── AFTER INSERT: sync identity map from any event with ab_slots ─────────
CREATE OR REPLACE FUNCTION public.sync_ab_identity_map()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ab text := NULLIF(NEW.payload->>'ab_slots','');
  v_mfi text := NULLIF(NEW.payload->>'master_funnel_id','');
  v_sid text := NULLIF(NEW.payload->>'session_id','');
  v_lead text := NULLIF(NEW.payload->>'lead_id','');
  v_email text := lower(COALESCE(NULLIF(NEW.email,''), NULLIF(NEW.payload->>'email','')));
  v_phone text := NULLIF(NEW.payload->>'phone','');
  v_fbp  text := NULLIF(NEW.payload->>'fbp','');
  v_fbc  text := NULLIF(NEW.payload->>'fbc','');
  v_fbclid text := NULLIF(NEW.payload->>'fbclid','');
  v_src text := NULLIF(NEW.payload->>'attribution_source','');
  v_lead_uuid uuid;
BEGIN
  IF v_ab IS NULL THEN RETURN NEW; END IF;
  IF v_mfi IS NULL AND v_sid IS NULL AND v_lead IS NULL AND v_email IS NULL
     AND v_phone IS NULL AND v_fbp IS NULL AND v_fbc IS NULL AND v_fbclid IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN v_lead_uuid := v_lead::uuid; EXCEPTION WHEN OTHERS THEN v_lead_uuid := NULL; END;

  IF v_mfi IS NOT NULL THEN
    INSERT INTO public.ab_identity_map AS m
      (master_funnel_id, session_id, lead_id, email, phone, fbp, fbc, fbclid, attribution_source, ab_slots)
    VALUES (v_mfi, v_sid, v_lead_uuid, v_email, v_phone, v_fbp, v_fbc, v_fbclid, v_src, v_ab)
    ON CONFLICT (master_funnel_id) WHERE master_funnel_id IS NOT NULL DO UPDATE SET
      session_id = COALESCE(EXCLUDED.session_id, m.session_id),
      lead_id    = COALESCE(EXCLUDED.lead_id,    m.lead_id),
      email      = COALESCE(EXCLUDED.email,      m.email),
      phone      = COALESCE(EXCLUDED.phone,      m.phone),
      fbp        = COALESCE(EXCLUDED.fbp,        m.fbp),
      fbc        = COALESCE(EXCLUDED.fbc,        m.fbc),
      fbclid     = COALESCE(EXCLUDED.fbclid,     m.fbclid),
      attribution_source = COALESCE(EXCLUDED.attribution_source, m.attribution_source),
      ab_slots   = EXCLUDED.ab_slots,
      last_seen_at = now(),
      updated_at   = now();
  ELSE
    INSERT INTO public.ab_identity_map
      (master_funnel_id, session_id, lead_id, email, phone, fbp, fbc, fbclid, attribution_source, ab_slots)
    VALUES (NULL, v_sid, v_lead_uuid, v_email, v_phone, v_fbp, v_fbc, v_fbclid, v_src, v_ab);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_ab_identity_map ON public.event_logs;
CREATE TRIGGER trg_sync_ab_identity_map
  AFTER INSERT ON public.event_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_ab_identity_map();

-- ─── BEFORE INSERT: robust multi-key backfill ─────────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_event_ab_slots()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_canonical text[] := ARRAY[
    'quiz_started','quiz_completed','quiz_completed_men','quiz_completed_women',
    'lead_capture_submitted','application_submitted','qualified','not_qualified',
    'high_quality_lead','booking_created','booking_completed',
    'appointment_showed','showup','booking_attended',
    'MASTER_QUIZ_STARTED','MASTER_QUIZ_COMPLETED',
    'APPLY_QUIZ_STARTED','APPLY_QUIZ_COMPLETED'
  ];
  v_existing text;
  v_mfi text; v_email text; v_session text; v_lead text; v_phone text;
  v_fbp text; v_fbc text; v_fbclid text;
  v_lead_uuid uuid;
  v_found_ab text; v_found_mfi text;
  v_match_key text; v_confidence numeric; v_missing_reason text;
BEGIN
  IF NEW.event_name IS NULL OR NOT (NEW.event_name = ANY(v_canonical)) THEN RETURN NEW; END IF;
  v_existing := NULLIF(NEW.payload->>'ab_slots','');
  IF v_existing IS NOT NULL THEN RETURN NEW; END IF;

  v_mfi     := NULLIF(NEW.payload->>'master_funnel_id','');
  v_session := NULLIF(NEW.payload->>'session_id','');
  v_lead    := NULLIF(NEW.payload->>'lead_id','');
  v_email   := lower(COALESCE(NULLIF(NEW.email,''), NULLIF(NEW.payload->>'email','')));
  v_phone   := NULLIF(NEW.payload->>'phone','');
  v_fbp     := NULLIF(NEW.payload->>'fbp','');
  v_fbc     := NULLIF(NEW.payload->>'fbc','');
  v_fbclid  := NULLIF(NEW.payload->>'fbclid','');

  BEGIN v_lead_uuid := v_lead::uuid; EXCEPTION WHEN OTHERS THEN v_lead_uuid := NULL; END;

  IF v_email IS NULL AND v_lead_uuid IS NOT NULL THEN
    SELECT lower(email), COALESCE(v_phone, phone) INTO v_email, v_phone
    FROM public.leads WHERE id = v_lead_uuid LIMIT 1;
  END IF;

  IF v_mfi IS NULL AND v_session IS NULL AND v_lead_uuid IS NULL
     AND v_email IS NULL AND v_phone IS NULL
     AND v_fbp IS NULL AND v_fbc IS NULL AND v_fbclid IS NULL THEN
    NEW.payload := NEW.payload || jsonb_build_object('ab_slots_missing_reason','missing_identifiers');
    RETURN NEW;
  END IF;

  IF v_found_ab IS NULL AND v_mfi IS NOT NULL THEN
    SELECT ab_slots, master_funnel_id INTO v_found_ab, v_found_mfi FROM public.ab_identity_map
    WHERE master_funnel_id = v_mfi ORDER BY last_seen_at DESC LIMIT 1;
    IF v_found_ab IS NOT NULL THEN v_match_key := 'master_funnel_id'; v_confidence := 1.0; END IF;
  END IF;
  IF v_found_ab IS NULL AND v_session IS NOT NULL THEN
    SELECT ab_slots, master_funnel_id INTO v_found_ab, v_found_mfi FROM public.ab_identity_map
    WHERE session_id = v_session ORDER BY last_seen_at DESC LIMIT 1;
    IF v_found_ab IS NOT NULL THEN v_match_key := 'session_id'; v_confidence := 0.95; END IF;
  END IF;
  IF v_found_ab IS NULL AND v_lead_uuid IS NOT NULL THEN
    SELECT ab_slots, master_funnel_id INTO v_found_ab, v_found_mfi FROM public.ab_identity_map
    WHERE lead_id = v_lead_uuid ORDER BY last_seen_at DESC LIMIT 1;
    IF v_found_ab IS NOT NULL THEN v_match_key := 'lead_id'; v_confidence := 0.9; END IF;
  END IF;
  IF v_found_ab IS NULL AND v_email IS NOT NULL THEN
    SELECT ab_slots, master_funnel_id INTO v_found_ab, v_found_mfi FROM public.ab_identity_map
    WHERE email = v_email ORDER BY last_seen_at DESC LIMIT 1;
    IF v_found_ab IS NOT NULL THEN v_match_key := 'email'; v_confidence := 0.85; END IF;
  END IF;
  IF v_found_ab IS NULL AND v_phone IS NOT NULL THEN
    SELECT ab_slots, master_funnel_id INTO v_found_ab, v_found_mfi FROM public.ab_identity_map
    WHERE phone = v_phone ORDER BY last_seen_at DESC LIMIT 1;
    IF v_found_ab IS NOT NULL THEN v_match_key := 'phone'; v_confidence := 0.8; END IF;
  END IF;
  IF v_found_ab IS NULL AND (v_fbp IS NOT NULL OR v_fbc IS NOT NULL OR v_fbclid IS NOT NULL) THEN
    SELECT ab_slots, master_funnel_id INTO v_found_ab, v_found_mfi FROM public.ab_identity_map
    WHERE (v_fbp IS NOT NULL AND fbp = v_fbp)
       OR (v_fbc IS NOT NULL AND fbc = v_fbc)
       OR (v_fbclid IS NOT NULL AND fbclid = v_fbclid)
    ORDER BY last_seen_at DESC LIMIT 1;
    IF v_found_ab IS NOT NULL THEN v_match_key := 'meta_id'; v_confidence := 0.7; END IF;
  END IF;

  IF v_found_ab IS NULL THEN
    SELECT NULLIF(payload->>'ab_slots',''), NULLIF(payload->>'master_funnel_id','')
      INTO v_found_ab, v_found_mfi
    FROM public.event_logs
    WHERE created_at >= now() - interval '60 days'
      AND NULLIF(payload->>'ab_slots','') IS NOT NULL
      AND (
            (v_mfi     IS NOT NULL AND payload->>'master_funnel_id' = v_mfi)
         OR (v_session IS NOT NULL AND payload->>'session_id'       = v_session)
         OR (v_lead   IS NOT NULL AND payload->>'lead_id'           = v_lead)
         OR (v_email  IS NOT NULL AND lower(email)                  = v_email)
         OR (v_phone  IS NOT NULL AND payload->>'phone'             = v_phone)
      )
    ORDER BY created_at DESC LIMIT 1;
    IF v_found_ab IS NOT NULL THEN v_match_key := COALESCE(v_match_key,'event_log_scan'); v_confidence := 0.6; END IF;
  END IF;

  IF v_found_ab IS NOT NULL THEN
    NEW.payload := NEW.payload || jsonb_build_object(
      'ab_slots', v_found_ab,
      'ab_slots_source', 'server_backfill',
      'ab_slots_match_key', v_match_key,
      'ab_slots_match_confidence', v_confidence
    );
    IF v_mfi IS NULL AND v_found_mfi IS NOT NULL THEN
      NEW.payload := NEW.payload || jsonb_build_object('master_funnel_id', v_found_mfi);
    END IF;
  ELSE
    v_missing_reason := 'no_identity_match';
    NEW.payload := NEW.payload || jsonb_build_object('ab_slots_missing_reason', v_missing_reason);
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_backfill_event_ab_slots ON public.event_logs;
CREATE TRIGGER trg_backfill_event_ab_slots
  BEFORE INSERT ON public.event_logs
  FOR EACH ROW EXECUTE FUNCTION public.backfill_event_ab_slots();

-- ─── One-shot identity map backfill (deduped) ─────────────────────────────
INSERT INTO public.ab_identity_map
  (master_funnel_id, session_id, lead_id, email, phone, fbp, fbc, fbclid, attribution_source, ab_slots, first_seen_at, last_seen_at)
SELECT DISTINCT ON (NULLIF(payload->>'master_funnel_id',''))
  NULLIF(payload->>'master_funnel_id',''),
  NULLIF(payload->>'session_id',''),
  CASE WHEN (payload->>'lead_id') ~ '^[0-9a-fA-F-]{36}$' THEN (payload->>'lead_id')::uuid END,
  lower(COALESCE(NULLIF(email,''), NULLIF(payload->>'email',''))),
  NULLIF(payload->>'phone',''),
  NULLIF(payload->>'fbp',''),
  NULLIF(payload->>'fbc',''),
  NULLIF(payload->>'fbclid',''),
  NULLIF(payload->>'attribution_source',''),
  payload->>'ab_slots',
  created_at, created_at
FROM public.event_logs
WHERE created_at >= now() - interval '30 days'
  AND NULLIF(payload->>'ab_slots','') IS NOT NULL
  AND NULLIF(payload->>'master_funnel_id','') IS NOT NULL
ORDER BY NULLIF(payload->>'master_funnel_id',''), created_at DESC
ON CONFLICT (master_funnel_id) WHERE master_funnel_id IS NOT NULL DO UPDATE SET
  session_id = COALESCE(EXCLUDED.session_id, ab_identity_map.session_id),
  lead_id    = COALESCE(EXCLUDED.lead_id,    ab_identity_map.lead_id),
  email      = COALESCE(EXCLUDED.email,      ab_identity_map.email),
  phone      = COALESCE(EXCLUDED.phone,      ab_identity_map.phone),
  ab_slots   = EXCLUDED.ab_slots,
  last_seen_at = GREATEST(EXCLUDED.last_seen_at, ab_identity_map.last_seen_at),
  updated_at   = now();

INSERT INTO public.ab_identity_map
  (master_funnel_id, session_id, lead_id, email, phone, fbp, fbc, fbclid, attribution_source, ab_slots, first_seen_at, last_seen_at)
SELECT DISTINCT ON (COALESCE(NULLIF(payload->>'session_id',''), lower(COALESCE(NULLIF(email,''), NULLIF(payload->>'email','')))))
  NULL,
  NULLIF(payload->>'session_id',''),
  CASE WHEN (payload->>'lead_id') ~ '^[0-9a-fA-F-]{36}$' THEN (payload->>'lead_id')::uuid END,
  lower(COALESCE(NULLIF(email,''), NULLIF(payload->>'email',''))),
  NULLIF(payload->>'phone',''),
  NULLIF(payload->>'fbp',''),
  NULLIF(payload->>'fbc',''),
  NULLIF(payload->>'fbclid',''),
  NULLIF(payload->>'attribution_source',''),
  payload->>'ab_slots',
  created_at, created_at
FROM public.event_logs
WHERE created_at >= now() - interval '30 days'
  AND NULLIF(payload->>'ab_slots','') IS NOT NULL
  AND NULLIF(payload->>'master_funnel_id','') IS NULL
  AND (NULLIF(payload->>'session_id','') IS NOT NULL
       OR NULLIF(email,'') IS NOT NULL
       OR NULLIF(payload->>'email','') IS NOT NULL)
ORDER BY COALESCE(NULLIF(payload->>'session_id',''), lower(COALESCE(NULLIF(email,''), NULLIF(payload->>'email','')))), created_at DESC;

-- ─── Historical reconstruction for conversion events ──────────────────────
WITH targets AS (
  SELECT el.id,
         NULLIF(el.payload->>'master_funnel_id','') AS mfi,
         NULLIF(el.payload->>'session_id','')       AS sid,
         CASE WHEN (el.payload->>'lead_id') ~ '^[0-9a-fA-F-]{36}$' THEN (el.payload->>'lead_id')::uuid END AS lid,
         lower(COALESCE(NULLIF(el.email,''), NULLIF(el.payload->>'email',''))) AS em,
         NULLIF(el.payload->>'phone','') AS ph,
         NULLIF(el.payload->>'fbp','')    AS fbp,
         NULLIF(el.payload->>'fbc','')    AS fbc,
         NULLIF(el.payload->>'fbclid','') AS fbclid
  FROM public.event_logs el
  WHERE el.created_at >= now() - interval '30 days'
    AND el.event_name IN (
      'quiz_started','quiz_completed','quiz_completed_men','quiz_completed_women',
      'lead_capture_submitted','application_submitted','qualified','not_qualified',
      'high_quality_lead','booking_created','booking_completed',
      'appointment_showed','showup','booking_attended'
    )
    AND NULLIF(el.payload->>'ab_slots','') IS NULL
),
matched AS (
  SELECT t.id, m.ab_slots, m.master_funnel_id,
         CASE
           WHEN t.mfi IS NOT NULL AND m.master_funnel_id = t.mfi THEN 'master_funnel_id'
           WHEN t.sid IS NOT NULL AND m.session_id        = t.sid THEN 'session_id'
           WHEN t.lid IS NOT NULL AND m.lead_id           = t.lid THEN 'lead_id'
           WHEN t.em  IS NOT NULL AND m.email             = t.em  THEN 'email'
           WHEN t.ph  IS NOT NULL AND m.phone             = t.ph  THEN 'phone'
           ELSE 'meta_id'
         END AS match_key,
         CASE
           WHEN t.mfi IS NOT NULL AND m.master_funnel_id = t.mfi THEN 1.0
           WHEN t.sid IS NOT NULL AND m.session_id        = t.sid THEN 0.95
           WHEN t.lid IS NOT NULL AND m.lead_id           = t.lid THEN 0.9
           WHEN t.em  IS NOT NULL AND m.email             = t.em  THEN 0.85
           WHEN t.ph  IS NOT NULL AND m.phone             = t.ph  THEN 0.8
           ELSE 0.7
         END AS confidence
  FROM targets t
  CROSS JOIN LATERAL (
    SELECT ab_slots, master_funnel_id, session_id, lead_id, email, phone, fbp, fbc, fbclid
    FROM public.ab_identity_map m
    WHERE (t.mfi IS NOT NULL AND m.master_funnel_id = t.mfi)
       OR (t.sid IS NOT NULL AND m.session_id        = t.sid)
       OR (t.lid IS NOT NULL AND m.lead_id           = t.lid)
       OR (t.em  IS NOT NULL AND m.email             = t.em)
       OR (t.ph  IS NOT NULL AND m.phone             = t.ph)
       OR (t.fbp IS NOT NULL AND m.fbp               = t.fbp)
       OR (t.fbc IS NOT NULL AND m.fbc               = t.fbc)
       OR (t.fbclid IS NOT NULL AND m.fbclid         = t.fbclid)
    ORDER BY last_seen_at DESC LIMIT 1
  ) m
)
UPDATE public.event_logs el
SET payload = el.payload || jsonb_build_object(
  'ab_slots', mm.ab_slots,
  'ab_slots_source', 'server_backfill',
  'ab_slots_match_key', mm.match_key,
  'ab_slots_match_confidence', mm.confidence
) || CASE
  WHEN (el.payload->>'master_funnel_id') IS NULL AND mm.master_funnel_id IS NOT NULL
  THEN jsonb_build_object('master_funnel_id', mm.master_funnel_id) ELSE '{}'::jsonb END
FROM matched mm WHERE el.id = mm.id;

UPDATE public.event_logs el
SET payload = el.payload || jsonb_build_object(
  'ab_slots_missing_reason',
  CASE
    WHEN COALESCE(NULLIF(el.payload->>'master_funnel_id',''), NULLIF(el.payload->>'session_id',''),
                  NULLIF(el.payload->>'lead_id',''), NULLIF(el.email,''),
                  NULLIF(el.payload->>'email',''), NULLIF(el.payload->>'phone',''),
                  NULLIF(el.payload->>'fbp',''), NULLIF(el.payload->>'fbc','')) IS NULL
    THEN 'missing_identifiers' ELSE 'no_identity_match' END)
WHERE el.created_at >= now() - interval '30 days'
  AND el.event_name IN (
    'quiz_started','quiz_completed','lead_capture_submitted','qualified',
    'high_quality_lead','booking_created','booking_completed',
    'appointment_showed','showup','booking_attended')
  AND NULLIF(el.payload->>'ab_slots','') IS NULL
  AND NULLIF(el.payload->>'ab_slots_missing_reason','') IS NULL;

-- ─── Coverage view for audit dashboard ────────────────────────────────────
CREATE OR REPLACE VIEW public.v_ab_slots_coverage AS
SELECT
  event_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE NULLIF(payload->>'ab_slots','') IS NOT NULL) AS with_ab_slots,
  COUNT(*) FILTER (WHERE payload->>'ab_slots_source' = 'server_backfill') AS server_backfilled,
  COUNT(*) FILTER (WHERE NULLIF(payload->>'ab_slots','') IS NULL) AS unmatched,
  COUNT(*) FILTER (WHERE payload->>'ab_slots_missing_reason' = 'no_identity_match') AS missing_no_match,
  COUNT(*) FILTER (WHERE payload->>'ab_slots_missing_reason' = 'missing_identifiers') AS missing_no_identifiers,
  COUNT(*) FILTER (WHERE payload->>'ab_slots_missing_reason' = 'no_exposure_found') AS missing_no_exposure,
  ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(payload->>'ab_slots','') IS NOT NULL) / NULLIF(COUNT(*),0), 1) AS coverage_pct
FROM public.event_logs
WHERE created_at >= now() - interval '30 days'
  AND event_name IN (
    'quiz_started','quiz_completed','lead_capture_submitted','qualified',
    'high_quality_lead','booking_created','booking_completed',
    'appointment_showed','showup','booking_attended')
GROUP BY event_name
ORDER BY event_name;

GRANT SELECT ON public.v_ab_slots_coverage TO anon, authenticated, service_role;
