
-- User state tracking for monetization engine
CREATE TABLE public.user_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  current_state text NOT NULL DEFAULT 'new'
    CHECK (current_state IN ('new', 'learning', 'committed', 'stuck', 'unstable', 'performing', 'scaling', 'leading')),
  previous_state text,
  state_changed_at timestamptz NOT NULL DEFAULT now(),
  login_count_30d int NOT NULL DEFAULT 0,
  community_posts_30d int NOT NULL DEFAULT 0,
  modules_completed int NOT NULL DEFAULT 0,
  kpi_trend text DEFAULT 'stable' CHECK (kpi_trend IN ('rising', 'stable', 'falling', 'volatile')),
  last_evaluated_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own state" ON public.user_states
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all states" ON public.user_states
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- State history for analytics
CREATE TABLE public.state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  from_state text,
  to_state text NOT NULL,
  reason text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.state_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own history" ON public.state_history
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all history" ON public.state_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Monetization offers catalog
CREATE TABLE public.monetization_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_key text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  description text,
  price_label text,
  trigger_states text[] NOT NULL DEFAULT '{}',
  min_level int NOT NULL DEFAULT 0,
  max_level int DEFAULT NULL,
  icon text DEFAULT 'Sparkles',
  cta_label text NOT NULL DEFAULT 'Mehr erfahren',
  cta_link text NOT NULL DEFAULT '/members/path',
  priority int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.monetization_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active offers" ON public.monetization_offers
  FOR SELECT TO authenticated
  USING (active = true);

CREATE POLICY "Admins manage offers" ON public.monetization_offers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Track which offers were shown/clicked/converted
CREATE TABLE public.offer_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  offer_id uuid NOT NULL REFERENCES public.monetization_offers(id),
  action text NOT NULL DEFAULT 'shown' CHECK (action IN ('shown', 'clicked', 'dismissed', 'converted')),
  context text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offer_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own impressions" ON public.offer_impressions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users read own impressions" ON public.offer_impressions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all impressions" ON public.offer_impressions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed the 5 core monetization offers
INSERT INTO public.monetization_offers (offer_key, title, subtitle, description, price_label, trigger_states, min_level, max_level, icon, cta_label, cta_link, priority) VALUES
('booster', 'Booster-Paket', 'Mehr Zeit. Mehr Support. Mehr Fokus.', 'Dein reguläres Zeitfenster ist überschritten. Der Booster gibt dir zusätzliche Wochen mit intensiver Betreuung, um deine Ziele noch zu erreichen.', 'ab 249 €/Monat', '{stuck}', 1, 6, 'Zap', 'Booster-Optionen ansehen', '/members/path', 10),
('radiant', 'Radiant Calibration', 'Skill ist da — Performance noch nicht stabil.', 'Radiant hilft dir, emotionale Muster zu erkennen, die deine Closing-Performance sabotieren. Nicht Technik — sondern innere Klarheit.', '4.000 €', '{unstable}', 2, 6, 'Sparkles', 'Radiant entdecken', '/members/radiant', 20),
('scale_lab', 'Advanced Scale Lab', 'Du bist gut — jetzt geht es um Dominanz.', 'Fortgeschrittene Strategien für komplexe Deals, höhere Ticketgrößen und systematische Performance-Optimierung.', 'ab 2.000 €', '{performing}', 5, 8, 'Rocket', 'Scale Lab entdecken', '/members/advanced-lab', 30),
('inner_circle', 'Inner Circle', 'Exklusiv. Strategisch. Auf Einladung.', 'Der Inner Circle ist für die Top 10% — Zugang zu strategischen Masterminds, direktem Mentoring und exklusiven Deals.', 'ab 300 €/Monat', '{scaling,leading}', 5, 8, 'Crown', 'Einladung prüfen', '/members/inner-circle', 40),
('quarterly', 'Quarterly Crossing', 'Hier entstehen Deals.', 'Exklusives Netzwerk-Event mit Top Closern, Direktoren und Partnern. Deal-Making, Insights und strategische Verbindungen.', 'ab 79 €/Monat', '{performing,scaling,leading}', 4, 8, 'Calendar', 'Nächstes Event sehen', '/members/quarterly', 15);
