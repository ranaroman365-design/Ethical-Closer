# Phase 1B-A1 — Completion Note

**Status:** ✅ COMPLETE — Green
**Applied:** 2026-05-12 (pre 18:00 UTC)
**Verified:** 2026-05-12 18:00 / 18:10 / 18:30 UTC (first post-apply scheduled ticks)
**Scope:** Jobs **30, 31, 36** — Option D (no `Authorization` header, `Content-Type: application/json` only)

---

## 1. What was changed

Three pg_cron jobs were rewritten via `cron.alter_job` to remove the inline anon JWT bearer token from their `net.http_post` commands. Headers reduced to a single entry: `Content-Type: application/json`.

| jobid | jobname | function | schedule | post-apply md5 |
|---|---|---|---|---|
| 30 | `etc-cron-extract-call-patterns` | `extract-call-patterns` | `0 */6 * * *` | `ce26c0a4…` |
| 31 | `etc-cron-update-scripts-from-patterns` | `update-scripts-from-patterns` | `30 */6 * * *` | `d9a72f72…` |
| 36 | `etc-cron-aggregate-call-patterns` | `aggregate-call-patterns` | `10 */6 * * *` | `7c68962b…` |

Forward + rollback SQL committed in `docs/governance/phase-1b-a1-draft.md` (byte-equivalent rollback to original inline-JWT commands).

---

## 2. What was explicitly NOT changed

- **No Vault secret** created (`etc_cron_anon_jwt` still does not exist — by design under Option D).
- **No service-role key** in any `cron.job` command.
- **No other cron jobs** touched (7, 24, 29, 48, 49, 52, 54 untouched; all Tier B/C/D untouched).
- **No edge function code** modified — `verify_jwt = false` retained for all three functions in `supabase/config.toml`.
- **No business-table writes**, no changes to messaging, payments, revenue, commissions, Stripe, Twilio, Resend, or GHL logic.

---

## 3. Verification results

### V1–V4 (immediate post-apply)
| Check | Result |
|---|---|
| V1 — No inline JWT remains in commands | ✅ Pass |
| V2 — No `Authorization` header remains | ✅ Pass |
| V3 — Jobs `active=true`, schedules byte-equal | ✅ Pass |
| V4 — Headers contain only `Content-Type: application/json`; no `service_role`, no Vault references | ✅ Pass |

### V5–V6 (next scheduled executions)
| jobid | tick UTC | `cron.job_run_details.status` | HTTP `status_code` | Body | automation_log |
|---|---|---|---|---|---|
| 30 | 18:00:00.287 | `succeeded` | 200 | extract early-exit (1 session < 5 threshold) | n/a (early return path) |
| 36 | 18:10:00.149 | `succeeded` | 200 | `{"skipped":true,"reason":"no patterns >= sample_size 3","scanned":1,"patterns_created":0}` | `status='skipped'`, no error |
| 31 | 18:30:00.273 | `succeeded` | 200 | `{"message":"No qualifying patterns yet","inserted":0}` | n/a (early return path) |

- **No 401 / 403 / 404** observed for any of the three function URLs in the 12h post-apply window.
- **No runtime regression** in call-pattern analytics: behavior is byte-identical to pre-apply (same early-return paths driven by current low session/pattern volume, not by the header change).

### Out-of-scope noise (NOT a regression)
Hourly 500s observed at `:00` and `:15` originate from jobs **1, 22, 23, 37, 44** (return-expired-leads, retargeting-no-booking, payment-recovery-flow, outcome-fallback-hourly, sweep-commissions-eligibility-hourly). These were already failing identically at **17:00 and 17:15 UTC — before the A1 apply boundary** — and are out of A1 scope. Tracked for Phase 1B-A2+.

---

## 4. Rollback location

- **File:** `docs/governance/phase-1b-a1-draft.md` → "Rollback SQL" section.
- **Command snapshots:** Three `cron.alter_job` calls that restore the original `Authorization: Bearer eyJhbGci…` inline-JWT commands byte-for-byte (md5 will match pre-apply hashes `5ec49d3c…` / `d53efdfe…` / `e2b80aa7…`).
- **Trigger condition:** Not triggered. All three executions green; rollback NOT executed.

---

## 5. Remaining linter context

Unchanged from Phase 1A completion note:
- 1 ERROR (Security Definer Views) — unchanged, queued for Phase 1B/2.
- 25 WARN — unchanged.
- 1 INFO — unchanged.

Phase 1B-A1 introduced no new linter findings (pure cron-command rewrite; no DDL, no RLS, no view changes).

---

## 6. Recommendation for next phase

**Phase 1B-A2** — Apply Option D to the remaining Tier A jobs that share the same auth pattern:

| jobid | function | verify_jwt | recommended action |
|---|---|---|---|
| 7 | `automation-scheduler` | false | Option D (drop Authorization header) |
| 24 | `sync-retargeting-audiences` | false | Investigate first — currently 500ing |
| 29 | TBD | TBD | Re-verify in fresh inventory |
| 48 | TBD | TBD | Re-verify |
| 49 | TBD | TBD | Re-verify |
| 52 | TBD | TBD | Re-verify |
| 54 | TBD | TBD | Re-verify |

**Pre-conditions for A2:**
1. Re-confirm `verify_jwt` for each function in `supabase/config.toml` (no assumptions).
2. Capture live SHA-256 per job immediately before apply.
3. Triage existing 500s on jobs 22, 23, 37, 44 separately — do **not** bundle into A2; they are functional bugs, not auth-pattern issues.
4. Maintain the same draft → preflight → apply → V1–V6 cadence per wave.

**Hard exclusions for A2:**
- No bulk migration. One wave at a time.
- No Vault secret creation unless a function explicitly has `verify_jwt = true`.
- No service-role key in cron commands.
- No business-logic, messaging, or payment changes.

Awaiting explicit approval before drafting A2.
