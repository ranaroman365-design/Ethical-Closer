
-- ── 1. Columns on appointments ──────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS fastlane_amount_cents integer;

CREATE INDEX IF NOT EXISTS idx_appointments_pending_expiry
  ON public.appointments (reservation_expires_at)
  WHERE appointment_status = 'pending_payment';

CREATE INDEX IF NOT EXISTS idx_appointments_stripe_session
  ON public.appointments (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- ── 2. Expire pending fastlane reservations + free their slot ──
CREATE OR REPLACE FUNCTION public.expire_pending_appointments()
RETURNS TABLE(expired_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT a.id, a.starts_at, a.ends_at, a.lead_id,
           s.id AS slot_id
    FROM public.appointments a
    LEFT JOIN public.availability_slots s
      ON s.starts_at = a.starts_at
     AND s.ends_at   = a.ends_at
    WHERE a.appointment_status = 'pending_payment'
      AND a.reservation_expires_at IS NOT NULL
      AND a.reservation_expires_at < now()
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    UPDATE public.appointments
       SET appointment_status      = 'expired',
           payment_status          = 'expired',
           reservation_expires_at  = NULL,
           updated_at              = now()
     WHERE id = r.id;

    IF r.slot_id IS NOT NULL THEN
      UPDATE public.availability_slots
         SET current_bookings = GREATEST(0, current_bookings - 1)
       WHERE id = r.slot_id;
    END IF;

    -- Best-effort: clear lead booking pointer if it pointed here
    UPDATE public.leads
       SET has_booking = false,
           booking_id  = NULL
     WHERE booking_id = r.id;

    v_expired := v_expired + 1;
  END LOOP;

  RETURN QUERY SELECT v_expired;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_pending_appointments() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_pending_appointments() TO service_role;

-- ── 3. Atomic confirmation helper for the Stripe webhook ──
CREATE OR REPLACE FUNCTION public.confirm_fastlane_appointment(
  p_appointment_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_cents integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.appointments
     SET appointment_status         = 'confirmed',
         payment_status             = 'paid',
         pricing_tier               = COALESCE(pricing_tier, 'priority'),
         reservation_expires_at     = NULL,
         stripe_checkout_session_id = COALESCE(p_session_id, stripe_checkout_session_id),
         stripe_payment_intent_id   = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
         fastlane_amount_cents      = COALESCE(p_amount_cents, fastlane_amount_cents),
         updated_at                 = now()
   WHERE id = p_appointment_id
     AND appointment_status IN ('pending_payment', 'booked', 'confirmed')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_fastlane_appointment(uuid, text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_fastlane_appointment(uuid, text, text, integer) TO service_role;

-- ── 4. pg_cron: run expiry every minute ──
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('expire-pending-appointments');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-pending-appointments',
  '* * * * *',
  $$ SELECT public.expire_pending_appointments(); $$
);
