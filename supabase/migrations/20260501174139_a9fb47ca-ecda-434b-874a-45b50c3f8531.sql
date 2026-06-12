
ALTER TABLE public.export_audit_logs
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS date_range TEXT,
  ADD COLUMN IF NOT EXISTS included_fields TEXT[];
