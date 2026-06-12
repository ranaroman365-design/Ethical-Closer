
-- Add 'paypal' to secondary_method CHECK constraint
ALTER TABLE public.payment_links DROP CONSTRAINT IF EXISTS payment_links_secondary_method_check;
ALTER TABLE public.payment_links ADD CONSTRAINT payment_links_secondary_method_check
  CHECK (secondary_method IN ('stripe','klarna','iban','digistore','paypal'));

-- Ensure processed_events exists
CREATE TABLE IF NOT EXISTS public.processed_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
