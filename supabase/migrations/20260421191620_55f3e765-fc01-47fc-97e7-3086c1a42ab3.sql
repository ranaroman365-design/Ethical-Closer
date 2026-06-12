CREATE OR REPLACE VIEW public.funnel_events AS
  SELECT ('lead_'  || l.id)::text AS event_id, l.id AS lead_id, NULL::uuid AS closer_id,
         'lead_created'::text AS event_type, l.created_at AS occurred_at,
         COALESCE(l.source_funnel, l.source, 'unknown') AS source,
         NULL::text AS campaign, NULL::numeric AS revenue
    FROM public.leads l
  UNION ALL
  SELECT ('quiz_' || e.id)::text,
         (SELECT id FROM public.leads WHERE lower(email) = lower(e.email) ORDER BY created_at DESC LIMIT 1),
         NULL::uuid,
         'quiz_completed'::text, e.created_at,
         COALESCE(e.payload->>'source', 'unknown'),
         NULLIF(e.payload->>'campaign', ''), NULL::numeric
    FROM public.event_logs e
   WHERE e.event_name IN ('QUIZ_COMPLETED','quiz_completed')
     AND e.email IS NOT NULL
  UNION ALL
  SELECT ('book_' || a.id)::text, a.lead_id, a.setter_id,
         'call_booked'::text, a.created_at,
         COALESCE((SELECT source_funnel FROM public.leads WHERE id = a.lead_id), 'unknown'),
         NULL::text, NULL::numeric
    FROM public.appointments a
  UNION ALL
  SELECT ('show_' || a.id)::text, a.lead_id, a.setter_id,
         'show_up'::text, COALESCE(a.call_started_at, a.starts_at),
         COALESCE((SELECT source_funnel FROM public.leads WHERE id = a.lead_id), 'unknown'),
         NULL::text, NULL::numeric
    FROM public.appointments a
   WHERE a.attendance_flag = true
  UNION ALL
  SELECT ('offer_' || c.id)::text, NULL::uuid, c.user_id,
         'offer_made'::text, c.created_at,
         COALESCE(c.lead_source, 'unknown'), NULL::text, NULL::numeric
    FROM public.calls c
   WHERE c.offer_type IS NOT NULL AND c.offer_type <> ''
  UNION ALL
  SELECT ('won_' || c.id)::text, NULL::uuid, c.user_id,
         'deal_won'::text, COALESCE(c.closed_at, c.created_at),
         COALESCE(c.lead_source, 'unknown'), NULL::text,
         COALESCE(c.revenue, c.deal_size, 0)::numeric
    FROM public.calls c
   WHERE c.result = 'won' OR c.status = 'closed_won'
  UNION ALL
  SELECT ('lost_' || c.id)::text, NULL::uuid, c.user_id,
         'deal_lost'::text, COALESCE(c.closed_at, c.created_at),
         COALESCE(c.lead_source, 'unknown'), NULL::text, NULL::numeric
    FROM public.calls c
   WHERE c.result = 'lost' OR c.status = 'closed_lost';

CREATE TABLE IF NOT EXISTS public.ad_spend_daily (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spend_date  date NOT NULL,
  source      text NOT NULL,
  campaign    text,
  amount      numeric(12,2) NOT NULL DEFAULT 0,
  notes       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ad_spend_day_src_camp
  ON public.ad_spend_daily (spend_date, source, COALESCE(campaign, ''));
CREATE INDEX IF NOT EXISTS idx_ad_spend_date   ON public.ad_spend_daily (spend_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_spend_source ON public.ad_spend_daily (source);
ALTER TABLE public.ad_spend_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_perf_viewer(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid
      AND (
        p.business_stage IN ('director','partner','head','manager','associate_director')
        OR public.has_role(_uid, 'admin'::app_role)
        OR public.has_role(_uid, 'owner'::app_role)
        OR public.has_role(_uid, 'administrator'::app_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_perf_editor(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid
      AND (
        p.business_stage IN ('partner','head')
        OR public.has_role(_uid, 'admin'::app_role)
        OR public.has_role(_uid, 'owner'::app_role)
        OR public.has_role(_uid, 'administrator'::app_role)
      )
  );
$$;

CREATE POLICY "ad_spend_read_l5"   ON public.ad_spend_daily FOR SELECT USING (public.is_perf_viewer(auth.uid()));
CREATE POLICY "ad_spend_write_l6"  ON public.ad_spend_daily FOR INSERT WITH CHECK (public.is_perf_editor(auth.uid()));
CREATE POLICY "ad_spend_update_l6" ON public.ad_spend_daily FOR UPDATE USING (public.is_perf_editor(auth.uid()));
CREATE POLICY "ad_spend_delete_l6" ON public.ad_spend_daily FOR DELETE USING (public.is_perf_editor(auth.uid()));

CREATE TRIGGER trg_ad_spend_updated
  BEFORE UPDATE ON public.ad_spend_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.perf_executive_strip(_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  since_today timestamptz := date_trunc('day', now());
  since_7d    timestamptz := now() - interval '7 days';
  since_xd    timestamptz := now() - interval '1 day' * _days;
  rev_today numeric; rev_7d numeric; rev_30d numeric;
  spend_xd numeric; sales_xd int; leads_xd int;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(SUM(revenue),0) INTO rev_today FROM public.funnel_events WHERE event_type='deal_won' AND occurred_at >= since_today;
  SELECT COALESCE(SUM(revenue),0) INTO rev_7d    FROM public.funnel_events WHERE event_type='deal_won' AND occurred_at >= since_7d;
  SELECT COALESCE(SUM(revenue),0) INTO rev_30d   FROM public.funnel_events WHERE event_type='deal_won' AND occurred_at >= since_xd;
  SELECT COALESCE(SUM(amount),0)  INTO spend_xd  FROM public.ad_spend_daily WHERE spend_date >= (now() - interval '1 day' * _days)::date;
  SELECT count(*) INTO sales_xd FROM public.funnel_events WHERE event_type='deal_won'     AND occurred_at >= since_xd;
  SELECT count(*) INTO leads_xd FROM public.funnel_events WHERE event_type='lead_created' AND occurred_at >= since_xd;
  RETURN jsonb_build_object(
    'revenue_today', rev_today, 'revenue_7d', rev_7d, 'revenue_30d', rev_30d, 'spend', spend_xd,
    'roas', CASE WHEN spend_xd > 0 THEN ROUND((rev_30d/spend_xd)::numeric, 2) ELSE NULL END,
    'cac',  CASE WHEN sales_xd > 0 THEN ROUND((spend_xd/sales_xd)::numeric, 2) ELSE NULL END,
    'cpl',  CASE WHEN leads_xd > 0 THEN ROUND((spend_xd/leads_xd)::numeric, 2) ELSE NULL END,
    'days', _days
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.perf_funnel_stages(_days int DEFAULT 30)
RETURNS TABLE (stage text, stage_order int, count int, rate_from_top numeric, rate_from_prev numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  since timestamptz := now() - interval '1 day' * _days;
  l int; q int; b int; s int; w int;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT count(*) INTO l FROM public.funnel_events WHERE event_type='lead_created'   AND occurred_at >= since;
  SELECT count(*) INTO q FROM public.funnel_events WHERE event_type='quiz_completed' AND occurred_at >= since;
  SELECT count(*) INTO b FROM public.funnel_events WHERE event_type='call_booked'    AND occurred_at >= since;
  SELECT count(*) INTO s FROM public.funnel_events WHERE event_type='show_up'        AND occurred_at >= since;
  SELECT count(*) INTO w FROM public.funnel_events WHERE event_type='deal_won'       AND occurred_at >= since;
  RETURN QUERY VALUES
    ('Leads',    1, l, 100.0::numeric, 100.0::numeric),
    ('Quiz',     2, q, CASE WHEN l>0 THEN ROUND(q*100.0/l,1) ELSE 0 END, CASE WHEN l>0 THEN ROUND(q*100.0/l,1) ELSE 0 END),
    ('Bookings', 3, b, CASE WHEN l>0 THEN ROUND(b*100.0/l,1) ELSE 0 END, CASE WHEN q>0 THEN ROUND(b*100.0/q,1) ELSE 0 END),
    ('Show-Ups', 4, s, CASE WHEN l>0 THEN ROUND(s*100.0/l,1) ELSE 0 END, CASE WHEN b>0 THEN ROUND(s*100.0/b,1) ELSE 0 END),
    ('Sales',    5, w, CASE WHEN l>0 THEN ROUND(w*100.0/l,1) ELSE 0 END, CASE WHEN s>0 THEN ROUND(w*100.0/s,1) ELSE 0 END);
END;
$$;

CREATE OR REPLACE FUNCTION public.perf_source_performance(_days int DEFAULT 30)
RETURNS TABLE (source text, leads int, sales int, revenue numeric, spend numeric, cpl numeric, cac numeric, roas numeric, recommendation text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  since timestamptz := now() - interval '1 day' * _days;
  since_d date     := (now() - interval '1 day' * _days)::date;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH ev AS (
    SELECT fe.source,
           count(*) FILTER (WHERE fe.event_type='lead_created') AS leads,
           count(*) FILTER (WHERE fe.event_type='deal_won')     AS sales,
           COALESCE(SUM(fe.revenue) FILTER (WHERE fe.event_type='deal_won'),0) AS rev
      FROM public.funnel_events fe
     WHERE fe.occurred_at >= since
     GROUP BY fe.source
  ),
  sp AS (
    SELECT a.source, COALESCE(SUM(a.amount),0) AS sp
      FROM public.ad_spend_daily a
     WHERE a.spend_date >= since_d
     GROUP BY a.source
  )
  SELECT ev.source, ev.leads::int, ev.sales::int, ev.rev, COALESCE(sp.sp, 0),
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
    FROM ev LEFT JOIN sp ON sp.source = ev.source
    ORDER BY ev.rev DESC, ev.leads DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.perf_campaign_breakdown(_days int DEFAULT 30)
RETURNS TABLE (campaign text, source text, spend numeric, leads int, cpl numeric, sales int, revenue numeric, roas numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  since timestamptz := now() - interval '1 day' * _days;
  since_d date     := (now() - interval '1 day' * _days)::date;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH ev AS (
    SELECT COALESCE(fe.campaign,'(none)') AS campaign, fe.source,
           count(*) FILTER (WHERE fe.event_type='lead_created') AS leads,
           count(*) FILTER (WHERE fe.event_type='deal_won')     AS sales,
           COALESCE(SUM(fe.revenue) FILTER (WHERE fe.event_type='deal_won'),0) AS rev
      FROM public.funnel_events fe
     WHERE fe.occurred_at >= since
     GROUP BY COALESCE(fe.campaign,'(none)'), fe.source
  ),
  sp AS (
    SELECT COALESCE(a.campaign,'(none)') AS campaign, a.source, COALESCE(SUM(a.amount),0) AS sp
      FROM public.ad_spend_daily a
     WHERE a.spend_date >= since_d
     GROUP BY COALESCE(a.campaign,'(none)'), a.source
  )
  SELECT ev.campaign, ev.source, COALESCE(sp.sp,0), ev.leads::int,
         CASE WHEN ev.leads>0 AND COALESCE(sp.sp,0)>0 THEN ROUND(sp.sp/ev.leads,2) ELSE NULL END,
         ev.sales::int, ev.rev,
         CASE WHEN COALESCE(sp.sp,0)>0 THEN ROUND(ev.rev/sp.sp,2) ELSE NULL END
    FROM ev LEFT JOIN sp ON sp.campaign = ev.campaign AND sp.source = ev.source
    ORDER BY COALESCE(sp.sp,0) DESC, ev.rev DESC
    LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.perf_closer_performance(_days int DEFAULT 30)
RETURNS TABLE (closer_id uuid, closer_name text, calls int, shows int, sales int, close_rate numeric, revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - interval '1 day' * _days;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH agg AS (
    SELECT fe.closer_id,
           count(*) FILTER (WHERE fe.event_type='call_booked') AS calls,
           count(*) FILTER (WHERE fe.event_type='show_up')     AS shows,
           count(*) FILTER (WHERE fe.event_type='deal_won')    AS sales,
           COALESCE(SUM(fe.revenue) FILTER (WHERE fe.event_type='deal_won'),0) AS rev
      FROM public.funnel_events fe
     WHERE fe.occurred_at >= since AND fe.closer_id IS NOT NULL
     GROUP BY fe.closer_id
  )
  SELECT a.closer_id, COALESCE(p.full_name, 'Unknown'),
         a.calls::int, a.shows::int, a.sales::int,
         CASE WHEN a.shows>0 THEN ROUND(a.sales*100.0/a.shows,1) ELSE 0 END,
         a.rev
    FROM agg a LEFT JOIN public.profiles p ON p.id = a.closer_id
    ORDER BY a.rev DESC, a.sales DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.perf_bottleneck_detection(_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  since timestamptz := now() - interval '1 day' * _days;
  l int; b int; s int; w int;
  booking_rate numeric; show_rate numeric; closing_rate numeric;
  flags jsonb := '[]'::jsonb;
  biggest_leak text; recommended_fix text; gap_max numeric := 0; gap numeric;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT count(*) INTO l FROM public.funnel_events WHERE event_type='lead_created' AND occurred_at >= since;
  SELECT count(*) INTO b FROM public.funnel_events WHERE event_type='call_booked'  AND occurred_at >= since;
  SELECT count(*) INTO s FROM public.funnel_events WHERE event_type='show_up'      AND occurred_at >= since;
  SELECT count(*) INTO w FROM public.funnel_events WHERE event_type='deal_won'     AND occurred_at >= since;
  booking_rate := CASE WHEN l>0 THEN b::numeric/l ELSE 0 END;
  show_rate    := CASE WHEN b>0 THEN s::numeric/b ELSE 0 END;
  closing_rate := CASE WHEN s>0 THEN w::numeric/s ELSE 0 END;

  IF booking_rate < 0.15 THEN
    flags := flags || jsonb_build_object('stage','booking','rate',ROUND(booking_rate*100,1),'threshold',15,'severity','high');
    gap := 0.15 - booking_rate;
    IF gap > gap_max THEN gap_max := gap; biggest_leak := 'BOOKING RATE';
      recommended_fix := 'Funnel-Problem: Quiz-Result-Page & Calendar-CTA überarbeiten, Friction reduzieren.'; END IF;
  END IF;
  IF show_rate < 0.60 THEN
    flags := flags || jsonb_build_object('stage','show','rate',ROUND(show_rate*100,1),'threshold',60,'severity','high');
    gap := 0.60 - show_rate;
    IF gap > gap_max THEN gap_max := gap; biggest_leak := 'SHOW RATE';
      recommended_fix := 'Setter-Problem: Reminder-Sequenz (24h/2h/15m) prüfen, Confirmation-Call einführen.'; END IF;
  END IF;
  IF closing_rate < 0.20 THEN
    flags := flags || jsonb_build_object('stage','closing','rate',ROUND(closing_rate*100,1),'threshold',20,'severity','high');
    gap := 0.20 - closing_rate;
    IF gap > gap_max THEN gap_max := gap; biggest_leak := 'CLOSING RATE';
      recommended_fix := 'Closer-Problem: Call-Recordings reviewen, Objection-Handling-Training, Lead-Quality prüfen.'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'leads', l, 'bookings', b, 'shows', s, 'sales', w,
    'booking_rate', ROUND(booking_rate*100,1),
    'show_rate',    ROUND(show_rate*100,1),
    'closing_rate', ROUND(closing_rate*100,1),
    'flags', flags, 'biggest_leak', biggest_leak,
    'recommended_fix', recommended_fix,
    'all_green', (jsonb_array_length(flags) = 0)
  );
END;
$$;