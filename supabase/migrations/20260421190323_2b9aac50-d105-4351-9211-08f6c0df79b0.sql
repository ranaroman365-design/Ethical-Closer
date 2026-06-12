-- ═══════════════════════════════════════════════════════════════════
-- USER SEGMENTATION ENGINE — A-Player Detection
-- Table: user_segments
-- Function: update_user_score(uuid, text) — pure SQL, called by trigger
-- Function: get_user_segment(uuid) — on-read with inactivity decay
-- Trigger: on community_events insert → score update
-- View: admin_segment_distribution (for KPI dashboard)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. SEGMENTS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_segments (
  user_id      uuid PRIMARY KEY,
  segment      text NOT NULL DEFAULT 'observer',
  score        int  NOT NULL DEFAULT 0,
  raw_score    int  NOT NULL DEFAULT 0,        -- pre-decay, persistent
  flags        jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_at timestamptz,
  last_updated timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_us_segment ON public.user_segments (segment);
CREATE INDEX IF NOT EXISTS idx_us_score   ON public.user_segments (score DESC);

ALTER TABLE public.user_segments ENABLE ROW LEVEL SECURITY;

-- members read own; admin/director (via existing helper) read all
CREATE POLICY "us_user_read_own" ON public.user_segments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "us_admin_read_all" ON public.user_segments
  FOR SELECT USING (public.is_kpi_viewer(auth.uid()));

-- ── 2. SEGMENT FROM SCORE ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.segment_for_score(_score int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _score <= 10 THEN 'observer'
    WHEN _score <= 25 THEN 'participant'
    WHEN _score <= 45 THEN 'engaged'
    WHEN _score <= 70 THEN 'builder'
    ELSE 'a_player'
  END;
$$;

-- ── 3. UPDATE SCORE (called by trigger) ─────────────────────────
CREATE OR REPLACE FUNCTION public.update_user_score(_user_id uuid, _event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  delta int := 0;
  cur   public.user_segments%ROWTYPE;
  new_raw int;
  new_clamped int;
  metrics public.community_user_metrics%ROWTYPE;
  replies_received int := 0;
  new_flags jsonb := '{}'::jsonb;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  -- score deltas per event
  delta := CASE _event
    WHEN 'login'         THEN 1
    WHEN 'streak_day'    THEN 2
    WHEN 'post'          THEN 5
    WHEN 'comment'       THEN 3
    WHEN 'reply_received' THEN 2
    WHEN 'reaction'      THEN 1
    WHEN 'level_up'      THEN 10
    WHEN 'upgrade_click' THEN 10
    WHEN 'high_content_view' THEN 8
    WHEN 'aplayer_apply' THEN 20
    ELSE 0
  END;

  -- ensure row exists
  INSERT INTO public.user_segments (user_id) VALUES (_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO cur FROM public.user_segments WHERE user_id = _user_id;
  SELECT * INTO metrics FROM public.community_user_metrics WHERE user_id = _user_id;

  new_raw := GREATEST(0, cur.raw_score + delta);

  -- credits bonus: +1 per 10 credits (recomputed not added, to stay deterministic)
  IF metrics.credits IS NOT NULL THEN
    new_raw := new_raw + FLOOR(metrics.credits / 10)::int;
  END IF;

  new_clamped := LEAST(100, GREATEST(0, new_raw));

  -- replies received (other users replying to my posts)
  SELECT count(*) INTO replies_received
    FROM public.community_messages m
   WHERE m.reply_to IN (SELECT id FROM public.community_messages WHERE user_id = _user_id)
     AND m.user_id <> _user_id;

  -- flags
  new_flags := jsonb_build_object(
    'consistent_user', COALESCE(metrics.current_streak, 0) >= 7,
    'social_leader',   replies_received >= 10,
    'high_intent',     COALESCE((cur.flags->>'upgrade_clicked')::boolean, false)
                       AND COALESCE(metrics.posts_count, 0) >= 3,
    'fast_responder',  COALESCE((cur.flags->>'fast_responder')::boolean, false),
    'upgrade_clicked', COALESCE((cur.flags->>'upgrade_clicked')::boolean, false)
                       OR _event = 'upgrade_click'
  );

  UPDATE public.user_segments
     SET raw_score    = new_raw,
         score        = new_clamped,
         segment      = public.segment_for_score(new_clamped),
         flags        = new_flags,
         last_event_at = now(),
         last_updated = now()
   WHERE user_id = _user_id;
END;
$$;

-- ── 4. GET USER SEGMENT (on-read with inactivity decay) ─────────
CREATE OR REPLACE FUNCTION public.get_user_segment(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur public.user_segments%ROWTYPE;
  days_inactive int;
  decay int := 0;
  effective_score int;
  is_aplayer boolean;
BEGIN
  SELECT * INTO cur FROM public.user_segments WHERE user_id = _user_id;
  IF cur.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'segment','observer','score',0,'raw_score',0,
      'flags','{}'::jsonb,'is_aplayer',false,'days_inactive',NULL
    );
  END IF;

  days_inactive := COALESCE(EXTRACT(DAY FROM (now() - cur.last_event_at))::int, 999);
  IF days_inactive >= 7 THEN decay := 10;
  ELSIF days_inactive >= 3 THEN decay := 5;
  END IF;

  effective_score := GREATEST(0, cur.score - decay);

  is_aplayer := effective_score > 70
    AND (
      COALESCE((cur.flags->>'consistent_user')::boolean, false)
      OR COALESCE((cur.flags->>'high_intent')::boolean, false)
    )
    AND days_inactive <= 3;

  RETURN jsonb_build_object(
    'segment',       public.segment_for_score(effective_score),
    'score',         effective_score,
    'raw_score',     cur.raw_score,
    'flags',         cur.flags,
    'is_aplayer',    is_aplayer,
    'days_inactive', days_inactive,
    'last_updated',  cur.last_updated
  );
END;
$$;

-- ── 5. TRIGGER: community_events → score update ─────────────────
CREATE OR REPLACE FUNCTION public.trg_event_to_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.update_user_score(NEW.user_id, NEW.event_type);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_events_score ON public.community_events;
CREATE TRIGGER trg_community_events_score
  AFTER INSERT ON public.community_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_event_to_score();

-- ── 6. KPI: SEGMENT DISTRIBUTION (admin/director only) ──────────
CREATE OR REPLACE FUNCTION public.kpi_segment_distribution()
RETURNS TABLE (segment text, user_count int, avg_score numeric, aplayer_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_kpi_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT s.segment,
         count(*)::int,
         ROUND(AVG(s.score)::numeric, 1),
         count(*) FILTER (
           WHERE s.score > 70
             AND ((s.flags->>'consistent_user')::boolean = true
                  OR (s.flags->>'high_intent')::boolean = true)
             AND s.last_event_at >= now() - interval '3 days'
         )::int
    FROM public.user_segments s
   GROUP BY s.segment
   ORDER BY CASE s.segment
     WHEN 'observer'    THEN 1
     WHEN 'participant' THEN 2
     WHEN 'engaged'     THEN 3
     WHEN 'builder'     THEN 4
     WHEN 'a_player'    THEN 5
     ELSE 99
   END;
END;
$$;

-- ── 7. BACKFILL existing users from community_user_metrics ──────
INSERT INTO public.user_segments (user_id, raw_score, score, segment, last_event_at, last_updated)
SELECT m.user_id,
       LEAST(100,
         COALESCE(m.posts_count,0)*5
         + COALESCE(m.comments_count,0)*3
         + COALESCE(m.reactions_count,0)*1
         + FLOOR(COALESCE(m.credits,0)/10)::int
       ) AS s,
       LEAST(100,
         COALESCE(m.posts_count,0)*5
         + COALESCE(m.comments_count,0)*3
         + COALESCE(m.reactions_count,0)*1
         + FLOOR(COALESCE(m.credits,0)/10)::int
       ) AS s2,
       public.segment_for_score(
         LEAST(100,
           COALESCE(m.posts_count,0)*5
           + COALESCE(m.comments_count,0)*3
           + COALESCE(m.reactions_count,0)*1
           + FLOOR(COALESCE(m.credits,0)/10)::int
         )
       ),
       m.last_active_at,
       now()
  FROM public.community_user_metrics m
ON CONFLICT (user_id) DO NOTHING;