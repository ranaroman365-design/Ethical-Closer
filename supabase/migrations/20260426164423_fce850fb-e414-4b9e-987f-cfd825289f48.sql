
CREATE TABLE IF NOT EXISTS public.go_live_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  status text NOT NULL DEFAULT 'pending',
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb,
  final_result text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_go_live_simulations_status ON public.go_live_simulations(status);
CREATE INDEX IF NOT EXISTS idx_go_live_simulations_created_at ON public.go_live_simulations(created_at DESC);

ALTER TABLE public.go_live_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all simulations"
ON public.go_live_simulations FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Admins can create simulations"
ON public.go_live_simulations FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Admins can update simulations"
ON public.go_live_simulations FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER update_go_live_simulations_updated_at
BEFORE UPDATE ON public.go_live_simulations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
