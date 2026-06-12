-- Add missing columns for funnel lead capture
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS quiz_funnel_source TEXT,
ADD COLUMN IF NOT EXISTS quiz_answers JSONB,
ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'interessent',
ADD COLUMN IF NOT EXISTS booking_status TEXT DEFAULT 'none';

-- Drop old restrictive insert policy
DROP POLICY IF EXISTS "Public insert leads from bewerbung" ON public.leads;

-- Create new anon insert policy for funnel forms
CREATE POLICY "Anon insert leads from funnel" ON public.leads
FOR INSERT TO anon
WITH CHECK (
  stage = 'new'
  AND source IN ('bewerbung', 'funnel_lifestyle', 'funnel_income', 'funnel_freiheit')
  AND lead_status = 'interessent'
);

-- RPC for upsert to handle duplicates safely
CREATE OR REPLACE FUNCTION public.upsert_funnel_lead(
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT DEFAULT NULL,
  p_funnel_source TEXT DEFAULT 'lifestyle',
  p_quiz_answers JSONB DEFAULT NULL
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
BEGIN
  v_normalized_email := LOWER(TRIM(p_email));

  IF v_normalized_email IS NULL OR v_normalized_email = '' THEN
    RETURN jsonb_build_object('error', 'Email is required');
  END IF;

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
      updated_at = now()
    WHERE id = v_existing.id;
    v_lead_id := v_existing.id;
  ELSE
    INSERT INTO leads (name, email, phone, source, stage, lead_level, lead_status, quiz_funnel_source, quiz_answers)
    VALUES (
      TRIM(p_name),
      v_normalized_email,
      NULLIF(TRIM(p_phone), ''),
      'funnel_' || p_funnel_source,
      'new',
      'L0',
      'interessent',
      p_funnel_source,
      p_quiz_answers
    )
    RETURNING id INTO v_lead_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id);
END;
$$;

-- RPC to convert lead to bewerber on booking
CREATE OR REPLACE FUNCTION public.convert_lead_to_bewerber(p_email TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead_id uuid;
  v_normalized_email text;
BEGIN
  v_normalized_email := LOWER(TRIM(p_email));

  SELECT id INTO v_lead_id
  FROM leads
  WHERE LOWER(TRIM(email)) = v_normalized_email
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;

  UPDATE leads SET
    lead_status = 'bewerber',
    booking_status = 'booked',
    updated_at = now()
  WHERE id = v_lead_id;

  RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id);
END;
$$;