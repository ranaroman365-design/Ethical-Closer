-- ═══════════════════════════════════════════════════════════════
-- Phase 2 Canonicalization: Ownership Columns + Commission Guard
-- ═══════════════════════════════════════════════════════════════

-- 1. Add canonical ownership columns to calls
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS call_owner_user_id UUID,
  ADD COLUMN IF NOT EXISTS revenue_owner_user_id UUID;

-- Backfill from existing user_id
UPDATE public.calls
SET call_owner_user_id = user_id,
    revenue_owner_user_id = user_id
WHERE call_owner_user_id IS NULL;

-- 2. Create commission_audit_log
CREATE TABLE IF NOT EXISTS public.commission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('update', 'delete', 'admin_override')),
  old_values JSONB,
  new_values JSONB,
  performed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view commission audit log"
  ON public.commission_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 3. Commission immutability trigger
CREATE OR REPLACE FUNCTION public.protect_finalized_commissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_paid_at TIMESTAMPTZ;
  v_is_admin_override BOOLEAN := false;
BEGIN
  -- Check if admin override is active
  BEGIN
    v_is_admin_override := current_setting('app.admin_override', true) = 'true';
  EXCEPTION WHEN OTHERS THEN
    v_is_admin_override := false;
  END;

  -- Only protect commissions linked to a finalized (paid) batch
  IF OLD.payout_batch_id IS NOT NULL THEN
    SELECT paid_at INTO v_batch_paid_at
    FROM public.payout_batches
    WHERE id = OLD.payout_batch_id;

    IF v_batch_paid_at IS NOT NULL THEN
      -- Log the attempt
      INSERT INTO public.commission_audit_log (commission_id, action, old_values, new_values, performed_by)
      VALUES (
        OLD.id,
        CASE
          WHEN v_is_admin_override THEN 'admin_override'
          WHEN TG_OP = 'DELETE' THEN 'delete'
          ELSE 'update'
        END,
        row_to_json(OLD)::jsonb,
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END,
        COALESCE(current_setting('app.current_user', true), 'system')
      );

      -- Block unless admin override
      IF NOT v_is_admin_override THEN
        RAISE EXCEPTION 'Cannot modify finalized commission (payout batch % paid at %)',
          OLD.payout_batch_id, v_batch_paid_at;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_finalized_commissions ON public.commissions;
CREATE TRIGGER trg_protect_finalized_commissions
  BEFORE UPDATE OR DELETE ON public.commissions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_finalized_commissions();