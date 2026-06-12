
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  ADD COLUMN IF NOT EXISTS booking_utc_offset TEXT NOT NULL DEFAULT '+02:00';

COMMENT ON COLUMN public.appointments.booking_timezone IS 'IANA timezone of the user at booking time, e.g. Europe/Berlin';
COMMENT ON COLUMN public.appointments.booking_utc_offset IS 'UTC offset at booking time, e.g. +02:00';
