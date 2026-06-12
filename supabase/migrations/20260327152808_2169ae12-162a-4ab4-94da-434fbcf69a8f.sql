
-- Add is_simulation flag to calls, leads, and commissions
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;

-- Add simulation_batch_id for grouping simulation runs
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS simulation_batch_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS simulation_batch_id text;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS simulation_batch_id text;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_calls_is_simulation ON public.calls (is_simulation);
CREATE INDEX IF NOT EXISTS idx_leads_is_simulation ON public.leads (is_simulation);
CREATE INDEX IF NOT EXISTS idx_commissions_is_simulation ON public.commissions (is_simulation);
