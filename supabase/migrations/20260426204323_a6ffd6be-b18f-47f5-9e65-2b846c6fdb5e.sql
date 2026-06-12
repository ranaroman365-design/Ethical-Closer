-- Track quiz attempts on leads + ensure new quiz_answers ALWAYS overwrite the old payload.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_quiz_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quiz_attempt_count integer NOT NULL DEFAULT 0;

-- Replace upsert_funnel_lead so a NEW quiz attempt fully overrides the previous one
-- (incl. previously low qualification) and bumps attempt counters.
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
  v_has_answers boolean;
BEGIN
  v_normalized_email := LOWER(TRIM(p_email));

  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RETURN jsonb_build_object('error', 'Email is required');
  END IF;

  v_has_answers := p_quiz_answers IS NOT NULL
                   AND jsonb_typeof(p_quiz_answers) = 'object'
                   AND p_quiz_answers <> '{}'::jsonb;

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
      -- A new quiz attempt FULLY overrides the previous payload (no COALESCE
      -- when answers are present) so requalification is possible.
      quiz_answers = CASE WHEN v_has_answers THEN p_quiz_answers ELSE quiz_answers END,
      quiz_score   = CASE WHEN v_has_answers THEN v_quiz_score   ELSE quiz_score END,
      lead_score   = CASE WHEN v_has_answers THEN v_lead_score   ELSE lead_score END,
      lead_quality = CASE WHEN v_has_answers THEN v_lead_quality ELSE lead_quality END,
      qualification_bucket = CASE WHEN v_has_answers THEN v_qualification_bucket ELSE qualification_bucket END,
      scored_at = CASE WHEN v_has_answers THEN now() ELSE scored_at END,
      last_quiz_completed_at = CASE WHEN v_has_answers THEN now() ELSE last_quiz_completed_at END,
      quiz_attempt_count     = CASE WHEN v_has_answers THEN COALESCE(quiz_attempt_count, 0) + 1 ELSE quiz_attempt_count END,
      updated_at = now()
    WHERE id = v_existing.id;
    v_lead_id := v_existing.id;
  ELSE
    INSERT INTO leads (
      name, email, phone, source, stage, lead_level, lead_status,
      quiz_funnel_source, quiz_answers,
      quiz_score, lead_score, lead_quality, qualification_bucket, scored_at,
      last_quiz_completed_at, quiz_attempt_count
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

  -- Synchronous attribution linking — closes the audit gap.
  IF p_session_id IS NOT NULL AND length(TRIM(p_session_id)) > 0 THEN
    BEGIN
      UPDATE lead_attribution
      SET lead_id = v_lead_id,
          updated_at = now()
      WHERE session_id = p_session_id
        AND (lead_id IS NULL OR lead_id = v_lead_id);
    EXCEPTION WHEN OTHERS THEN
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