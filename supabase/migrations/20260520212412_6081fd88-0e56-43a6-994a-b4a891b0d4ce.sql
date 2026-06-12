-- ============================================================================
-- HARDENING: leads.appointment_status drift cleanup + sync guard
-- ============================================================================
-- Context: leads.appointment_status had DEFAULT 'scheduled' which polluted
-- every new lead regardless of actual appointment state. Column is nowhere
-- authoritative (0 reads in src/, edge functions, or other migrations).
-- Canonical source of truth = appointments.appointment_status.
--
-- This migration:
--   1. Drops the misleading DEFAULT
--   2. Backfills leads.appointment_status from latest non-cancelled appointment
--   3. Installs trigger to keep leads.appointment_status in sync on appointment
--      INSERT/UPDATE/DELETE — read-only from appointments, never the reverse
--
-- DOES NOT touch: booking flow, notifications, pool, state machine, RLS.
-- ============================================================================

-- 1) Remove misleading default
ALTER TABLE public.leads
  ALTER COLUMN appointment_status DROP DEFAULT;

-- 2) Backfill from canonical source (appointments)
WITH latest_appt AS (
  SELECT DISTINCT ON (lead_id)
    lead_id,
    appointment_status
  FROM public.appointments
  WHERE lead_id IS NOT NULL
    AND appointment_status <> 'cancelled'
  ORDER BY lead_id, COALESCE(updated_at, created_at) DESC
)
UPDATE public.leads l
SET appointment_status = la.appointment_status
FROM latest_appt la
WHERE l.id = la.lead_id
  AND COALESCE(l.appointment_status, '') IS DISTINCT FROM la.appointment_status;

-- Null-out leads with no active appointment (clears the 'scheduled' default drift)
UPDATE public.leads l
SET appointment_status = NULL
WHERE l.appointment_status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.lead_id = l.id
      AND a.appointment_status <> 'cancelled'
  );

-- 3) Sync trigger: keep leads.appointment_status mirrored from appointments
CREATE OR REPLACE FUNCTION public.sync_lead_appointment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_new_status text;
BEGIN
  -- Determine which lead is affected
  IF TG_OP = 'DELETE' THEN
    v_lead_id := OLD.lead_id;
  ELSE
    v_lead_id := NEW.lead_id;
  END IF;

  IF v_lead_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Derive canonical status: latest non-cancelled appointment, or NULL
  SELECT appointment_status
    INTO v_new_status
  FROM public.appointments
  WHERE lead_id = v_lead_id
    AND appointment_status <> 'cancelled'
  ORDER BY COALESCE(updated_at, created_at) DESC
  LIMIT 1;

  UPDATE public.leads
  SET appointment_status = v_new_status
  WHERE id = v_lead_id
    AND COALESCE(appointment_status, '') IS DISTINCT FROM COALESCE(v_new_status, '');

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_appointment_status ON public.appointments;
CREATE TRIGGER trg_sync_lead_appointment_status
AFTER INSERT OR UPDATE OF appointment_status, lead_id OR DELETE
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_appointment_status();

COMMENT ON COLUMN public.leads.appointment_status IS
  'DERIVED display field — mirrored from appointments.appointment_status via trg_sync_lead_appointment_status. NOT authoritative. Canonical source: appointments table. NULL = no active appointment.';

COMMENT ON FUNCTION public.sync_lead_appointment_status() IS
  'Keeps leads.appointment_status in sync with latest non-cancelled appointment. Read-only from appointments side.';