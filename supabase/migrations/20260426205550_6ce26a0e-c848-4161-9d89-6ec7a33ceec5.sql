-- Live re-read + (improving-only) recompute of lead qualification.
-- Used by the Booking page guard to avoid blocking a re-qualified lead
-- whose localStorage still carries a stale "low" verdict.
CREATE OR REPLACE FUNCTION public.refresh_lead_qualification(
  p_lead_id uuid DEFAULT NULL,
  p_email   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead          public.leads%ROWTYPE;
  v_recomputed    jsonb;
  v_new_quiz      integer;
  v_new_lead_sc   integer;
  v_new_quality   text;
  v_new_bucket    text;
  v_did_recompute boolean := false;
  v_bucket_rank   jsonb := '{"low":0,"mid":1,"high":2}'::jsonb;
BEGIN
  IF p_lead_id IS NULL AND (p_email IS NULL OR length(trim(p_email)) = 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_id_or_email_required');
  END IF;

  -- Prefer ID lookup; fall back to email (case-insensitive, most-recent wins).
  IF p_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id LIMIT 1;
  END IF;

  IF v_lead.id IS NULL AND p_email IS NOT NULL THEN
    SELECT * INTO v_lead
    FROM public.leads
    WHERE lower(email) = lower(trim(p_email))
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_lead.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  -- Recompute only when answers exist; otherwise just return current state.
  IF v_lead.quiz_answers IS NOT NULL
     AND jsonb_typeof(v_lead.quiz_answers) = 'object' THEN
    v_recomputed  := public.compute_lead_quality_from_answers(v_lead.quiz_answers);
    v_new_quiz    := NULLIF(v_recomputed->>'quiz_score','')::integer;
    v_new_lead_sc := NULLIF(v_recomputed->>'lead_score','')::integer;
    v_new_quality := v_recomputed->>'lead_quality';
    v_new_bucket  := v_recomputed->>'qualification_bucket';

    -- Improving-only write: never downgrade an already-good bucket.
    IF v_new_bucket IS NOT NULL
       AND COALESCE((v_bucket_rank->>v_new_bucket)::int, -1)
           > COALESCE((v_bucket_rank->>COALESCE(v_lead.qualification_bucket,'low'))::int, -1)
    THEN
      UPDATE public.leads
         SET quiz_score           = COALESCE(v_new_quiz, quiz_score),
             lead_score           = COALESCE(v_new_lead_sc, lead_score),
             lead_quality         = COALESCE(v_new_quality, lead_quality),
             qualification_bucket = v_new_bucket,
             scored_at            = now(),
             updated_at           = now()
       WHERE id = v_lead.id
       RETURNING * INTO v_lead;
      v_did_recompute := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',              true,
    'lead_id',              v_lead.id,
    'quiz_score',           v_lead.quiz_score,
    'lead_score',           v_lead.lead_score,
    'lead_quality',         v_lead.lead_quality,
    'qualification_bucket', v_lead.qualification_bucket,
    'recomputed',           v_did_recompute
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_lead_qualification(uuid, text)
  TO anon, authenticated;