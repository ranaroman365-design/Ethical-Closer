ALTER TABLE public.ab_slot_weights
  ADD COLUMN IF NOT EXISTS confidence_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_level text NOT NULL DEFAULT 'very_low',
  ADD COLUMN IF NOT EXISTS confidence_reason text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS last_confidence_update timestamptz,
  ADD COLUMN IF NOT EXISTS winner_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS experiment_health numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS variance_indicator numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coverage_impact numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_allowed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ab_confidence_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL,
  variant text NOT NULL,
  confidence_score numeric NOT NULL,
  confidence_level text NOT NULL,
  confidence_reason text[] NOT NULL DEFAULT ARRAY[]::text[],
  winner_status text NOT NULL,
  experiment_health numeric NOT NULL,
  variance_indicator numeric NOT NULL,
  coverage_impact numeric NOT NULL,
  shift_allowed boolean NOT NULL,
  exposures integer NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  bookings integer NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ab_confidence_log TO authenticated;
GRANT ALL ON public.ab_confidence_log TO service_role;
ALTER TABLE public.ab_confidence_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ab_confidence_log admin read"
ON public.ab_confidence_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.ab_confidence_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL,
  variant text,
  kind text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ab_confidence_warnings TO authenticated;
GRANT ALL ON public.ab_confidence_warnings TO service_role;
ALTER TABLE public.ab_confidence_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ab_confidence_warnings admin read"
ON public.ab_confidence_warnings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_ab_confidence_log_slot_recorded
  ON public.ab_confidence_log(slot, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ab_confidence_warnings_created
  ON public.ab_confidence_warnings(created_at DESC);