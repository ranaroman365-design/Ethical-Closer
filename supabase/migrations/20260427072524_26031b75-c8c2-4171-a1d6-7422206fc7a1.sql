-- 1. Extend canonical enum with webinar_entry (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'funnel_source_t' AND e.enumlabel = 'webinar_entry'
  ) THEN
    ALTER TYPE public.funnel_source_t ADD VALUE 'webinar_entry' BEFORE 'external_inbound';
  END IF;
END $$;

-- 2. appointments.traffic_owner (non-destructive add)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS traffic_owner uuid;

-- Auto-fill from lead on insert/update if not provided
CREATE OR REPLACE FUNCTION public.appointments_fill_traffic_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.traffic_owner IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT l.traffic_owner INTO NEW.traffic_owner
    FROM public.leads l WHERE l.id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_fill_traffic_owner ON public.appointments;
CREATE TRIGGER trg_appointments_fill_traffic_owner
  BEFORE INSERT OR UPDATE OF lead_id, traffic_owner ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_fill_traffic_owner();

-- One-time backfill for existing rows
UPDATE public.appointments a
SET traffic_owner = l.traffic_owner
FROM public.leads l
WHERE a.lead_id = l.id
  AND a.traffic_owner IS NULL
  AND l.traffic_owner IS NOT NULL;

-- 3. Master view: operator_performance (no `deals` table — derive won/revenue from leads canonical signals)
CREATE OR REPLACE VIEW public.operator_performance AS
WITH base AS (
  SELECT
    l.traffic_owner,
    l.funnel_source::text AS funnel_source,
    l.id AS lead_id,
    a.id AS appointment_id,
    COALESCE(a.attendance_flag, false) AS showed,
    (l.outcome = 'closed_won' OR l.payment_status = 'paid') AS won,
    COALESCE(l.deal_value, 0) AS deal_value
  FROM public.leads l
  LEFT JOIN public.appointments a ON a.lead_id = l.id
  WHERE l.created_at > now() - interval '14 days'
    AND COALESCE(l.is_simulation, false) = false
)
SELECT
  traffic_owner,
  funnel_source,
  COUNT(DISTINCT lead_id) AS leads,
  COUNT(DISTINCT appointment_id) AS bookings,
  COUNT(DISTINCT appointment_id) FILTER (WHERE showed) AS shows,
  COUNT(DISTINCT lead_id) FILTER (WHERE won) AS deals,
  COALESCE(SUM(deal_value) FILTER (WHERE won), 0) AS revenue,
  COUNT(DISTINCT appointment_id)::numeric
    / NULLIF(COUNT(DISTINCT lead_id), 0) AS booking_rate,
  COUNT(DISTINCT appointment_id) FILTER (WHERE showed)::numeric
    / NULLIF(COUNT(DISTINCT appointment_id), 0) AS show_rate,
  COUNT(DISTINCT lead_id) FILTER (WHERE won)::numeric
    / NULLIF(COUNT(DISTINCT appointment_id) FILTER (WHERE showed), 0) AS close_rate,
  COALESCE(SUM(deal_value) FILTER (WHERE won), 0)::numeric
    / NULLIF(COUNT(DISTINCT lead_id), 0) AS revenue_per_lead
FROM base
GROUP BY traffic_owner, funnel_source;

-- 4. Leak detector
CREATE OR REPLACE VIEW public.operator_leak AS
SELECT
  op.*,
  CASE
    WHEN COALESCE(op.booking_rate, 0) < 0.20 THEN 'FUNNEL'
    WHEN COALESCE(op.show_rate, 0)    < 0.60 THEN 'SETTER'
    WHEN COALESCE(op.close_rate, 0)   < 0.20 THEN 'CLOSER'
    ELSE 'SCALE'
  END AS main_issue
FROM public.operator_performance op;

-- 5. Data quality view
CREATE OR REPLACE VIEW public.operator_data_quality AS
SELECT
  COUNT(*) AS leads_total,
  COUNT(*) FILTER (WHERE funnel_source IS NULL) AS missing_funnel_source,
  COUNT(*) FILTER (WHERE traffic_owner IS NULL) AS missing_traffic_owner,
  COUNT(*) FILTER (WHERE funnel_source IS NOT NULL AND traffic_owner IS NOT NULL) AS fully_attributed
FROM public.leads
WHERE created_at > now() - interval '14 days'
  AND COALESCE(is_simulation, false) = false;

-- 6. Completeness score (0..1)
CREATE OR REPLACE FUNCTION public.ors_completeness_score()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN leads_total = 0 THEN 1.0
    ELSE round(fully_attributed::numeric / leads_total, 4)
  END
  FROM public.operator_data_quality;
$$;

-- 7. Access: views inherit base table RLS; expose to authenticated for admin pages.
REVOKE ALL ON public.operator_performance FROM PUBLIC;
REVOKE ALL ON public.operator_leak FROM PUBLIC;
REVOKE ALL ON public.operator_data_quality FROM PUBLIC;
GRANT SELECT ON public.operator_performance TO authenticated;
GRANT SELECT ON public.operator_leak TO authenticated;
GRANT SELECT ON public.operator_data_quality TO authenticated;
GRANT EXECUTE ON FUNCTION public.ors_completeness_score() TO authenticated;