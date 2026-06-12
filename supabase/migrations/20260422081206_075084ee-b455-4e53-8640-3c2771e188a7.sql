-- 1. History table
CREATE TABLE IF NOT EXISTS public.referral_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  referrer_id UUID,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID,
  source TEXT NOT NULL DEFAULT 'system', -- system | admin | trigger | webhook
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rsh_referral ON public.referral_status_history(referral_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rsh_status   ON public.referral_status_history(new_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rsh_created  ON public.referral_status_history(created_at DESC);

ALTER TABLE public.referral_status_history ENABLE ROW LEVEL SECURITY;

-- Admins/owners can read all history
CREATE POLICY "Admins can read referral history"
ON public.referral_status_history FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'owner'::app_role)
);

-- 2. Trigger function: log status transitions and inserts
CREATE OR REPLACE FUNCTION public.log_referral_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.referral_status_history(referral_id, referrer_id, old_status, new_status, changed_by, source)
    VALUES (NEW.id, NEW.referrer_id, NULL, COALESCE(NEW.status,'invited'), auth.uid(), 'trigger');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.referral_status_history(referral_id, referrer_id, old_status, new_status, changed_by, source)
    VALUES (NEW.id, NEW.referrer_id, OLD.status, NEW.status, auth.uid(), 'trigger');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_referral_status ON public.referrals;
CREATE TRIGGER trg_log_referral_status
AFTER INSERT OR UPDATE OF status ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.log_referral_status_change();

-- 3. Backfill: one synthetic history row per existing referral
INSERT INTO public.referral_status_history(referral_id, referrer_id, old_status, new_status, source, created_at)
SELECT r.id, r.referrer_id, NULL, r.status, 'backfill', r.created_at
FROM public.referrals r
WHERE NOT EXISTS (
  SELECT 1 FROM public.referral_status_history h WHERE h.referral_id = r.id
);

-- 4. Convenience view: full referral with last_changed_at + transition count
CREATE OR REPLACE VIEW public.view_referral_audit AS
SELECT
  r.id,
  r.referrer_id,
  r.referred_email,
  r.referred_user_id,
  r.status,
  r.referral_index,
  r.payout_amount,
  r.source_channel,
  r.reward_granted,
  r.created_at,
  r.accepted_at,
  r.reward_granted_at,
  (SELECT COUNT(*) FROM public.referral_status_history h WHERE h.referral_id = r.id) AS transition_count,
  (SELECT MAX(created_at) FROM public.referral_status_history h WHERE h.referral_id = r.id) AS last_changed_at,
  pr.full_name  AS referrer_name,
  pr.email      AS referrer_email
FROM public.referrals r
LEFT JOIN public.profiles pr ON pr.id = r.referrer_id;

GRANT SELECT ON public.view_referral_audit TO authenticated;