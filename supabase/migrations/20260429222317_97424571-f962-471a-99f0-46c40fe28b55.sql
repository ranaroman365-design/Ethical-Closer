-- =====================================================================
-- DUPLICATE-PAYOUT GUARD (server-side, defense in depth)
-- =====================================================================

-- 1) Hard uniqueness: a single commission can be linked to at most one batch.
--    Partial index ignores rows still NULL (not yet paid).
CREATE UNIQUE INDEX IF NOT EXISTS uq_commissions_payout_batch_id
  ON public.commissions (id)
  WHERE payout_batch_id IS NOT NULL;

-- 2) Trigger: payout_batch_id is set-once-then-immutable
--    + can only be set when the commission becomes 'paid'.
CREATE OR REPLACE FUNCTION public.commissions_protect_payout_batch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Set-once: any change to a non-null payout_batch_id is forbidden.
  IF TG_OP = 'UPDATE'
     AND OLD.payout_batch_id IS NOT NULL
     AND NEW.payout_batch_id IS DISTINCT FROM OLD.payout_batch_id THEN
    RAISE EXCEPTION
      'commission % already linked to batch % — duplicate-payout guard',
      OLD.id, OLD.payout_batch_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- A batch link may only exist on a 'paid' commission.
  IF NEW.payout_batch_id IS NOT NULL AND NEW.payout_status <> 'paid' THEN
    RAISE EXCEPTION
      'payout_batch_id may only be set when status is paid (commission_id=%, status=%)',
      NEW.id, NEW.payout_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_protect_payout_batch ON public.commissions;
CREATE TRIGGER trg_commissions_protect_payout_batch
BEFORE UPDATE OR INSERT ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.commissions_protect_payout_batch();

-- 3) Race-safe batch RPC: lock rows + re-verify status under lock.
CREATE OR REPLACE FUNCTION public.mark_commissions_paid_batch(
  _commission_ids uuid[],
  _payment_method text DEFAULT NULL,
  _payout_reference text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _allowed boolean;
  _user_id uuid;
  _user_count int;
  _eligible_ids uuid[];
  _already_linked_count int;
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

  -- LOCK the selected rows so no concurrent batch can read+write them.
  -- SKIP LOCKED would silently drop ids; we want loud failure on race.
  PERFORM 1
  FROM public.commissions
  WHERE id = ANY(_commission_ids)
  FOR UPDATE;

  -- Detect ids already linked to another batch (paid). Loud error.
  SELECT count(*)
    INTO _already_linked_count
  FROM public.commissions
  WHERE id = ANY(_commission_ids)
    AND payout_batch_id IS NOT NULL;

  IF _already_linked_count > 0 THEN
    RAISE EXCEPTION
      'duplicate-payout guard: % commission(s) in selection already linked to a payout batch',
      _already_linked_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Filter to ONLY eligible (under lock).
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

  INSERT INTO public.payout_batches (
    user_id, total_amount, commission_count,
    payment_method, payout_reference, notes, paid_by, paid_at
  )
  VALUES (
    _user_id, _total, _count,
    _payment_method, _payout_reference, _notes, _actor, now()
  )
  RETURNING id INTO _batch_id;

  -- Mark eligible commissions paid + link to batch.
  -- Trigger + unique index will reject any duplicate / status mismatch.
  UPDATE public.commissions
     SET payout_status    = 'paid',
         paid_at          = now(),
         payout_reference = COALESCE(_payout_reference, payout_reference),
         payout_batch_id  = _batch_id
   WHERE id = ANY(_eligible_ids);

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