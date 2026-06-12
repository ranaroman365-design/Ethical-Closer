# Phase 1A Completion Note

**Date:** 2026-05-12
**Status:** ✅ Applied & verified
**Migration:** `supabase/migrations/20260512213853_801fe2d9-5b4e-4bc8-abfe-0c684b2adc44.sql`
**Rollback snapshot:** `docs/governance/phase-1a-rollback-snapshot.md`

---

## 1. What Was Changed

### A. Backup tables relocated (15)
Moved from `public` → `archive` schema, `anon`/`authenticated` USAGE revoked,
`postgres`/`service_role` granted.

`leads_backup_20260429`, `wa_messages_backup_20260429`, `appointments_backup_20260429`,
`calls_backup_20260429`, `outbound_events_backup_20260429`, `attendance_jobs_backup_20260429`,
`attendance_templates_backup_20260429`, `commissions_backup_20260429`,
`commission_rates_backup_20260429`, `payment_events_backup_20260429`,
`stripe_events_backup_20260429`, `user_level_status_backup_20260429`,
`user_access_contract_backup_20260429`, `kpi_snapshots_backup_20260429`,
`real_kpi_snapshot_backup_20260429`.

### B. RLS enabled on 2 tables
- `commission_rates` — SELECT policy: `is_admin = true OR level >= 4` (via `user_access_contract`).
- `canonical_state_transitions` — SELECT policy: `authenticated`.

### C. Cron job 53 unscheduled
`process-appointment-reminders` (`*/5 * * * *`) — confirmed disabled no-op.

### D. 8 SECURITY DEFINER views flipped to `security_invoker = true`
`canonical_kpi_unified`, `canonical_promotion_readiness`, `level_kpi_requirements`,
`real_appointments_view`, `real_kpi_snapshot`, `real_leads_view`,
`v_communication_ab_leaderboard`, `v_email_delivery_dropoffs`.

---

## 2. What Was Explicitly NOT Changed

- ❌ No Cron Vault migration (Phase 1B deferred).
- ❌ No changes to Tier B–D cron jobs.
- ❌ No attribution backfill.
- ❌ No changes to: `calls`, `leads`, `appointments`, `revenue`, `payments`,
      `commissions`, Stripe, Twilio, Resend, GHL, messaging logic.
- ❌ No changes to the 9 warning-class SECURITY DEFINER views.
- ❌ No edge function code changes.
- ❌ No deletions — backup tables preserved in `archive` schema.

---

## 3. Verification Results (post-flight, all green)

| Check | Expected | Actual |
|---|---|---|
| `*_backup_20260429` in `public` | 0 | 0 ✅ |
| `*_backup_20260429` in `archive` | 15 | 15 ✅ |
| `anon`/`authenticated` USAGE on `archive` | none | none ✅ |
| `commission_rates` RLS enabled | true | true ✅ |
| `canonical_state_transitions` RLS enabled | true | true ✅ |
| Cron job 53 present | no | no ✅ |
| 8 views with `security_invoker=true` | 8 | 8 ✅ |

---

## 4. Rollback Location

- **Migration SQL (rollback section):** `docs/governance/phase-1a-rollback-snapshot.md`
- **Cron job 53 snapshot:**
  - `jobid: 53`
  - `jobname: process-appointment-reminders`
  - `schedule: */5 * * * *`
  - Original command captured in rollback snapshot file.

Rollback is a single transactional script — restores all 4 sub-changes.

---

## 5. Remaining Linter Context

- **949 pre-existing findings** reported by the linter.
- **Zero new error-class findings** introduced by Phase 1A.
- Outstanding scope (NOT in Phase 1A):
  - 9 warning-class SECURITY DEFINER views (deferred — semantic review needed).
  - `search_path` warnings on legacy functions (out of scope).
  - Cron jobs with inline anon JWTs (Phase 1B target).

---

## 6. Recommendation for Next Phase

**Do NOT proceed to Phase 1B (Cron Vault migration) until:**
1. Fresh cron inventory is reviewed by user (see `phase-1b-cron-inventory.md`).
2. Tier classification is re-confirmed (do **not** reuse old `30, 31, 36, 48, 49, 52, 54` list blindly).
3. Vault secret name is confirmed (`etc_cron_anon_jwt` was unverified).
4. Per-job rollback snapshots are captured **before** any `cron.alter_job` call.

Suggested ordering for Phase 1B:
- **Tier A (low-risk, internal/analytics):** start here — 1 job at a time, observe 24h.
- **Tier B (operational):** only after Tier A is stable for 48h.
- **Tier C/D (revenue/messaging/customer-facing):** require change-window + on-call.

No further changes recommended until Phase 1B inventory is approved.
