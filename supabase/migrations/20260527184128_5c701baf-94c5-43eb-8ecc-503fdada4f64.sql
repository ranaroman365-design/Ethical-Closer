CREATE TABLE public.apply_nurture_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('d1','d3','d14')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  funnel TEXT NOT NULL DEFAULT 'apply',
  bucket TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recipient_email, stage)
);

CREATE INDEX idx_apply_nurture_due ON public.apply_nurture_queue (scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_apply_nurture_lead ON public.apply_nurture_queue (lead_id);

GRANT ALL ON public.apply_nurture_queue TO service_role;

ALTER TABLE public.apply_nurture_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access"
  ON public.apply_nurture_queue
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
