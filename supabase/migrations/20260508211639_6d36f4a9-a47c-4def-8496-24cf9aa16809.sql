-- =========================================================================
-- COMMISSION CANON — SHADOW VALIDATION LAYER (additive only) — fixed roles
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.commission_diff_audit (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id              uuid NOT NULL,
  user_id              uuid,
  role                 text NOT NULL,
  business_stage       text,
  canonical_level      integer,
  legacy_rate_pct      numeric(8,4),
  canonical_rate_pct   numeric(8,4),
  legacy_amount        numeric(12,2),
  canonical_amount     numeric(12,2),
  delta                numeric(12,2),
  percentage_delta     numeric(8,4),
  diff_severity        text NOT NULL CHECK (diff_severity IN ('safe','warning','critical')),
  diff_reason          text,
  revenue              numeric(12,2),
  legacy_source        text NOT NULL DEFAULT 'jsonb_product_config',
  canonical_source     text NOT NULL DEFAULT 'commission_rates',
  computed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_diff_audit_call_user_role
  ON public.commission_diff_audit(call_id, COALESCE(user_id,'00000000-0000-0000-0000-000000000000'::uuid), role);

CREATE INDEX IF NOT EXISTS idx_commission_diff_audit_severity
  ON public.commission_diff_audit(diff_severity, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_commission_diff_audit_user
  ON public.commission_diff_audit(user_id, computed_at DESC);

ALTER TABLE public.commission_diff_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_commission_diff_audit" ON public.commission_diff_audit;
CREATE POLICY "admins_read_commission_diff_audit"
  ON public.commission_diff_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.commission_diff_audit IS
  'Shadow Validation Layer: per-payout diff between legacy JSONB commission resolution and canonical commission_rates. Read-only audit. NEVER drives payouts.';

CREATE OR REPLACE FUNCTION public.shadow_compute_canonical_commission(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call          record;
  v_revenue       numeric;
  v_closer_id     uuid;
  v_setter_id     uuid;
  v_closer_stage  text;
  v_setter_stage  text;
  v_closer_rate   numeric;
  v_setter_rate   numeric;
  v_closer_level  integer;
  v_setter_level  integer;
  v_results       jsonb := '[]'::jsonb;
BEGIN
  SELECT c.*, a.locked_closer_id
    INTO v_call
    FROM calls c
    LEFT JOIN appointments a ON a.id = c.appointment_id
   WHERE c.id = p_call_id;

  IF v_call IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;

  v_revenue := COALESCE(v_call.revenue, v_call.deal_size, 0);
  v_closer_id := COALESCE(v_call.locked_closer_id, v_call.user_id);

  IF v_closer_id IS NOT NULL THEN
    SELECT business_stage INTO v_closer_stage FROM profiles WHERE id = v_closer_id;
    SELECT revenue_commission_pct, level
      INTO v_closer_rate, v_closer_level
      FROM commission_rates
     WHERE is_active = true
       AND v_closer_stage = ANY(business_stages)
     LIMIT 1;
    IF v_closer_rate IS NOT NULL THEN
      v_results := v_results || jsonb_build_object(
        'user_id', v_closer_id, 'role', 'closer',
        'business_stage', v_closer_stage, 'level', v_closer_level,
        'rate_pct', v_closer_rate,
        'amount', round(v_revenue * (v_closer_rate / 100.0), 2)
      );
    ELSE
      v_results := v_results || jsonb_build_object(
        'user_id', v_closer_id, 'role', 'closer',
        'business_stage', v_closer_stage,
        'rate_pct', null, 'amount', null,
        'reason', 'no_canonical_mapping'
      );
    END IF;
  END IF;

  IF v_call.lead_id IS NOT NULL THEN
    SELECT setter_id INTO v_setter_id FROM leads WHERE id = v_call.lead_id;
    IF v_setter_id IS NOT NULL AND v_setter_id IS DISTINCT FROM v_closer_id THEN
      SELECT business_stage INTO v_setter_stage FROM profiles WHERE id = v_setter_id;
      SELECT revenue_commission_pct, level
        INTO v_setter_rate, v_setter_level
        FROM commission_rates
       WHERE is_active = true
         AND v_setter_stage = ANY(business_stages)
       LIMIT 1;
      IF v_setter_rate IS NOT NULL THEN
        v_results := v_results || jsonb_build_object(
          'user_id', v_setter_id, 'role', 'setter',
          'business_stage', v_setter_stage, 'level', v_setter_level,
          'rate_pct', v_setter_rate,
          'amount', round(v_revenue * (v_setter_rate / 100.0), 2)
        );
      ELSE
        v_results := v_results || jsonb_build_object(
          'user_id', v_setter_id, 'role', 'setter',
          'business_stage', v_setter_stage,
          'rate_pct', null, 'amount', null,
          'reason', 'no_canonical_mapping'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'call_id', p_call_id,
    'revenue', v_revenue, 'canonical', v_results
  );
END;
$$;

COMMENT ON FUNCTION public.shadow_compute_canonical_commission(uuid) IS
  'Shadow read-only: returns what commission_rates would yield. Writes nothing.';

CREATE OR REPLACE FUNCTION public.record_commission_shadow_diff(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue        numeric;
  v_canonical      jsonb;
  v_canonical_item jsonb;
  v_match          jsonb;
  v_legacy         record;
  v_legacy_pct     numeric;
  v_canonical_pct  numeric;
  v_canonical_amt  numeric;
  v_canonical_lvl  int;
  v_canonical_stg  text;
  v_delta          numeric;
  v_pct_delta      numeric;
  v_severity       text;
  v_reason         text;
  v_inserted       int := 0;
BEGIN
  v_canonical := public.shadow_compute_canonical_commission(p_call_id);
  IF (v_canonical->>'success')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_canonical->>'error');
  END IF;
  v_revenue := (v_canonical->>'revenue')::numeric;

  FOR v_legacy IN
    SELECT c.user_id, c.role, c.amount,
           (c.closer_lock_snapshot->>'rate')::numeric  AS legacy_rate,
           (c.closer_lock_snapshot->>'stage')::text    AS legacy_stage
      FROM commissions c
     WHERE c.call_id = p_call_id
       AND COALESCE(c.is_simulation, false) = false
  LOOP
    v_match := NULL;
    FOR v_canonical_item IN
      SELECT value FROM jsonb_array_elements(v_canonical->'canonical') AS t(value)
    LOOP
      IF (v_canonical_item->>'user_id')::uuid = v_legacy.user_id
         AND (v_canonical_item->>'role') = v_legacy.role
      THEN
        v_match := v_canonical_item;
        EXIT;
      END IF;
    END LOOP;

    v_legacy_pct    := COALESCE(v_legacy.legacy_rate * 100.0, NULL);
    v_canonical_pct := NULLIF((v_match->>'rate_pct'), '')::numeric;
    v_canonical_amt := NULLIF((v_match->>'amount'), '')::numeric;
    v_canonical_lvl := NULLIF((v_match->>'level'), '')::int;
    v_canonical_stg := COALESCE(v_match->>'business_stage', v_legacy.legacy_stage);
    v_delta := COALESCE(v_canonical_amt, 0) - COALESCE(v_legacy.amount, 0);
    v_pct_delta := CASE
      WHEN v_legacy.amount IS NOT NULL AND v_legacy.amount <> 0
        THEN round((v_delta / v_legacy.amount) * 100.0, 4)
      ELSE NULL
    END;

    IF v_canonical_amt IS NULL THEN
      v_severity := 'critical';
      v_reason   := 'no_canonical_mapping';
    ELSIF abs(v_delta) < 0.01 THEN
      v_severity := 'safe';
      v_reason   := 'match';
    ELSIF abs(v_delta) < 1.00 OR (v_pct_delta IS NOT NULL AND abs(v_pct_delta) < 1.0) THEN
      v_severity := 'safe';
      v_reason   := 'rounding_only';
    ELSIF v_pct_delta IS NOT NULL AND abs(v_pct_delta) < 10.0 THEN
      v_severity := 'warning';
      v_reason   := 'rate_drift_minor';
    ELSE
      v_severity := 'critical';
      v_reason   := 'rate_drift_major';
    END IF;

    INSERT INTO commission_diff_audit (
      call_id, user_id, role, business_stage, canonical_level,
      legacy_rate_pct, canonical_rate_pct,
      legacy_amount, canonical_amount, delta, percentage_delta,
      diff_severity, diff_reason, revenue
    ) VALUES (
      p_call_id, v_legacy.user_id, v_legacy.role,
      v_canonical_stg, v_canonical_lvl,
      v_legacy_pct, v_canonical_pct,
      v_legacy.amount, v_canonical_amt, v_delta, v_pct_delta,
      v_severity, v_reason, v_revenue
    )
    ON CONFLICT (call_id, COALESCE(user_id,'00000000-0000-0000-0000-000000000000'::uuid), role)
    DO UPDATE SET
      legacy_amount      = EXCLUDED.legacy_amount,
      canonical_amount   = EXCLUDED.canonical_amount,
      legacy_rate_pct    = EXCLUDED.legacy_rate_pct,
      canonical_rate_pct = EXCLUDED.canonical_rate_pct,
      delta              = EXCLUDED.delta,
      percentage_delta   = EXCLUDED.percentage_delta,
      diff_severity      = EXCLUDED.diff_severity,
      diff_reason        = EXCLUDED.diff_reason,
      revenue            = EXCLUDED.revenue,
      computed_at        = now();

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'recorded', v_inserted);
END;
$$;

COMMENT ON FUNCTION public.record_commission_shadow_diff(uuid) IS
  'Shadow audit recorder. Compares legacy commissions vs canonical commission_rates. Idempotent. Never alters commissions.';

CREATE OR REPLACE FUNCTION public.trg_commissions_shadow_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.record_commission_shadow_diff(NEW.call_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_shadow_audit_after_insert ON public.commissions;
CREATE TRIGGER trg_commissions_shadow_audit_after_insert
  AFTER INSERT ON public.commissions
  FOR EACH ROW
  WHEN (COALESCE(NEW.is_simulation, false) = false)
  EXECUTE FUNCTION public.trg_commissions_shadow_audit();

CREATE OR REPLACE VIEW public.commission_diff_audit_summary AS
SELECT
  date_trunc('day', computed_at)::date AS day,
  diff_severity,
  count(*)                              AS rows,
  sum(abs(delta))                       AS abs_delta_sum,
  sum(delta)                            AS net_delta_sum,
  count(DISTINCT call_id)               AS calls_affected,
  count(DISTINCT user_id)               AS users_affected
FROM public.commission_diff_audit
WHERE computed_at >= now() - interval '90 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

COMMENT ON VIEW public.commission_diff_audit_summary IS
  'Rolling 90-day rollup of shadow commission diffs by severity.';
