
CREATE TABLE public.benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'Gift',
  unlock_type text NOT NULL DEFAULT 'level_based',
  unlock_value text NOT NULL DEFAULT '1',
  reward_type text NOT NULL DEFAULT 'digital',
  redeem_link text,
  redeem_code text,
  is_new boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benefits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active benefits" ON public.benefits
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage benefits" ON public.benefits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE public.user_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  benefit_id uuid NOT NULL REFERENCES public.benefits(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  redeemed boolean NOT NULL DEFAULT false,
  redeemed_at timestamptz,
  UNIQUE(user_id, benefit_id)
);

ALTER TABLE public.user_benefits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own user_benefits" ON public.user_benefits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own user_benefits" ON public.user_benefits
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own user_benefits" ON public.user_benefits
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete user_benefits" ON public.user_benefits
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));
