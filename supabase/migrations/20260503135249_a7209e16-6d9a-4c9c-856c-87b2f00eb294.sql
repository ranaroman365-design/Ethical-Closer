
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
BEGIN
  v_normalized_email := lower(trim(p_email));
  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email is required');
  END IF;

  IF p_referral_code IS NOT NULL AND length(trim(p_referral_code)) > 0 THEN
    v_referrer_id := public.resolve_referral_code(trim(p_referral_code));
  END IF;

  v_has_answers := p_quiz_answers IS NOT NULL
                   AND jsonb_typeof(p_quiz_answers) = 'object'
                   AND p_quiz_answers <> '{}'::jsonb;

  IF v_has_answers THEN
    v_scoring := public.compute_lead_quality_from_answers(p_quiz_answers);
    v_quiz_score := (v_scoring->>'quiz_score')::int;
    v_lead_score := (v_scoring->>'lead_score')::int;
    v_lead_quality := v_scoring->>'lead_quality';
    v_qualification_bucket := v_scoring->>'qualification_bucket';
  END IF;

  SELECT id, stage INTO v_existing
  FROM public.leads
  WHERE lower(trim(email)) = v_normalized_email
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.leads SET
      name = COALESCE(NULLIF(trim(p_name), ''), name),
      phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
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
  ELSE
    INSERT INTO public.leads (
      name, email, phone, source, stage, lead_level, lead_status,
      funnel_source,
      quiz_funnel_source, source_funnel, quiz_answers,
      quiz_score, lead_score, lead_quality, qualification_bucket, scored_at,
      last_quiz_completed_at, quiz_attempt_count,
      referrer_user_id, referral_code, referral_attributed_at
    )
    VALUES (
      NULLIF(trim(p_name), ''),
      v_normalized_email,
      NULLIF(trim(p_phone), ''),
      'funnel_' || COALESCE(NULLIF(trim(p_funnel_source), ''), 'apply'),
      'new', 'L0', 'interessent',
      COALESCE(NULLIF(trim(p_funnel_source), ''), 'apply'),
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
      CASE WHEN v_referrer_id IS NOT NULL THEN now() ELSE NULL END
    )
    RETURNING id INTO v_lead_id;
  END IF;

  IF p_session_id IS NOT NULL AND length(trim(p_session_id)) > 0 THEN
    BEGIN
      UPDATE public.lead_attribution
      SET lead_id = v_lead_id, updated_at = now()
      WHERE session_id = p_session_id
        AND (lead_id IS NULL OR lead_id = v_lead_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF NOT v_has_answers THEN
    SELECT quiz_score, lead_score, lead_quality, qualification_bucket
    INTO v_quiz_score, v_lead_score, v_lead_quality, v_qualification_bucket
    FROM public.leads WHERE id = v_lead_id;
  END IF;

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
