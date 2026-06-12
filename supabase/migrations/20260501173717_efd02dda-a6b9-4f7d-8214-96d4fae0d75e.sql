
-- Export audit logging table
CREATE TABLE public.export_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  level INT NOT NULL DEFAULT 0,
  export_type TEXT NOT NULL CHECK (export_type IN ('lead', 'appointment')),
  record_count INT NOT NULL DEFAULT 0,
  scope TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.export_audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own log entries
CREATE POLICY "Users can insert own export logs"
  ON public.export_audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own logs
CREATE POLICY "Users can read own export logs"
  ON public.export_audit_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all logs
CREATE POLICY "Admins can read all export logs"
  ON public.export_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_export_audit_logs_user ON public.export_audit_logs(user_id);
CREATE INDEX idx_export_audit_logs_type ON public.export_audit_logs(export_type);
