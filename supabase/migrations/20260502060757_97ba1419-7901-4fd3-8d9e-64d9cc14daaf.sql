
-- Schema patches (idempotent)
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referral_attributed_at timestamptz;

ALTER TABLE public.referral_earnings
  ADD COLUMN IF NOT EXISTS paid_by uuid,
  ADD COLUMN IF NOT EXISTS payout_reference text,
  ADD COLUMN IF NOT EXISTS payout_batch_id uuid,
  ADD COLUMN IF NOT EXISTS payout_note text,
  ADD COLUMN IF NOT EXISTS fraud_review_status text NOT NULL DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS frozen_reward_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earned_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS referred_user_id uuid,
  ADD COLUMN IF NOT EXISTS clawback_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.referral_earnings ALTER COLUMN eligible_at SET DEFAULT (now() + interval '14 days');

DO $$ BEGIN
  ALTER TABLE public.referral_earnings ADD CONSTRAINT uq_referral_earnings_referrer_lead UNIQUE (referrer_id, lead_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Resolve referral code
CREATE OR REPLACE FUNCTION public.resolve_referral_code(p_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT user_id FROM referral_links WHERE referral_code = p_code LIMIT 1),
    (SELECT id FROM profiles WHERE referral_code = p_code LIMIT 1)
  );
$$;

-- Drop old overloads of upsert_funnel_lead that don't have p_referral_code
DROP FUNCTION IF EXISTS public.upsert_funnel_lead(text, text, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.upsert_funnel_lead(text, text, text, text, jsonb, text, text);

-- Updated upsert_funnel_lead
CREATE OR REPLACE FUNCTION public.upsert_funnel_lead(
  p_name text,
  p_email text,
  p_phone text,
  p_funnel_source text,
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

-- Create referral earning for a closed lead
CREATE OR REPLACE FUNCTION public.create_referral_earning_for_lead(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_tier record;
  v_existing_id uuid;
BEGIN
  SELECT id, referrer_user_id, owner_id, closer_id, setter_id, deal_value
  INTO v_lead FROM leads WHERE id = p_lead_id;

  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead not found');
  END IF;
  IF v_lead.referrer_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No referrer on lead');
  END IF;
  -- Self-referral block
  IF v_lead.referrer_user_id IN (v_lead.owner_id, v_lead.closer_id, v_lead.setter_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Self-referral blocked');
  END IF;
  -- Duplicate check
  SELECT id INTO v_existing_id FROM referral_earnings
  WHERE referrer_id = v_lead.referrer_user_id AND lead_id = p_lead_id;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Earning already exists');
  END IF;

  SELECT tier, reward_per_deal INTO v_tier FROM get_referral_tier(v_lead.referrer_user_id);

  INSERT INTO referral_earnings (
    referrer_id, lead_id, deal_value, referral_tier, reward_amount,
    frozen_reward_amount, status, sale_date, earned_at, eligible_at, fraud_review_status
  ) VALUES (
    v_lead.referrer_user_id, p_lead_id, COALESCE(v_lead.deal_value, 0),
    v_tier.tier, v_tier.reward_per_deal, v_tier.reward_per_deal,
    'pending', now(), now(), now() + interval '14 days', 'clear'
  );

  RETURN jsonb_build_object('success', true, 'tier', v_tier.tier, 'reward', v_tier.reward_per_deal);
END;
$$;

-- Updated mature function
CREATE OR REPLACE FUNCTION public.mature_referral_earnings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE referral_earnings SET status = 'eligible'
  WHERE status = 'pending' AND eligible_at <= now() AND fraud_review_status = 'clear';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Reverse/clawback
CREATE OR REPLACE FUNCTION public.reverse_referral_earning(p_lead_id uuid, p_reason text DEFAULT 'refund')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_earning record;
BEGIN
  SELECT id, status, paid_at INTO v_earning FROM referral_earnings WHERE lead_id = p_lead_id LIMIT 1;
  IF v_earning IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No earning found');
  END IF;
  UPDATE referral_earnings SET
    status = 'reversed', fraud_review_status = 'review', payout_note = p_reason,
    clawback_required = CASE WHEN v_earning.paid_at IS NOT NULL THEN true ELSE false END
  WHERE id = v_earning.id;
  RETURN jsonb_build_object('success', true, 'clawback_required', v_earning.paid_at IS NOT NULL);
END;
$$;

-- RLS hardening
DROP POLICY IF EXISTS "Users can view own referral earnings" ON referral_earnings;
DROP POLICY IF EXISTS "Admins can view all referral earnings" ON referral_earnings;
DROP POLICY IF EXISTS "Admins full access referral earnings" ON referral_earnings;

CREATE POLICY "Users can view own referral earnings"
ON referral_earnings FOR SELECT TO authenticated
USING (auth.uid() = referrer_id);

CREATE POLICY "Admins full access referral earnings"
ON referral_earnings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
