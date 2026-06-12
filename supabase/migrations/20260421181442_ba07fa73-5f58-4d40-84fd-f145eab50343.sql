-- Format catalog as enum (mirrors weekday cadence)
CREATE TYPE public.community_drop_format AS ENUM (
  'monday_mindset',
  'tuesday_tactic',
  'wednesday_win',
  'thursday_thread',
  'friday_framework',
  'saturday_story',
  'sunday_reflection'
);

-- Drops table
CREATE TABLE public.community_drops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  format public.community_drop_format NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Mon ... 6=Sun
  scheduled_for DATE NOT NULL,
  cta_label TEXT,
  cta_url TEXT,
  cover_image_url TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_drops_scheduled ON public.community_drops (scheduled_for DESC);
CREATE INDEX idx_community_drops_published ON public.community_drops (published, scheduled_for DESC);

-- updated_at trigger
CREATE TRIGGER update_community_drops_updated_at
BEFORE UPDATE ON public.community_drops
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.community_drops ENABLE ROW LEVEL SECURITY;

-- Read: authenticated users with active community_access can read published past/today drops.
CREATE POLICY "Members read published drops"
ON public.community_drops
FOR SELECT
TO authenticated
USING (
  published = true
  AND scheduled_for <= CURRENT_DATE
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.community_access, false) = true
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  )
);

-- Admin/Owner full access (drafts + future scheduling)
CREATE POLICY "Admins manage drops select"
ON public.community_drops
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
);

CREATE POLICY "Admins insert drops"
ON public.community_drops
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
);

CREATE POLICY "Admins update drops"
ON public.community_drops
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
);

CREATE POLICY "Admins delete drops"
ON public.community_drops
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
);