# Phase 1B — Fresh Cron Inventory

**Date:** 2026-05-12
**Scope:** Read-only inventory. **No migration applied. No tier reused blindly.**
**Source:** `cron.job` snapshot taken 2026-05-12 21:44 UTC.

> Tiers are **proposals for review only**. User must approve before any `cron.alter_job`.
> Hash column = SHA-256 of full command body (use to detect drift before migrating).

## Tier definitions (proposed)

- **Tier A — Internal / Analytics / Idempotent:** Low blast radius. Failure = stale dashboard. Safe to migrate first.
- **Tier B — Operational SQL or non-customer HTTP:** Internal automation, no customer messaging. Migrate second.
- **Tier C — Revenue / Commissions / Payments:** Money paths. Requires change-window + finance sign-off.
- **Tier D — Customer-facing messaging (Twilio/Resend/GHL):** Highest blast radius. Migrate last, one at a time.
- **Tier N/A — Pure SQL (no HTTP, no JWT):** Not Vault candidates. Skip.

---

## Inventory (34 active jobs)

| jobid | jobname | schedule | function URL | auth method | cmd hash (short) | criticality | customer-facing | revenue/payment/msg | proposed tier | rollback snapshot |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | return-expired-leads-every-15min | `*/15 * * * *` | `/return-expired-leads` | inline anon JWT | `a1` | High | No | Lead lifecycle | **B** | captured in raw snapshot |
| 2 | generate-daily-leads | `0 8 * * *` | `/generate-daily-leads` | inline anon JWT | `a2` | High | No | Lead lifecycle | **B** | captured |
| 7 | evaluate-user-states-daily | `0 6 * * *` | `/evaluate-user-states` | inline anon JWT | `a3` | Medium | No | Talent state | **A** | captured |
| 8 | daily-recalculate-certifications | `0 6 * * *` | (pure SQL) | none | `a4` | Medium | No | Talent | **N/A** | n/a |
| 9 | daily-evaluate-promotions | `0 7 * * *` | (pure SQL) | none | `a5` | Medium | No | Talent | **N/A** | n/a |
| 11 | daily-timebox-check | `0 8 * * *` | (pure SQL) | none | `a6` | Low | No | Talent | **N/A** | n/a |
| 13 | process-appointment-sla | `*/5 * * * *` | `/process-appointment-sla` | inline anon JWT | `a7` | High | Indirect | SLA → operator alerts | **B** | captured |
| 17 | generate-availability-slots | `0 1 * * *` | `/generate-availability-slots` | inline anon JWT | `a8` | High | Indirect | Booking surface | **B** | captured |
| 18 | automation-scheduler-every-5min | `*/5 * * * *` | `/automation-scheduler` | inline anon JWT | `a9` | High | Yes | Triggers msgs | **D** | captured |
| 19 | community-drop-scheduler-hourly | `5 * * * *` | `/community-drop-scheduler` | inline anon JWT | `a10` | Medium | Yes | Community msgs | **D** | captured |
| 21 | etc-cron-dispatch-appointment-reminders | `*/5 * * * *` | `/dispatch-appointment-reminders` | inline anon JWT | `a11` | **Critical** | **Yes** | Reminders (WA/SMS/Email) | **D** | captured |
| 22 | etc-cron-retargeting-no-booking | `*/15 * * * *` | `/retargeting-no-booking` | inline anon JWT | `a12` | High | Yes | Retargeting msgs | **D** | captured |
| 23 | etc-cron-payment-recovery-flow | `*/15 * * * *` | `/payment-recovery-flow` | inline anon JWT | `a13` | **Critical** | **Yes** | Payment recovery (Stripe) | **C** | captured |
| 24 | etc-cron-sync-retargeting-audiences | `0 * * * *` | `/sync-retargeting-audiences` | inline anon JWT | `a14` | Medium | No | Ad audiences | **A** | captured |
| 25 | etc-cron-evaluate-upsell-triggers | `0 * * * *` | `/evaluate-upsell-triggers` | inline anon JWT | `a15` | High | Indirect | Upsell triggers | **B** | captured |
| 26 | etc-cron-process-outbound-events | `*/2 * * * *` | `/process-outbound-events` | inline anon JWT | `a16` | High | Yes | Outbound msg pipeline | **D** | captured |
| 27 | expire-pending-appointments | `* * * * *` | (pure SQL) | none | `a17` | High | Indirect | Booking | **N/A** | n/a |
| 28 | governance_daily_detections | `30 3 * * *` | (pure SQL) | none | `a18` | Medium | No | Governance | **N/A** | n/a |
| 29 | process-pending-analyses-every-5min | `*/5 * * * *` | `/process-pending-analyses` | inline anon JWT | `a19` | Medium | No | Call analysis | **A** | captured |
| 30 | extract-call-patterns-every-6h | `0 */6 * * *` | `/extract-call-patterns` | inline anon JWT | `a20` | Low | No | Pattern mining | **A** | captured |
| 31 | update-scripts-from-patterns-every-6h | `30 */6 * * *` | `/update-scripts-from-patterns` | inline anon JWT | `a21` | Low | No | Scripts/intelligence | **A** | captured |
| 36 | aggregate-call-patterns-every-6h | `10 */6 * * *` | `/aggregate-call-patterns` | inline anon JWT | `a22` | Low | No | Analytics | **A** | captured |
| 37 | outcome-fallback-hourly | `15 * * * *` | `/outcome-fallback` | inline anon JWT | `a23` | Medium | No | Call outcome backfill | **B** | captured |
| 41 | auto_close_missing_outcomes_daily | `15 3 * * *` | (pure SQL) | none | `a24` | Medium | No | Call outcomes | **N/A** | n/a |
| 42 | traffic_owner_backfill_worker | `* * * * *` | (pure SQL) | none | `a25` | Medium | No | Attribution | **N/A** | n/a |
| 44 | sweep-commissions-eligibility-hourly | `15 * * * *` | (pure SQL `sweep_commissions_eligibility(14)`) | none | `a26` | **Critical** | No | **Commissions** | **N/A** | n/a |
| 45 | process-email-queue | `5 seconds` | `/process-email-queue` | **Vault (already migrated)** | `a27` | **Critical** | **Yes** | Email pipeline | **DONE** | n/a (already Vault) |
| 46 | dispatch-playbook-promotions-5m | `*/5 * * * *` | `/dispatch-playbook-promotions` | inline anon (apikey hdr) | `a28` | High | Yes | Playbook promo msgs | **D** | captured |
| 47 | process-lead-touchpoints-every-5min | `*/5 * * * *` | `/process-lead-touchpoints` | inline anon JWT | `a29` | High | Indirect | Lead activity | **B** | captured |
| 48 | playbook-audit-weekly | `0 6 * * 1` | `/playbook-audit-scheduler` | inline anon (apikey hdr) | `a30` | Low | No | Audit | **A** | captured |
| 49 | system-health-check-6h | `0 */6 * * *` | `/system-health-check` | inline anon JWT | `a31` | Medium | No | Health monitoring | **A** | captured |
| 50 | mature-referral-earnings-daily | `0 3 * * *` | `/mature-referral-earnings` | inline anon (apikey hdr) | `a32` | **Critical** | No | **Referral revenue** | **C** | captured |
| 52 | qa-regression-6h | `30 */6 * * *` | `/qa-regression` | inline anon (apikey hdr) | `a33` | Low | No | QA | **A** | captured |
| 54 | experiment-optimizer-daily | `17 3 * * *` | `/experiment-optimizer` | inline anon (apikey hdr) | `a34` | Low | No | Experimentation | **A** | captured |

> **Cmd-hash column:** placeholder labels (`a1`–`a34`). Before migration, regenerate exact SHA-256 of each `command` row from `cron.job` and store in the Phase 1B package — any drift between inventory and migration time = abort.

---

## Tier rollups (proposed, pending approval)

- **Tier A (10):** 7, 24, 29, 30, 31, 36, 48, 49, 52, 54 — safe first wave.
- **Tier B (7):** 1, 2, 13, 17, 25, 37, 47 — internal automation, second wave.
- **Tier C (2):** 23, 50 — money paths, change-window required.
- **Tier D (6):** 18, 19, 21, 22, 26, 46 — customer messaging, last wave, **one at a time**.
- **Tier N/A (8):** 8, 9, 11, 27, 28, 41, 42, 44 — pure SQL, not Vault candidates.
- **DONE (1):** 45 — already on Vault.

Total: 34 active jobs accounted for.

---

## ⚠️ Required before Phase 1B drafting

1. User must **approve or amend** Tier A list above.
2. Confirm exact Vault secret name (candidate: `etc_cron_anon_jwt` — unverified).
3. For each job to migrate, capture `command` SHA-256 immediately before drafting `cron.alter_job` and immediately before applying — must match.
4. Per-job rollback (exact original `command`) must be embedded in the migration file.
5. Migration must be split: **one Vault wave per migration file**, never bulk.

**No cron job will be migrated in this turn.**
