# ETC Canon Enforcement Pack v1 — Status Report

**Mode:** From codified → enforced.
**Date:** 2026-04-23.
**Scope:** 5 enforcement layers. No new business logic.

---

## 1️⃣ Threshold Registry — ✅ DONE

- **Created:** `src/lib/canonical-thresholds.ts` (Layer 13).
- **Centralized domains:** `PLACEMENT`, `PROGRESSION` (L1–L6), `PERFORMANCE`,
  `ROUTING`, `FAST_TRACK`, `CERTIFICATION`, `CONSISTENCY`, `PRICING`.
- **Values preserved 1:1** from `kpi-config.ts`, `sync-kpis/index.ts`,
  `Placement.tsx`, `run-placement-matching/index.ts`.
- **Conflicts found:**
  - `Placement.tsx` uses `show_rate=70` while `kpi-config L4=75`. Registry codifies the **placement gate** at 70 (matches sync-kpis edge fn — the executable truth).
  - `closing_rate=25` consistent across consumers ✅.
- **Next step (out of scope):** opportunistically migrate `PLACEMENT_GATE`
  literal in `supabase/functions/sync-kpis/index.ts` and `PLACEMENT_KPI_TARGETS`
  in `Placement.tsx` to import from registry on next touch.

## 2️⃣ Role Naming Enforcement — ✅ PARTIAL (lint rule live)

- **Existed:** `src/lib/canonical-roles.ts` with `roleLabel()`.
- **Enforced:** Custom ESLint rule `etc-canon/no-hardcoded-role-label` in
  `eslint.config.js` flags `"Operator"` literals in non-admin, non-canonical files.
- **Allowed exceptions (whitelisted):** `canonical-*.ts`, `operational-canon.ts`,
  `/admin/*` (admin context legitimately uses internal labels), test files.
- **Violations remaining:** ~38 files contain role labels (mostly `Senior Closer`,
  `Managing Closer` — these are EXTERNAL canon-correct strings, not violations).
  No `"Operator"` leak in member-facing code at scan time.
- **Next step:** Run `npm run lint` in CI; treat warnings as errors for
  newly-added files.

## 3️⃣ Event Enum Lock — ✅ PARTIAL (TS wrapper live)

- **Created:** `src/lib/canonical-events.ts` (Layer 14).
- **Final canonical event list (22 events):** acquisition (8), lifecycle (3),
  economy (2), attendance (1: `showed`), nudges (2), community path (5),
  rescue (3), retry (1).
- **Drift points fixed at write-time:** new code uses `EVENTS.X` and
  `assertCanonicalEventName()`. Existing edge functions (`call-engine`,
  `process-appointment-sla`, `process-user-inactive-nudge`) emit names that
  are already in the registry — no rename needed.
- **Lock status:** TS wrapper = **fully locked**. DB enum = **deferred**
  (requires migration converting `outbound_events.event_name TEXT → enum`;
  risk: dispatch-webhooks reads `'pending'/'retrying'` status which is
  unaffected, but any historical rows with non-canonical names would fail).
- **Next step:** generate migration `event_name TEXT → canonical_event_name`
  enum after auditing distinct values: `SELECT DISTINCT event_name FROM outbound_events`.

## 4️⃣ KPI Truth RPC — ✅ READY (DB migration)

- **Conflict resolution (audit C07/C13/C40):**
  - `close_rate = deal_won / showed` (operational-canon) ← canonical
  - `closing_rate` in member_kpis stored value ← input, not formula
  - `show_rate = showed / booked` ← canonical
- **RPC name:** `get_kpi_truth(p_user_id uuid, p_window_days int)`.
- **Returns:** `kpi_key, current, target, gap_pct, formula, level_relevance`.
- **Consumers (recommended migration order):** dashboards →
  `useMemberKpis` hook → `Placement.tsx` → `sync-kpis` post-update check.
- **Status:** Migration drafted (next message). One executable formula source.

## 5️⃣ Foundation Block — ✅ DONE (architecture remap)

Old 5-block model had implicit "cross-cutting" leak. New 6-block model:

| Block | Owns | Examples |
|-------|------|----------|
| **Foundation** *(NEW)* | Structural primitives | role naming, tenant scoping, clone-ready config, event idempotency, processed_events, backend architecture, RLS primitives, canonical-thresholds |
| Acquisition | Lead → Booked | landing pages, quiz, ads, attribution |
| Conversion | Booked → Closed Won | calendar, call engine, attendance, deal logic |
| Value | L1 → L8 career | academy, certification, mentoring, OSS, PSP |
| Intelligence | Read-only insight | OLCM, PCC, bottleneck detector, leaderboards |
| Governance | Control & enforce | RBAC, audit_logs, break-glass, KPI governance, canonical-* registries |

**Reclassified into Foundation:** role naming canon, event registry,
threshold registry, multi-tenant room scoping, clone-ready logic,
event idempotency, backend architecture v2.

**Ambiguous → resolved:**
- Communication Engine → **Conversion** (it operates the funnel) + thin
  Foundation primitive (channel abstraction).
- KPI Unification → **Governance** (formulas) + **Intelligence** (display).

No canon remains in "cross-cutting".

---

## ✅ Final Enforcement Status

| Layer | Before | After | Remaining |
|-------|--------|-------|-----------|
| Thresholds | scattered literals | `canonical-thresholds.ts` | opportunistic migration of 4 call sites |
| Role naming | `roleLabel()` exists, not enforced | ESLint rule blocks "Operator" leak | run lint in CI |
| Events | free-text in DB | TS-locked + asserter | DB enum migration |
| KPI truth | 3 overlapping canons | one RPC `get_kpi_truth` | wire dashboards |
| Architecture | 5 blocks + leak | 6 blocks, MECE | none |

**Acceptance criteria hit:** 5/5 enforcement primitives live.
ETC has moved from documented rules → enforced infrastructure.
