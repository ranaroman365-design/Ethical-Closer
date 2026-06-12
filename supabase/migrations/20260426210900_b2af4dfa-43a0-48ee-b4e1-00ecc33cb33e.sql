CREATE OR REPLACE FUNCTION public.compute_lead_quality_from_answers(p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_quiz_score integer := 0;
  v_lead_score integer := 0;
  v_quality text;
  v_bucket text;
  v_income text;
  v_commitment text;
  v_experience text;
  v_time text;
  v_motivation text;
  v_hard_block boolean := false;
  v_answer jsonb;
  v_answer_id text;
  v_answer_label text;
  v_answer_value integer;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RETURN jsonb_build_object(
      'quiz_score', 0, 'lead_score', 0,
      'lead_quality', 'C', 'qualification_bucket', 'low'
    );
  END IF;

  v_hard_block := COALESCE((p_answers->>'hard_blocked')::boolean, false)
                  OR COALESCE((p_answers->>'qualification_hard_blocked')::boolean, false);

  -- Active /apply quiz stores the exact selected answers as an array of
  -- { id, label, value }. Recompute from that payload so a retake with the same
  -- email fully replaces the previous verdict.
  IF jsonb_typeof(p_answers->'answers') = 'array' THEN
    FOR v_answer IN SELECT value FROM jsonb_array_elements(p_answers->'answers')
    LOOP
      v_answer_id := v_answer->>'id';
      v_answer_label := lower(COALESCE(v_answer->>'label', ''));
      v_answer_value := COALESCE(NULLIF(v_answer->>'value', '')::integer, 0);

      v_quiz_score := v_quiz_score + GREATEST(0, LEAST(v_answer_value, 25));
      IF v_answer_id = 'real_calls' AND (v_answer_value = 0 OR v_answer_label LIKE 'nein%') THEN
        v_hard_block := true;
      END IF;
    END LOOP;
  ELSE
    -- Pull common quiz answer keys (tolerant of multiple schemas in production).
    v_income      := COALESCE(p_answers->>'income_target', p_answers->>'income_goal', p_answers->>'income', p_answers->>'monthly_income', p_answers->>'goal');
    v_commitment  := COALESCE(p_answers->>'commitment', p_answers->>'ambition', p_answers->>'real_calls', p_answers->>'performanceBased', p_answers->>'time_commitment');
    v_experience  := COALESCE(p_answers->>'experience', p_answers->>'sales_experience', p_answers->>'situation', p_answers->>'commSkill');
    v_time        := COALESCE(p_answers->>'time_available', p_answers->>'hours_per_week', p_answers->>'hours', p_answers->>'time');
    v_motivation  := COALESCE(p_answers->>'motivation', p_answers->>'why', p_answers->>'reason', p_answers->>'challenge');

    IF lower(COALESCE(v_commitment, '')) IN ('nein', 'nein.', 'no', 'not_ready') THEN
      v_hard_block := true;
    END IF;

    -- Income / ambition bucket (max 30)
    IF v_income IN ('10000+', '10k+', 'over_10k', '10000_plus')
       OR lower(COALESCE(v_income, '')) LIKE '%10.000%'
       OR lower(COALESCE(v_income, '')) LIKE '%top-level%'
       OR lower(COALESCE(v_income, '')) LIKE '%skalierung%'
    THEN v_quiz_score := v_quiz_score + 30;
    ELSIF v_income IN ('5000-10000', '5k_10k', '5000_10000')
       OR lower(COALESCE(v_income, '')) LIKE '%5.000%'
       OR lower(COALESCE(v_income, '')) LIKE '%karriere%'
    THEN v_quiz_score := v_quiz_score + 22;
    ELSIF v_income IN ('2000-5000', '2k_5k', '2000_5000')
       OR lower(COALESCE(v_income, '')) LIKE '%2.000%'
       OR lower(COALESCE(v_income, '')) LIKE '%stabiles einkommen%'
    THEN v_quiz_score := v_quiz_score + 14;
    ELSIF v_income IS NOT NULL THEN v_quiz_score := v_quiz_score + 6;
    END IF;

    -- Commitment (max 25)
    IF v_commitment IN ('full_time', 'all_in', 'high', 'Ja', 'ja', 'Ja.')
       OR lower(COALESCE(v_commitment, '')) LIKE '%wirklich lernen%'
       OR lower(COALESCE(v_commitment, '')) LIKE '%top-level%'
    THEN v_quiz_score := v_quiz_score + 25;
    ELSIF v_commitment IN ('part_time', 'medium', 'evenings', 'Unsicher', 'unsicher', 'Vielleicht.', 'vielleicht')
       OR lower(COALESCE(v_commitment, '')) LIKE '%ausprobieren%'
    THEN v_quiz_score := v_quiz_score + 15;
    ELSIF v_commitment IS NOT NULL THEN v_quiz_score := v_quiz_score + 5;
    END IF;

    -- Time available (max 20)
    IF v_time IN ('20h+', '20_plus', 'full_time')
       OR lower(COALESCE(v_time, '')) LIKE '%20+%'
       OR lower(COALESCE(v_time, '')) LIKE '%mehr als 20%'
       OR lower(COALESCE(v_time, '')) LIKE '%vollzeit%'
    THEN v_quiz_score := v_quiz_score + 20;
    ELSIF v_time IN ('10-20h', '10_20', 'part_time')
       OR lower(COALESCE(v_time, '')) LIKE '%10–20%'
       OR lower(COALESCE(v_time, '')) LIKE '%10-20%'
    THEN v_quiz_score := v_quiz_score + 12;
    ELSIF v_time IS NOT NULL THEN v_quiz_score := v_quiz_score + 4;
    END IF;

    -- Experience / coachability (max 15)
    IF v_experience IN ('experienced', 'closer', 'sales_pro', '5')
       OR lower(COALESCE(v_experience, '')) LIKE '%fortgeschritten%'
       OR lower(COALESCE(v_experience, '')) LIKE '%sales%'
    THEN v_quiz_score := v_quiz_score + 15;
    ELSIF v_experience IN ('beginner_coachable', 'eager_learner', '4')
       OR lower(COALESCE(v_experience, '')) LIKE '%keine erfahrung%'
       OR lower(COALESCE(v_experience, '')) LIKE '%wenig%'
       OR lower(COALESCE(v_experience, '')) LIKE '%mittel%'
    THEN v_quiz_score := v_quiz_score + 12;
    ELSIF v_experience IS NOT NULL THEN v_quiz_score := v_quiz_score + 5;
    END IF;

    -- Motivation length (max 10)
    IF v_motivation IS NOT NULL AND length(v_motivation) > 80 THEN v_quiz_score := v_quiz_score + 10;
    ELSIF v_motivation IS NOT NULL AND length(v_motivation) > 20 THEN v_quiz_score := v_quiz_score + 5;
    END IF;
  END IF;

  v_quiz_score := LEAST(v_quiz_score, 100);

  IF v_hard_block THEN
    v_quiz_score := 0;
  END IF;

  v_lead_score := v_quiz_score;

  IF v_lead_score >= 70 THEN v_quality := 'A';
  ELSIF v_lead_score >= 40 THEN v_quality := 'B';
  ELSE v_quality := 'C';
  END IF;

  IF v_lead_score >= 70 THEN v_bucket := 'high';
  ELSIF v_lead_score >= 40 THEN v_bucket := 'mid';
  ELSE v_bucket := 'low';
  END IF;

  RETURN jsonb_build_object(
    'quiz_score', v_quiz_score,
    'lead_score', v_lead_score,
    'lead_quality', v_quality,
    'qualification_bucket', v_bucket
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_funnel_lead(
  p_name text,
  p_email text,
  p_phone text DEFAULT NULL::text,
  p_funnel_source text DEFAULT 'lifestyle'::text,
  p_quiz_answers jsonb DEFAULT NULL::jsonb,
  p_session_id text DEFAULT NULL::text
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
BEGIN
  v_normalized_email := lower(trim(p_email));

  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email is required');
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
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_lead_id;
  ELSE
    INSERT INTO public.leads (
      name, email, phone, source, stage, lead_level, lead_status,
      quiz_funnel_source, source_funnel, quiz_answers,
      quiz_score, lead_score, lead_quality, qualification_bucket, scored_at,
      last_quiz_completed_at, quiz_attempt_count
    )
    VALUES (
      NULLIF(trim(p_name), ''),
      v_normalized_email,
      NULLIF(trim(p_phone), ''),
      'funnel_' || COALESCE(NULLIF(trim(p_funnel_source), ''), 'apply'),
      'new',
      'L0',
      'interessent',
      COALESCE(NULLIF(trim(p_funnel_source), ''), 'apply'),
      COALESCE(NULLIF(trim(p_funnel_source), ''), 'apply'),
      CASE WHEN v_has_answers THEN p_quiz_answers ELSE NULL END,
      CASE WHEN v_has_answers THEN v_quiz_score ELSE NULL END,
      CASE WHEN v_has_answers THEN v_lead_score ELSE NULL END,
      CASE WHEN v_has_answers THEN v_lead_quality ELSE NULL END,
      CASE WHEN v_has_answers THEN v_qualification_bucket ELSE NULL END,
      CASE WHEN v_has_answers THEN now() ELSE NULL END,
      CASE WHEN v_has_answers THEN now() ELSE NULL END,
      CASE WHEN v_has_answers THEN 1 ELSE 0 END
    )
    RETURNING id INTO v_lead_id;
  END IF;

  IF p_session_id IS NOT NULL AND length(trim(p_session_id)) > 0 THEN
    BEGIN
      UPDATE public.lead_attribution
      SET lead_id = v_lead_id,
          updated_at = now()
      WHERE session_id = p_session_id
        AND (lead_id IS NULL OR lead_id = v_lead_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF NOT v_has_answers THEN
    SELECT quiz_score, lead_score, lead_quality, qualification_bucket
    INTO v_quiz_score, v_lead_score, v_lead_quality, v_qualification_bucket
    FROM public.leads
    WHERE id = v_lead_id;
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

CREATE OR REPLACE FUNCTION public.upsert_funnel_lead(
  p_name text,
  p_email text,
  p_phone text DEFAULT NULL::text,
  p_funnel_source text DEFAULT 'lifestyle'::text,
  p_quiz_answers jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.upsert_funnel_lead(
    p_name,
    p_email,
    p_phone,
    p_funnel_source,
    p_quiz_answers,
    NULL::text
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_lead_qualification(p_lead_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_recomputed jsonb;
  v_new_quiz integer;
  v_new_lead_score integer;
  v_new_quality text;
  v_new_bucket text;
  v_did_recompute boolean := false;
BEGIN
  IF p_email IS NOT NULL AND length(trim(p_email)) > 0 THEN
    SELECT * INTO v_lead
    FROM public.leads
    WHERE lower(trim(email)) = lower(trim(p_email))
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_lead.id IS NULL AND p_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id LIMIT 1;
  END IF;

  IF v_lead.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  IF v_lead.quiz_answers IS NOT NULL
     AND jsonb_typeof(v_lead.quiz_answers) = 'object'
     AND v_lead.quiz_answers <> '{}'::jsonb THEN
    v_recomputed := public.compute_lead_quality_from_answers(v_lead.quiz_answers);
    v_new_quiz := NULLIF(v_recomputed->>'quiz_score','')::integer;
    v_new_lead_score := NULLIF(v_recomputed->>'lead_score','')::integer;
    v_new_quality := v_recomputed->>'lead_quality';
    v_new_bucket := v_recomputed->>'qualification_bucket';

    UPDATE public.leads
    SET quiz_score = v_new_quiz,
        lead_score = v_new_lead_score,
        lead_quality = v_new_quality,
        qualification_bucket = v_new_bucket,
        scored_at = now(),
        updated_at = now()
    WHERE id = v_lead.id
    RETURNING * INTO v_lead;
    v_did_recompute := true;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', v_lead.id,
    'quiz_score', v_lead.quiz_score,
    'lead_score', v_lead.lead_score,
    'lead_quality', v_lead.lead_quality,
    'qualification_bucket', v_lead.qualification_bucket,
    'recomputed', v_did_recompute
  );
END;
$$;