-- 1. Add variant_key to dispatch log
ALTER TABLE public.communication_dispatch_log
  ADD COLUMN IF NOT EXISTS variant_key TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_dispatch_template_variant
  ON public.communication_dispatch_log (template_key, variant_key, dispatched_at DESC);

-- 2. Conversion events table
CREATE TABLE IF NOT EXISTS public.communication_conversion_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_log_id UUID NULL REFERENCES public.communication_dispatch_log(id) ON DELETE SET NULL,
  event_key TEXT NOT NULL,
  template_key TEXT NULL,
  variant_key TEXT NULL,
  conversion_type TEXT NOT NULL CHECK (conversion_type IN ('reply','click','booking','show','close','reschedule','custom')),
  lead_id UUID NULL,
  user_id UUID NULL,
  value_eur NUMERIC(12,2) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comm_conv_template_variant
  ON public.communication_conversion_events (template_key, variant_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_conv_event
  ON public.communication_conversion_events (event_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_conv_lead
  ON public.communication_conversion_events (lead_id, occurred_at DESC);

ALTER TABLE public.communication_conversion_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and L6+ read conversion events"
  ON public.communication_conversion_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.current_phase, 0) >= 6
    )
  );

CREATE POLICY "Service role writes conversion events"
  ON public.communication_conversion_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 3. Helper: link a conversion to most recent matching dispatch within 7d
CREATE OR REPLACE FUNCTION public.record_communication_conversion(
  p_event_key TEXT,
  p_conversion_type TEXT,
  p_lead_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_value_eur NUMERIC DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dispatch_id UUID;
  v_template_key TEXT;
  v_variant_key TEXT;
  v_conv_id UUID;
BEGIN
  SELECT id, template_key, variant_key
    INTO v_dispatch_id, v_template_key, v_variant_key
  FROM public.communication_dispatch_log
  WHERE event_key = p_event_key
    AND status = 'sent'
    AND dispatched_at > now() - interval '7 days'
    AND (
      (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
      OR (p_user_id IS NOT NULL AND user_id = p_user_id)
    )
  ORDER BY dispatched_at DESC
  LIMIT 1;

  INSERT INTO public.communication_conversion_events
    (dispatch_log_id, event_key, template_key, variant_key, conversion_type,
     lead_id, user_id, value_eur, metadata)
  VALUES
    (v_dispatch_id, p_event_key, v_template_key, v_variant_key, p_conversion_type,
     p_lead_id, p_user_id, p_value_eur, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_conv_id;

  RETURN v_conv_id;
END;
$$;

-- 4. Leaderboard view: per template+variant sent / conv / rate
CREATE OR REPLACE VIEW public.v_communication_ab_leaderboard AS
WITH sent AS (
  SELECT
    event_key,
    template_key,
    COALESCE(variant_key, 'control') AS variant_key,
    COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
    MAX(dispatched_at) AS last_sent_at
  FROM public.communication_dispatch_log
  WHERE template_key IS NOT NULL
  GROUP BY event_key, template_key, COALESCE(variant_key, 'control')
),
conv AS (
  SELECT
    event_key,
    template_key,
    COALESCE(variant_key, 'control') AS variant_key,
    COUNT(*) AS conversions,
    COUNT(*) FILTER (WHERE conversion_type IN ('booking','show','close')) AS hard_conversions,
    COALESCE(SUM(value_eur), 0)::NUMERIC AS total_value_eur
  FROM public.communication_conversion_events
  WHERE template_key IS NOT NULL
  GROUP BY event_key, template_key, COALESCE(variant_key, 'control')
)
SELECT
  s.event_key,
  s.template_key,
  s.variant_key,
  s.sent_count,
  COALESCE(c.conversions, 0)        AS conversions,
  COALESCE(c.hard_conversions, 0)   AS hard_conversions,
  COALESCE(c.total_value_eur, 0)    AS total_value_eur,
  CASE WHEN s.sent_count > 0
       THEN ROUND( COALESCE(c.conversions, 0)::NUMERIC * 100.0 / s.sent_count, 2)
       ELSE 0 END                   AS conversion_rate_pct,
  CASE WHEN s.sent_count > 0
       THEN ROUND( COALESCE(c.hard_conversions, 0)::NUMERIC * 100.0 / s.sent_count, 2)
       ELSE 0 END                   AS hard_conversion_rate_pct,
  s.last_sent_at
FROM sent s
LEFT JOIN conv c
  ON c.event_key = s.event_key
 AND c.template_key = s.template_key
 AND c.variant_key = s.variant_key;

GRANT SELECT ON public.v_communication_ab_leaderboard TO authenticated;