
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS placement_type text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS platform_usage boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS partner_track_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS partner_company_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partner_revenue_volume numeric DEFAULT 0;

COMMENT ON COLUMN public.profiles.placement_type IS 'none | internal | external';
COMMENT ON COLUMN public.profiles.platform_usage IS 'Whether external user actively uses the platform';
COMMENT ON COLUMN public.profiles.partner_track_status IS 'none | associate_partner | equity_partner | managing_partner';
COMMENT ON COLUMN public.profiles.partner_company_count IS 'Number of partner companies brought';
COMMENT ON COLUMN public.profiles.partner_revenue_volume IS 'Total revenue volume from partner companies';
