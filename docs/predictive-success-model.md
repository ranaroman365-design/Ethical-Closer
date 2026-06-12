# ETC Predictive Success Model (PSM) — Canonical V1

> **Status:** Canonical prediction spec for the Value Engine (Block 2). Pairs with the [Operator Scoring System (OSS)](./operator-scoring-system.md): OSS measures present performance, PSM predicts future performance.
>
> **Doctrine:** ETC V6.1. Lovable = source of truth. PSM is the early-detection layer that identifies high-potential operators at L1–L3, before results materialize.
>
> **Scope:** Semantic + governance only. Defines formula, signals, thresholds, and integration contracts. No code, schema, or live data is modified by registering this spec.

---

## 0. Hard Rules (non-negotiable)

1. **No ML black box.** Pure deterministic formula. Every score is reproducible from raw events.
2. **No external models.** All inputs come from `funnel_events_v2` and existing KPI tables.
3. **No subjective tagging.** No human-assigned labels feed PSP.
4. **Explainable at all times.** Every PSP exposes its 4 component scores + per-input contribution.
5. **No silent retraining.** Weights are fixed in this spec. Changes require an architectural review + version bump.
6. **PSM never bypasses OSS.** Promotions still require OSS gates (see [OSS §9](./operator-scoring-system.md)). PSM only proposes who deserves attention.

---

## 1. Score Definition

Every user in **L1–L3** (early career) gets a **Predicted Success Probability (PSP) ∈ [0, 100]**:

```
PSP = EV·0.25 + ED·0.25 + FR·0.25 + OT·0.25
```

| Component | Symbol | Measures |
|---|---|---|
| Execution Velocity | `EV` | speed of action |
| Effort Density | `ED` | intensity of activity |
| Feedback Responsiveness | `FR` | adaptability to coaching |
| Outcome Trajectory | `OT` | improvement curve |

Each component normalized to `[0, 100]`. Equal weights — no level-banding (PSM is for early career only).

> **Why equal weights:** at L1–L3 the signal is correlation, not causation. Over-weighting any single dimension introduces bias before enough data exists. Weights may diverge in PSM V2 once historical L1→L6 cohorts are large enough to back-test.

PSM may also be computed for L4+ as a **secondary signal** (talent retention), but it does not drive promotion decisions above L3 — OSS owns that domain.

---

## 2. Execution Velocity (EV)

**Purpose:** how fast the user moves from intent to action.

**Inputs:**
- `time_to_first_action` (signup → first meaningful event)
- `time_to_first_call` (signup → first call attempt)
- `median_inter_action_gap_30d`

**Normalization (inverse-time, log-scaled):**
```
EV = clamp( 100 − scaled_log(time_to_first_action_hours, level_p50), 0, 100 )
```
Fast movers → high EV. Slow starters → low EV.

---

## 3. Effort Density (ED)

**Purpose:** intensity of repetition.

**Inputs:**
- `actions_per_active_day_14d`
- `calls_per_week_14d`
- `platform_engagement_frequency_14d` (sessions/day)

**Normalization (peer-relative within level):**
```
ED = clamp( percentile_rank(actions_per_day, level_peers) · 100, 0, 100 )
```
High repetition is the strongest single predictor of L6 trajectory.

---

## 4. Feedback Responsiveness (FR)

**Purpose:** does the user change behavior after feedback?

**Inputs:**
- KPI delta in the 7-day window after a coaching/feedback event
- Reattempt frequency after a failed call/simulation
- Module re-engagement after low score

**Normalization:**
```
FR = clamp( mean_normalized_post_feedback_lift_30d · 100, 0, 100 )
```
Responds → scalable human. Ignores → ceiling reached.

> **Edge case:** users with no feedback events in the window receive `FR = null` and the formula renormalizes over the remaining 3 components until at least 1 feedback event exists.

---

## 5. Outcome Trajectory (OT)

**Purpose:** trend matters more than level.

**Inputs:**
- Slope of `close_rate` over last 4 weeks
- Slope of `activity_per_day` over last 4 weeks
- Slope of any tracked KPI improvement

**Normalization (slope to score):**
```
OT = clamp( 50 + scaled_slope(kpi_history_4w) · 50, 0, 100 )
```
A flat curve → 50. Upward → >50. Downward → <50.

> **Why slope, not absolute:** a user at 12% close rate climbing 2 pts/week beats a flat 18% closer. PSM rewards the derivative.

---

## 6. Segmentation

| PSP | Segment | Default Action |
|---|---|---|
| `0–30` | **Low Potential** | Reactivation flow + restrict opportunity allocation |
| `30–60` | **Unclear / Developing** | Standard path, monitor monthly |
| `60–80` | **High Potential** | Increase opportunity flow, prioritize coaching |
| `80–100` | **Likely Future L6** | Fast-track candidate, mentor pairing, recognition |

---

## 7. Early Detection Heuristics (priority signal)

PSM elevates these patterns above raw PSP for human review:

| Pattern | Meaning |
|---|---|
| High EV + High ED + Medium SS (from OSS) | **Pre-result winner** — invest now |
| High EV + High ED + Low FR | **Workhorse, no growth** — coach or cap |
| Low EV + Low ED + High SS | **Plateau risk** — talented but coasting |
| Rising OT + Low absolute OSS | **Late bloomer** — protect from premature judgement |

These flags surface in the Admin view but never auto-trigger promotions.

---

## 8. OSS × PSM Decision Matrix

The combination is the actual decision signal. Used by Control Engine and (future) Autonomous Promotion Engine.

| OSS | PSP | Label | Action |
|---|---|---|---|
| High | High | **Scale** | budget_signal: scale_up + leadership track |
| Low | High | **Invest** | coaching, opportunity boost, mentor pairing |
| High | Low | **Monitor** | maintain, watch for decay |
| Low | Low | **Deprioritize** | reactivation flow → exit if no recovery |

This matrix is the only place where PSM influences resource allocation directly.

---

## 9. Recomputation Cadence

| Component | Window | Recompute |
|---|---|---|
| EV | first 30d behavior + rolling 30d | daily |
| ED | rolling 14d | every 6h |
| FR | rolling 30d, event-driven | on each feedback event + daily reconcile |
| OT | rolling 4w, slope | daily |
| PSP (composite) | — | daily |

Each recomputation emits `psp_recomputed { user_id, psp, components, segment, level, timestamp }` — immutable.

---

## 10. Control Engine Integration

PSM feeds the [Control Engine](./control-engine-bottleneck-system.md) as a **future-quality signal**:

- `PSP > 75` → eligible for `budget_signal: scale_up` even if current OSS is mid-band.
- `PSP < 30` sustained ≥ 14d → `priority_flag` + reactivation lever.
- Operator-level bottleneck reports include the cohort PSP distribution to distinguish "weak operators today" from "weak pipeline tomorrow".

PSM never invents new actions — it only enriches the 5 allowed Control Engine action types.

---

## 11. Communication Integration

PSP transitions can trigger flows from the existing [Workflow Registry](./communication-engine-workflows.md). PSM does **not** create new workflows.

| Trigger | Existing Workflow |
|---|---|
| Entry into `Low Potential` (PSP crosses below 30) | `WF_VAL_INACTIVE_7D_REACTIVATION` |
| Entry into `Likely Future L6` (PSP crosses above 80) | `WF_VAL_PSP_HIGH_POTENTIAL_RECOGNITION` (reserved) |
| Sustained High Potential ≥ 14d | mentor-pairing flow (reserved: `WF_VAL_MENTOR_PAIR_PROPOSE`) |

Reserved workflows are added to the registry only when activated; until then they are documented placeholders.

---

## 12. Admin & User View Contract

**Per-user card (admin):**
```
PSP:  78%   Segment: High Potential
EV:   85    ED: 80    FR: 72    OT: 75
Strength: Execution speed
Weakness: Feedback responsiveness
Suggested action: coaching focus
Cohort rank (level): 12 / 184
OSS × PSM: Invest  (OSS 52 / PSP 78)
```

**Visibility:**
- User: own PSP + components + suggested action + segment.
- L4+ peers: not visible (PSM is private to user + admin).
- Admin: all components, cohort distribution, override log.

---

## 13. Governance

1. **Auditability** — every recomputation, segment change, and admin override is logged.
2. **Versioning** — this spec is V1. Weight, signal-set, or cadence changes bump the version and emit a `psp_version` event per user on first recompute under the new version.
3. **No promotion bypass** — PSM proposes attention, never rank.
4. **Bias guard** — PSM inputs use only behavioral data already tracked. No demographics, no protected-class proxies, no manual tags.
5. **Explainability** — every PSP exposes its component breakdown to the user it describes.

---

## 14. Final System Effect

| Capability | Owner |
|---|---|
| Behavioral execution | Communication Workflows V1 |
| KPI bottleneck detection | Control Engine V1 |
| Present performance measurement | OSS V1 |
| **Future performance prediction** | **PSM V1 (this doc)** |

ETC now distinguishes **who performs** (OSS) from **who will perform** (PSM). Most systems reward visible results. ETC also rewards the invisible signals of future results.

---

## 15. Cross-References

- 5-block model: [`system-architecture-canonical.md`](./system-architecture-canonical.md)
- Behavioral spec: [`communication-engine-blueprint.md`](./communication-engine-blueprint.md)
- Deterministic workflows: [`communication-engine-workflows.md`](./communication-engine-workflows.md)
- Closed-loop optimizer: [`control-engine-bottleneck-system.md`](./control-engine-bottleneck-system.md)
- Present-performance measurement: [`operator-scoring-system.md`](./operator-scoring-system.md)
- Role hierarchy: `mem://governance/role-definitions-v11`
- Mentor pairing logic: `mem://features/mentor-system-logic-and-performance`
- Event taxonomy: `mem://technical/master-integration-event-architecture`

*Canonical V1. Update only via explicit architectural review.*
