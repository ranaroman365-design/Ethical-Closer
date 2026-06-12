-- Layer 39 — Psychological State Engine (schema)
-- Adds state columns to wa_conversations + state events log + override capability.

-- 1. Add psych state columns to wa_conversations
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS psych_state text
    CHECK (psych_state IS NULL OR psych_state = ANY (ARRAY['uncertain','busy','rational','dominant','neutral'])),
  ADD COLUMN IF NOT EXISTS psych_state_confidence numeric,
  ADD COLUMN IF NOT EXISTS psych_state_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dominant_state text
    CHECK (dominant_state IS NULL OR dominant_state = ANY (ARRAY['uncertain','busy','rational','dominant','neutral'])),
  ADD COLUMN IF NOT EXISTS state_override text
    CHECK (state_override IS NULL OR state_override = ANY (ARRAY['uncertain','busy','rational','dominant','neutral'])),
  ADD COLUMN IF NOT EXISTS state_override_by uuid,
  ADD COLUMN IF NOT EXISTS state_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS psych_engine_disabled boolean NOT NULL DEFAULT false;

-- 2. Per-message state record + per-state outcome tracking
CREATE TABLE IF NOT EXISTS public.wa_psych_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  lead_id uuid,
  funnel_key text,
  message_id uuid REFERENCES public.wa_messages(id) ON DELETE SET NULL,
  detected_state text NOT NULL
    CHECK (detected_state = ANY (ARRAY['uncertain','busy','rational','dominant','neutral'])),
  confidence numeric NOT NULL DEFAULT 0,
  effective_state text NOT NULL
    CHECK (effective_state = ANY (ARRAY['uncertain','busy','rational','dominant','neutral'])),
  smoothing_applied boolean NOT NULL DEFAULT false,
  override_active boolean NOT NULL DEFAULT false,
  signal_text text,
  reply_template_key text,
  reply_sent boolean NOT NULL DEFAULT false,
  led_to_booking boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_psych_events_conv ON public.wa_psych_state_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_psych_events_state ON public.wa_psych_state_events(effective_state, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_psych_events_funnel ON public.wa_psych_state_events(funnel_key, created_at DESC);

ALTER TABLE public.wa_psych_state_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_psych_events_admin_all" ON public.wa_psych_state_events
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'ops_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'ops_admin'::app_role));

CREATE POLICY "wa_psych_events_l6_scoped" ON public.wa_psych_state_events
  FOR SELECT TO authenticated
  USING (funnel_key IS NOT NULL AND is_funnel_operator(funnel_key));

-- 3. Per-state performance aggregate RPC (read-only, scoped)
CREATE OR REPLACE FUNCTION public.psych_state_performance(_funnel_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := has_role(auth.uid(), 'admin'::app_role)
                     OR has_role(auth.uid(), 'owner'::app_role)
                     OR has_role(auth.uid(), 'ops_admin'::app_role);
  v_result jsonb;
BEGIN
  IF NOT v_is_admin AND (_funnel_key IS NULL OR NOT is_funnel_operator(_funnel_key)) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT jsonb_build_object(
    'window_days', 30,
    'by_state', COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      effective_state AS state,
      count(*) AS messages,
      count(*) FILTER (WHERE reply_sent) AS replies_sent,
      count(*) FILTER (WHERE led_to_booking) AS bookings,
      ROUND(
        CASE WHEN count(*) FILTER (WHERE reply_sent) > 0
          THEN 100.0 * count(*) FILTER (WHERE led_to_booking) / count(*) FILTER (WHERE reply_sent)
          ELSE 0 END, 1
      ) AS booking_rate_pct
    FROM public.wa_psych_state_events
    WHERE created_at >= now() - interval '30 days'
      AND (_funnel_key IS NULL OR funnel_key = _funnel_key)
    GROUP BY effective_state
    ORDER BY messages DESC
  ) t;

  RETURN COALESCE(v_result, jsonb_build_object('window_days', 30, 'by_state', '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.psych_state_performance(text) TO authenticated;