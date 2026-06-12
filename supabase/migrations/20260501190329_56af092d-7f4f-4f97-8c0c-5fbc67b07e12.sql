
-- Referral links table
CREATE TABLE public.referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(referral_code)
);

ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral link"
  ON public.referral_links FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own referral link"
  ON public.referral_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Referral earnings table
CREATE TABLE public.referral_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,
  deal_value NUMERIC NOT NULL DEFAULT 0,
  referral_tier INT NOT NULL CHECK (referral_tier IN (1, 2, 3)),
  reward_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'eligible', 'paid')),
  sale_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  eligible_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lead_id)
);

ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral earnings"
  ON public.referral_earnings FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_id);

CREATE POLICY "Admins can view all referral earnings"
  ON public.referral_earnings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to get referral tier based on lifetime closed referrals
CREATE OR REPLACE FUNCTION public.get_referral_tier(p_user_id UUID)
RETURNS TABLE(tier INT, reward_per_deal NUMERIC, total_closed_referrals BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM referral_earnings
  WHERE referrer_id = p_user_id
    AND status IN ('eligible', 'paid');

  total_closed_referrals := v_count;

  IF v_count >= 5 THEN
    tier := 3; reward_per_deal := 500;
  ELSIF v_count >= 3 THEN
    tier := 2; reward_per_deal := 350;
  ELSE
    tier := 1; reward_per_deal := 200;
  END IF;

  RETURN NEXT;
END;
$$;

-- Function to get referral summary for a user
CREATE OR REPLACE FUNCTION public.get_referral_summary(p_user_id UUID)
RETURNS TABLE(
  total_referrals BIGINT,
  current_tier INT,
  reward_per_deal NUMERIC,
  pending_amount NUMERIC,
  eligible_amount NUMERIC,
  paid_amount NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Get tier info
  SELECT t.tier, t.reward_per_deal, t.total_closed_referrals
  INTO current_tier, reward_per_deal, total_referrals
  FROM get_referral_tier(p_user_id) t;

  SELECT COALESCE(SUM(re.reward_amount), 0) INTO pending_amount
  FROM referral_earnings re
  WHERE re.referrer_id = p_user_id AND re.status = 'pending';

  SELECT COALESCE(SUM(re.reward_amount), 0) INTO eligible_amount
  FROM referral_earnings re
  WHERE re.referrer_id = p_user_id AND re.status = 'eligible';

  SELECT COALESCE(SUM(re.reward_amount), 0) INTO paid_amount
  FROM referral_earnings re
  WHERE re.referrer_id = p_user_id AND re.status = 'paid';

  RETURN NEXT;
END;
$$;

-- Auto-transition pending → eligible after 14 days
CREATE OR REPLACE FUNCTION public.mature_referral_earnings()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE referral_earnings
  SET status = 'eligible',
      eligible_at = now()
  WHERE status = 'pending'
    AND sale_date + INTERVAL '14 days' <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
