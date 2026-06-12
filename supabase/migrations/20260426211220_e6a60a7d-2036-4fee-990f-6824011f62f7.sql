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

  -- Score snapshots written by older booking/contact flows are accepted, so a
  -- contact-save cannot downgrade a recently requalified lead.
  IF p_answers ? 'qualification_score' OR p_answers ? 'quiz_score' THEN
    v_quiz_score := GREATEST(0, LEAST(100, COALESCE(NULLIF(p_answers->>'qualification_score','')::integer, NULLIF(p_answers->>'quiz_score','')::integer, 0)));
  ELSIF jsonb_typeof(p_answers->'answers') = 'array' THEN
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
    v_income      := COALESCE(p_answers->>'income_target', p_answers->>'income_goal', p_answers->>'income', p_answers->>'monthly_income', p_answers->>'goal');
    v_commitment  := COALESCE(p_answers->>'commitment', p_answers->>'ambition', p_answers->>'real_calls', p_answers->>'performanceBased', p_answers->>'time_commitment');
    v_experience  := COALESCE(p_answers->>'experience', p_answers->>'sales_experience', p_answers->>'situation', p_answers->>'commSkill');
    v_time        := COALESCE(p_answers->>'time_available', p_answers->>'hours_per_week', p_answers->>'hours', p_answers->>'time');
    v_motivation  := COALESCE(p_answers->>'motivation', p_answers->>'why', p_answers->>'reason', p_answers->>'challenge');

    IF lower(COALESCE(v_commitment, '')) IN ('nein', 'nein.', 'no', 'not_ready') THEN
      v_hard_block := true;
    END IF;

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

    IF v_commitment IN ('full_time', 'all_in', 'high', 'Ja', 'ja', 'Ja.')
       OR lower(COALESCE(v_commitment, '')) LIKE '%wirklich lernen%'
       OR lower(COALESCE(v_commitment, '')) LIKE '%top-level%'
    THEN v_quiz_score := v_quiz_score + 25;
    ELSIF v_commitment IN ('part_time', 'medium', 'evenings', 'Unsicher', 'unsicher', 'Vielleicht.', 'vielleicht')
       OR lower(COALESCE(v_commitment, '')) LIKE '%ausprobieren%'
    THEN v_quiz_score := v_quiz_score + 15;
    ELSIF v_commitment IS NOT NULL THEN v_quiz_score := v_quiz_score + 5;
    END IF;

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