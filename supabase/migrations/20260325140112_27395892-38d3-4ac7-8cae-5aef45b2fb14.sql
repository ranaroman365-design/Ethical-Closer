-- Add response_time column to member_kpis if not present
ALTER TABLE public.member_kpis ADD COLUMN IF NOT EXISTS response_time numeric DEFAULT 0;
ALTER TABLE public.member_kpis ADD COLUMN IF NOT EXISTS lead_quality_sensitivity numeric DEFAULT 0;
ALTER TABLE public.member_kpis ADD COLUMN IF NOT EXISTS earnings_per_call numeric DEFAULT 0;

-- Add kpi_snapshots columns too
ALTER TABLE public.kpi_snapshots ADD COLUMN IF NOT EXISTS response_time numeric DEFAULT 0;
ALTER TABLE public.kpi_snapshots ADD COLUMN IF NOT EXISTS lead_quality_sensitivity numeric DEFAULT 0;
ALTER TABLE public.kpi_snapshots ADD COLUMN IF NOT EXISTS earnings_per_call numeric DEFAULT 0;