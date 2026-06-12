-- ── Inner Voice Library ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE inner_voice_scenario AS ENUM
    ('objection','closing','mindset','breakthrough','deal','mistake');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.inner_voice_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  scenario_type inner_voice_scenario NOT NULL,
  content text NOT NULL,
  lesson text NOT NULL,
  difficulty_level int NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 6),
  display_order int NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  last_shown_at timestamptz,
  shown_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iv_posts_active
  ON public.inner_voice_posts (is_published, last_shown_at NULLS FIRST);

ALTER TABLE public.inner_voice_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read inner voice"
  ON public.inner_voice_posts FOR SELECT
  TO authenticated USING (is_published = true);
CREATE POLICY "Admins manage inner voice"
  ON public.inner_voice_posts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- ── User Conversion State ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_conversion_state (
  user_id uuid PRIMARY KEY,
  first_active_at timestamptz NOT NULL DEFAULT now(),
  days_active int NOT NULL DEFAULT 1,
  posts_count int NOT NULL DEFAULT 0,
  comments_count int NOT NULL DEFAULT 0,
  credits_snapshot int NOT NULL DEFAULT 0,
  triggers_fired text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_bridge_shown_at timestamptz,
  last_bridge_type text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_conversion_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own conversion state"
  ON public.user_conversion_state FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "User upserts own conversion state"
  ON public.user_conversion_state FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User updates own conversion state"
  ON public.user_conversion_state FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all conversion state"
  ON public.user_conversion_state FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- ── Mid Ticket Offers ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mid_ticket_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  description text NOT NULL,
  price_cents int NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  unlock_credits int NOT NULL DEFAULT 300,
  checkout_url text,
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mid_ticket_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read active offers"
  ON public.mid_ticket_offers FOR SELECT
  TO authenticated USING (is_active = true);
CREATE POLICY "Admins manage offers"
  ON public.mid_ticket_offers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

-- ── Trigger evaluation function ───────────────────────────────
CREATE OR REPLACE FUNCTION public.evaluate_conversion_triggers(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state public.user_conversion_state;
  v_days int;
  v_credits int;
  v_eligible_trigger text;
  v_cta_type text;
  v_offer_id uuid;
BEGIN
  -- Upsert initial state
  INSERT INTO public.user_conversion_state (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_state FROM public.user_conversion_state WHERE user_id = _user_id;

  v_days := GREATEST(1, EXTRACT(DAY FROM (now() - v_state.first_active_at))::int);

  -- Refresh credits & counts from source-of-truth tables
  SELECT COALESCE(SUM(amount), 0) INTO v_credits
    FROM public.credit_transactions WHERE user_id = _user_id;

  -- Determine eligible trigger (highest reached, not yet fired)
  v_cta_type := NULL;
  IF v_credits >= 300 AND NOT ('mid_ticket_offer' = ANY(v_state.triggers_fired)) THEN
    v_eligible_trigger := 'mid_ticket_offer';
    v_cta_type := 'progress';
    SELECT id INTO v_offer_id FROM public.mid_ticket_offers
      WHERE is_active = true AND unlock_credits <= v_credits
      ORDER BY display_order LIMIT 1;
  ELSIF v_credits >= 150 AND NOT ('opportunity_unlock' = ANY(v_state.triggers_fired)) THEN
    v_eligible_trigger := 'opportunity_unlock';
    v_cta_type := 'identity';
  ELSIF v_state.posts_count >= 3 AND v_state.comments_count >= 5
        AND NOT ('you_are_ready' = ANY(v_state.triggers_fired)) THEN
    v_eligible_trigger := 'you_are_ready';
    v_cta_type := 'identity';
  ELSIF v_days >= 7 AND NOT ('first_hint' = ANY(v_state.triggers_fired)) THEN
    v_eligible_trigger := 'first_hint';
    v_cta_type := 'curiosity';
  END IF;

  -- Update snapshot
  UPDATE public.user_conversion_state
    SET days_active = v_days,
        credits_snapshot = v_credits,
        updated_at = now()
    WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'days_active', v_days,
    'credits', v_credits,
    'posts_count', v_state.posts_count,
    'comments_count', v_state.comments_count,
    'triggers_fired', v_state.triggers_fired,
    'eligible_trigger', v_eligible_trigger,
    'cta_type', v_cta_type,
    'offer_id', v_offer_id,
    'cooldown_ok', (v_state.last_bridge_shown_at IS NULL
      OR v_state.last_bridge_shown_at < now() - interval '24 hours'),
    'show_allowed', v_days >= 6  -- timing rule: never pitch Day 1-5
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_bridge_shown(_user_id uuid, _trigger text, _cta_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_conversion_state (user_id, triggers_fired, last_bridge_shown_at, last_bridge_type)
  VALUES (_user_id, ARRAY[_trigger], now(), _cta_type)
  ON CONFLICT (user_id) DO UPDATE
    SET triggers_fired = (
          SELECT array_agg(DISTINCT t)
          FROM unnest(public.user_conversion_state.triggers_fired || _trigger) AS t
        ),
        last_bridge_shown_at = now(),
        last_bridge_type = _cta_type,
        updated_at = now();
END;
$$;