# ETC KPI Unification Layer — Canonical V1

> **Status:** Non-destructive integration spec. Defines how the existing KPI system feeds [OSS V1](./operator-scoring-system.md) and [PSM V1](./predictive-success-model.md) without changing a single KPI definition, threshold, or promotion rule.
>
> **Doctrine:** ETC V6.1. Existing KPIs = ground truth. OSS + PSP are interpretations layered on top.
>
> **Scope:** Mapping + normalization contract only. No code, schema, KPI, threshold, or promotion rule is modified by registering this spec.

---

## 0. Hard Rules (non-negotiable)

1. **No new KPIs.** OSS and PSP components are derived exclusively from KPIs already governed by `mem://features/kpi-system-governance`.
2. **No threshold changes.** All existing KPI thresholds remain the canonical pass/fail line.
3. **No parallel KPI system.** OSS/PSP never replace or shadow a KPI; they aggregate it.
4. **No promotion override.** Promotion logic remains as defined in `mem://governance/role-definitions-v11` and `mem://features/placement-engine`. OSS gates are *additive proposals*, never substitutes.
5. **One source per metric.** A KPI value displayed in any OSS/PSP card must equal the value displayed in the canonical KPI dashboard. No drift.
6. **Coherence over complexity.** This layer only adds compression (OSS) and prediction (PSP). It removes nothing.

---

## 1. Three-Layer Information Model

```
KPIs   →  WHAT is happening   (ground truth, unchanged)
OSS    →  HOW GOOD it is      (compression / interpretation)
PSP    →  WHERE it is going   (projection / early signal)
```

Every admin/user view that surfaces OSS or PSP **must also** expose the underlying KPI values when drilled into. No black box.

---

## 2. KPI → OSS Component Map

OSS components are aggregations over **already-tracked** KPIs. No new measurement is introduced.

### Activity Score (AS)
| OSS input | Source KPI / Event |
|---|---|
| calls completed (7d) | existing `calls_handled` KPI |
| tasks completed (7d) | existing Daily Execution OS task log |
| platform engagement (7d) | existing session/event log |
| training engagement (7d) | existing module/simulator events |

### Skill Score (SS)
| OSS input | Source KPI |
|---|---|
| close rate | existing `close_rate` KPI |
| show / handover / qualification (setter) | existing setter KPI set |
| call quality / outcomes | existing `call_outcomes` table |

### Revenue Score (RS)
| OSS input | Source KPI |
|---|---|
| revenue (30d) | existing `revenue_closed` KPI |
| deals closed (30d) | existing `deals_closed` KPI |
| commission earned | existing commissions table |

### Consistency Score (CS)
| OSS input | Source |
|---|---|
| KPI stability over time | rolling stdev of existing KPIs |
| activity continuity | gap analysis of existing event log |
| drop-off patterns | existing inactivity flags |

> **Rule:** if a row above ever requires a metric that does not yet exist, do **not** create it. Either skip the row or escalate via architectural review. PSM/OSS adapt to the KPI system, never the other way around.

---

## 3. KPI → PSP Signal Map

| PSP component | Derived from existing data |
|---|---|
| **EV** Execution Velocity | timestamps already in `funnel_events_v2` (signup, first action, first call) |
| **ED** Effort Density | existing calls/period + actions/day from event log |
| **FR** Feedback Responsiveness | KPI delta after existing coaching/feedback events; retry counts already in call/simulation logs |
| **OT** Outcome Trajectory | slope of existing `close_rate`, `activity`, `revenue` series |

No new metric, no new event, no new instrumentation.

---

## 4. Normalization Contract

All component scores are **relative**, never absolute:

```
component_score = normalize(user_kpi_value, benchmark)
```

### Benchmark precedence (deterministic)
1. **Level-specific p50** of active users in same level band (primary)
2. **Rolling 7-day system average** (fallback for sparse cohorts)
3. **Rolling 30-day system average** (smoothing reference)
4. **Top-performer reference** (used only for "Elite" band ceiling)

A user's component score is the same regardless of which screen renders it. Benchmarks are recomputed on the cadences already defined in OSS §11 and PSM §9.

### Worked example
```
User close_rate:  38%
Level p50:        50%
SS (skill score): 76   ← 38/50 normalized to 0–100
```

---

## 5. Promotion Logic — Unchanged

| Decision | Owner |
|---|---|
| Pass/fail KPI threshold | existing KPI system |
| Promotion eligibility gate | existing role/promotion engine (`role-definitions-v11`, `placement-engine`) |
| OSS gate | **proposal only**, must coexist with existing gate |
| PSP signal | **attention proposal only**, never a promotion gate |

OSS contributes:
- visibility (rank within level)
- diagnostics (which component is weak)
- proposal (which users meet the OSS gate in addition to existing gates)

OSS does NOT:
- modify thresholds
- bypass the role engine
- promote anyone autonomously

---

## 6. Control Engine Integration

The [Control Engine](./control-engine-bottleneck-system.md) consumes all three layers:

```
User: <name>   Level: L2

KPI Status (ground truth):
  Calls:       ✔ threshold met
  Close Rate:  ✖ below threshold (32% vs 45%)

OSS: 62  (Developing)
PSP: 78  (High Potential)

Decision (OSS × PSM matrix): INVEST
Insight: strong future operator, needs skill refinement
Lever:   coaching focus on Skill component
```

The Control Engine never invents thresholds — it reads the existing KPI verdict, then enriches it with OSS interpretation and PSP projection.

---

## 7. Admin View Contract (Coherence Layer)

Every per-user admin card surfaces three sections in this order:

1. **Raw KPIs** — exact values, exact thresholds, pass/fail badges (unchanged from current dashboards).
2. **OSS** — composite + 4 components (AS/SS/RS/CS) + band label + rank-in-level.
3. **PSP** — composite + 4 components (EV/ED/FR/OT) + segment + early-detection flags.

Plus a single **Decision** badge (Scale / Invest / Monitor / Deprioritize) from the OSS × PSM matrix.

Drill-down from OSS/PSP must lead back to the underlying KPI rows. No orphan numbers.

---

## 8. Governance

1. **Single source of truth per metric.** OSS/PSP cards must read from the same KPI store as the canonical dashboards. Reject any implementation that recomputes a base KPI inside the OSS/PSP layer.
2. **No silent benchmark changes.** Benchmark precedence (§4) is canonical; changes require a version bump on this doc + downstream OSS/PSM specs.
3. **Auditability.** Each OSS/PSP recompute event must reference the KPI snapshot ids it consumed.
4. **Backwards compatibility.** Removing or renaming an existing KPI requires updating the maps in §2 and §3 in the same change set. No dangling references.

---

## 9. System Benefit Summary

| Benefit | Mechanism |
|---|---|
| Zero disruption | KPIs, thresholds, promotion logic untouched |
| Higher clarity | KPIs gain a one-glance interpretation (OSS) |
| Forward visibility | Behavioral projection (PSP) without new instrumentation |
| Better decisions | Single Decision badge collapses 3 layers into 1 action |

---

## 10. Cross-References

- KPI source of truth: `mem://features/kpi-system-governance`
- Role hierarchy & promotion: `mem://governance/role-definitions-v11`, `mem://features/placement-engine`
- Present-performance scoring: [`operator-scoring-system.md`](./operator-scoring-system.md)
- Future-potential prediction: [`predictive-success-model.md`](./predictive-success-model.md)
- Closed-loop optimizer: [`control-engine-bottleneck-system.md`](./control-engine-bottleneck-system.md)
- Workflow registry: [`communication-engine-workflows.md`](./communication-engine-workflows.md)
- Event taxonomy: `mem://technical/master-integration-event-architecture`

*Canonical V1. Update only via explicit architectural review.*
