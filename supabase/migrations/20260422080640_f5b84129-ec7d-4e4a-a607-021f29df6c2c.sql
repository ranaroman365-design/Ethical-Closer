ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS source_channel TEXT;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_channel
  ON public.referrals(referrer_id, source_channel);

CREATE OR REPLACE FUNCTION public.get_referral_channel_stats(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH channels AS (
    SELECT unnest(ARRAY['whatsapp','telegram','email','copy','direct']) AS channel
  ),
  shares AS (
    SELECT COALESCE(metadata->>'channel','direct') AS channel, COUNT(*) AS cnt
    FROM public.community_events
    WHERE user_id = _user_id AND event_type = 'referral_shared'
    GROUP BY 1
  ),
  refs AS (
    SELECT
      COALESCE(source_channel,'direct') AS channel,
      COUNT(*)                                              AS total,
      COUNT(*) FILTER (WHERE status = 'invited')            AS invited,
      COUNT(*) FILTER (WHERE status = 'signed')             AS signed,
      COUNT(*) FILTER (WHERE status IN ('closed','paid'))   AS closed,
      COALESCE(SUM(payout_amount) FILTER (WHERE status IN ('closed','paid')),0) AS earnings
    FROM public.referrals
    WHERE referrer_id = _user_id
    GROUP BY 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'channel',   c.channel,
      'shares',    COALESCE(s.cnt, 0),
      'total',     COALESCE(r.total, 0),
      'invited',   COALESCE(r.invited, 0),
      'signed',    COALESCE(r.signed, 0),
      'closed',    COALESCE(r.closed, 0),
      'earnings',  COALESCE(r.earnings, 0),
      'conv_rate', CASE WHEN COALESCE(s.cnt,0) > 0
                        THEN ROUND((COALESCE(r.signed,0)+COALESCE(r.closed,0))::numeric / s.cnt::numeric * 100, 1)
                        ELSE 0 END
    ) ORDER BY COALESCE(r.closed,0) DESC, COALESCE(s.cnt,0) DESC
  )
  INTO v_result
  FROM channels c
  LEFT JOIN shares s ON s.channel = c.channel
  LEFT JOIN refs   r ON r.channel = c.channel;

  RETURN COALESCE(v_result, '[]'::jsonb);
END
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_channel_stats(UUID) TO authenticated;