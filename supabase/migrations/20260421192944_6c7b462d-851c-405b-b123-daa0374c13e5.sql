-- ── 1. NEUE VIEW: funnel_events mit normalisiertem `origin` ───────
DROP VIEW IF EXISTS public.funnel_events;

CREATE VIEW public.funnel_events
WITH (security_invoker = true) AS
WITH map AS (
  SELECT
    CASE
      WHEN lower(coalesce(origin_id, 'dl_default')) IN ('team_oleg','oleg_team','oleg','oleg_funnel') THEN 'TEAM_OLEG'
      WHEN lower(coalesce(origin_id, 'dl_default')) LIKE 'oleg%' THEN 'TEAM_OLEG'
      WHEN lower(coalesce(origin_id, 'dl_default')) IN ('josue','founder','founder_funnel') THEN 'JOSUE'
      WHEN lower(coalesce(origin_id, 'dl_default')) LIKE 'founder%' THEN 'JOSUE'
      WHEN lower(coalesce(origin_id, 'dl_default')) IN ('dl_default','dl') THEN 'DL'
      WHEN lower(coalesce(origin_id, 'dl_default')) LIKE 'dl%' THEN 'DL'
      ELSE 'OTHER'
    END AS origin_norm,
    *
  FROM public.leads
)
SELECT ('lead_' || m.id)::text AS event_id, m.id AS lead_id, NULL::uuid AS closer_id,
       'lead_created'::text AS event_type, m.created_at AS occurred_at,
       COALESCE(m.source_funnel, m.source, 'unknown') AS source,
       NULL::text AS campaign,
       COALESCE(m.origin_type, 'DL')           AS origin_type,
       COALESCE(m.origin_id,   'dl_default')   AS origin_id,
       COALESCE(m.funnel_id,   'main_funnel')  AS funnel_id,
       m.origin_norm                           AS origin,
       NULL::numeric                           AS revenue
  FROM map m
UNION ALL
SELECT ('quiz_' || e.id)::text,
       (SELECT id FROM public.leads WHERE lower(email) = lower(e.email) ORDER BY created_at DESC LIMIT 1),
       NULL::uuid,
       'quiz_completed'::text, e.created_at,
       COALESCE(e.payload->>'source', 'unknown'),
       NULLIF(e.payload->>'campaign', ''),
       COALESCE((SELECT origin_type FROM public.leads WHERE lower(email) = lower(e.email) ORDER BY created_at DESC LIMIT 1), 'DL'),
       COALESCE((SELECT origin_id   FROM public.leads WHERE lower(email) = lower(e.email) ORDER BY created_at DESC LIMIT 1), 'dl_default'),
       COALESCE((SELECT funnel_id   FROM public.leads WHERE lower(email) = lower(e.email) ORDER BY created_at DESC LIMIT 1), 'main_funnel'),
       (SELECT origin_norm FROM map WHERE lower(email) = lower(e.email) ORDER BY created_at DESC LIMIT 1),
       NULL::numeric
  FROM public.event_logs e
 WHERE e.event_name IN ('QUIZ_COMPLETED','quiz_completed')
   AND e.email IS NOT NULL
UNION ALL
SELECT ('book_' || a.id)::text, a.lead_id, a.setter_id,
       'call_booked'::text, a.created_at,
       COALESCE((SELECT source_funnel FROM public.leads WHERE id = a.lead_id), 'unknown'),
       NULL::text,
       COALESCE((SELECT origin_type FROM public.leads WHERE id = a.lead_id), 'DL'),
       COALESCE((SELECT origin_id   FROM public.leads WHERE id = a.lead_id), 'dl_default'),
       COALESCE((SELECT funnel_id   FROM public.leads WHERE id = a.lead_id), 'main_funnel'),
       COALESCE((SELECT origin_norm FROM map WHERE id = a.lead_id), 'OTHER'),
       NULL::numeric
  FROM public.appointments a
UNION ALL
SELECT ('show_' || a.id)::text, a.lead_id, a.setter_id,
       'show_up'::text, COALESCE(a.call_started_at, a.starts_at),
       COALESCE((SELECT source_funnel FROM public.leads WHERE id = a.lead_id), 'unknown'),
       NULL::text,
       COALESCE((SELECT origin_type FROM public.leads WHERE id = a.lead_id), 'DL'),
       COALESCE((SELECT origin_id   FROM public.leads WHERE id = a.lead_id), 'dl_default'),
       COALESCE((SELECT funnel_id   FROM public.leads WHERE id = a.lead_id), 'main_funnel'),
       COALESCE((SELECT origin_norm FROM map WHERE id = a.lead_id), 'OTHER'),
       NULL::numeric
  FROM public.appointments a
 WHERE a.attendance_flag = true
UNION ALL
SELECT ('offer_' || c.id)::text, NULL::uuid, c.user_id,
       'offer_made'::text, c.created_at,
       COALESCE(c.lead_source, 'unknown'), NULL::text,
       'DL'::text, 'dl_default'::text, 'main_funnel'::text,
       'OTHER'::text,
       NULL::numeric
  FROM public.calls c
 WHERE c.offer_type IS NOT NULL AND c.offer_type <> ''
UNION ALL
SELECT ('won_' || c.id)::text, NULL::uuid, c.user_id,
       'deal_won'::text, COALESCE(c.closed_at, c.created_at),
       COALESCE(c.lead_source, 'unknown'), NULL::text,
       'DL'::text, 'dl_default'::text, 'main_funnel'::text,
       'OTHER'::text,
       COALESCE(c.revenue, c.deal_size, 0)::numeric
  FROM public.calls c
 WHERE c.result = 'won' OR c.status = 'closed_won'
UNION ALL
SELECT ('lost_' || c.id)::text, NULL::uuid, c.user_id,
       'deal_lost'::text, COALESCE(c.closed_at, c.created_at),
       COALESCE(c.lead_source, 'unknown'), NULL::text,
       'DL'::text, 'dl_default'::text, 'main_funnel'::text,
       'OTHER'::text,
       NULL::numeric
  FROM public.calls c
 WHERE c.result = 'lost' OR c.status = 'closed_lost';

-- ── 2. EQUAL-BUDGET CONFIG ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.equal_budget_config (
  period_key  text PRIMARY KEY CHECK (period_key IN ('daily','weekly','monthly')),
  amount      numeric NOT NULL DEFAULT 0,
  notes       text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

ALTER TABLE public.equal_budget_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ebc_read_l5"   ON public.equal_budget_config;
DROP POLICY IF EXISTS "ebc_write_l6"  ON public.equal_budget_config;
DROP POLICY IF EXISTS "ebc_update_l6" ON public.equal_budget_config;
CREATE POLICY "ebc_read_l5"   ON public.equal_budget_config FOR SELECT USING (public.is_perf_viewer(auth.uid()));
CREATE POLICY "ebc_write_l6"  ON public.equal_budget_config FOR INSERT WITH CHECK (public.is_perf_editor(auth.uid()));
CREATE POLICY "ebc_update_l6" ON public.equal_budget_config FOR UPDATE USING (public.is_perf_editor(auth.uid()));

INSERT INTO public.equal_budget_config (period_key, amount, notes) VALUES
  ('daily',    100,  'Equal daily budget per origin'),
  ('weekly',   700,  'Equal weekly budget per origin'),
  ('monthly',  3000, 'Equal monthly budget per origin')
ON CONFLICT (period_key) DO NOTHING;

-- ── 3. RPC: perf_operator_comparison ─────────────────────────────
CREATE OR REPLACE FUNCTION public.perf_operator_comparison(_days int DEFAULT 30)
RETURNS TABLE (
  origin text,
  leads int, quiz int, bookings int, shows int,
  offers int, sales int, losses int,
  revenue numeric, spend numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  since         timestamptz := now() - interval '1 day' * _days;
  daily_b       numeric;
  weekly_b      numeric;
  monthly_b     numeric;
  spend_amount  numeric;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT amount INTO daily_b   FROM public.equal_budget_config WHERE period_key = 'daily';
  SELECT amount INTO weekly_b  FROM public.equal_budget_config WHERE period_key = 'weekly';
  SELECT amount INTO monthly_b FROM public.equal_budget_config WHERE period_key = 'monthly';

  spend_amount := CASE
    WHEN _days <= 1  THEN COALESCE(daily_b, 0)
    WHEN _days <= 7  THEN COALESCE(weekly_b, 0)  * CEIL(_days::numeric / 7)
    WHEN _days <= 30 THEN COALESCE(monthly_b, 0) * CEIL(_days::numeric / 30)
    ELSE COALESCE(monthly_b, 0) * CEIL(_days::numeric / 30)
  END;

  RETURN QUERY
  WITH origins(o) AS (VALUES ('DL'),('TEAM_OLEG'),('JOSUE'),('OTHER')),
  agg AS (
    SELECT fe.origin,
           COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type='lead_created')   AS leads,
           COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type='quiz_completed') AS quiz,
           COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type='call_booked')    AS bookings,
           COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type='show_up')        AS shows,
           COUNT(DISTINCT COALESCE(fe.lead_id::text, fe.event_id))
             FILTER (WHERE fe.event_type='offer_made')                              AS offers,
           COUNT(DISTINCT COALESCE(fe.lead_id::text, fe.event_id))
             FILTER (WHERE fe.event_type='deal_won')                                AS sales,
           COUNT(DISTINCT COALESCE(fe.lead_id::text, fe.event_id))
             FILTER (WHERE fe.event_type='deal_lost')                               AS losses,
           COALESCE(SUM(fe.revenue) FILTER (WHERE fe.event_type='deal_won'), 0)     AS revenue
      FROM public.funnel_events fe
     WHERE fe.occurred_at >= since
     GROUP BY fe.origin
  )
  SELECT o.o::text,
         COALESCE(a.leads, 0)::int,
         COALESCE(a.quiz, 0)::int,
         COALESCE(a.bookings, 0)::int,
         COALESCE(a.shows, 0)::int,
         COALESCE(a.offers, 0)::int,
         COALESCE(a.sales, 0)::int,
         COALESCE(a.losses, 0)::int,
         COALESCE(a.revenue, 0)::numeric,
         spend_amount
    FROM origins o
    LEFT JOIN agg a ON a.origin = o.o
   ORDER BY CASE o.o WHEN 'DL' THEN 1 WHEN 'TEAM_OLEG' THEN 2 WHEN 'JOSUE' THEN 3 ELSE 4 END;
END;
$$;