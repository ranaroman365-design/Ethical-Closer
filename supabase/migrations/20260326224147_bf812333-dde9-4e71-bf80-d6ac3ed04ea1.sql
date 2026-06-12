
-- Live calls table for admin-managed recurring calls
CREATE TABLE public.live_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  weekday text NOT NULL,
  time_slot text NOT NULL,
  description text NOT NULL DEFAULT '',
  join_link text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read active live calls" ON public.live_calls
  FOR SELECT TO authenticated USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage live calls" ON public.live_calls
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.live_calls (title, weekday, time_slot, description, sort_order) VALUES
  ('Live-Training', 'Mittwoch', '18:00', 'Offenes Training für Opener, Setter und Closer zur Anwendung der Skills in der Praxis.', 1),
  ('Live-Training', 'Sonntag', '10:00', 'Offenes Training für Opener, Setter und Closer zur Anwendung der Skills in der Praxis.', 2);
