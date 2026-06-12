-- Layer 40 — Personality Matching Engine

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS personality_type text,
  ADD COLUMN IF NOT EXISTS personality_confidence numeric,
  ADD COLUMN IF NOT EXISTS personality_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dominant_personality text,
  ADD COLUMN IF NOT EXISTS personality_override text,
  ADD COLUMN IF NOT EXISTS personality_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS personality_override_by uuid,
  ADD COLUMN IF NOT EXISTS personality_engine_disabled boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.wa_conversations
    ADD CONSTRAINT wa_conversations_personality_type_chk
    CHECK (personality_type IS NULL OR personality_type IN ('dominant','analytical','relational','expressive','unknown'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.wa_conversations
    ADD CONSTRAINT wa_conversations_dominant_personality_chk
    CHECK (dominant_personality IS NULL OR dominant_personality IN ('dominant','analytical','relational','expressive','unknown'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.wa_conversations
    ADD CONSTRAINT wa_conversations_personality_override_chk
    CHECK (personality_override IS NULL OR personality_override IN ('dominant','analytical','relational','expressive','unknown'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.wa_personality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  lead_id uuid,
  funnel_key text,
  message_id uuid,
  detected_personality text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  effective_personality text NOT NULL,
  smoothing_applied boolean NOT NULL DEFAULT false,
  override_active boolean NOT NULL DEFAULT false,
  signal_text text,
  reply_template_key text,
  reply_sent boolean NOT NULL DEFAULT false,
  resulted_in_booking boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_pe_detected_chk CHECK (detected_personality IN ('dominant','analytical','relational','expressive','unknown')),
  CONSTRAINT wa_pe_effective_chk CHECK (effective_personality IN ('dominant','analytical','relational','expressive','unknown'))
);

CREATE INDEX IF NOT EXISTS wa_pe_conv_idx        ON public.wa_personality_events (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_pe_funnel_idx      ON public.wa_personality_events (funnel_key, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_pe_personality_idx ON public.wa_personality_events (effective_personality, created_at DESC);

ALTER TABLE public.wa_personality_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "wa_personality_events admin full"
    ON public.wa_personality_events
    FOR ALL
    USING (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'ops_admin'::app_role)
    )
    WITH CHECK (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'owner'::app_role)
      OR public.has_role(auth.uid(), 'ops_admin'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "wa_personality_events operator scoped read"
    ON public.wa_personality_events
    FOR SELECT
    USING (
      funnel_key IS NOT NULL
      AND public.is_funnel_operator(funnel_key)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "wa_personality_events service insert"
    ON public.wa_personality_events
    FOR INSERT
    TO service_role
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.personality_performance(_funnel_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'ops_admin'::app_role)
    OR (_funnel_key IS NOT NULL AND public.is_funnel_operator(_funnel_key))
  ) THEN
    RETURN jsonb_build_object('by_personality', '[]'::jsonb, 'access', 'denied');
  END IF;

  WITH base AS (
    SELECT
      effective_personality AS personality,
      reply_sent,
      resulted_in_booking
    FROM public.wa_personality_events
    WHERE created_at >= now() - interval '30 days'
      AND (_funnel_key IS NULL OR funnel_key = _funnel_key)
  ),
  agg AS (
    SELECT
      personality,
      count(*)::int AS messages,
      count(*) FILTER (WHERE reply_sent)::int AS replies_sent,
      count(*) FILTER (WHERE resulted_in_booking)::int AS bookings
    FROM base
    GROUP BY personality
  )
  SELECT jsonb_build_object(
    'by_personality',
    coalesce(jsonb_agg(jsonb_build_object(
      'personality', personality,
      'messages', messages,
      'replies_sent', replies_sent,
      'bookings', bookings,
      'booking_rate_pct',
        CASE WHEN replies_sent > 0
          THEN round((bookings::numeric / replies_sent::numeric) * 100, 1)
          ELSE 0 END
    ) ORDER BY messages DESC), '[]'::jsonb),
    'window_days', 30,
    'funnel_key', _funnel_key
  )
  INTO result
  FROM agg;

  RETURN coalesce(result, jsonb_build_object('by_personality', '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.personality_performance(text) TO authenticated;