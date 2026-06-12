
-- 1. Add test user flags to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_test_user boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS exclude_from_kpis boolean NOT NULL DEFAULT false;

-- 2. Mark known operator/test profiles
UPDATE public.profiles SET is_test_user = true, exclude_from_kpis = true
WHERE id IN (
  'da2c7521-c6a1-44da-a393-f6fa2bdf4563', -- Oleg
  '366e7808-35c7-4329-bd36-323f0f58361e', -- Daniel
  '6ec5144b-be70-43ad-989d-f4e3904f47f1', -- Josué (partner)
  '7a9c14a9-f25c-4a87-93ef-faaa7b6e78a4', -- Josué
  'a11ce606-113e-4dc1-96a2-cfe9000acd7a'  -- Josué
);

-- 3. Flag ALL test leads as simulation (so is_test_lead() catches them)
UPDATE public.leads SET is_simulation = true
WHERE is_simulation IS NOT true
  AND (
    name ILIKE 'test%'
    OR name ILIKE '%kein lead%'
    OR name ILIKE '%test test%'
    OR source LIKE '%test%'
    OR source = 'go_live_simulation:meta'
    OR source = 'qa_test'
  );

-- 4. Delete expired/pending payment links (all unpaid)
DELETE FROM public.payment_links WHERE paid_at IS NULL;

-- 5. Delete appointments linked to test leads
DELETE FROM public.appointments
WHERE lead_id IN (SELECT id FROM public.leads WHERE is_simulation = true);

-- 6. Delete calls linked to test leads
DELETE FROM public.calls
WHERE lead_id IN (SELECT id FROM public.leads WHERE is_simulation = true);

-- 7. Delete ALL commissions (fresh start)
DELETE FROM public.commissions;

-- 8. Delete calls with zero revenue (test data cleanup)
DELETE FROM public.calls WHERE COALESCE(revenue, 0) = 0 AND result IS NULL;

-- 9. Create helper function: is_test_user check
CREATE OR REPLACE FUNCTION public.is_test_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT exclude_from_kpis FROM profiles WHERE id = p_user_id),
    false
  );
$$;
