-- ═══════════════════════════════════════════════════════════════════════
-- Layer 24 Audit: validate monetization_offers against canonical-revenue.ts
-- Read-only. Returns structured JSON. No data modification.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_revenue_offers()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_violations jsonb := '[]'::jsonb;
  v_band_collisions int := 0;
  v_invalid_levels int := 0;
  v_total_active int := 0;
  v_rec record;
BEGIN
  -- Count active offers
  SELECT COUNT(*) INTO v_total_active
  FROM monetization_offers
  WHERE active = true;

  -- 1. Single-Offer: detect collisions per (trigger_state, level band)
  FOR v_rec IN
    WITH expanded AS (
      SELECT
        o.id,
        o.offer_key,
        UNNEST(o.trigger_states) AS state,
        o.min_level,
        o.max_level,
        o.priority
      FROM monetization_offers o
      WHERE o.active = true
    ),
    pairs AS (
      SELECT
        a.state,
        a.offer_key AS offer_a,
        b.offer_key AS offer_b,
        GREATEST(a.min_level, b.min_level) AS overlap_min,
        LEAST(COALESCE(a.max_level, 99), COALESCE(b.max_level, 99)) AS overlap_max
      FROM expanded a
      JOIN expanded b
        ON a.state = b.state
       AND a.offer_key < b.offer_key
       AND GREATEST(a.min_level, b.min_level) <= LEAST(COALESCE(a.max_level, 99), COALESCE(b.max_level, 99))
    )
    SELECT * FROM pairs
  LOOP
    v_band_collisions := v_band_collisions + 1;
    v_violations := v_violations || jsonb_build_object(
      'rule', 'single_offer_principle',
      'severity', 'high',
      'state', v_rec.state,
      'offers', jsonb_build_array(v_rec.offer_a, v_rec.offer_b),
      'overlap_levels', jsonb_build_array(v_rec.overlap_min, v_rec.overlap_max)
    );
  END LOOP;

  -- 2. Invalid level bands
  FOR v_rec IN
    SELECT offer_key, min_level, max_level
    FROM monetization_offers
    WHERE active = true
      AND max_level IS NOT NULL
      AND min_level > max_level
  LOOP
    v_invalid_levels := v_invalid_levels + 1;
    v_violations := v_violations || jsonb_build_object(
      'rule', 'level_band_sanity',
      'severity', 'critical',
      'offer_key', v_rec.offer_key,
      'min_level', v_rec.min_level,
      'max_level', v_rec.max_level
    );
  END LOOP;

  -- 3. Persist report to audit_logs (best-effort; ignore if RLS blocks)
  BEGIN
    INSERT INTO audit_logs (
      action, action_type, resource_type, metadata
    ) VALUES (
      'audit_revenue_offers',
      'system_audit',
      'monetization_offers',
      jsonb_build_object(
        'total_active', v_total_active,
        'band_collisions', v_band_collisions,
        'invalid_levels', v_invalid_levels,
        'violations', v_violations,
        'canon_layer', 24,
        'canon_source', 'src/lib/canonical-revenue.ts'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- audit_logs write failure must not break the read-only audit
  END;

  RETURN jsonb_build_object(
    'ok', (v_band_collisions = 0 AND v_invalid_levels = 0),
    'total_active_offers', v_total_active,
    'band_collisions', v_band_collisions,
    'invalid_level_bands', v_invalid_levels,
    'violations', v_violations,
    'audited_at', now(),
    'canon_layer', 24
  );
END;
$$;

COMMENT ON FUNCTION public.audit_revenue_offers() IS
  'Layer 24 (Revenue Acceleration Canon) audit. Read-only validator for monetization_offers against Single-Offer Principle and level-band sanity. Returns JSON report and best-effort writes to audit_logs.';

-- Restrict execution to authenticated users (admin gate enforced in app layer)
REVOKE ALL ON FUNCTION public.audit_revenue_offers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_revenue_offers() TO authenticated;