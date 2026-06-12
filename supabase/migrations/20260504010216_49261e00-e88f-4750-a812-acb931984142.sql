ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_priority TEXT NOT NULL DEFAULT 'MEDIUM'
  CHECK (booking_priority IN ('HIGH', 'MEDIUM', 'LOW'));