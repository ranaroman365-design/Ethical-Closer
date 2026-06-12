CREATE OR REPLACE FUNCTION public.upsert_funnel_lead(
  p_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_funnel_source text DEFAULT 'lifestyle',
  p_quiz_answers jsonb DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_traffic_owner text DEFAULT NULL,
  p_referral_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_normalized_email text;
  v_existing record;
  v_scoring jsonb;
  v_quiz_score integer;
  v_lead_score integer;
  v_lead_quality text;
  v_qualification_bucket text;
  v_has_answers boolean;
  v_referrer_id uuid;
  v_funnel_source_enum funnel_source_t;
  v_caller_uid uuid;
  v_caller_role text;
  v_step text := 'init';
  -- Phone validation vars
  v_phone_raw text;
  v_phone_stripped text;
  v_phone_digits text;
  v_phone_normalized text;
  v_phone_valid boolean := false;
  v_phone_quality_status text := 'missing';
  v_phone_quality_reason text := 'Keine Telefonnummer angegeben.';
BEGIN
  -- ── Permission / caller context logging ──────────────────────────────
  BEGIN
    v_caller_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_caller_uid := NULL;
  END;
  BEGIN
    v_caller_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    v_caller_role := 'unknown';
  END;

  RAISE LOG '[upsert_funnel_lead] CALL caller_uid=% caller_role=% email=% funnel_source=% has_answers=% session_id=% traffic_owner=% referral_code=%',
    COALESCE(v_caller_uid::text, 'anon'),
    COALESCE(v_caller_role, 'unknown'),
    COALESCE(left(p_email, 3) || '***', 'NULL'),
    COALESCE(p_funnel_source, 'NULL'),
    (p_quiz_answers IS NOT NULL AND p_quiz_answers <> '{}'::jsonb),
    COALESCE(left(p_session_id, 8), 'NULL'),
    COALESCE(left(p_traffic_owner, 8), 'NULL'),
    COALESCE(left(p_referral_code, 8), 'NULL');

  -- ── Email validation ─────────────────────────────────────────────────
  v_step := 'email_validation';
  v_normalized_email := lower(trim(p_email));
  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RAISE LOG '[upsert_funnel_lead] DENIED step=% reason=empty_email caller_uid=% caller_role=%',
      v_step, COALESCE(v_caller_uid::text, 'anon'), COALESCE(v_caller_role, 'unknown');
    RETURN jsonb_build_object('success', false, 'error', 'Email is required');
  END IF;

  -- ── Phone validation (server-side enforcement) ───────────────────────
  v_step := 'phone_validation';
  v_phone_raw := COALESCE(trim(p_phone), '');

  IF v_phone_raw = '' THEN
    RAISE LOG '[upsert_funnel_lead] DENIED step=% reason=missing_phone caller_uid=%',
      v_step, COALESCE(v_caller_uid::text, 'anon');
    RETURN jsonb_build_object('success', false, 'error', 'Phone is required');
  END IF;

  -- Strip non-digits (keep leading +)
  IF left(v_phone_raw, 1) = '+' THEN
    v_phone_stripped := '+' || regexp_replace(substring(v_phone_raw from 2), '[^0-9]', '', 'g');
  ELSE
    v_phone_stripped := regexp_replace(v_phone_raw, '[^0-9]', '', 'g');
  END IF;
  v_phone_digits := regexp_replace(v_phone_stripped, '[^0-9]', '', 'g');

  -- Too short
  IF length(v_phone_digits) < 7 THEN
    v_phone_quality_status := 'invalid';
    v_phone_quality_reason := 'Nummer zu kurz.';
    RAISE LOG '[upsert_funnel_lead] DENIED step=% reason=phone_too_short digits=% caller_uid=%',
      v_step, length(v_phone_digits), COALESCE(v_caller_uid::text, 'anon');
    RETURN jsonb_build_object('success', false, 'error', 'Phone number too short');
  END IF;

  -- Too long
  IF length(v_phone_digits) > 15 THEN
    v_phone_quality_status := 'invalid';
    v_phone_quality_reason := 'Nummer zu lang.';
    RAISE LOG '[upsert_funnel_lead] DENIED step=% reason=phone_too_long digits=% caller_uid=%',
      v_step, length(v_phone_digits), COALESCE(v_caller_uid::text, 'anon');
    RETURN jsonb_build_object('success', false, 'error', 'Phone number too long');
  END IF;

  -- Repeated single digit (e.g. 00000000, 11111111)
  IF v_phone_digits ~ '^([0-9])\1{4,}$' THEN
    v_phone_quality_status := 'fake';
    v_phone_quality_reason := 'Wiederholte Ziffern erkannt.';
    RAISE LOG '[upsert_funnel_lead] DENIED step=% reason=repeated_digits caller_uid=%',
      v_step, COALESCE(v_caller_uid::text, 'anon');
    RETURN jsonb_build_object('success', false, 'error', 'Fake phone number detected');
  END IF;

  -- Known fake patterns
  IF v_phone_digits ~ '^(123456|654321|000000|111111|999999)' THEN
    v_phone_quality_status := 'fake';
    v_phone_quality_reason := 'Bekanntes Fake-Muster erkannt.';
    RAISE LOG '[upsert_funnel_lead] DENIED step=% reason=fake_pattern caller_uid=%',
      v_step, COALESCE(v_caller_uid::text, 'anon');
    RETURN jsonb_build_object('success', false, 'error', 'Fake phone number detected');
  END IF;

  -- E.164 normalization (DACH focus)
  IF v_phone_stripped LIKE '+%' THEN
    v_phone_normalized := v_phone_stripped;
  ELSIF v_phone_stripped LIKE '0%' AND length(v_phone_digits) >= 10 AND length(v_phone_digits) <= 15 THEN
    v_phone_normalized := '+49' || substring(v_phone_digits from 2);
  ELSIF length(v_phone_digits) >= 10 AND length(v_phone_digits) <= 15 THEN
    IF v_phone_digits LIKE '49%' OR v_phone_digits LIKE '43%' OR v_phone_digits LIKE '41%' THEN
      v_phone_normalized := '+' || v_phone_digits;
    ELSE
      v_phone_normalized := '+' || v_phone_digits;
    END IF;
  ELSE
    v_phone_normalized := v_phone_stripped;
  END IF;

  v_phone_valid := true;
  v_phone_quality_status := 'valid';
  v_phone_quality_reason := 'Telefonnummer validiert.';

  RAISE LOG '[upsert_funnel_lead] INFO step=% phone_valid=% normalized=% caller_uid=%',
    v_step, v_phone_valid, left(v_phone_normalized, 6) || '***', COALESCE(v_caller_uid::text, 'anon');

  -- ── Funnel source enum mapping ───────────────────────────────────────
  v_step := 'funnel_source_mapping';
  BEGIN
    v_funnel_source_enum := COALESCE(NULLIF(trim(p_funnel_source), ''), 'apply_direct')::funnel_source_t;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE LOG '[upsert_funnel_lead] WARN step=% invalid_funnel_source=% defaulting=apply_direct caller_uid=%',
      v_step, p_funnel_source, COALESCE(v_caller_uid::text, 'anon');
    v_funnel_source_enum := 'apply_direct'::funnel_source_t;
  END;

  -- ── Referral resolution ──────────────────────────────────────────────
  v_step := 'referral_resolution';
  IF p_referral_code IS NOT NULL AND length(trim(p_referral_code)) > 0 THEN
    BEGIN
      v_referrer_id := public.resolve_referral_code(trim(p_referral_code));
      IF v_referrer_id IS NOT NULL THEN
        RAISE LOG '[upsert_funnel_lead] INFO step=% referral_code=% resolved_referrer=%',
          v_step, left(p_referral_code, 8), v_referrer_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[upsert_funnel_lead] WARN step=% referral_resolution_failed=% error=%',
        v_step, p_referral_code, SQLERRM;
      v_referrer_id := NULL;
    END;
  END IF;

  -- ── Quiz scoring ─────────────────────────────────────────────────────
  v_step := 'quiz_scoring';
  v_has_answers := p_quiz_answers IS NOT NULL
                   AND jsonb_typeof(p_quiz_answers) = 'object'
                   AND p_quiz_answers <> '{}'::jsonb;

  IF v_has_answers THEN
    BEGIN
      v_scoring := public.compute_lead_quality_from_answers(p_quiz_answers);
      v_quiz_score := (v_scoring->>'quiz_score')::int;
      v_lead_score := (v_scoring->>'lead_score')::int;
      v_lead_quality := v_scoring->>'lead_quality';
      v_qualification_bucket := v_scoring->>'qualification_bucket';
      RAISE LOG '[upsert_funnel_lead] INFO step=% quiz_score=% lead_score=% quality=% bucket=%',
        v_step, v_quiz_score, v_lead_score, v_lead_quality, v_qualification_bucket;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[upsert_funnel_lead] ERROR step=% scoring_failed=% error=%',
        v_step, SQLERRM, SQLSTATE;
      RAISE;
    END;
  END IF;

  -- ── Lookup existing lead ─────────────────────────────────────────────
  v_step := 'lead_lookup';
  SELECT id, stage INTO v_existing
  FROM public.leads
  WHERE lower(trim(email)) = v_normalized_email
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  -- ── Upsert ───────────────────────────────────────────────────────────
  IF v_existing.id IS NOT NULL THEN
    v_step := 'lead_update';
    RAISE LOG '[upsert_funnel_lead] INFO step=% existing_lead=% stage=% caller_uid=%',
      v_step, v_existing.id, v_existing.stage, COALESCE(v_caller_uid::text, 'anon');
    BEGIN
      UPDATE public.leads SET
        name = COALESCE(NULLIF(trim(p_name), ''), name),
        phone = v_phone_normalized,
        phone_raw = v_phone_raw,
        phone_normalized = v_phone_normalized,
        phone_valid = v_phone_valid,
        phone_quality_status = v_phone_quality_status,
        phone_quality_reason = v_phone_quality_reason,
        quiz_funnel_source = COALESCE(NULLIF(trim(p_funnel_source), ''), quiz_funnel_source),
        source_funnel = COALESCE(NULLIF(trim(p_funnel_source), ''), source_funnel),
        quiz_answers = CASE WHEN v_has_answers THEN p_quiz_answers ELSE quiz_answers END,
        quiz_score = CASE WHEN v_has_answers THEN v_quiz_score ELSE quiz_score END,
        lead_score = CASE WHEN v_has_answers THEN v_lead_score ELSE lead_score END,
        lead_quality = CASE WHEN v_has_answers THEN v_lead_quality ELSE lead_quality END,
        qualification_bucket = CASE WHEN v_has_answers THEN v_qualification_bucket ELSE qualification_bucket END,
        scored_at = CASE WHEN v_has_answers THEN now() ELSE scored_at END,
        last_quiz_completed_at = CASE WHEN v_has_answers THEN now() ELSE last_quiz_completed_at END,
        quiz_attempt_count = CASE WHEN v_has_answers THEN COALESCE(quiz_attempt_count, 0) + 1 ELSE quiz_attempt_count END,
        referrer_user_id = COALESCE(referrer_user_id, v_referrer_id),
        referral_code = COALESCE(leads.referral_code, p_referral_code),
        referral_attributed_at = CASE WHEN referrer_user_id IS NULL AND v_referrer_id IS NOT NULL THEN now() ELSE referral_attributed_at END,
        updated_at = now()
      WHERE id = v_existing.id
      RETURNING id INTO v_lead_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[upsert_funnel_lead] ERROR step=% lead_id=% error=% sqlstate=%',
        v_step, v_existing.id, SQLERRM, SQLSTATE;
      RAISE;
    END;
  ELSE
    v_step := 'lead_insert';
    RAISE LOG '[upsert_funnel_lead] INFO step=% new_lead email_prefix=% caller_uid=%',
      v_step, left(v_normalized_email, 3) || '***', COALESCE(v_caller_uid::text, 'anon');
    BEGIN
      INSERT INTO public.leads (
        name, email, phone, source, stage, lead_level, lead_status,
        funnel_source,
        quiz_funnel_source, source_funnel, quiz_answers,
        quiz_score, lead_score, lead_quality, qualification_bucket, scored_at,
        last_quiz_completed_at, quiz_attempt_count,
        referrer_user_id, referral_code, referral_attributed_at,
        phone_raw, phone_normalized, phone_valid, phone_quality_status, phone_quality_reason
      )
      VALUES (
        NULLIF(trim(p_name), ''),
        v_normalized_email,
        v_phone_normalized,
        'funnel_' || COALESCE(NULLIF(trim(p_funnel_source), ''), 'apply'),
        'new', 'L0', 'interessent',
        v_funnel_source_enum,
        COALESCE(NULLIF(trim(p_funnel_source), ''), 'apply'),
        COALESCE(NULLIF(trim(p_funnel_source), ''), 'apply'),
        CASE WHEN v_has_answers THEN p_quiz_answers ELSE NULL END,
        CASE WHEN v_has_answers THEN v_quiz_score ELSE NULL END,
        CASE WHEN v_has_answers THEN v_lead_score ELSE NULL END,
        CASE WHEN v_has_answers THEN v_lead_quality ELSE NULL END,
        CASE WHEN v_has_answers THEN v_qualification_bucket ELSE NULL END,
        CASE WHEN v_has_answers THEN now() ELSE NULL END,
        CASE WHEN v_has_answers THEN now() ELSE NULL END,
        CASE WHEN v_has_answers THEN 1 ELSE 0 END,
        v_referrer_id,
        p_referral_code,
        CASE WHEN v_referrer_id IS NOT NULL THEN now() ELSE NULL END,
        v_phone_raw,
        v_phone_normalized,
        v_phone_valid,
        v_phone_quality_status,
        v_phone_quality_reason
      )
      RETURNING id INTO v_lead_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[upsert_funnel_lead] ERROR step=% error=% sqlstate=% detail=%',
        v_step, SQLERRM, SQLSTATE, left(p_email, 3) || '***';
      RAISE;
    END;
  END IF;

  -- ── Attribution linking ──────────────────────────────────────────────
  v_step := 'attribution_linking';
  IF p_session_id IS NOT NULL AND length(trim(p_session_id)) > 0 THEN
    BEGIN
      UPDATE public.lead_attribution
      SET lead_id = v_lead_id, updated_at = now()
      WHERE session_id = p_session_id
        AND (lead_id IS NULL OR lead_id = v_lead_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[upsert_funnel_lead] WARN step=% attribution_failed=% error=%',
        v_step, p_session_id, SQLERRM;
    END;
  END IF;

  -- ── Re-fetch scores if no new answers ────────────────────────────────
  IF NOT v_has_answers THEN
    SELECT quiz_score, lead_score, lead_quality, qualification_bucket
    INTO v_quiz_score, v_lead_score, v_lead_quality, v_qualification_bucket
    FROM public.leads WHERE id = v_lead_id;
  END IF;

  -- ── Success log ──────────────────────────────────────────────────────
  RAISE LOG '[upsert_funnel_lead] OK lead_id=% bucket=% quality=% phone_valid=% caller_uid=% caller_role=%',
    v_lead_id, COALESCE(v_qualification_bucket, 'none'), COALESCE(v_lead_quality, 'none'),
    v_phone_valid,
    COALESCE(v_caller_uid::text, 'anon'), COALESCE(v_caller_role, 'unknown');

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead_id,
    'quiz_score', v_quiz_score,
    'lead_score', v_lead_score,
    'lead_quality', v_lead_quality,
    'qualification_bucket', v_qualification_bucket
  );
END;
$$;