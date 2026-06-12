-- Unique partial index: only ONE active appointment per lead at any time.
-- "Active" = booked, confirmed, or pending_payment. Superseded/cancelled/etc are excluded.
-- This prevents duplicate appointments even under race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_one_active_per_lead
  ON public.appointments (lead_id)
  WHERE appointment_status IN ('booked', 'confirmed', 'pending_payment');