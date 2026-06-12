# Phase 1B-A1 — Cron Auth Cleanup Draft (Jobs 30, 31, 36) — Option D

**Status:** DRAFT ONLY. Not approved. Not applied.
**Date:** 2026-05-12 (revised — Option D approved)
**Approach:** **Option D — Remove `Authorization` header entirely.** Keep only `Content-Type: application/json`.
**Rationale:** Functions `extract-call-patterns`, `update-scripts-from-patterns`, `aggregate-call-patterns` all run with `verify_jwt = false` and load `SUPABASE_SERVICE_ROLE_KEY` directly from `Deno.env`. The inline anon JWT in cron commands is cosmetic — neither the gateway nor the function consumes it. Removing it eliminates a JWT-leak surface with zero functional change and zero new secrets to rotate.
**Scope:** Jobs 30, 31, 36 only.
**Out of scope:** Jobs 7, 24, 29, 48, 49, 52, 54 (Tier A remainder). All Tier B/C/D jobs. Vault secret creation. Service-role key in `cron.job`.

---

## 0. No Vault prerequisite

Option D requires **no** Vault secret. The previous PF-0 (`etc_cron_anon_jwt` creation) is **not needed** and is intentionally removed from this draft.

---

## 1. Captured job state (source of truth for this draft)

Captured live from `cron.job` at 2026-05-12 (Europe/Berlin). **Re-capture immediately before apply** (see PF-2).

### Job 30
- **jobname:** `extract-call-patterns-every-6h`
- **schedule:** `0 */6 * * *`
- **URL:** `https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/extract-call-patterns`
- **auth header (current):** `Authorization: Bearer <inline anon JWT>`
- **auth header (target):** *(none)*
- **command SHA-256 (captured):** `5ec49d3c831dd3dfd03e5ce8957898912066f8cbde6feff02d5a12b07d99f611`

### Job 31
- **jobname:** `update-scripts-from-patterns-every-6h`
- **schedule:** `30 */6 * * *`
- **URL:** `https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/update-scripts-from-patterns`
- **auth header (current):** `Authorization: Bearer <inline anon JWT>`
- **auth header (target):** *(none)*
- **command SHA-256 (captured):** `d53efdfeeda3e4a187f3587c557f3791a34f8663c99837b7c7f6f5015cc64f6d`

### Job 36
- **jobname:** `aggregate-call-patterns-every-6h`
- **schedule:** `10 */6 * * *`
- **URL:** `https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/aggregate-call-patterns`
- **auth header (current):** `Authorization: Bearer <inline anon JWT>`
- **auth header (target):** *(none)*
- **command SHA-256 (captured):** `e2b80aa7bef97300e20007aa6b4c6e8447b931de4db844bad0e0213f7f1284dc`

> Original full command bodies (with inline JWT) preserved verbatim in the rollback section below.

---

## 2. Pre-flight checks (run all; abort if any fails)

```sql
-- PF-1: Confirm jobs 30/31/36 exist with captured names + schedules.
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobid IN (30, 31, 36)
ORDER BY jobid;
-- Expected:
--   30 | extract-call-patterns-every-6h         | 0 */6 * * *  | t
--   31 | update-scripts-from-patterns-every-6h  | 30 */6 * * * | t
--   36 | aggregate-call-patterns-every-6h       | 10 */6 * * * | t

-- PF-2: Drift detection — re-capture SHA-256 immediately before apply.
SELECT jobid,
       encode(extensions.digest(command::bytea, 'sha256'), 'hex') AS sha256
FROM cron.job
WHERE jobid IN (30, 31, 36)
ORDER BY jobid;
-- Expected (must match section 1 exactly):
--   30 | 5ec49d3c831dd3dfd03e5ce8957898912066f8cbde6feff02d5a12b07d99f611
--   31 | d53efdfeeda3e4a187f3587c557f3791a34f8663c99837b7c7f6f5015cc64f6d
--   36 | e2b80aa7bef97300e20007aa6b4c6e8447b931de4db844bad0e0213f7f1284dc
-- Any mismatch → ABORT (job has drifted since draft).

-- PF-3: Confirm target functions still exist + verify_jwt=false assumption.
-- (Manual: re-read supabase/config.toml entries for the three functions.
--  Required: verify_jwt = false for all three. Abort if any has flipped to true.)

-- PF-4: Recent run health baseline (so we can compare post-apply).
SELECT jobid, status, count(*) AS runs_last_24h
FROM cron.job_run_details
WHERE jobid IN (30, 31, 36)
  AND start_time > now() - interval '24 hours'
GROUP BY jobid, status
ORDER BY jobid, status;
-- Expected: predominantly 'succeeded'. Note baseline before apply.
```

---

## 3. Forward migration SQL (one transaction, three `cron.alter_job`)

No `Authorization` header. No Vault lookup. No service-role key. Only `Content-Type: application/json`.

```sql
BEGIN;

-- Job 30 — extract-call-patterns-every-6h
SELECT cron.alter_job(
  job_id   := 30,
  schedule := '0 */6 * * *',
  command  := $cmd$
    SELECT net.http_post(
      url     := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/extract-call-patterns',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- Job 31 — update-scripts-from-patterns-every-6h
SELECT cron.alter_job(
  job_id   := 31,
  schedule := '30 */6 * * *',
  command  := $cmd$
    SELECT net.http_post(
      url     := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/update-scripts-from-patterns',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- Job 36 — aggregate-call-patterns-every-6h
SELECT cron.alter_job(
  job_id   := 36,
  schedule := '10 */6 * * *',
  command  := $cmd$
    SELECT net.http_post(
      url     := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/aggregate-call-patterns',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

COMMIT;
```

---

## 4. Rollback SQL (byte-equivalent to original inline-JWT commands)

Restores each job verbatim to the inline-JWT command captured in section 1. After applying rollback, re-running PF-2 must reproduce the original SHA-256s:
- Job 30 → `5ec49d3c…99f611`
- Job 31 → `d53efdfe…cc64f6d`
- Job 36 → `e2b80aa7…f1284dc`

```sql
BEGIN;

-- Rollback job 30
SELECT cron.alter_job(
  job_id   := 30,
  schedule := '0 */6 * * *',
  command  := $cmd$
  SELECT net.http_post(
    url:='https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/extract-call-patterns',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $cmd$
);

-- Rollback job 31
SELECT cron.alter_job(
  job_id   := 31,
  schedule := '30 */6 * * *',
  command  := $cmd$
  SELECT net.http_post(
    url:='https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/update-scripts-from-patterns',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $cmd$
);

-- Rollback job 36
SELECT cron.alter_job(
  job_id   := 36,
  schedule := '10 */6 * * *',
  command  := $cmd$ SELECT net.http_post(
    url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/aggregate-call-patterns',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body := '{}'::jsonb); $cmd$
);

COMMIT;
```

> Whitespace and operator style (`:=` vs `:=`) preserved per original capture so rollback SHA-256 matches the originals exactly.

---

## 5. Post-flight verification

Run **all five** checks. Migration is only "complete" when V1–V4 are green and V5 confirms a successful next execution.

```sql
-- V1: Jobs still scheduled, schedules unchanged, still active.
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobid IN (30, 31, 36)
ORDER BY jobid;
-- Expected:
--   30 | extract-call-patterns-every-6h         | 0 */6 * * *  | t
--   31 | update-scripts-from-patterns-every-6h  | 30 */6 * * * | t
--   36 | aggregate-call-patterns-every-6h       | 10 */6 * * * | t

-- V2: No inline JWT remains in any of the three commands.
SELECT jobid,
       command ILIKE '%eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9%' AS still_has_inline_jwt
FROM cron.job
WHERE jobid IN (30, 31, 36)
ORDER BY jobid;
-- Expected: still_has_inline_jwt = false for all 3.

-- V3: No Authorization header remains in any of the three commands
--     (case-insensitive, covers "Authorization", "authorization", "AUTHORIZATION").
SELECT jobid,
       command ILIKE '%authorization%' AS still_has_auth_header
FROM cron.job
WHERE jobid IN (30, 31, 36)
ORDER BY jobid;
-- Expected: still_has_auth_header = false for all 3.

-- V4: Headers contain only Content-Type: application/json (sanity check).
SELECT jobid,
       command ILIKE '%"Content-Type":"application/json"%' AS has_content_type,
       command NOT ILIKE '%vault.decrypted_secrets%'        AS no_vault_lookup,
       command NOT ILIKE '%service_role%'                   AS no_service_role
FROM cron.job
WHERE jobid IN (30, 31, 36)
ORDER BY jobid;
-- Expected: all three columns = true for all 3 jobs.

-- V5: Next executions succeed after apply timestamp.
-- Job 30 fires at minute 0 every 6h, job 36 at :10, job 31 at :30.
-- Run this AFTER the next scheduled tick of each job (worst case ~6h wait).
SELECT jobid, runid, status, start_time, end_time,
       left(coalesce(return_message, ''), 200) AS return_message_head
FROM cron.job_run_details
WHERE jobid IN (30, 31, 36)
  AND start_time > now() - interval '12 hours'
ORDER BY jobid, start_time DESC
LIMIT 30;
-- Expected: at least one row per jobid with status='succeeded' AFTER the apply timestamp.
-- If 'failed' appears post-apply → execute rollback (section 4) immediately.

-- V6 (cross-check): edge function logs show HTTP 200 for the next invocation
-- of extract-call-patterns / update-scripts-from-patterns / aggregate-call-patterns.
-- Inspect via Cloud → Edge Functions → Logs (no SQL).
```

---

## 6. Risk notes

- **Blast radius:** Low. All three jobs are Tier A internal analytics:
  - `extract-call-patterns` — read `copilot_sessions`/events, write `copilot_pattern_insights`
  - `update-scripts-from-patterns` — refresh script suggestions
  - `aggregate-call-patterns` — write `call_pattern_summary` rollup
- **Customer-facing:** No. No messaging, no payments, no commissions, no Stripe/Twilio/Resend/GHL.
- **Auth model:** All three functions have `verify_jwt = false` (verified in `supabase/config.toml`) and authenticate to the database via `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env`. The removed `Authorization` header was never consumed.
- **Failure modes:**
  - If a function's `verify_jwt` flag has been flipped to `true` since this draft (PF-3 catches this) → next tick returns HTTP 401 → V5 shows failure → execute rollback.
  - If the function URL changes → next tick returns HTTP 404 → V5 shows failure → rollback.
- **Drift risk:** PF-2 hashes guard against any concurrent edit between draft and apply. Re-capture SHA-256 immediately before apply.
- **Style normalization:** Forward SQL uses uniform formatting; rollback preserves original byte-for-byte. SHA-256 of new commands will differ from originals (expected). Rollback SHA-256 must match originals exactly (verifiable via PF-2 syntax post-rollback).
- **Single transaction:** All three `cron.alter_job` calls wrapped in BEGIN/COMMIT so partial failure rolls back atomically.

---

## 7. Estimated blast radius

- **Tables touched:** 0 (cron metadata only).
- **Rows touched:** 0 (config change).
- **Customer impact if broken:** None directly. Stale call-pattern analytics for up to one 6h cycle until rollback.
- **Recovery time on failure:** < 5 min (apply section 4 rollback).
- **Approval required to apply:** Explicit user "apply Phase 1B-A1" instruction **plus** all PF checks green at apply time.

---

## 8. Approval checklist (must be green before apply)

- [ ] PF-1, PF-2, PF-3, PF-4 re-run immediately before apply, all green.
- [ ] No drift in command SHA-256 since this draft (re-capture required).
- [ ] `supabase/config.toml` re-checked: `extract-call-patterns`, `update-scripts-from-patterns`, `aggregate-call-patterns` all still have `verify_jwt = false`.
- [ ] Rollback SQL (this document, section 4) committed to repo before forward apply.
- [ ] Apply window agreed (low-traffic preferred; jobs are 6-hourly so any window works).

**No execution in this turn.**
