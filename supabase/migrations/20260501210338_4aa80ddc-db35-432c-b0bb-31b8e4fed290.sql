
-- Simulated Activity Layer (separate from core data)
CREATE TABLE public.simulated_activity_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('new_member','booking_created','deal_closed','level_up','system_tip','recovery_action','community_activity')),
  title TEXT NOT NULL,
  description TEXT,
  display_context TEXT DEFAULT 'dashboard',
  is_simulated BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.simulated_activity_events ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read activity feed
CREATE POLICY "Authenticated users can view activity feed"
  ON public.simulated_activity_events FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage simulated events
CREATE POLICY "Admins can manage simulated events"
  ON public.simulated_activity_events FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed some initial activity events
INSERT INTO public.simulated_activity_events (event_type, title, description, display_context, priority) VALUES
  ('new_member', 'Ein neues Mitglied hat gerade seinen Karrierepfad gestartet.', 'Willkommen im System.', 'dashboard', 1),
  ('booking_created', 'Ein Strategy Call wurde für diese Woche gebucht.', 'Neue Aktivität im Setter-Bereich.', 'dashboard', 2),
  ('deal_closed', 'Ein Deal wurde erfolgreich abgeschlossen.', 'Das Team wächst.', 'dashboard', 3),
  ('level_up', 'Ein Member hat sein nächstes Level freigeschaltet.', 'Kontinuierlicher Fortschritt.', 'dashboard', 2),
  ('system_tip', 'Tipp: Regelmäßige Trainingseinheiten verbessern deine Closing-Rate.', 'Nutze die Academy für gezieltes Training.', 'dashboard', 1),
  ('community_activity', 'Neue Trainingsaktivität im Setter-Bereich.', 'Die Community ist aktiv.', 'dashboard', 1),
  ('recovery_action', 'Ein Follow-Up wurde automatisch ausgelöst.', 'Das System arbeitet für dich.', 'dashboard', 1),
  ('system_tip', 'Tipp: Dein Karriereweg zeigt dir genau, was als nächstes kommt.', 'Fortschritt ist messbar.', 'dashboard', 1);
