ALTER TABLE public.email_send_state
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS visibility_timeout_seconds integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS retry_backoff_multiplier numeric NOT NULL DEFAULT 1.0;

ALTER TABLE public.email_send_state
  ADD CONSTRAINT email_send_state_max_retries_check CHECK (max_retries >= 1 AND max_retries <= 20),
  ADD CONSTRAINT email_send_state_vt_check CHECK (visibility_timeout_seconds >= 5 AND visibility_timeout_seconds <= 3600),
  ADD CONSTRAINT email_send_state_backoff_check CHECK (retry_backoff_multiplier >= 0 AND retry_backoff_multiplier <= 10);

COMMENT ON COLUMN public.email_send_state.max_retries IS 'Failed send attempts before message moves to DLQ. Range 1-20, default 5.';
COMMENT ON COLUMN public.email_send_state.visibility_timeout_seconds IS 'Base seconds a message stays invisible after a failed attempt before being retried. Range 5-3600, default 30.';
COMMENT ON COLUMN public.email_send_state.retry_backoff_multiplier IS 'Exponential backoff factor. Effective VT = base_vt * (1 + failed_attempts * multiplier). 0 = constant backoff, 1.0 = linear growth, default 1.0.';