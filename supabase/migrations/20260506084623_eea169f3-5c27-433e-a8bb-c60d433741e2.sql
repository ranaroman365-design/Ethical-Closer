-- Phase 2 GHL Decommissioning: Drop unused tables
-- attendance_jobs: 0 rows, used only by removed process-attendance-jobs
-- attendance_templates: unused, template data embedded in edge functions

DROP TABLE IF EXISTS public.attendance_jobs CASCADE;
DROP TABLE IF EXISTS public.attendance_templates CASCADE;

-- Mark outbound_events as deprecated (do NOT drop — still used by process-outbound-events for GHL CRM mirroring)
COMMENT ON TABLE public.outbound_events IS 'DEPRECATED (Phase 2): GHL-only outbound queue. Will be removed in Phase 3 when GHL CRM mirroring is decommissioned. New messaging goes through dispatch-communication.';