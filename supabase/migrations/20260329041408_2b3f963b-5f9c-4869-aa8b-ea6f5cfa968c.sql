
-- Section-level settings (singleton)
CREATE TABLE public.support_team_section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_title text NOT NULL DEFAULT 'Wer dich begleitet',
  section_subtitle text NOT NULL DEFAULT 'Du arbeitest nicht alleine. Hinter deinem Fortschritt steht ein strukturiertes System aus Mentoren, Closern und Support.',
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_team_section ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read support_team_section"
  ON public.support_team_section FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage support_team_section"
  ON public.support_team_section FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Role cards
CREATE TABLE public.support_team_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  cta_label text NOT NULL DEFAULT 'Mehr erfahren',
  cta_action text NOT NULL DEFAULT 'none' CHECK (cta_action IN ('chat', 'learn', 'support', 'none')),
  icon_name text NOT NULL DEFAULT 'Info',
  sort_order int NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_team_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read support_team_cards"
  ON public.support_team_cards FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage support_team_cards"
  ON public.support_team_cards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- People row
CREATE TABLE public.support_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  initials text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read support_team_members"
  ON public.support_team_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage support_team_members"
  ON public.support_team_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default section
INSERT INTO public.support_team_section (section_title, section_subtitle, is_enabled)
VALUES ('Wer dich begleitet', 'Du arbeitest nicht alleine. Hinter deinem Fortschritt steht ein strukturiertes System aus Mentoren, Closern und Support.', true);

-- Seed default cards
INSERT INTO public.support_team_cards (title, description, cta_label, cta_action, icon_name, sort_order) VALUES
  ('Closing Mentoren', 'Begleiten dich in echten Verkaufssituationen, analysieren deine Calls und sorgen dafür, dass du konstant abschließt.', 'Chat starten', 'chat', 'TrendingUp', 0),
  ('Setter Mentoren', 'Helfen dir, Leads sauber zu qualifizieren, Termine zu setzen und deinen Funnel stabil aufzubauen.', 'Chat starten', 'chat', 'MessageSquare', 1),
  ('Performance Coaches', 'Arbeiten mit dir an Entscheidungsstärke, Fokus und emotionaler Stabilität im Closing.', 'Mehr erfahren', 'learn', 'Info', 2),
  ('Support Team', 'Hilft dir bei technischen Fragen, Zugang, Plattform und Organisation.', 'Support kontaktieren', 'support', 'Headphones', 3);

-- Seed default people
INSERT INTO public.support_team_members (name, role, initials, sort_order) VALUES
  ('Maria S.', 'Closing Mentor', 'MS', 0),
  ('Lukas W.', 'Setter Mentor', 'LW', 1),
  ('Anna K.', 'Performance Coach', 'AK', 2),
  ('Tim R.', 'Support Lead', 'TR', 3);
