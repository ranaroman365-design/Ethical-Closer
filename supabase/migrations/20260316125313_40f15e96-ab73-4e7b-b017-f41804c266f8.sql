-- 1. Attach the auto_advance_phase trigger to member_progress
CREATE TRIGGER trg_auto_advance_phase
  AFTER INSERT OR UPDATE ON public.member_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_advance_phase();

-- 2. Create onboarding_progress table for Start Here checklist persistence
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  UNIQUE(user_id, item_key)
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own onboarding" ON public.onboarding_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users insert own onboarding" ON public.onboarding_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own onboarding" ON public.onboarding_progress
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- 3. Create objection_mastery table for Objection Handling persistence
CREATE TABLE IF NOT EXISTS public.objection_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  objection_id int NOT NULL,
  mastered boolean NOT NULL DEFAULT true,
  mastered_at timestamptz DEFAULT now(),
  UNIQUE(user_id, objection_id)
);

ALTER TABLE public.objection_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own objection mastery" ON public.objection_mastery
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users insert own objection mastery" ON public.objection_mastery
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own objection mastery" ON public.objection_mastery
  FOR DELETE TO authenticated USING (user_id = auth.uid());