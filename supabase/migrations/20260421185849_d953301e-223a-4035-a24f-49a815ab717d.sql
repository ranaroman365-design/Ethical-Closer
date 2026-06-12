-- ── Helper: is the current user an admin or director-tier ───────
CREATE OR REPLACE FUNCTION public.is_kpi_viewer(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _uid
       AND role IN ('admin','owner','administrator')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = _uid
       AND business_stage IN ('senior_manager','director','partner')
  );
$$;

-- ── 1. EVENTS TABLE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  event_type  text NOT NULL,
  ref_table   text,
  ref_id      uuid,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ce_user_time ON public.community_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ce_type_time ON public.community_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ce_created   ON public.community_events (created_at DESC);
ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ce_user_insert_own" ON public.community_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ce_user_read_own" ON public.community_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ce_admin_read_all" ON public.community_events
  FOR SELECT USING (public.is_kpi_viewer(auth.uid()));

-- ── 2. METRICS TABLE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_user_metrics (
  user_id          uuid PRIMARY KEY,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_active_at   timestamptz NOT NULL DEFAULT now(),
  days_active      integer     NOT NULL DEFAULT 1,
  current_streak   integer     NOT NULL DEFAULT 1,
  longest_streak   integer     NOT NULL DEFAULT 1,
  posts_count      integer     NOT NULL DEFAULT 0,
  comments_count   integer     NOT NULL DEFAULT 0,
  reactions_count  integer     NOT NULL DEFAULT 0,
  credits          integer     NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cum_last_active ON public.community_user_metrics (last_active_at DESC);
ALTER TABLE public.community_user_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cum_user_read_own" ON public.community_user_metrics
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cum_admin_read_all" ON public.community_user_metrics
  FOR SELECT USING (public.is_kpi_viewer(auth.uid()));

-- ── 3. METRICS TOUCHER ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_user_metrics(_user_id uuid, _event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev_last_day date; today_d date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  SELECT (last_active_at AT TIME ZONE 'UTC')::date INTO prev_last_day
    FROM public.community_user_metrics WHERE user_id = _user_id;
  IF prev_last_day IS NULL THEN
    INSERT INTO public.community_user_metrics (user_id) VALUES (_user_id)
      ON CONFLICT (user_id) DO NOTHING;
    prev_last_day := today_d;
  END IF;
  IF prev_last_day = today_d THEN NULL;
  ELSIF prev_last_day = today_d - 1 THEN
    UPDATE public.community_user_metrics
       SET current_streak = current_streak + 1,
           longest_streak = GREATEST(longest_streak, current_streak + 1),
           days_active    = days_active + 1
     WHERE user_id = _user_id;
  ELSE
    UPDATE public.community_user_metrics
       SET current_streak = 1, days_active = days_active + 1
     WHERE user_id = _user_id;
  END IF;
  IF _event = 'post' THEN
    UPDATE public.community_user_metrics
       SET posts_count = posts_count + 1, credits = credits + 10
     WHERE user_id = _user_id;
  ELSIF _event = 'comment' THEN
    UPDATE public.community_user_metrics
       SET comments_count = comments_count + 1, credits = credits + 5
     WHERE user_id = _user_id;
  ELSIF _event = 'reaction' THEN
    UPDATE public.community_user_metrics
       SET reactions_count = reactions_count + 1, credits = credits + 1
     WHERE user_id = _user_id;
  END IF;
  UPDATE public.community_user_metrics
     SET last_active_at = now(), updated_at = now()
   WHERE user_id = _user_id;
END;
$$;

-- ── 4. TRIGGERS ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_msg_to_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE evt text;
BEGIN
  evt := CASE WHEN NEW.reply_to IS NULL THEN 'post' ELSE 'comment' END;
  INSERT INTO public.community_events (user_id, event_type, ref_table, ref_id)
    VALUES (NEW.user_id, evt, 'community_messages', NEW.id);
  PERFORM public.touch_user_metrics(NEW.user_id, evt);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_community_messages_event ON public.community_messages;
CREATE TRIGGER trg_community_messages_event
  AFTER INSERT ON public.community_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_msg_to_event();

CREATE OR REPLACE FUNCTION public.trg_reaction_to_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.community_events (user_id, event_type, ref_table, ref_id)
    VALUES (NEW.user_id, 'reaction', 'community_reactions', NEW.id);
  PERFORM public.touch_user_metrics(NEW.user_id, 'reaction');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_community_reactions_event ON public.community_reactions;
CREATE TRIGGER trg_community_reactions_event
  AFTER INSERT ON public.community_reactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_reaction_to_event();

-- ── 5. KPI OVERVIEW ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dau_today int; dau_yest int; wau int; mau int;
  rev_today numeric; rev_30d numeric;
  l0_count int; paid_count int; conv_pct numeric;
BEGIN
  IF NOT public.is_kpi_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT count(DISTINCT user_id) INTO dau_today FROM public.community_events
   WHERE created_at >= (now() AT TIME ZONE 'UTC')::date;
  SELECT count(DISTINCT user_id) INTO dau_yest FROM public.community_events
   WHERE created_at >= ((now() AT TIME ZONE 'UTC')::date - 1)
     AND created_at <  (now() AT TIME ZONE 'UTC')::date;
  SELECT count(DISTINCT user_id) INTO wau FROM public.community_events
   WHERE created_at >= now() - interval '7 days';
  SELECT count(DISTINCT user_id) INTO mau FROM public.community_events
   WHERE created_at >= now() - interval '30 days';
  SELECT COALESCE(SUM(amount),0) INTO rev_today FROM public.commissions
   WHERE created_at >= (now() AT TIME ZONE 'UTC')::date;
  SELECT COALESCE(SUM(amount),0) INTO rev_30d  FROM public.commissions
   WHERE created_at >= now() - interval '30 days';
  SELECT count(*) INTO l0_count FROM public.community_user_metrics;
  SELECT count(*) INTO paid_count FROM public.profiles
    WHERE business_stage IS NOT NULL AND business_stage <> 'prospect' AND business_stage <> 'applicant';
  conv_pct := CASE WHEN l0_count > 0 THEN ROUND((paid_count::numeric / l0_count) * 100, 1) ELSE 0 END;
  RETURN jsonb_build_object(
    'dau_today', dau_today, 'dau_yesterday', dau_yest,
    'dau_delta_pct', CASE WHEN dau_yest > 0 THEN ROUND(((dau_today - dau_yest)::numeric / dau_yest) * 100, 1) ELSE 0 END,
    'wau', wau, 'mau', mau,
    'revenue_today', rev_today, 'revenue_30d', rev_30d,
    'conversion_pct', conv_pct, 'tracked_users', l0_count
  );
END;
$$;

-- ── 6. ENGAGEMENT SERIES ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_engagement_series(_days int DEFAULT 30)
RETURNS TABLE (day date, dau int, posts int, comments int, reactions int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_kpi_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH days AS (
    SELECT generate_series(((now() AT TIME ZONE 'UTC')::date - (_days-1)),
                           (now() AT TIME ZONE 'UTC')::date,
                           interval '1 day')::date AS day
  )
  SELECT d.day,
         COALESCE(count(DISTINCT e.user_id),0)::int,
         COALESCE(count(*) FILTER (WHERE e.event_type='post'),0)::int,
         COALESCE(count(*) FILTER (WHERE e.event_type='comment'),0)::int,
         COALESCE(count(*) FILTER (WHERE e.event_type='reaction'),0)::int
    FROM days d
    LEFT JOIN public.community_events e
      ON (e.created_at AT TIME ZONE 'UTC')::date = d.day
   GROUP BY d.day ORDER BY d.day;
END;
$$;

-- ── 7. RETENTION COHORTS ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_retention_cohorts(_weeks int DEFAULT 8)
RETURNS TABLE (cohort_week date, cohort_size int, d1 int, d7 int, d30 int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_kpi_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH cohorts AS (
    SELECT user_id, date_trunc('week', first_seen_at)::date AS cohort_week, first_seen_at
      FROM public.community_user_metrics
     WHERE first_seen_at >= now() - (_weeks || ' weeks')::interval
  )
  SELECT c.cohort_week,
         count(DISTINCT c.user_id)::int,
         count(DISTINCT c.user_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM public.community_events e
             WHERE e.user_id = c.user_id
               AND e.created_at::date = (c.first_seen_at + interval '1 day')::date)
         )::int,
         count(DISTINCT c.user_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM public.community_events e
             WHERE e.user_id = c.user_id
               AND e.created_at::date BETWEEN (c.first_seen_at + interval '6 days')::date
                                           AND (c.first_seen_at + interval '8 days')::date)
         )::int,
         count(DISTINCT c.user_id) FILTER (
           WHERE EXISTS (SELECT 1 FROM public.community_events e
             WHERE e.user_id = c.user_id
               AND e.created_at::date BETWEEN (c.first_seen_at + interval '28 days')::date
                                           AND (c.first_seen_at + interval '32 days')::date)
         )::int
    FROM cohorts c GROUP BY c.cohort_week ORDER BY c.cohort_week DESC;
END;
$$;

-- ── 8. CONVERSION FUNNEL ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_conversion_funnel()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l0 int; l1 int; l2 int; l4 int; l6 int;
BEGIN
  IF NOT public.is_kpi_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT count(*) INTO l0 FROM public.profiles
    WHERE business_stage IN ('prospect','applicant') OR business_stage IS NULL;
  SELECT count(*) INTO l1 FROM public.profiles
    WHERE business_stage IN ('opener','trainee');
  SELECT count(*) INTO l2 FROM public.profiles
    WHERE business_stage IN ('setter','associate_setter','associate','senior_associate','senior_setter');
  SELECT count(*) INTO l4 FROM public.profiles
    WHERE business_stage IN ('junior_manager','manager');
  SELECT count(*) INTO l6 FROM public.profiles
    WHERE business_stage IN ('senior_manager','director','partner');
  RETURN jsonb_build_object(
    'L0', l0, 'L1', l1, 'L2', l2, 'L4', l4, 'L6', l6,
    'l0_to_l1_pct', CASE WHEN l0+l1 > 0 THEN ROUND((l1::numeric / NULLIF(l0+l1,0)) * 100, 1) ELSE 0 END,
    'l1_to_l2_pct', CASE WHEN l1+l2 > 0 THEN ROUND((l2::numeric / NULLIF(l1+l2,0)) * 100, 1) ELSE 0 END,
    'l2_to_l4_pct', CASE WHEN l2+l4 > 0 THEN ROUND((l4::numeric / NULLIF(l2+l4,0)) * 100, 1) ELSE 0 END,
    'l4_to_l6_pct', CASE WHEN l4+l6 > 0 THEN ROUND((l6::numeric / NULLIF(l4+l6,0)) * 100, 1) ELSE 0 END
  );
END;
$$;

-- ── 9. LEVEL DISTRIBUTION ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_level_distribution()
RETURNS TABLE (level_key text, user_count int, avg_credits numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_kpi_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH mapped AS (
    SELECT p.id,
           CASE
             WHEN p.business_stage IN ('prospect','applicant') OR p.business_stage IS NULL THEN 'L0'
             WHEN p.business_stage IN ('opener','trainee') THEN 'L1'
             WHEN p.business_stage IN ('setter','associate_setter','associate','senior_associate','senior_setter') THEN 'L2'
             WHEN p.business_stage IN ('junior_manager','manager') THEN 'L4'
             WHEN p.business_stage IN ('senior_manager','director') THEN 'L6'
             WHEN p.business_stage = 'partner' THEN 'L8'
             ELSE 'L0'
           END AS lvl,
           COALESCE(m.credits, 0) AS credits
      FROM public.profiles p
      LEFT JOIN public.community_user_metrics m ON m.user_id = p.id
  )
  SELECT lvl, count(*)::int, ROUND(AVG(credits)::numeric, 1)
    FROM mapped GROUP BY lvl ORDER BY lvl;
END;
$$;

-- ── 10. TOP CONTENT ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_top_content(_limit int DEFAULT 10)
RETURNS TABLE (
  message_id uuid, content_preview text, author_id uuid,
  reactions int, replies int, score int, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_kpi_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT m.id, LEFT(m.content, 140), m.user_id,
         COALESCE((SELECT count(*) FROM public.community_reactions r WHERE r.message_id = m.id),0)::int,
         COALESCE((SELECT count(*) FROM public.community_messages c WHERE c.reply_to = m.id),0)::int,
         (COALESCE((SELECT count(*) FROM public.community_reactions r WHERE r.message_id = m.id),0)
          + COALESCE((SELECT count(*) FROM public.community_messages c WHERE c.reply_to = m.id),0) * 2)::int,
         m.created_at
    FROM public.community_messages m
   WHERE m.reply_to IS NULL
     AND m.created_at >= now() - interval '30 days'
   ORDER BY 6 DESC
   LIMIT _limit;
END;
$$;