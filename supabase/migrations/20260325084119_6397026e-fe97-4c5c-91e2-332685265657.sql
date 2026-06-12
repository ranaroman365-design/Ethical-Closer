-- Update the auto_grant_referral_reward function to support tiered rewards
-- Tier 1 (1-2 referrals): 100€
-- Tier 2 (3-4 referrals): 150€  
-- Tier 3 (5+ referrals): 200€

CREATE OR REPLACE FUNCTION public.auto_grant_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referral_id uuid;
  v_benefit_id uuid;
  v_referrer_id uuid;
  v_accepted_count int;
  v_reward_amount numeric;
  v_tier int;
BEGIN
  IF NEW.stage = 'closed_won' AND (OLD.stage IS DISTINCT FROM 'closed_won') THEN
    IF NEW.referrer_user_id IS NOT NULL THEN
      v_referrer_id := NEW.referrer_user_id;
      
      SELECT id INTO v_referral_id
      FROM public.referrals
      WHERE referrer_id = v_referrer_id
        AND (referred_email = NEW.email OR referred_user_id = COALESCE(NEW.closer_id, NEW.setter_id, NEW.owner_id))
        AND reward_granted = false
      LIMIT 1;
      
      IF v_referral_id IS NOT NULL THEN
        -- Count existing accepted referrals for tiered pricing
        SELECT count(*) INTO v_accepted_count
        FROM public.referrals
        WHERE referrer_id = v_referrer_id AND status = 'accepted';
        
        -- Determine tier and reward amount (count is BEFORE this one)
        IF v_accepted_count >= 4 THEN
          v_reward_amount := 200;
          v_tier := 3;
        ELSIF v_accepted_count >= 2 THEN
          v_reward_amount := 150;
          v_tier := 2;
        ELSE
          v_reward_amount := 100;
          v_tier := 1;
        END IF;
        
        -- Update referral to accepted
        UPDATE public.referrals
        SET status = 'accepted',
            accepted_at = now(),
            tier = v_tier,
            reward_amount = v_reward_amount
        WHERE id = v_referral_id AND status != 'accepted';
        
        -- Create the benefit
        INSERT INTO public.benefits (title, description, icon, unlock_type, unlock_value, reward_type, is_new, active)
        VALUES (
          'Amazon Voucher (' || v_reward_amount::text || '€) – Referral Reward',
          'Referral-Belohnung für erfolgreiche Empfehlung (Tier ' || v_tier::text || ')',
          'Gift',
          'milestone_based',
          'referral_' || v_referral_id::text,
          'voucher',
          true,
          true
        )
        RETURNING id INTO v_benefit_id;
        
        INSERT INTO public.user_benefits (user_id, benefit_id)
        VALUES (v_referrer_id, v_benefit_id);
        
        UPDATE public.referrals
        SET reward_granted = true,
            reward_granted_at = now(),
            reward_benefit_id = v_benefit_id
        WHERE id = v_referral_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;