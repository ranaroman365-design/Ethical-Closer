
-- ============================================================================
-- Payout Batches — manual admin payout workflow (extends existing system)
-- ============================================================================

-- 1. payout_batches: one row per manual payout to a user
CREATE TABLE IF NOT EXISTS public.payout_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  total_amount    numeric NOT NULL CHECK (total_amount > 0),
  commission_count int NOT NULL CHECK (commission_count > 0),
  payment_method  text,
  payout_reference text,
  notes           text,
  paid_by         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  paid_at         timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_user_id ON public.payout_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_batches_paid_at ON public.payout_batches(paid_at DESC);

ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own payout batches"  ON public.payout_batches;
CREATE POLICY "Users see own payout batches"
  ON public.payout_batches FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins see all payout batches" ON public.payout_batches;
CREATE POLICY "Admins see all payout batches"
  ON public.payout_batches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('owner','admin','finance_admin')
    )
  );

-- No direct INSERT/UPDATE/DELETE — only via RPC
DROP POLICY IF EXISTS "No direct write payout batches" ON public.payout_batches;
CREATE POLICY "No direct write payout batches"
  ON public.payout_batches FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- 2. Link commissions to a batch
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS payout_batch_id uuid REFERENCES public.payout_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commissions_payout_batch_id
  ON public.commissions(payout_batch_id) WHERE payout_batch_id IS NOT NULL;

-- 3. Bulk mark-as-paid RPC (admin/finance/owner only)
CREATE OR REPLACE FUNCTION public.mark_commissions_paid_batch(
  _commission_ids   uuid[],
  _payment_method   text DEFAULT NULL,
  _payout_reference text DEFAULT NULL,
  _notes            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _allowed boolean;
  _user_id uuid;
  _user_count int;
  _eligible_ids uuid[];
  _total numeric;
  _count int;
  _batch_id uuid;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _actor AND role IN ('owner','admin','finance_admin')
  ) INTO _allowed;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'forbidden: requires owner, admin or finance_admin role';
  END IF;

  IF _commission_ids IS NULL OR array_length(_commission_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no commissions provided';
  END IF;

  -- Filter to ONLY eligible (not already paid, not pending, not reversed) and same user
  SELECT array_agg(id), max(user_id), count(*), count(DISTINCT user_id), COALESCE(sum(amount),0)
    INTO _eligible_ids, _user_id, _count, _user_count, _total
  FROM public.commissions
  WHERE id = ANY(_commission_ids)
    AND payout_status = 'eligible'
    AND is_simulation = false;

  IF _count = 0 THEN
    RAISE EXCEPTION 'no eligible commissions in selection';
  END IF;
  IF _user_count > 1 THEN
    RAISE EXCEPTION 'all commissions in a batch must belong to one user';
  END IF;

  -- Create the batch row
  INSERT INTO public.payout_batches (
    user_id, total_amount, commission_count,
    payment_method, payout_reference, notes, paid_by, paid_at
  )
  VALUES (
    _user_id, _total, _count,
    _payment_method, _payout_reference, _notes, _actor, now()
  )
  RETURNING id INTO _batch_id;

  -- Mark all eligible commissions as paid + link to batch
  UPDATE public.commissions
     SET payout_status    = 'paid',
         paid_at          = now(),
         payout_reference = COALESCE(_payout_reference, payout_reference),
         payout_batch_id  = _batch_id
   WHERE id = ANY(_eligible_ids);

  -- Best-effort audit log
  BEGIN
    INSERT INTO public.audit_logs (
      actor_id, action, action_type, resource_type, resource_id,
      after_state, action_result
    ) VALUES (
      _actor, 'commission.batch_paid', 'update', 'payout_batches', _batch_id::text,
      jsonb_build_object(
        'user_id', _user_id, 'total_amount', _total,
        'commission_count', _count, 'commission_ids', _eligible_ids,
        'payment_method', _payment_method
      ),
      'success'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', _batch_id,
    'user_id', _user_id,
    'total_amount', _total,
    'commission_count', _count,
    'paid_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_commissions_paid_batch(uuid[], text, text, text) TO authenticated;

-- 4. Admin batches history view
DROP VIEW IF EXISTS public.v_admin_payout_batches CASCADE;
CREATE VIEW public.v_admin_payout_batches
WITH (security_invoker = true) AS
SELECT
  b.id,
  b.user_id,
  COALESCE(p.payout_full_name, p.full_name, p.email) AS recipient_name,
  p.email AS recipient_email,
  b.total_amount,
  b.commission_count,
  b.payment_method,
  b.payout_reference,
  b.notes,
  b.paid_by,
  pa.full_name AS paid_by_name,
  b.paid_at
FROM public.payout_batches b
LEFT JOIN public.profiles p  ON p.id  = b.user_id
LEFT JOIN public.profiles pa ON pa.id = b.paid_by;

GRANT SELECT ON public.v_admin_payout_batches TO authenticated;
