
CREATE TABLE IF NOT EXISTS public.meta_capi_alert_dedup (
  alert_key text PRIMARY KEY,
  last_alerted_at timestamptz NOT NULL DEFAULT now(),
  count_since integer NOT NULL DEFAULT 1
);

ALTER TABLE public.meta_capi_alert_dedup ENABLE ROW LEVEL SECURITY;

-- No public policies — service role only.
COMMENT ON TABLE public.meta_capi_alert_dedup IS
  'Dedupe window for Meta CAPI failure alerts emitted by send-meta-event.';
