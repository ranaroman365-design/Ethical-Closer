-- ── 1. LEADS: Origin-Felder ──────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origin_type text,
  ADD COLUMN IF NOT EXISTS origin_id   text,
  ADD COLUMN IF NOT EXISTS funnel_id   text;

CREATE INDEX IF NOT EXISTS idx_leads_origin_id ON public.leads (origin_id);
CREATE INDEX IF NOT EXISTS idx_leads_funnel_id ON public.leads (funnel_id);

-- ── 2. ORIGINS REGISTRY ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.origins (
  origin_id      text PRIMARY KEY,
  origin_type    text NOT NULL CHECK (origin_type IN ('DL','TEAM','FOUNDER','PARTNER')),
  label          text NOT NULL,
  owner_user_id  uuid,
  funnel_id      text,
  notes          text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_origins_type   ON public.origins (origin_type);
CREATE INDEX IF NOT EXISTS idx_origins_active ON public.origins (active);

ALTER TABLE public.origins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "origins_read_l5"   ON public.origins;
DROP POLICY IF EXISTS "origins_write_l6"  ON public.origins;
DROP POLICY IF EXISTS "origins_update_l6" ON public.origins;
DROP POLICY IF EXISTS "origins_delete_l6" ON public.origins;
CREATE POLICY "origins_read_l5"   ON public.origins FOR SELECT USING (public.is_perf_viewer(auth.uid()));
CREATE POLICY "origins_write_l6"  ON public.origins FOR INSERT WITH CHECK (public.is_perf_editor(auth.uid()));
CREATE POLICY "origins_update_l6" ON public.origins FOR UPDATE USING (public.is_perf_editor(auth.uid()));
CREATE POLICY "origins_delete_l6" ON public.origins FOR DELETE USING (public.is_perf_editor(auth.uid()));

DROP TRIGGER IF EXISTS trg_origins_updated ON public.origins;
CREATE TRIGGER trg_origins_updated
  BEFORE UPDATE ON public.origins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.origins (origin_id, origin_type, label, funnel_id, notes)
VALUES
  ('dl_default',     'DL',      'Direct Landing',  'main_funnel',    'System-Default für Direkt-Traffic'),
  ('founder',        'FOUNDER', 'Founder',         'founder_funnel', 'Founder-eigene Leads'),
  ('team_oleg',      'TEAM',    'Team Oleg',       'oleg_funnel',    'Team Oleg'),
  ('partner_extern', 'PARTNER', 'External Partner','partner_funnel', 'Externe Partner / Affiliates')
ON CONFLICT (origin_id) DO NOTHING;

-- ── 3. AD_SPEND: optionale origin_id ─────────────────────────────
ALTER TABLE public.ad_spend_daily
  ADD COLUMN IF NOT EXISTS origin_id text;
CREATE INDEX IF NOT EXISTS idx_ad_spend_origin ON public.ad_spend_daily (origin_id);

-- ── 4. FUNNEL_EVENTS VIEW (drop + recreate, mit Origin) ──────────
DROP VIEW IF EXISTS public.funnel_events;

CREATE VIEW public.funnel_events
WITH (security_invoker = true) AS
  SELECT ('lead_'  || l.id)::text AS event_id, l.id AS lead_id, NULL::uuid AS closer_id,
         'lead_created'::text AS event_type, l.created_at AS occurred_at,
         COALESCE(l.source_funnel, l.source, 'unknown') AS source,
         NULL::text AS campaign,
         COALESCE(l.origin_type, 'DL')           AS origin_type,
         COALESCE(l.origin_id,   'dl_default')   AS origin_id,
         COALESCE(l.funnel_id,   'main_funnel')  AS funnel_id,
         NULL::numeric AS revenue
    FROM public.leads l
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
         NULL::numeric
    FROM public.appointments a
   WHERE a.attendance_flag = true
  UNION ALL
  SELECT ('offer_' || c.id)::text, NULL::uuid, c.user_id,
         'offer_made'::text, c.created_at,
         COALESCE(c.lead_source, 'unknown'), NULL::text,
         'DL'::text, 'dl_default'::text, 'main_funnel'::text,
         NULL::numeric
    FROM public.calls c
   WHERE c.offer_type IS NOT NULL AND c.offer_type <> ''
  UNION ALL
  SELECT ('won_' || c.id)::text, NULL::uuid, c.user_id,
         'deal_won'::text, COALESCE(c.closed_at, c.created_at),
         COALESCE(c.lead_source, 'unknown'), NULL::text,
         'DL'::text, 'dl_default'::text, 'main_funnel'::text,
         COALESCE(c.revenue, c.deal_size, 0)::numeric
    FROM public.calls c
   WHERE c.result = 'won' OR c.status = 'closed_won'
  UNION ALL
  SELECT ('lost_' || c.id)::text, NULL::uuid, c.user_id,
         'deal_lost'::text, COALESCE(c.closed_at, c.created_at),
         COALESCE(c.lead_source, 'unknown'), NULL::text,
         'DL'::text, 'dl_default'::text, 'main_funnel'::text,
         NULL::numeric
    FROM public.calls c
   WHERE c.result = 'lost' OR c.status = 'closed_lost';

-- ── 5. ORIGIN PERFORMANCE RPC ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perf_origin_performance(_days int DEFAULT 30)
RETURNS TABLE (
  origin_id text, origin_type text, label text,
  leads int, bookings int, shows int, sales int,
  revenue numeric, spend numeric,
  cpl numeric, cac numeric, roas numeric,
  recommendation text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  since   timestamptz := now() - interval '1 day' * _days;
  since_d date        := (now() - interval '1 day' * _days)::date;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH ev AS (
    SELECT fe.origin_id, fe.origin_type,
           count(*) FILTER (WHERE fe.event_type='lead_created') AS leads,
           count(*) FILTER (WHERE fe.event_type='call_booked')  AS bookings,
           count(*) FILTER (WHERE fe.event_type='show_up')      AS shows,
           count(*) FILTER (WHERE fe.event_type='deal_won')     AS sales,
           COALESCE(SUM(fe.revenue) FILTER (WHERE fe.event_type='deal_won'),0) AS rev
      FROM public.funnel_events fe
     WHERE fe.occurred_at >= since
     GROUP BY fe.origin_id, fe.origin_type
  ),
  sp AS (
    SELECT COALESCE(a.origin_id,'dl_default') AS origin_id,
           COALESCE(SUM(a.amount),0) AS sp
      FROM public.ad_spend_daily a
     WHERE a.spend_date >= since_d
     GROUP BY COALESCE(a.origin_id,'dl_default')
  )
  SELECT ev.origin_id, ev.origin_type,
         COALESCE(o.label, ev.origin_id),
         ev.leads::int, ev.bookings::int, ev.shows::int, ev.sales::int,
         ev.rev, COALESCE(sp.sp, 0),
         CASE WHEN ev.leads>0 AND COALESCE(sp.sp,0)>0 THEN ROUND(sp.sp/ev.leads, 2) ELSE NULL END,
         CASE WHEN ev.sales>0 AND COALESCE(sp.sp,0)>0 THEN ROUND(sp.sp/ev.sales, 2) ELSE NULL END,
         CASE WHEN COALESCE(sp.sp,0)>0 THEN ROUND(ev.rev/sp.sp, 2)
              WHEN ev.rev>0           THEN 999.0
              ELSE NULL END,
         CASE
           WHEN COALESCE(sp.sp,0)=0 AND ev.sales>0 THEN 'SCALE'
           WHEN COALESCE(sp.sp,0)>0 AND ev.rev/NULLIF(sp.sp,0) >= 3 THEN 'SCALE'
           WHEN COALESCE(sp.sp,0)>0 AND ev.rev/NULLIF(sp.sp,0) <  1 THEN 'PAUSE'
           ELSE 'OPTIMIZE'
         END
    FROM ev
    LEFT JOIN sp ON sp.origin_id = ev.origin_id
    LEFT JOIN public.origins o ON o.origin_id = ev.origin_id
    ORDER BY ev.rev DESC, ev.leads DESC;
END;
$$;

-- ── 6. FUNNEL COMPARISON RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perf_funnel_comparison(_days int DEFAULT 30)
RETURNS TABLE (
  origin_id text, label text, funnel_id text,
  leads int, bookings int, shows int, sales int,
  booking_rate numeric, show_rate numeric, closing_rate numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - interval '1 day' * _days;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH agg AS (
    SELECT fe.origin_id, fe.funnel_id,
           count(*) FILTER (WHERE fe.event_type='lead_created') AS l,
           count(*) FILTER (WHERE fe.event_type='call_booked')  AS b,
           count(*) FILTER (WHERE fe.event_type='show_up')      AS s,
           count(*) FILTER (WHERE fe.event_type='deal_won')     AS w
      FROM public.funnel_events fe
     WHERE fe.occurred_at >= since
     GROUP BY fe.origin_id, fe.funnel_id
  )
  SELECT a.origin_id, COALESCE(o.label, a.origin_id), a.funnel_id,
         a.l::int, a.b::int, a.s::int, a.w::int,
         CASE WHEN a.l>0 THEN ROUND(a.b*100.0/a.l, 1) ELSE 0 END,
         CASE WHEN a.b>0 THEN ROUND(a.s*100.0/a.b, 1) ELSE 0 END,
         CASE WHEN a.s>0 THEN ROUND(a.w*100.0/a.s, 1) ELSE 0 END
    FROM agg a
    LEFT JOIN public.origins o ON o.origin_id = a.origin_id
    ORDER BY a.l DESC;
END;
$$;

-- ── 7. CLOSER × ORIGIN MATRIX RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION public.perf_closer_origin_matrix(_days int DEFAULT 30)
RETURNS TABLE (
  closer_id uuid, closer_name text,
  origin_id text, origin_label text,
  calls int, sales int, close_rate numeric, revenue numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - interval '1 day' * _days;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH agg AS (
    SELECT fe.closer_id, fe.origin_id,
           count(*) FILTER (WHERE fe.event_type='show_up')  AS calls,
           count(*) FILTER (WHERE fe.event_type='deal_won') AS sales,
           COALESCE(SUM(fe.revenue) FILTER (WHERE fe.event_type='deal_won'),0) AS rev
      FROM public.funnel_events fe
     WHERE fe.occurred_at >= since AND fe.closer_id IS NOT NULL
     GROUP BY fe.closer_id, fe.origin_id
  )
  SELECT a.closer_id,
         COALESCE(p.full_name, 'Unknown'),
         a.origin_id,
         COALESCE(o.label, a.origin_id),
         a.calls::int, a.sales::int,
         CASE WHEN a.calls>0 THEN ROUND(a.sales*100.0/a.calls, 1) ELSE 0 END,
         a.rev
    FROM agg a
    LEFT JOIN public.profiles p ON p.id = a.closer_id
    LEFT JOIN public.origins  o ON o.origin_id = a.origin_id
    ORDER BY a.rev DESC, a.sales DESC;
END;
$$;