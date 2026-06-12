
-- ─── Helper indexes for fast ab_slots lookup on event_logs ───────────────
CREATE INDEX IF NOT EXISTS idx_event_logs_exposure_mfi
  ON public.event_logs ((payload->>'master_funnel_id'), created_at DESC)
  WHERE event_name = 'experiment_exposure';

CREATE INDEX IF NOT EXISTS idx_event_logs_exposure_session
  ON public.event_logs ((payload->>'session_id'), created_at DESC)
  WHERE event_name = 'experiment_exposure';

CREATE INDEX IF NOT EXISTS idx_event_logs_exposure_email
  ON public.event_logs (email, created_at DESC)
  WHERE event_name = 'experiment_exposure' AND email IS NOT NULL;

-- ─── Trigger function: backfill ab_slots + master_funnel_id ──────────────
-- Runs BEFORE INSERT on canonical funnel-conversion events. If the row
-- already carries ab_slots, no-op. Otherwise look up the most recent
-- experiment_exposure row (last 30 days) for the same visitor via
-- master_funnel_id → email → session_id, and merge ab_slots into payload.
-- Purely additive: never removes or rewrites existing payload keys.
CREATE OR REPLACE FUNCTION public.backfill_event_ab_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_mfi text;
  v_email text;
  v_session text;
  v_found_ab text;
  v_found_mfi text;
BEGIN
  IF NEW.event_name IS NULL OR NOT (NEW.event_name = ANY(v_canonical)) THEN
    RETURN NEW;
  END IF;

  v_existing := NEW.payload->>'ab_slots';
  IF v_existing IS NOT NULL AND length(v_existing) > 0 THEN
    RETURN NEW;
  END IF;

  v_mfi     := NEW.payload->>'master_funnel_id';
  v_email   := COALESCE(NEW.email, NEW.payload->>'email');
  v_session := NEW.payload->>'session_id';

  IF v_mfi IS NULL AND v_email IS NULL AND v_session IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT payload->>'ab_slots', payload->>'master_funnel_id'
    INTO v_found_ab, v_found_mfi
  FROM public.event_logs
  WHERE event_name = 'experiment_exposure'
    AND created_at >= now() - interval '30 days'
    AND (payload->>'ab_slots') IS NOT NULL
    AND length(payload->>'ab_slots') > 0
    AND (
         (v_mfi     IS NOT NULL AND payload->>'master_funnel_id' = v_mfi)
      OR (v_email   IS NOT NULL AND email = v_email)
      OR (v_session IS NOT NULL AND payload->>'session_id' = v_session)
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_found_ab IS NOT NULL THEN
    NEW.payload := NEW.payload || jsonb_build_object('ab_slots', v_found_ab);
    IF v_mfi IS NULL AND v_found_mfi IS NOT NULL THEN
      NEW.payload := NEW.payload || jsonb_build_object('master_funnel_id', v_found_mfi);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_event_ab_slots ON public.event_logs;
CREATE TRIGGER trg_backfill_event_ab_slots
  BEFORE INSERT ON public.event_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_event_ab_slots();

-- ─── One-shot backfill for existing rows (last 30 days) ──────────────────
-- Updates only rows that are missing ab_slots and where we can find a
-- matching experiment_exposure. Never overwrites existing values.
WITH targets AS (
  SELECT el.id,
         el.payload,
         el.email,
         el.event_name,
         el.payload->>'master_funnel_id' AS mfi,
         el.payload->>'session_id'       AS sid,
         COALESCE(el.email, el.payload->>'email') AS em
  FROM public.event_logs el
  WHERE el.created_at >= now() - interval '30 days'
    AND el.event_name IN (
      'quiz_started','quiz_completed','quiz_completed_men','quiz_completed_women',
      'lead_capture_submitted','application_submitted','qualified','not_qualified',
      'high_quality_lead','booking_created','booking_completed',
      'appointment_showed','showup','booking_attended',
      'MASTER_QUIZ_STARTED','MASTER_QUIZ_COMPLETED',
      'APPLY_QUIZ_STARTED','APPLY_QUIZ_COMPLETED'
    )
    AND COALESCE(NULLIF(el.payload->>'ab_slots',''), NULL) IS NULL
),
matched AS (
  SELECT t.id,
         (
           SELECT jsonb_build_object(
                    'ab_slots',         x.payload->>'ab_slots',
                    'master_funnel_id', COALESCE(t.mfi, x.payload->>'master_funnel_id')
                  )
           FROM public.event_logs x
           WHERE x.event_name = 'experiment_exposure'
             AND x.created_at >= now() - interval '30 days'
             AND (x.payload->>'ab_slots') IS NOT NULL
             AND length(x.payload->>'ab_slots') > 0
             AND (
                   (t.mfi IS NOT NULL AND x.payload->>'master_funnel_id' = t.mfi)
                OR (t.em  IS NOT NULL AND x.email = t.em)
                OR (t.sid IS NOT NULL AND x.payload->>'session_id' = t.sid)
             )
           ORDER BY x.created_at DESC
           LIMIT 1
         ) AS patch
  FROM targets t
)
UPDATE public.event_logs el
SET payload = el.payload || m.patch
FROM matched m
WHERE el.id = m.id
  AND m.patch IS NOT NULL;
