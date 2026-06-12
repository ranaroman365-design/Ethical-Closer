# Canonical Reactivation Canon — Layer 22

**Status:** Installed · 2026-04-23
**Source of truth:** `src/lib/canonical-reactivation.ts`
**Block:** Value (primary) · Governance (supporting)
**Loop mode:** `recovery` (per `execution-loop-canon-v2`)
**Constitution:** governed by `canon-constitution`

---

## 0. Why this canon

Audit (Part 6) flagged **Retention / Reactivation** as the single largest open
LTV lever. Inactivity events (`INACTIVE_3D`, `INACTIVE_7D`) existed in the
operational canon but had no deterministic action map. Result: silent
drop-offs, no recovery, no escalation cap.

This canon closes that gap with **one loop per cohort, deterministic stages,
hard escalation caps, and a single dominant CTA per stage**.

---

## 1. Cohorts (MECE)

| Cohort | Definition | Block touchpoint |
|---|---|---|
| `lead_no_quiz` | Lead created, quiz never started | Acquisition |
| `quiz_no_booking` | Quiz finished, no booking | Acquisition → Conversion |
| `booked_no_show` | Booked, missed call (long-tail; rescue owns first 24h) | Conversion |
| `community_idle` | Community member, no path progress 7d+ | Value |
| `member_idle` | L1+ member, KPI silence | Value → Governance |
| `closed_won_idle` | Converted, no first execution | Value |

A user is in **at most one** reactivation cohort at a time. Cohort selection
is deterministic from current `user_state` + last meaningful event.

---

## 2. Stage anatomy

Every stage declares:

```
Trigger event (INACTIVE_3D|INACTIVE_7D)
 └─► Inactivity threshold (days)
      └─► Message purpose (one of: reminder|reactivation|encouragement|urgency|escalation)
           └─► Channel cascade (ordered, first success wins)
                └─► Single CTA
                     └─► Success event (canonical → exits loop)
                          └─► on_failure (next_stage|escalate|terminate)
```

**Hard rules:**
- One purpose per stage. No multi-purpose messages.
- One CTA per stage. No alternative paths.
- `max_attempts` per stage capped at 1 (escalate by adding the next stage).
- Stage `inactivity_days` strictly increasing within a loop.
- Terminal stage cannot have `on_failure='next_stage'`.

---

## 3. Channels

`email · sms · whatsapp · in_app · mentor_intervention`

Channel selection is **per stage**, not per user preference. Cascade order
is fixed in the registry. `mentor_intervention` is reserved for escalations
in `member_idle` and `closed_won_idle`.

---

## 4. Integration points

| System | How this canon plugs in |
|---|---|
| `automation-and-recovery` engine | Reads `REACTIVATION_LOOPS`, dispatches per stage |
| `EVENTS` registry | All trigger and success events are canonical |
| `outbound_events` table | `metadata.stage_id` = `ReactivationStage.id` for idempotency |
| `community_path_progress` | Drives `community_idle` cohort detection |
| Mentor system (Layer 20) | Receives `mentor_intervention` escalations |

No new tables. No schema migration. The canon is a behavioral overlay on
existing infrastructure.

---

## 5. Audit gate

`auditReactivationCanon()` enforces at test time:
- unique stage ids
- strictly increasing `inactivity_days` per loop
- `max_attempts >= 1`
- at least one channel per stage
- terminal stage has terminal `on_failure`

A canon failing this audit MUST NOT ship.

---

## 6. Highest-leverage cohort

`quiz_no_booking` — three stages (d1 urgency → d3 reactivation → d7 community
fallback). This is where the audit identified the 81% drop. The canon now
guarantees three deterministic touches with one CTA each before terminal
archive.

---

## 7. Future migration

Stage ids will become a Postgres enum once the broader **Event Enum Lock**
(audit move #2) ships. Until then, idempotency relies on
`outbound_events.metadata.stage_id` + `assertCanonicalEventName()`.
