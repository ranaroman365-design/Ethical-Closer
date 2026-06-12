
-- Payment Links Tabelle
CREATE TABLE IF NOT EXISTS public.payment_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token           TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  lead_id         UUID REFERENCES public.leads(id),
  closer_id       UUID REFERENCES public.profiles(id),
  deal_type       TEXT NOT NULL,
  payment_type    TEXT NOT NULL,
  secondary_method TEXT NOT NULL,
  amount          INTEGER NOT NULL,
  installment_amount INTEGER,
  installment_count  INTEGER,
  currency        TEXT NOT NULL DEFAULT 'EUR',
  status          TEXT NOT NULL DEFAULT 'pending',
  session_id      TEXT,
  payment_url     TEXT,
  first_name      TEXT,
  email           TEXT,
  offer_title     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

-- Validation trigger for payment_type
CREATE OR REPLACE FUNCTION public.validate_payment_link_payment_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_type NOT IN ('one_time', 'split_3', 'split_6') THEN
    RAISE EXCEPTION 'Invalid payment_type: %', NEW.payment_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_payment_type
  BEFORE INSERT OR UPDATE ON public.payment_links
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_link_payment_type();

-- Validation trigger for secondary_method
CREATE OR REPLACE FUNCTION public.validate_payment_link_secondary_method()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.secondary_method NOT IN ('stripe', 'klarna', 'iban', 'digistore') THEN
    RAISE EXCEPTION 'Invalid secondary_method: %', NEW.secondary_method;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_secondary_method
  BEFORE INSERT OR UPDATE ON public.payment_links
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_link_secondary_method();

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_payment_link_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'opened', 'paid', 'failed', 'expired') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_payment_link_status
  BEFORE INSERT OR UPDATE ON public.payment_links
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_link_status();

-- Processed events for idempotency (if not exists)
CREATE TABLE IF NOT EXISTS public.processed_events (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS on payment_links
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Closer reads own links"
  ON public.payment_links FOR SELECT
  TO authenticated
  USING (closer_id = auth.uid());

CREATE POLICY "Closer creates links"
  ON public.payment_links FOR INSERT
  TO authenticated
  WITH CHECK (closer_id = auth.uid());

CREATE POLICY "Service role updates links"
  ON public.payment_links FOR UPDATE
  TO service_role
  USING (true);

-- Public SELECT for checkout page (by token, no auth needed)
CREATE POLICY "Public reads by token"
  ON public.payment_links FOR SELECT
  TO anon
  USING (true);

-- RLS on processed_events
ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages processed_events"
  ON public.processed_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_payment_links_token ON public.payment_links(token);
CREATE INDEX IF NOT EXISTS idx_payment_links_session_id ON public.payment_links(session_id);
