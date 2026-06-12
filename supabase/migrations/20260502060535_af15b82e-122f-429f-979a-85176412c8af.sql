
DROP FUNCTION IF EXISTS public.get_referral_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_referral_summary(p_user_id uuid)
RETURNS TABLE(
  total_referrals bigint,
  current_tier integer,
  reward_per_deal numeric,
  pending_amount numeric,
  eligible_amount numeric,
  paid_amount numeric,
  reversed_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT t.tier, t.reward_per_deal, t.total_closed_referrals
  INTO current_tier, reward_per_deal, total_referrals
  FROM get_referral_tier(p_user_id) t;

  SELECT COALESCE(SUM(re.frozen_reward_amount), 0) INTO pending_amount
  FROM referral_earnings re WHERE re.referrer_id = p_user_id AND re.status = 'pending';

  SELECT COALESCE(SUM(re.frozen_reward_amount), 0) INTO eligible_amount
  FROM referral_earnings re WHERE re.referrer_id = p_user_id AND re.status = 'eligible';

  SELECT COALESCE(SUM(re.frozen_reward_amount), 0) INTO paid_amount
  FROM referral_earnings re WHERE re.referrer_id = p_user_id AND re.status = 'paid';

  SELECT COALESCE(SUM(re.frozen_reward_amount), 0) INTO reversed_amount
  FROM referral_earnings re WHERE re.referrer_id = p_user_id AND re.status = 'reversed';

  RETURN NEXT;
END;
$$;
