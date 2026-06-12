
-- Routing function (already created, but ensure it exists)
CREATE OR REPLACE FUNCTION public.route_lead_to_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_unit_id uuid;
  v_operator_id uuid;
  v_sf text := LOWER(COALESCE(NEW.source_funnel, ''));
BEGIN
  SELECT ou.id, ou.operator_id INTO v_unit_id, v_operator_id
  FROM operator_units ou
  WHERE ou.status = 'active'
    AND (
      (v_sf IN ('apply', 'apply_direct', 'organic', 'apply-test', '') AND ou.funnel_path = '/apply')
      OR (v_sf = 'qualify' AND ou.funnel_path = '/qualify')
      OR (v_sf IN ('high-income-skill', 'his') AND ou.funnel_path = '/high-income-skill')
      OR (v_sf = 'partners' AND ou.funnel_path = '/partners')
    )
  LIMIT 1;

  IF v_unit_id IS NULL THEN
    SELECT ou.id, ou.operator_id INTO v_unit_id, v_operator_id
    FROM operator_units ou WHERE ou.funnel_path = '/apply' AND ou.status = 'active' LIMIT 1;
  END IF;

  NEW.unit_id := v_unit_id;
  NEW.assigned_operator_id := v_operator_id;
  RETURN NEW;
END;
$fn$;

-- Separate triggers for INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_route_lead_to_unit ON leads;
DROP TRIGGER IF EXISTS trg_route_lead_insert ON leads;
DROP TRIGGER IF EXISTS trg_route_lead_update ON leads;

CREATE TRIGGER trg_route_lead_insert
  BEFORE INSERT ON leads
  FOR EACH ROW
  WHEN (NEW.unit_id IS NULL)
  EXECUTE FUNCTION route_lead_to_unit();

CREATE TRIGGER trg_route_lead_update
  BEFORE UPDATE OF source_funnel ON leads
  FOR EACH ROW
  WHEN (OLD.source_funnel IS DISTINCT FROM NEW.source_funnel)
  EXECUTE FUNCTION route_lead_to_unit();

-- Backfill existing leads
UPDATE leads SET
  unit_id = sub.uid,
  assigned_operator_id = sub.oid
FROM (
  SELECT l.id,
    COALESCE(
      (SELECT ou.id FROM operator_units ou WHERE ou.status = 'active' AND (
        (LOWER(COALESCE(l.source_funnel,'')) IN ('apply','apply_direct','organic','apply-test','') AND ou.funnel_path = '/apply')
        OR (LOWER(COALESCE(l.source_funnel,'')) = 'qualify' AND ou.funnel_path = '/qualify')
        OR (LOWER(COALESCE(l.source_funnel,'')) IN ('high-income-skill','his') AND ou.funnel_path = '/high-income-skill')
        OR (LOWER(COALESCE(l.source_funnel,'')) = 'partners' AND ou.funnel_path = '/partners')
      ) LIMIT 1),
      (SELECT ou.id FROM operator_units ou WHERE ou.funnel_path = '/apply' AND ou.status = 'active' LIMIT 1)
    ) AS uid,
    COALESCE(
      (SELECT ou.operator_id FROM operator_units ou WHERE ou.status = 'active' AND (
        (LOWER(COALESCE(l.source_funnel,'')) IN ('apply','apply_direct','organic','apply-test','') AND ou.funnel_path = '/apply')
        OR (LOWER(COALESCE(l.source_funnel,'')) = 'qualify' AND ou.funnel_path = '/qualify')
        OR (LOWER(COALESCE(l.source_funnel,'')) IN ('high-income-skill','his') AND ou.funnel_path = '/high-income-skill')
        OR (LOWER(COALESCE(l.source_funnel,'')) = 'partners' AND ou.funnel_path = '/partners')
      ) LIMIT 1),
      (SELECT ou.operator_id FROM operator_units ou WHERE ou.funnel_path = '/apply' AND ou.status = 'active' LIMIT 1)
    ) AS oid
  FROM leads l
  WHERE l.unit_id IS NULL
) sub
WHERE leads.id = sub.id;
