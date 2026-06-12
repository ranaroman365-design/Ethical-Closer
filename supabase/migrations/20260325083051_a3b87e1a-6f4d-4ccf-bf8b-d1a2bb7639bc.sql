
-- Add referrer_user_id to leads table for tracking which user referred this lead
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS referrer_user_id uuid;

-- Create function to auto-grant referral reward when lead is accepted/closed
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
BEGIN
  -- Only trigger when stage changes to closed_won
  IF NEW.stage = 'closed_won' AND (OLD.stage IS DISTINCT FROM 'closed_won') THEN
    -- Check if this lead has a referrer
    IF NEW.referrer_user_id IS NOT NULL THEN
      v_referrer_id := NEW.referrer_user_id;
      
      -- Find the matching referral record
      SELECT id INTO v_referral_id
      FROM public.referrals
      WHERE referrer_id = v_referrer_id
        AND (referred_email = NEW.email OR referred_user_id = COALESCE(NEW.closer_id, NEW.setter_id, NEW.owner_id))
        AND reward_granted = false
      LIMIT 1;
      
      IF v_referral_id IS NOT NULL THEN
        -- Update referral to accepted
        UPDATE public.referrals
        SET status = 'accepted',
            accepted_at = now()
        WHERE id = v_referral_id AND status != 'accepted';
        
        -- Create the benefit
        INSERT INTO public.benefits (title, description, icon, unlock_type, unlock_value, reward_type, is_new, active)
        VALUES (
          'Amazon Voucher (100€) – Referral Reward',
          'Referral-Belohnung für erfolgreiche Empfehlung',
          'Gift',
          'milestone_based',
          'referral_' || v_referral_id::text,
          'voucher',
          true,
          true
        )
        RETURNING id INTO v_benefit_id;
        
        -- Auto-unlock for the referrer
        INSERT INTO public.user_benefits (user_id, benefit_id)
        VALUES (v_referrer_id, v_benefit_id);
        
        -- Mark referral as rewarded
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

-- Create trigger on leads table
DROP TRIGGER IF EXISTS trg_auto_grant_referral_reward ON public.leads;
CREATE TRIGGER trg_auto_grant_referral_reward
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_grant_referral_reward();

-- Add referral_tier column for future tiered rewards
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS tier integer DEFAULT 1;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS reward_amount numeric DEFAULT 100;
