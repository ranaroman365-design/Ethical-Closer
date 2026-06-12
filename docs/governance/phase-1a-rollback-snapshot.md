# Phase 1A — Rollback Snapshots (captured pre-flight)

**Captured:** 2026-05-12 (immediately before Phase 1A migration).
**Source query:** `SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobid = 53;`

## Cron Job 53 (rollback for step C)

- **jobid:** `53`
- **jobname:** `process-appointment-reminders`
- **schedule:** `*/5 * * * *`
- **command (verbatim):**

```sql
  SELECT net.http_post(
    url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/process-appointment-reminders',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body := '{"time": "now"}'::jsonb
  ) AS request_id;
```

## Rollback statement (paste verbatim if Phase 1A step C must be reverted)

```sql
SELECT cron.schedule(
  'process-appointment-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/process-appointment-reminders',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body := '{"time": "now"}'::jsonb
  ) AS request_id;
  $$
);
```

## Pre-flight summary at capture time

| Check | Expected | Actual | Pass |
|---|---|---|---|
| PF1 backup table count | 15 | **15** | ✅ |
| PF2a non-pg_catalog DB deps on backups | 0 logical | **14 (all `pg_toast.*` — auto-move with parent)** | ✅ benign |
| PF2b repo references (`rg -n '_backup_20260429' --glob '!supabase/migrations/**'`) | 0 | **0** | ✅ |
| PF3 RLS state of `commission_rates` / `canonical_state_transitions` | rowsec=false, 0 policies | **rowsec=false, 0 policies (both)** | ✅ |
| PF4 `user_access_contract` columns `user_id`,`level`,`is_admin` | all present | **all present** | ✅ |
| PF5 8 target views, no `security_invoker=true` set | 8 rows, reloptions NULL | **8 rows, reloptions NULL** | ✅ |
| PF6 cron 53 still the disabled-stub reminder | 1 row, jobname `process-appointment-reminders` | **matches** | ✅ |

All pre-flight gates green. Proceeding with Phase 1A migration.
