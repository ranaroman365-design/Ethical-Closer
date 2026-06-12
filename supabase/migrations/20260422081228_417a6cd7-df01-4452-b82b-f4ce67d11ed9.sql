DROP VIEW IF EXISTS public.view_referral_audit;

CREATE VIEW public.view_referral_audit
WITH (security_invoker = true)
AS
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