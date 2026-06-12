-- Backfill original_local_date and original_local_time for pre-migration appointments
-- that have booking_timezone but missing original_local_* fields.
-- Uses starts_at (UTC) + booking_timezone to compute the correct local values.
UPDATE public.appointments
SET
  original_local_date = to_char(
    starts_at AT TIME ZONE COALESCE(booking_timezone, 'Europe/Berlin'),
    'YYYY-MM-DD'
  ),
  original_local_time = to_char(
    starts_at AT TIME ZONE COALESCE(booking_timezone, 'Europe/Berlin'),
    'HH24:MI'
  ),
  booking_timezone = COALESCE(booking_timezone, 'Europe/Berlin'),
  updated_at = now()
WHERE original_local_date IS NULL
  AND original_local_time IS NULL
  AND starts_at IS NOT NULL;