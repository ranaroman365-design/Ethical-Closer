-- ============================================================================
-- PART 1 — Appointment closer LOCK (set once at deal close, immutable)
-- ============================================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS locked_closer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at        timestamptz;

CREATE INDEX IF NOT EXISTS idx_appointments_locked_closer
  ON public.appointments(locked_closer_id) WHERE locked_closer_id IS NOT NULL;

-- Once locked, never change
CREATE OR REPLACE FUNCTION public.appointments_protect_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.locked_closer_id IS NOT NULL
     AND (NEW.locked_closer_id IS DISTINCT FROM OLD.locked_closer_id
          OR NEW.locked_at      IS DISTINCT FROM OLD.locked_at) THEN
    RAISE EXCEPTION 'appointment closer-lock is immutable (locked_at=%)', OLD.locked_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_protect_lock ON public.appointments;
CREATE TRIGGER trg_appointments_protect_lock
BEFORE UPDATE OF locked_closer_id, locked_at ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.appointments_protect_lock();

-- ============================================================================
-- PART 2 — Profile payment fields (minimal)
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS iban                text,
  ADD COLUMN IF NOT EXISTS payment_method      text,
  ADD COLUMN IF NOT EXISTS payout_company_name text,
  ADD COLUMN IF NOT EXISTS payout_full_name    text;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('iban','wise','paypal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PART 3 — Commission lifecycle additions
-- ============================================================================
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS eligible_at           timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_reason       text,
  ADD COLUMN IF NOT EXISTS closer_lock_snapshot  jsonb;

-- Allow new statuses (no-op if check absent; commissions has no payout_status check today)
ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_payout_status_check;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_payout_status_check
  CHECK (payout_status IN ('pending','eligible','paid','reversed'));

-- Protect paid/reversed commissions from edits
CREATE OR REPLACE FUNCTION public.commissions_protect_finalized()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.payout_status = 'paid' THEN
    -- only payout_reference may change after paid (audit notes)
    IF NEW.payout_status   IS DISTINCT FROM OLD.payout_status
    OR NEW.amount          IS DISTINCT FROM OLD.amount
    OR NEW.user_id         IS DISTINCT FROM OLD.user_id
    OR NEW.call_id         IS DISTINCT FROM OLD.call_id
    OR NEW.role            IS DISTINCT FROM OLD.role
    OR NEW.paid_at         IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'paid commissions are immutable (commission_id=%)', OLD.id;
    END IF;
  END IF;

  IF OLD.payout_status = 'reversed'
     AND (NEW.payout_status IS DISTINCT FROM OLD.payout_status
          OR NEW.amount     IS DISTINCT FROM OLD.amount) THEN
    RAISE EXCEPTION 'reversed commissions are immutable (commission_id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_protect_finalized ON public.commissions;
CREATE TRIGGER trg_commissions_protect_finalized
BEFORE UPDATE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.commissions_protect_finalized();

-- Block deletes on history (admins keep history)
CREATE OR REPLACE FUNCTION public.commissions_block_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commissions are append-only — use mark_commission_reversed()';
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_block_delete ON public.commissions;
CREATE TRIGGER trg_commissions_block_delete
BEFORE DELETE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.commissions_block_delete();

-- ============================================================================
-- PART 4 — Patch distribute_commissions: write lock + read ONLY from lock
-- ============================================================================
CREATE OR REPLACE FUNCTION public.distribute_commissions(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_call                 record;
  v_appt                 record;
  v_revenue              numeric;
  v_locked_closer_id     uuid;
  v_original_handler_id  uuid;
  v_results              jsonb := '[]'::jsonb;
  v_product_key          text;
  v_config               jsonb;
  v_user_stage           text;
  v_rate                 numeric;
  v_amount               numeric;
  v_override_active      boolean;
  v_override_stages      text[] := ARRAY['director','partner'];
BEGIN
  SELECT * INTO v_call FROM calls WHERE id = p_call_id;
  IF v_call IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  IF v_call.result != 'won' OR v_call.closed_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_closed_won');
  END IF;

  v_revenue := COALESCE(v_call.revenue, v_call.deal_size, 0);
  IF v_revenue <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_revenue');
  END IF;

  v_original_handler_id := v_call.user_id;

  -- ── LOCK PHASE ──────────────────────────────────────────────────────────
  -- Set the lock once. Subsequent calls (e.g. retries) read the same lock.
  IF v_call.appointment_id IS NOT NULL THEN
    SELECT * INTO v_appt FROM appointments WHERE id = v_call.appointment_id FOR UPDATE;

    IF v_appt.id IS NOT NULL THEN
      IF v_appt.locked_closer_id IS NULL THEN
        UPDATE appointments
           SET locked_closer_id = COALESCE(v_appt.current_closer_id, v_appt.current_owner_id, v_original_handler_id),
               locked_at        = now()
         WHERE id = v_appt.id
         RETURNING locked_closer_id INTO v_locked_closer_id;

        INSERT INTO audit_logs (action, source_type, note, after_state)
        VALUES (
          'commission_closer_locked',
          'system',
          format('Closer locked at deal close for appointment %s', v_appt.id),
          jsonb_build_object(
            'call_id', p_call_id,
            'appointment_id', v_appt.id,
            'locked_closer_id', v_locked_closer_id,
            'original_handler_id', v_original_handler_id
          )
        );
      ELSE
        v_locked_closer_id := v_appt.locked_closer_id;
      END IF;
    END IF;
  END IF;

  -- Fallback when call has no appointment link (legacy)
  IF v_locked_closer_id IS NULL THEN
    v_locked_closer_id := v_original_handler_id;
  END IF;

  -- Audit reassignment effect
  IF v_locked_closer_id IS DISTINCT FROM v_original_handler_id
     AND v_original_handler_id IS NOT NULL THEN
    INSERT INTO audit_logs (action, source_type, note, after_state)
    VALUES (
      'commission_reassigned_close',
      'system',
      format('Commission routed to locked closer %s instead of original handler %s',
             v_locked_closer_id, v_original_handler_id),
      jsonb_build_object(
        'call_id', p_call_id,
        'appointment_id', v_call.appointment_id,
        'original_handler_id', v_original_handler_id,
        'locked_closer_id', v_locked_closer_id
      )
    );
  END IF;

  -- ── PAYOUT PHASE — read ONLY from lock ──────────────────────────────────
  IF v_locked_closer_id IS NOT NULL THEN
    v_product_key := get_user_product_key(v_locked_closer_id);
    SELECT config INTO v_config FROM product_config WHERE product_key = v_product_key;
    SELECT current_stage INTO v_user_stage FROM profiles WHERE id = v_locked_closer_id;

    IF v_config IS NOT NULL AND v_user_stage IS NOT NULL THEN
      v_rate := COALESCE(
        (v_config->'commission_rates'->'closer'->>v_user_stage)::numeric,
        (v_config->'commission_rates'->'closer'->>'default')::numeric,
        0
      );
      v_override_active := v_user_stage = ANY(v_override_stages);

      IF v_rate > 0 THEN
        v_amount := round(v_revenue * v_rate / 100.0, 2);
        INSERT INTO commissions (
          call_id, user_id, role, amount, source_type, payout_status, closer_lock_snapshot
        ) VALUES (
          p_call_id, v_locked_closer_id,
          CASE WHEN v_override_active THEN 'director_override' ELSE 'closer' END,
          v_amount, 'direct', 'pending',
          jsonb_build_object(
            'locked_closer_id', v_locked_closer_id,
            'locked_at', COALESCE(v_appt.locked_at, now()),
            'original_handler_id', v_original_handler_id,
            'appointment_id', v_call.appointment_id
          )
        )
        ON CONFLICT DO NOTHING;

        v_results := v_results || jsonb_build_object(
          'role', CASE WHEN v_override_active THEN 'director_override' ELSE 'closer' END,
          'user_id', v_locked_closer_id,
          'amount', v_amount,
          'rate', v_rate
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'call_id', p_call_id,
    'locked_closer_id', v_locked_closer_id,
    'commissions', v_results
  );
END;
$function$;

-- ============================================================================
-- PART 5 — Eligibility sweep (pending → eligible after 14 days)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sweep_commissions_eligibility(_delay_days int DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _promoted int := 0;
BEGIN
  WITH upd AS (
    UPDATE public.commissions
       SET payout_status = 'eligible',
           eligible_at   = now()
     WHERE payout_status = 'pending'
       AND created_at <= now() - make_interval(days => _delay_days)
       AND is_simulation = false
     RETURNING 1
  )
  SELECT count(*) INTO _promoted FROM upd;

  RETURN jsonb_build_object('success', true, 'promoted', _promoted, 'delay_days', _delay_days);
END;
$$;

-- ============================================================================
-- PART 6 — Reversal (refund) RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_commission_reversed(
  _commission_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _allowed boolean;
  _before public.commissions%ROWTYPE;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _actor AND role IN ('owner','admin','finance_admin')
  ) INTO _allowed;
  IF NOT _allowed THEN RAISE EXCEPTION 'forbidden: requires owner, admin or finance_admin role'; END IF;

  SELECT * INTO _before FROM public.commissions WHERE id = _commission_id;
  IF _before.id IS NULL THEN RAISE EXCEPTION 'commission not found'; END IF;
  IF _before.payout_status = 'reversed' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'commission_id', _commission_id);
  END IF;

  UPDATE public.commissions
     SET payout_status   = 'reversed',
         reversed_at     = now(),
         reversed_reason = COALESCE(_reason, 'unspecified')
   WHERE id = _commission_id;

  INSERT INTO public.audit_logs (
    actor_id, action, action_type, resource_type, resource_id, before_state, after_state, action_result
  ) VALUES (
    _actor, 'commission.reversed', 'update', 'commissions', _commission_id::text,
    jsonb_build_object('payout_status', _before.payout_status),
    jsonb_build_object('payout_status', 'reversed', 'reason', _reason),
    'success'
  );

  RETURN jsonb_build_object('success', true, 'commission_id', _commission_id);
END;
$$;

-- ============================================================================
-- PART 7 — Dashboard views (security_invoker so RLS applies)
-- ============================================================================
DROP VIEW IF EXISTS public.v_user_payout_summary CASCADE;
CREATE VIEW public.v_user_payout_summary
WITH (security_invoker = true) AS
SELECT
  user_id,
  COALESCE(SUM(amount) FILTER (WHERE payout_status IN ('pending','eligible','paid')), 0)::numeric AS total_earned,
  COALESCE(SUM(amount) FILTER (WHERE payout_status = 'pending'),  0)::numeric AS total_pending,
  COALESCE(SUM(amount) FILTER (WHERE payout_status = 'eligible'), 0)::numeric AS total_eligible,
  COALESCE(SUM(amount) FILTER (WHERE payout_status = 'paid'),     0)::numeric AS total_paid,
  COALESCE(SUM(amount) FILTER (WHERE payout_status = 'reversed'), 0)::numeric AS total_reversed,
  count(*) FILTER (WHERE payout_status = 'eligible') AS eligible_count,
  count(*) FILTER (WHERE payout_status = 'pending')  AS pending_count
FROM public.commissions
WHERE is_simulation = false
GROUP BY user_id;

DROP VIEW IF EXISTS public.v_admin_payout_queue CASCADE;
CREATE VIEW public.v_admin_payout_queue
WITH (security_invoker = true) AS
SELECT
  c.user_id,
  p.payout_full_name,
  p.full_name,
  p.payment_method,
  p.iban,
  p.payout_company_name,
  COALESCE(SUM(c.amount) FILTER (WHERE c.payout_status = 'eligible'), 0)::numeric AS total_eligible,
  count(*) FILTER (WHERE c.payout_status = 'eligible') AS eligible_count,
  jsonb_agg(
    jsonb_build_object(
      'commission_id', c.id,
      'amount', c.amount,
      'role', c.role,
      'created_at', c.created_at,
      'eligible_at', c.eligible_at,
      'call_id', c.call_id
    ) ORDER BY c.eligible_at DESC NULLS LAST
  ) FILTER (WHERE c.payout_status = 'eligible') AS eligible_commissions
FROM public.commissions c
LEFT JOIN public.profiles p ON p.id = c.user_id
WHERE c.is_simulation = false
GROUP BY c.user_id, p.payout_full_name, p.full_name, p.payment_method, p.iban, p.payout_company_name
HAVING count(*) FILTER (WHERE c.payout_status = 'eligible') > 0;

GRANT SELECT ON public.v_user_payout_summary TO authenticated;
GRANT SELECT ON public.v_admin_payout_queue  TO authenticated;