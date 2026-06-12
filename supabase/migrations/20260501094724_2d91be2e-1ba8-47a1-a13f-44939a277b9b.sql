
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS original_local_date text,
  ADD COLUMN IF NOT EXISTS original_local_time text;

COMMENT ON COLUMN public.appointments.original_local_date IS 'Date as selected by user in their local timezone, e.g. 2025-04-30';
COMMENT ON COLUMN public.appointments.original_local_time IS 'Time as selected by user in their local timezone, e.g. 11:00';
