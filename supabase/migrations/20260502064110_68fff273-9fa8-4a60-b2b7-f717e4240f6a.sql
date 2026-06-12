
-- ═══════════════════════════════════════════════════════════════
-- 1. Fix status constraint to allow 'reversed'
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.referral_earnings DROP CONSTRAINT IF EXISTS referral_earnings_status_check;
ALTER TABLE public.referral_earnings ADD CONSTRAINT referral_earnings_status_check
  CHECK (status IN ('pending', 'eligible', 'paid', 'reversed'));

-- ═══════════════════════════════════════════════════════════════
-- 2. Trigger: create referral earning when payment_links.status → 'paid'
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_referral_earning_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status transitions to 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') AND NEW.lead_id IS NOT NULL THEN
    -- Best-effort: don't fail the payment if referral earning fails
    BEGIN
      PERFORM create_referral_earning_for_lead(NEW.lead_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Referral earning creation failed for lead %: %', NEW.lead_id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_referral_earning_on_payment ON public.payment_links;
CREATE TRIGGER trg_create_referral_earning_on_payment
  AFTER UPDATE OF status ON public.payment_links
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION trg_referral_earning_on_payment();

-- Also handle INSERT with status='paid' (edge case: direct insert as paid)
DROP TRIGGER IF EXISTS trg_create_referral_earning_on_payment_insert ON public.payment_links;
CREATE TRIGGER trg_create_referral_earning_on_payment_insert
  AFTER INSERT ON public.payment_links
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION trg_referral_earning_on_payment();

-- ═══════════════════════════════════════════════════════════════
-- 3. Clawback trigger: reverse earning on refund/dispute
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_clawback_referral_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('refunded', 'disputed', 'chargeback') 
     AND OLD.status IS DISTINCT FROM NEW.status 
     AND NEW.lead_id IS NOT NULL THEN
    BEGIN
      PERFORM reverse_referral_earning(NEW.lead_id, NEW.status);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Referral clawback failed for lead %: %', NEW.lead_id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clawback_referral_on_refund ON public.payment_links;
CREATE TRIGGER trg_clawback_referral_on_refund
  AFTER UPDATE OF status ON public.payment_links
  FOR EACH ROW
  WHEN (NEW.status IN ('refunded', 'disputed', 'chargeback'))
  EXECUTE FUNCTION trg_clawback_referral_on_refund();

-- ═══════════════════════════════════════════════════════════════
-- 4. Deprecate legacy auto_grant_referral_reward (uses old referrals table)
-- Replace with no-op so trigger doesn't error but doesn't create dupes
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auto_grant_referral_reward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- DEPRECATED: Referral earnings are now created via payment_links trigger
  -- (trg_create_referral_earning_on_payment → create_referral_earning_for_lead)
  -- This function is a no-op to prevent legacy dual-earning.
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5. Enable extensions for cron
-- ═══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ═══════════════════════════════════════════════════════════════
-- 6. RLS hardening on referral_earnings
-- ═══════════════════════════════════════════════════════════════
-- Drop existing policies and recreate
DROP POLICY IF EXISTS "Admins full access referral earnings" ON public.referral_earnings;
DROP POLICY IF EXISTS "Users can view own referral earnings" ON public.referral_earnings;

-- SELECT: users see own, admins see all
CREATE POLICY "Users view own referral earnings"
  ON public.referral_earnings FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_id OR has_role(auth.uid(), 'admin'::app_role));

-- INSERT: service role only (via SECURITY DEFINER functions)
-- No INSERT policy for authenticated = blocked by default with RLS enabled

-- UPDATE: admin only (for status changes, payout marking)
CREATE POLICY "Admins update referral earnings"
  ON public.referral_earnings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- DELETE: nobody (append-only)
-- No DELETE policy = blocked by default
