-- 1. Add new columns
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS referral_index INTEGER,
  ADD COLUMN IF NOT EXISTS payout_amount NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created ON public.referrals(referrer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user ON public.referrals(referred_user_id);

-- 2. Payout calculator
CREATE OR REPLACE FUNCTION public.calc_referral_payout(idx INTEGER)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN idx = 1 THEN 150
    WHEN idx = 2 THEN 300
    WHEN idx BETWEEN 3 AND 4 THEN 400
    WHEN idx >= 5 THEN 500
    ELSE 0
  END::NUMERIC;
$$;

-- 3. Backfill: assign sequential index per referrer (by created_at) and recalculate payouts
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY referrer_id ORDER BY created_at, id) AS rn
  FROM public.referrals
)
UPDATE public.referrals r
SET referral_index = ranked.rn,
    payout_amount  = public.calc_referral_payout(ranked.rn::int)
FROM ranked
WHERE r.id = ranked.id;

-- 4. Normalize status: accepted -> closed, rejected stays, pending/applied -> invited or signed
UPDATE public.referrals SET status = 'closed'  WHERE status = 'accepted';
UPDATE public.referrals SET status = 'signed'  WHERE status = 'applied';
UPDATE public.referrals SET status = 'invited' WHERE status = 'pending';
-- rejected stays as is

-- 5. Trigger: auto-assign index + payout on insert
CREATE OR REPLACE FUNCTION public.assign_referral_index()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_idx INTEGER;
BEGIN
  IF NEW.referral_index IS NULL THEN
    SELECT COALESCE(MAX(referral_index), 0) + 1 INTO next_idx
    FROM public.referrals WHERE referrer_id = NEW.referrer_id;
    NEW.referral_index := next_idx;
  END IF;
  NEW.payout_amount := public.calc_referral_payout(NEW.referral_index);
  IF NEW.status IS NULL OR NEW.status = '' THEN
    NEW.status := 'invited';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_referral_index ON public.referrals;
CREATE TRIGGER trg_assign_referral_index
BEFORE INSERT ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.assign_referral_index();

-- 6. Trigger: when referred user reaches closer level, mark referral as closed
CREATE OR REPLACE FUNCTION public.auto_close_referral_on_promotion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.business_stage IS DISTINCT FROM OLD.business_stage
     AND NEW.business_stage IN ('junior_manager','manager','senior_manager','director','partner','inner_circle') THEN
    UPDATE public.referrals
       SET status = 'closed', accepted_at = COALESCE(accepted_at, now())
     WHERE referred_user_id = NEW.id
       AND status IN ('invited','signed');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_close_referral ON public.profiles;
CREATE TRIGGER trg_auto_close_referral
AFTER UPDATE OF business_stage ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.auto_close_referral_on_promotion();

-- 7. Dashboard RPC
CREATE OR REPLACE FUNCTION public.get_referral_dashboard(_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total INTEGER;
  v_confirmed NUMERIC;
  v_pending NUMERIC;
  v_total_earnings NUMERIC;
  v_next_index INTEGER;
  v_next_reward NUMERIC;
  v_next_threshold INTEGER;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(CASE WHEN status IN ('closed','paid') THEN payout_amount ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN status IN ('invited','signed') THEN payout_amount ELSE 0 END),0)
    INTO v_total, v_confirmed, v_pending
    FROM public.referrals WHERE referrer_id = _user_id;

  v_total_earnings := v_confirmed + v_pending;
  v_next_index := v_total + 1;
  v_next_reward := public.calc_referral_payout(v_next_index);

  -- Threshold = remaining referrals to reach next payout tier jump
  v_next_threshold := CASE
    WHEN v_total = 0 THEN 1   -- 1 to unlock 150
    WHEN v_total = 1 THEN 1   -- 1 to unlock 300
    WHEN v_total = 2 THEN 1   -- 1 to unlock 400-tier
    WHEN v_total = 3 THEN 1   -- still 400
    WHEN v_total = 4 THEN 1   -- 1 to unlock 500 top-level
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'total_referrals', v_total,
    'total_earnings', v_total_earnings,
    'confirmed_earnings', v_confirmed,
    'pending_earnings', v_pending,
    'next_index', v_next_index,
    'next_reward', v_next_reward,
    'next_threshold', v_next_threshold,
    'top_level_reached', v_total >= 5
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_referral_dashboard(UUID) TO authenticated;