
-- Add AI lead scoring columns to leads table
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_quality text DEFAULT 'C',
  ADD COLUMN IF NOT EXISTS scored_at timestamptz;

-- Create lead_follow_ups table for automated follow-up scheduling
CREATE TABLE IF NOT EXISTS public.lead_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  follow_up_type text NOT NULL DEFAULT 'booking_confirmation',
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view follow-ups" ON public.lead_follow_ups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service can manage follow-ups" ON public.lead_follow_ups
  FOR ALL TO service_role USING (true);

-- Create performance_rankings view for setter/closer ranking
CREATE OR REPLACE VIEW public.view_performance_rankings AS
SELECT 
  p.id AS user_id,
  p.full_name,
  p.business_stage,
  mk.closing_rate,
  mk.show_rate,
  mk.revenue_closed,
  mk.calls_handled,
  mk.earnings_per_call,
  mk.commission_earned,
  mk.handover_rate,
  mk.qualification_accuracy,
  -- Setter score: weighted composite
  CASE WHEN p.business_stage IN ('setter', 'associate_setter', 'senior_associate', 'senior_setter')
    THEN ROUND(
      COALESCE(mk.show_rate, 0) * 0.30 +
      COALESCE(mk.handover_rate, 0) * 0.25 +
      COALESCE(mk.qualification_accuracy, 0) * 0.20 +
      LEAST(COALESCE(mk.calls_handled, 0)::numeric / GREATEST(20, 1) * 100, 100) * 0.15 +
      COALESCE(mk.crm_hygiene_score, 0) * 0.10
    , 1)
    ELSE NULL END AS setter_score,
  -- Closer score: weighted composite
  CASE WHEN p.business_stage IN ('junior_manager', 'manager', 'senior_manager', 'director')
    THEN ROUND(
      COALESCE(mk.closing_rate, 0) * 0.35 +
      COALESCE(mk.show_rate, 0) * 0.20 +
      LEAST(COALESCE(mk.earnings_per_call, 0) / GREATEST(500, 1) * 100, 100) * 0.25 +
      LEAST(COALESCE(mk.revenue_closed, 0) / GREATEST(50000, 1) * 100, 100) * 0.10 +
      (100 - COALESCE(mk.storno_rate, 0)) * 0.10
    , 1)
    ELSE NULL END AS closer_score
FROM profiles p
LEFT JOIN member_kpis mk ON mk.user_id = p.id
WHERE p.business_stage IS NOT NULL 
  AND p.business_stage NOT IN ('prospect', 'inner_circle');

-- Auto-schedule follow-ups when appointment is set
CREATE OR REPLACE FUNCTION public.auto_schedule_follow_ups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only trigger when appointment_date is set/changed
  IF NEW.appointment_date IS NOT NULL AND (OLD.appointment_date IS DISTINCT FROM NEW.appointment_date) THEN
    -- Delete old pending follow-ups for this lead
    DELETE FROM lead_follow_ups WHERE lead_id = NEW.id AND status = 'pending';
    
    -- Booking confirmation (immediate)
    INSERT INTO lead_follow_ups (lead_id, follow_up_type, scheduled_at)
    VALUES (NEW.id, 'booking_confirmation', now());
    
    -- 24h reminder
    INSERT INTO lead_follow_ups (lead_id, follow_up_type, scheduled_at)
    VALUES (NEW.id, 'reminder_24h', NEW.appointment_date::timestamptz - interval '24 hours');
    
    -- 2h reminder
    INSERT INTO lead_follow_ups (lead_id, follow_up_type, scheduled_at)
    VALUES (NEW.id, 'reminder_2h', NEW.appointment_date::timestamptz - interval '2 hours');
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_schedule_follow_ups
  AFTER UPDATE OF appointment_date ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION auto_schedule_follow_ups();

-- Also trigger on insert with appointment_date
CREATE OR REPLACE FUNCTION public.auto_schedule_follow_ups_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.appointment_date IS NOT NULL THEN
    INSERT INTO lead_follow_ups (lead_id, follow_up_type, scheduled_at)
    VALUES (NEW.id, 'booking_confirmation', now());
    
    INSERT INTO lead_follow_ups (lead_id, follow_up_type, scheduled_at)
    VALUES (NEW.id, 'reminder_24h', NEW.appointment_date::timestamptz - interval '24 hours');
    
    INSERT INTO lead_follow_ups (lead_id, follow_up_type, scheduled_at)
    VALUES (NEW.id, 'reminder_2h', NEW.appointment_date::timestamptz - interval '2 hours');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_schedule_follow_ups_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION auto_schedule_follow_ups_insert();
