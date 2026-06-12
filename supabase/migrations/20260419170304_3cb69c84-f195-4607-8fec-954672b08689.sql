
CREATE TABLE public.community_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  duration_min integer,
  sort_order integer,
  content_url text,
  is_locked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.community_modules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.module_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid REFERENCES public.community_modules(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_at timestamptz DEFAULT now(),
  UNIQUE(module_id, user_id)
);
ALTER TABLE public.module_completions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.community_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  credits_reward integer NOT NULL,
  challenge_type text DEFAULT 'one_time',
  deadline timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.community_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.challenge_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid REFERENCES public.community_challenges(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  proof_text text,
  proof_url text,
  status text DEFAULT 'pending',
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(challenge_id, user_id)
);
ALTER TABLE public.challenge_submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer,
  recording_url text,
  credits_for_attending integer DEFAULT 10,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.live_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.live_attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.live_events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  attended_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);
ALTER TABLE public.live_attendances ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.investment_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  tip_type text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.investment_tips ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.aplayer_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  status text DEFAULT 'pending',
  credits_at_application integer,
  calculated_discount integer,
  target_tier text,
  applicant_note text,
  reviewer_note text,
  applied_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id)
);
ALTER TABLE public.aplayer_applications ENABLE ROW LEVEL SECURITY;

INSERT INTO public.community_modules (title, description, duration_min, sort_order, content_url, is_locked) VALUES
('Entscheidungsarchitektur — Grundlagen','Wie Entscheidungen wirklich entstehen.',18,1,NULL,false),
('Das EEG Framework: Überblick','Die 6 Phasen im Überblick.',22,2,NULL,false),
('Ankommen & Kontext setzen','Phase 1 und 2 im Detail.',15,3,NULL,false),
('Reibung und Bewusstheit','Phase 3 und 4 — der Kern.',28,4,NULL,false),
('Verantwortung und Entscheidung','Phase 5 und 6 — die Konversion.',24,5,NULL,false),
('Real Call Analyse','Echtes Gespräch — annotiert.',35,6,NULL,true);

INSERT INTO public.community_challenges (title, description, credits_reward, challenge_type, deadline, is_active) VALUES
('Erster Win-Post','Poste deinen ersten Win im Community Feed.',20,'one_time',NULL,true),
('7-Tage-Streak','Logge dich 7 Tage hintereinander ein.',50,'recurring',NULL,true),
('Modul-Sprint','Schließe 3 Module in einer Woche ab.',80,'weekly',NULL,true);

INSERT INTO public.investment_tips (title, content, tip_type) VALUES
('Immobilien als Closer: Der Einstieg','Als Closer mit variablem Einkommen in Immobilien einsteigen — was zuerst.','Immobilien'),
('Asset-Aufbau in den ersten 12 Monaten','Die häufigste Frage von neuen Closers — konkret beantwortet.','Assets'),
('Wealth Mindset: Warum die meisten Closers arm bleiben','Es liegt nicht am Einkommen. Es liegt an der Struktur.','Mindset');

INSERT INTO public.live_events (title, description, scheduled_at, duration_minutes, recording_url, credits_for_attending) VALUES
('EEG Framework Live-Session','Manuel walkthrough — Q&A inklusive.', now() + interval '7 days', 60, NULL, 10),
('Closer Mindset: Entscheidungen empfangen','Nastja live über die Psychologie hinter Abschlüssen.', now() + interval '14 days', 45, NULL, 10);
