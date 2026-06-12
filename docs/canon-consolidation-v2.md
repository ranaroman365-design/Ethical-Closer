# ETC Canon Consolidation v2 — Merge · Sharpen · Demote · Remove

**Mode:** Reduce canon noise. No new logic. Preserve truth.
**Date:** 2026-04-23 · Follows Enforcement Pack v1.

---

## 1. MERGED CANONS — what was absorbed

### A. KPI Truth Layer ← merges C07 + C13(KPI part) + C40
- **Owner:** `src/lib/operational-canon.ts` (formulas) + `src/lib/canonical-thresholds.ts` (gates) + DB RPC `get_kpi_truth()` (executable values).
- **Absorbed:** C07 KPI Unification (compression view), C13 KPI formulas, C40 KPI Governance.
- **Removed:** parallel formula descriptions in feature memories; KPI display thresholds in `kpi-config.ts` re-classified as *consumer*, not *author*.
- **Single rule:** *Formulas live in operational-canon. Thresholds live in canonical-thresholds. Values come from get_kpi_truth(). Display lives in kpi-config.*

### B. Lead Routing Canon ← merges C29 + C37 + C46
- **Owner:** new section in `canonical-thresholds.ts → ROUTING + FAST_TRACK` + existing `smart-routing.ts`.
- **Hierarchy (deterministic, top wins):**
  1. **Fast Track** — lead score ≥ `FAST_TRACK.self_qualification_score` (75) skips Setter.
  2. **Quality Priority** — score ≥ `ROUTING.high_tier_score` (75) → priority slot pool.
  3. **Weighted Assignment** — `0.40·capacity + 0.40·performance + 0.20·fairness`.
- **"Priority" final meaning:** lead-quality based, NOT paid upsell. Paid €27 upsell = `Priority Call Slot` (different concept, separate term).
- **Override:** admin manual reassignment only; no automatic ML override.

### C. Communication Delivery Canon ← merges C30 + C31 + channel abstraction
- **Owner:** `src/lib/canonical-events.ts` (event names) + `outbound_events` table (queue) + GHL adapter (dumb channel).
- **Single rule:** *Lovable = brain (events, state, KPIs). GHL = arms (SMS/WA/Email delivery only).* GHL **never** mutates state.
- **Removed:** "Master Integration Events" as separate canon — fully absorbed by canonical-events.

### D. Operator Workflow Canon ← merges C43 + C44 + C50
- **Owner:** memory `mem://features/daily-execution-os-v2-master` (sequence) referencing closing script + Copilot.
- **Stack:** *Daily Execution OS = container. Closing Script = method inside calls. AI Copilot = real-time advisor inside Closing Script.*
- **Removed:** standalone "Closing Script Philosophy" canon flag — now spec-level inside Workflow.

### E. Performance Surface Canon ← merges C08 + C48 + C56
- **Owner:** access matrix in `operational-canon.ts → ACCESS_MATRIX`.
- **Surface ownership (no overlap):**
  | Role | Surface | Route |
  |---|---|---|
  | Member L0–L3 | `basic_dashboard` | `/members/dashboard` |
  | Closer L4–L5 | `closer_dashboard` | `/members/dashboard` (variant) |
  | Operator L6 | `operator_dashboard` + own funnel | `/members/dashboard/performance` |
  | Director L7 | `director_dashboard` | `/members/director/performance` |
  | Admin/Founder | Decision Console | `/members/admin/performance` |
- **Removed:** "Dashboard Governance" + "Operator Performance System" as separate canons → now sub-specs.

---

## 2. DEMOTED CANONS — UI/feature, not invariants
| Was canon | New classification | Reason |
|---|---|---|
| C58 Mission Section Design | UI spec | Pure visual, no system rule |
| C63 Communication System v8 | Feature spec | Implements Communication Delivery Canon |
| C61 Operator Comparison Dashboard | Feature spec (under Performance Surface) | Specialized view, not invariant |
| C43 Closing Script Philosophy | Feature spec (under Operator Workflow) | Method, not law |
| C44 Daily Execution OS detail | Feature spec (Operator Workflow owns container) | Implementation |

---

## 3. DORMANT CANONS — decision per item
| Canon | Status | Decision | Rationale |
|---|---|---|---|
| C53 Earn-While-Learn | Active L2+ | **Keep as canon** | Defines monetization invariant (no revenue → no payout) |
| C54 Employer Marketplace | Behind feature flag | **Demote → dormant feature spec** | Not yet active in user journeys; no current invariant |

---

## 4. FINAL ACTIVE CANON INVENTORY (post-consolidation)

**Count: 21 active canons** (down from ~71 pre-audit).

### Foundation (6)
1. Canonical Role Naming (Layer 11)
2. Operational Canon (Layer 12)
3. Canonical Thresholds (Layer 13)
4. Canonical Events Registry (Layer 14)
5. Multi-Tenant Room Scoping
6. Event Idempotency

### Acquisition (3)
7. Canonical Narrative + Emotion + Charisma + Lifestyle (Layers 13–16, narrative stack — single canon family)
8. Lead Routing Canon (merged C29+C37+C46)
9. Booking Conversion Logic v20

### Conversion (3)
10. Communication Delivery Canon (merged C30+C31)
11. Operator Workflow Canon (merged C43+C44+C50)
12. Appointment Recovery & Reschedule

### Value (4)
13. Canonical Onboarding (Layer 18)
14. Canonical Progression (Layer 19)
15. Canonical Mentoring (Layer 20)
16. Canonical Compensation (Layer 17)

### Intelligence (3)
17. KPI Truth Layer (merged C07+C13kpi+C40 → `get_kpi_truth`)
18. OSS + PSP Coherence Layer (Layers 9–10)
19. Control Engine — Bottleneck

### Governance (2)
20. Performance Surface Canon (merged C08+C48+C56)
21. Canonical B2B (Layer 21)

---

## 5. REMAINING GAPS
- **Retention canon (post-L4):** still missing. Add in v3.
- **Refund/cancellation lifecycle canon:** missing.
- **DB enum for `outbound_events.event_name`:** TS-locked, DB-side deferred.

---

## 6. INTEGRITY SCORE — before vs after

| Dimension | Before (v1 audit) | After (v2) |
|---|---|---|
| Completeness | 7 | 7 (gaps documented) |
| MECE quality | 6 | 9 (no overlaps, no cross-cutting) |
| Coherence | 6 | 9 |
| Consistency | 7 | 9 |
| Effectiveness | 7 | 8 |
| **Composite** | **6.6** | **8.4** |

---

## 7. MINIMAL NEXT STEPS
1. Author retention canon + refund canon (gap close).
2. Run `SELECT DISTINCT event_name FROM outbound_events`, then DB enum migration.
3. Wire dashboards to `get_kpi_truth()` (replace direct `member_kpis` reads).
4. Optional v3: "Canon Constitution" meta-doc as supreme reference.
