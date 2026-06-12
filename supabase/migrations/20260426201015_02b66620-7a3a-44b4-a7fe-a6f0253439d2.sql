-- 1. Centralised scoring helper (deterministic). Source: lead-quality-engine canon.
CREATE OR REPLACE FUNCTION public.compute_lead_quality_from_answers(p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
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
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RETURN jsonb_build_object(
      'quiz_score', 0, 'lead_score', 0,
      'lead_quality', 'C', 'qualification_bucket', 'low'
    );
  END IF;

  -- Pull common quiz answer keys (tolerant of multiple schemas in production)
  v_income      := COALESCE(p_answers->>'income_target', p_answers->>'income', p_answers->>'monthly_income');
  v_commitment  := COALESCE(p_answers->>'commitment', p_answers->>'time_commitment');
  v_experience  := COALESCE(p_answers->>'experience', p_answers->>'sales_experience');
  v_time        := COALESCE(p_answers->>'time_available', p_answers->>'hours_per_week');
  v_motivation  := COALESCE(p_answers->>'motivation', p_answers->>'why');

  -- Income bucket (max 30)
  IF v_income IN ('10000+', '10k+', 'over_10k', '10000_plus') THEN v_quiz_score := v_quiz_score + 30;
  ELSIF v_income IN ('5000-10000', '5k_10k', '5000_10000') THEN v_quiz_score := v_quiz_score + 22;
  ELSIF v_income IN ('2000-5000', '2k_5k', '2000_5000') THEN v_quiz_score := v_quiz_score + 14;
  ELSIF v_income IS NOT NULL THEN v_quiz_score := v_quiz_score + 6;
  END IF;

  -- Commitment (max 25)
  IF v_commitment IN ('full_time', 'all_in', 'high') THEN v_quiz_score := v_quiz_score + 25;
  ELSIF v_commitment IN ('part_time', 'medium', 'evenings') THEN v_quiz_score := v_quiz_score + 15;
  ELSIF v_commitment IS NOT NULL THEN v_quiz_score := v_quiz_score + 5;
  END IF;

  -- Time available (max 20)
  IF v_time IN ('20h+', '20_plus', 'full_time') THEN v_quiz_score := v_quiz_score + 20;
  ELSIF v_time IN ('10-20h', '10_20', 'part_time') THEN v_quiz_score := v_quiz_score + 12;
  ELSIF v_time IS NOT NULL THEN v_quiz_score := v_quiz_score + 4;
  END IF;

  -- Experience (max 15) — both ends count: experienced OR explicit beginner-coachable
  IF v_experience IN ('experienced', 'closer', 'sales_pro') THEN v_quiz_score := v_quiz_score + 15;
  ELSIF v_experience IN ('beginner_coachable', 'eager_learner') THEN v_quiz_score := v_quiz_score + 12;
  ELSIF v_experience IS NOT NULL THEN v_quiz_score := v_quiz_score + 5;
  END IF;

  -- Motivation length (max 10) — qualitative proxy
  IF v_motivation IS NOT NULL AND length(v_motivation) > 80 THEN v_quiz_score := v_quiz_score + 10;
  ELSIF v_motivation IS NOT NULL AND length(v_motivation) > 20 THEN v_quiz_score := v_quiz_score + 5;
  END IF;

  v_quiz_score := LEAST(v_quiz_score, 100);
  v_lead_score := v_quiz_score;  -- engagement multiplier applied later by triggers/edge fns

  -- Quality letter (A/B/C) — used by lead-quality-engine
  IF v_lead_score >= 70 THEN v_quality := 'A';
  ELSIF v_lead_score >= 40 THEN v_quality := 'B';
  ELSE v_quality := 'C';
  END IF;

  -- Qualification bucket (high/mid/low) — used by booking gates
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

REVOKE ALL ON FUNCTION public.compute_lead_quality_from_answers(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_lead_quality_from_answers(jsonb) TO authenticated, anon, service_role;

-- 2. New overload of upsert_funnel_lead with session linking + scoring.
-- Keep the old 5-arg signature working by delegating to the new one.
CREATE OR REPLACE FUNCTION public.upsert_funnel_lead(
  p_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_funnel_source text DEFAULT 'lifestyle',
  p_quiz_answers jsonb DEFAULT NULL,
  p_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
BEGIN
  v_normalized_email := LOWER(TRIM(p_email));

  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RETURN jsonb_build_object('error', 'Email is required');
  END IF;

  -- Compute scoring up-front. Only persisted when we actually have answers.
  v_scoring := public.compute_lead_quality_from_answers(p_quiz_answers);
  v_quiz_score          := (v_scoring->>'quiz_score')::int;
  v_lead_score          := (v_scoring->>'lead_score')::int;
  v_lead_quality        := v_scoring->>'lead_quality';
  v_qualification_bucket:= v_scoring->>'qualification_bucket';

  SELECT id, stage INTO v_existing
  FROM leads
  WHERE LOWER(TRIM(email)) = v_normalized_email
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    UPDATE leads SET
      name = COALESCE(NULLIF(TRIM(p_name), ''), name),
      phone = COALESCE(NULLIF(TRIM(p_phone), ''), phone),
      quiz_funnel_source = p_funnel_source,
      quiz_answers = COALESCE(p_quiz_answers, quiz_answers),
      -- Only overwrite scores if we have new answers
      quiz_score = CASE WHEN p_quiz_answers IS NOT NULL THEN v_quiz_score ELSE quiz_score END,
      lead_score = CASE WHEN p_quiz_answers IS NOT NULL THEN v_lead_score ELSE lead_score END,
      lead_quality = CASE WHEN p_quiz_answers IS NOT NULL THEN v_lead_quality ELSE lead_quality END,
      qualification_bucket = CASE WHEN p_quiz_answers IS NOT NULL THEN v_qualification_bucket ELSE qualification_bucket END,
      scored_at = CASE WHEN p_quiz_answers IS NOT NULL THEN now() ELSE scored_at END,
      updated_at = now()
    WHERE id = v_existing.id;
    v_lead_id := v_existing.id;
  ELSE
    INSERT INTO leads (
      name, email, phone, source, stage, lead_level, lead_status,
      quiz_funnel_source, quiz_answers,
      quiz_score, lead_score, lead_quality, qualification_bucket, scored_at
    )
    VALUES (
      TRIM(p_name),
      v_normalized_email,
      NULLIF(TRIM(p_phone), ''),
      'funnel_' || p_funnel_source,
      'new',
      'L0',
      'interessent',
      p_funnel_source,
      p_quiz_answers,
      CASE WHEN p_quiz_answers IS NOT NULL THEN v_quiz_score ELSE NULL END,
      CASE WHEN p_quiz_answers IS NOT NULL THEN v_lead_score ELSE NULL END,
      CASE WHEN p_quiz_answers IS NOT NULL THEN v_lead_quality ELSE NULL END,
      CASE WHEN p_quiz_answers IS NOT NULL THEN v_qualification_bucket ELSE NULL END,
      CASE WHEN p_quiz_answers IS NOT NULL THEN now() ELSE NULL END
    )
    RETURNING id INTO v_lead_id;
  END IF;

  -- Synchronous attribution linking — closes the audit gap.
  -- Best-effort: missing/empty session_id is fine; missing attribution row is fine.
  IF p_session_id IS NOT NULL AND length(TRIM(p_session_id)) > 0 THEN
    BEGIN
      UPDATE lead_attribution
      SET lead_id = v_lead_id,
          updated_at = now()
      WHERE session_id = p_session_id
        AND (lead_id IS NULL OR lead_id = v_lead_id);
    EXCEPTION WHEN OTHERS THEN
      -- Never fail lead creation because of attribution noise
      NULL;
    END;
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

REVOKE ALL ON FUNCTION public.upsert_funnel_lead(text, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_funnel_lead(text, text, text, text, jsonb, text)
  TO authenticated, anon, service_role;

-- 3. One-shot backfill: rescue leads that have answers but no bucket
UPDATE leads l
SET
  quiz_score = COALESCE(l.quiz_score, (s->>'quiz_score')::int),
  lead_score = COALESCE(l.lead_score, (s->>'lead_score')::int),
  lead_quality = COALESCE(l.lead_quality, s->>'lead_quality'),
  qualification_bucket = COALESCE(l.qualification_bucket, s->>'qualification_bucket'),
  scored_at = COALESCE(l.scored_at, now())
FROM (
  SELECT id, public.compute_lead_quality_from_answers(quiz_answers) AS s
  FROM leads
  WHERE quiz_answers IS NOT NULL
    AND (qualification_bucket IS NULL OR lead_score IS NULL)
) sub
WHERE l.id = sub.id;