-- Extend community_drops with heartbeat fields
ALTER TABLE public.community_drops
  ADD COLUMN IF NOT EXISTS drop_type text,
  ADD COLUMN IF NOT EXISTS scheduled_time timestamptz,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS author_type text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Backfill scheduled_time from scheduled_for if missing
UPDATE public.community_drops
SET scheduled_time = scheduled_for::timestamptz
WHERE scheduled_time IS NULL;

-- Indexes for scheduler & feed queries
CREATE INDEX IF NOT EXISTS idx_community_drops_scheduled_pub
  ON public.community_drops (published, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_community_drops_pub_date
  ON public.community_drops (published, scheduled_for DESC);

-- Analytics table
CREATE TABLE IF NOT EXISTS public.community_drop_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id uuid NOT NULL REFERENCES public.community_drops(id) ON DELETE CASCADE,
  views integer NOT NULL DEFAULT 0,
  likes integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  engagement_rate numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drop_id)
);

ALTER TABLE public.community_drop_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view drop analytics"
  ON public.community_drop_analytics FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage drop analytics"
  ON public.community_drop_analytics FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Atomic view counter
CREATE OR REPLACE FUNCTION public.increment_drop_view(_drop_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.community_drop_analytics (drop_id, views, updated_at)
  VALUES (_drop_id, 1, now())
  ON CONFLICT (drop_id) DO UPDATE
    SET views = public.community_drop_analytics.views + 1,
        updated_at = now();
END;
$$;

-- Admin-write policy on community_drops (in case missing)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='community_drops'
      AND policyname='Admins manage community_drops'
  ) THEN
    CREATE POLICY "Admins manage community_drops"
      ON public.community_drops FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
      WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));
  END IF;
END $$;
