-- 1. calls.transcript_created_at
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS transcript_created_at TIMESTAMPTZ;

-- Backfill timestamp trigger (only fires when transcript transitions from null/empty -> populated)
CREATE OR REPLACE FUNCTION public.set_transcript_created_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transcript IS NOT NULL AND length(NEW.transcript) > 50
     AND (OLD.transcript IS NULL OR length(OLD.transcript) <= 50)
     AND NEW.transcript_created_at IS NULL THEN
    NEW.transcript_created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_transcript_created_at ON public.calls;
CREATE TRIGGER trg_set_transcript_created_at
BEFORE UPDATE OF transcript ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.set_transcript_created_at();

-- 2. commissions.payout_reference
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS payout_reference TEXT;

-- 3. call_pattern_summary (aggregated, deterministic)
CREATE TABLE IF NOT EXISTS public.call_pattern_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  objection_type TEXT,
  phase TEXT,
  outcome TEXT NOT NULL,
  win_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  avg_score NUMERIC(5,2),
  sample_size INTEGER NOT NULL DEFAULT 0,
  pattern_key TEXT GENERATED ALWAYS AS (
    COALESCE(objection_type,'_') || '|' || COALESCE(phase,'_') || '|' || outcome
  ) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT call_pattern_summary_unique UNIQUE (pattern_key)
);

CREATE INDEX IF NOT EXISTS idx_call_pattern_summary_outcome
  ON public.call_pattern_summary(outcome);
CREATE INDEX IF NOT EXISTS idx_call_pattern_summary_phase
  ON public.call_pattern_summary(phase);

ALTER TABLE public.call_pattern_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read pattern summary" ON public.call_pattern_summary;
CREATE POLICY "authenticated read pattern summary"
ON public.call_pattern_summary FOR SELECT
TO authenticated
USING (true);

-- 4. mark_commission_paid RPC (admin/finance only, audit logged)
CREATE OR REPLACE FUNCTION public.mark_commission_paid(
  _commission_id UUID,
  _payout_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _allowed BOOLEAN;
  _before public.commissions%ROWTYPE;
  _after public.commissions%ROWTYPE;
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

  SELECT * INTO _before FROM public.commissions WHERE id = _commission_id;
  IF _before.id IS NULL THEN
    RAISE EXCEPTION 'commission not found';
  END IF;

  -- Idempotency: already paid -> return current state
  IF _before.payout_status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'commission_id', _commission_id,
      'paid_at', _before.paid_at,
      'payout_reference', _before.payout_reference
    );
  END IF;

  UPDATE public.commissions
     SET payout_status = 'paid',
         paid_at = now(),
         payout_reference = COALESCE(_payout_reference, payout_reference)
   WHERE id = _commission_id
   RETURNING * INTO _after;

  -- Audit log (best effort, do not fail the payout if audit insert fails)
  BEGIN
    INSERT INTO public.audit_logs (
      actor_id, action, action_type, resource_type, resource_id,
      before_state, after_state, action_result
    ) VALUES (
      _actor, 'commission.mark_paid', 'update', 'commissions', _commission_id::text,
      jsonb_build_object('payout_status', _before.payout_status, 'paid_at', _before.paid_at),
      jsonb_build_object('payout_status', _after.payout_status, 'paid_at', _after.paid_at, 'payout_reference', _after.payout_reference),
      'success'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'commission_id', _commission_id,
    'paid_at', _after.paid_at,
    'payout_reference', _after.payout_reference
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_commission_paid(UUID, TEXT) TO authenticated;