# ETC System Canon v1.1 — Alignment & Execution Upgrade

**Status:** Installed · 2026-04-23
**Type:** Alignment manifest (NOT new logic, NOT new architecture)
**Source of truth:** `src/lib/etc-system-canon.ts`
**Goal:** Activate existing system to maximize **Conversion · Retention · LTV**

---

## 0. What this is and is not

**Is:** a thin alignment layer that ties together what already exists:
- Canon Constitution v1 (supreme meta-rules)
- Canon Consolidation v2 (21 active canons, 6-block map)
- Canon Enforcement Pack v1 (registries, lint, RPC)
- Execution Loop Canon v2 (Trigger→Comm→Action→Measure→Govern→Recover)

**Is not:** a rewrite, a new feature, a parallel KPI/governance/event system, or a new block.

---

## 1. Locked Block Map (Part 1)

| Block | Function |
|---|---|
| **Foundation** | invariants — roles, thresholds, events, tenant scoping, idempotency |
| **Acquisition** | traffic & entry — lead generation, narrative, routing, booking conversion |
| **Conversion** | monetization — call delivery, communication, operator workflow, recovery |
| **Value** | delivery & progression — onboarding, progression, mentoring, compensation |
| **Intelligence** | measurement & insight — KPI truth, OSS/PSP, bottleneck control engine |
| **Governance** | decisions & control — performance surfaces, B2B governance |

Rule: every active canon belongs to exactly one block. Source: `src/lib/canon-map.ts`.

---

## 2. Execution Loop (Parts 2–10)

Already installed as **Execution Loop Canon v2** (`src/lib/execution-loop-canon.ts`).

Loop: `Trigger → Communication(Trigger·Message·Channel) → Action → Measurement → Governance → Recovery → next`.

Loop modes: `conversion · retention · recovery · performance`.
Time horizons: `immediate · short_term · long_term`.
Priority: `pickDominant()` — revenue_impact > diagnosis_confidence > urgency > execution_speed.

---

## 3. Canon Alignment Graph (Part 11)

| v1.1 Component | Aligned canon(s) |
|---|---|
| Trigger layer | F4 Canonical Events Registry · C1 Communication Delivery |
| Message logic | A1 Narrative Stack |
| Channel delivery | C1 Communication Delivery |
| Action engine | C2 Operator Workflow · A3 Booking Conversion v20 |
| Performance | I1 KPI Truth Layer (`get_kpi_truth`) |
| Governance engine | G1 Performance Surface · I3 Control Engine |
| Recovery engine | C3 Appointment Recovery & Reschedule |
| Priority engine | I3 Control Engine · A2 Lead Routing |
| Time layer | F3 Canonical Thresholds (windows) |

No canon is replaced — each is **activated** through the loop.

---

## 4. Enforcement Manifest (Part 12)

| Mechanism | Source | Guarantees |
|---|---|---|
| Thresholds registry | `src/lib/canonical-thresholds.ts` | no hardcoded numeric gates |
| Events registry | `src/lib/canonical-events.ts` | no free-text event names |
| Role naming lint | `eslint.config.js → etc-canon/no-hardcoded-role-label` | no role labels leak into UI |
| KPI truth RPC | `get_kpi_truth()` + `operational-canon.ts` | single KPI formula source |
| 6-block map | `src/lib/canon-map.ts` | exactly-one-block ownership |
| Execution loop audit | `auditExecutionLoops()` | trigger / CTA / measurement / decision / recovery / horizon |
| Constitution audit | `auditConstitution()` | block membership · unique ownership · source of truth |

---

## 5. Success Conditions (Part 13) — programmatic

`auditSystemCanon()` returns `passed: true` only when:

- [x] every trigger → communication
- [x] every communication → action (one CTA)
- [x] every action → measured (event or KPI)
- [x] every measurement → explicit decision (incl. `ignore`)
- [x] every failure → recovery path
- [x] every user → guided (priority engine surfaces one dominant action)

Run anytime via `auditSystemCanon()` — failing audits block ship.

---

## 6. Why this maximizes Conversion · Retention · LTV

| Outcome | Mechanism activated |
|---|---|
| **Conversion ↑** | Quiz-rescue + booking-to-show loops (`LOOP_CONV_*`), single dominant CTA via `pickDominant()`, deterministic follow-ups via canonical events |
| **Retention ↑** | Daily Execution loop (`LOOP_RET_DAILY_EXEC`) + capped recovery on activity drop → mentor intervention before silent churn |
| **LTV ↑** | Performance loop (`LOOP_PERF_KPI_GAP_FEEDBACK`) ties KPI gap → action → improved KPI → progression → compensation tier upgrade |

No new features were added to achieve this — only existing canons activated through the loop.

---

## 7. Amendment rule

System Canon v1.1 may only change when:
1. A pillar (Constitution / Consolidation / Enforcement / Execution Loop) is upgraded.
2. `SYSTEM_CANON.version` is bumped in `etc-system-canon.ts`.
3. `auditSystemCanon()` returns `passed: true`.
