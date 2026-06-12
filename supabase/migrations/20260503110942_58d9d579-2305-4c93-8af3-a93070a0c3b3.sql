CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_lib_log_created ON public.message_library_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_level_msg_jobs_created ON public.level_message_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ltj_created_at ON public.lifecycle_touchpoint_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_insights_created ON public.learning_insights (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpe_occurred_desc ON public.message_performance_events (occurred_at DESC);