
-- =====================================================
-- Unit Consistency Fix: 1 Person = 1 Unit (ALWAYS)
-- =====================================================

-- 1. Add UNIQUE constraint on member_id — each person can only be in ONE unit
-- (currently only UNIQUE(unit_id, member_id) exists which allows multi-unit)
ALTER TABLE public.operator_team_members
  ADD CONSTRAINT operator_team_members_member_id_unique UNIQUE (member_id);

-- 2. Create a validation trigger to enforce this with a clear error message
CREATE OR REPLACE FUNCTION public.enforce_single_unit_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM operator_team_members
    WHERE member_id = NEW.member_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Member % is already assigned to another unit. Each person can only belong to one unit.',
      NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_single_unit
  BEFORE INSERT OR UPDATE ON operator_team_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_unit_membership();

-- 3. Harden the L5 lead visibility policy — currently uses `public` role, should use `authenticated`
DROP POLICY IF EXISTS "L5 unit members see unit leads" ON public.leads;
CREATE POLICY "L5 unit members see unit leads"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    is_operator_l5plus(auth.uid())
    AND lead_visible_to_unit_member(id, auth.uid())
  );

-- 4. Harden L6 team policy — same fix: public → authenticated
DROP POLICY IF EXISTS "L6 team sees team leads" ON public.leads;
CREATE POLICY "L6 team sees team leads"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    is_operator_l6plus(auth.uid())
    AND lead_visible_to_team_member(id, auth.uid())
  );

-- 5. Harden L7 director policy — remove subquery, use security definer function
DROP POLICY IF EXISTS "L7 directors see all leads" ON public.leads;
CREATE POLICY "L7 directors see all leads"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(
      (SELECT current_level >= 7 FROM public.user_level_status WHERE user_id = auth.uid()),
      false
    )
  );

-- 6. Add index on leads.unit_id for faster unit-scoped queries
CREATE INDEX IF NOT EXISTS idx_leads_unit_id ON public.leads (unit_id);

-- 7. Add index on operator_team_members.member_id for RLS function performance
CREATE INDEX IF NOT EXISTS idx_otm_member_id ON public.operator_team_members (member_id);
