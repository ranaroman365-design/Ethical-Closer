# ETC Operator Scoring System (OSS) — Canonical V1

> **Status:** Canonical scoring spec for the Value Engine (Block 2 of the [5-Block Architecture](./system-architecture-canonical.md)).
>
> **Doctrine:** ETC V6.1. Lovable = source of truth. OSS is the deterministic measurement layer that ranks operators (L1–L8), drives promotions, and feeds the [Control Engine](./control-engine-bottleneck-system.md).
>
> **Scope:** Semantic + governance only. Defines the formula, weights, thresholds, and integration contracts. No code, schema, or live data is modified by registering this spec.

---

## 0. Hard Rules (non-negotiable)

1. **Fully deterministic.** No manual scoring, no subjective inputs, no hidden weights.
2. **Event/KPI-sourced only.** All inputs trace back to `funnel_events_v2` or already-tracked KPIs.
3. **Transparent per level.** Every user can see their own component breakdown.
4. **Single formula, level-weighted.** One scoring function; only weights vary by level band.
5. **No score override** without an immutable audit entry (admin override = exception, not norm).
6. **Recomputed on a fixed cadence** (see §11). No on-demand mutation outside the loop.

---

## 1. Score Definition

Every user in L1–L8 gets one **Operator Score (OSS) ∈ [0, 100]**, composed of 4 components:

| Component | Symbol | Measures |
|---|---|---|
| Activity Score | `AS` | Output volume |
| Skill Score | `SS` | Capability / quality |
| Revenue Score | `RS` | Economic impact |
| Consistency Score | `CS` | Stability over time |

```
OSS = AS·w₁ + SS·w₂ + RS·w₃ + CS·w₄        where w₁+w₂+w₃+w₄ = 1
```

Each component is itself normalized to `[0, 100]` (see §2–5).

---

## 2. Activity Score (AS)

**Purpose:** measures output volume in the last rolling 7 days.

**Inputs (from `funnel_events_v2` + activity tables):**
- `calls_completed_7d`
- `tasks_completed_7d`
- `platform_actions_7d` (logins, workspace events)
- `training_engagement_7d` (modules touched, simulator runs)

**Normalization:**
```
AS = clamp( (activity_7d / level_benchmark_activity_7d) · 100, 0, 100 )
```
`level_benchmark_activity_7d` = p50 of active users in the same level band.

**Bands:** `0–30` inactive · `30–70` normal · `70–100` high output.

---

## 3. Skill Score (SS)

**Purpose:** measures capability and quality of execution.

**Inputs:**
- `close_rate` (closers) or `show_rate + handover_rate + qualification_accuracy` (setters)
- Call rating averages (when present)
- Simulation results (`simulations.score`)

**Normalization (closer):**
```
SS = clamp( (close_rate / level_benchmark_close_rate) · 100, 0, 100 )
```
**Normalization (setter):** weighted blend of show / handover / qualification, same shape.

Low → training trigger. High → quality operator.

---

## 4. Revenue Score (RS)

**Purpose:** measures economic impact over the last rolling 30 days.

**Inputs:**
- `revenue_30d` (closed deals attributed to user)
- `deals_closed_30d`
- System contribution (commissions paid)

**Normalization (peer-relative):**
```
RS = clamp( percentile_rank(revenue_30d, peer_set) · 100, 0, 100 )
```
`peer_set` = active users in the same level band.

**Weight intent:** core driver from L4 upward; suppressed for L1–L2 (still learning).

---

## 5. Consistency Score (CS)

**Purpose:** rewards stability and reliability.

**Inputs:**
- Variance of weekly activity over last 8 weeks
- KPI stability (rolling stdev of close/show rate)
- Retention behavior (no >7d inactivity gaps)

**Normalization (inverse volatility):**
```
CS = clamp( 100 − scaled_volatility(activity_8w, kpis_8w), 0, 100 )
```

High = reliable. Low = inconsistent / risky.

---

## 6. Level-Weighted Combination

| Level Band | Phase | w₁ AS | w₂ SS | w₃ RS | w₄ CS |
|---|---|---|---|---|---|
| **L1–L2** | Learning | 40% | 30% | 10% | 20% |
| **L3–L4** | Execution | 25% | 35% | 25% | 15% |
| **L5–L6** | Operator | 15% | 25% | 40% | 20% |
| **L7–L8** | Leadership | 10% | 20% | 40% | 30% |

Weights are canonical. Any change requires architectural review + version bump.

---

## 7. Score Interpretation

| Range | Label | Meaning |
|---|---|---|
| `0–40` | **At Risk** | reactivation / retraining |
| `40–60` | **Developing** | expected mid-band |
| `60–80` | **Strong** | promotion-eligible |
| `80–100` | **Elite** | scaling candidate |

---

## 8. Ranking System

The system maintains three ranking views:

1. **Global Ranking** — all operators sorted by OSS.
2. **Level Ranking** — within-level comparison (fairer for promotion logic).
3. **Operator Leaderboard** — visible to L4+ and Admin only. Lower levels see only their own score.

---

## 9. Promotion Logic

Promotion = **OSS threshold** AND **band-specific gate** (already defined in `mem://governance/role-definitions-v11`).

| Transition | OSS gate | Additional gate |
|---|---|---|
| L1 → L2 | OSS > 60 | activity threshold met |
| L2 → L4 | OSS > 70 | revenue threshold met |
| L4 → L6 | OSS > 80 | high CS + consistency window ≥ 8w |
| L6 → L7 | OSS > 85 | leadership criteria (separate doc) |

Promotions are **proposed** by OSS, **confirmed** by the existing role/promotion engine. OSS does not bypass approval flows.

---

## 10. Control Engine Integration

OSS feeds the [Control Engine](./control-engine-bottleneck-system.md) as a **node-quality signal**:

- Low OSS → flagged as weak node → eligible for `priority_flag` + reactivation lever.
- High OSS → marked as scaling candidate → eligible for `budget_signal: scale_up` (future Capital layer).
- Operator-level bottleneck classification (Class C — Sales) cross-references low SS / RS to localize the problem.

OSS never invents new actions; it only enriches the existing 5 allowed action types.

---

## 11. Recomputation Cadence

| Component | Window | Recompute |
|---|---|---|
| AS | 7d rolling | every 1h |
| SS | 30d rolling | every 6h |
| RS | 30d rolling | every 6h |
| CS | 8w rolling | daily |
| OSS (composite) | — | every 1h (cheapest of the above changed) |

All recomputations emit a `oss_recomputed` event with `{ user_id, oss, components, level_band, timestamp }`. Immutable.

---

## 12. Communication Integration

OSS state changes can trigger flows from the [Workflow Registry](./communication-engine-workflows.md). It does **not** create new workflows.

| Trigger | Existing Workflow |
|---|---|
| `oss < 40` (transition into At Risk) | `WF_VAL_INACTIVE_7D_REACTIVATION` |
| `oss > 80` (transition into Elite) | recognition flow (registry entry to be reserved: `WF_VAL_OSS_ELITE_RECOGNITION`) |
| Promotion threshold crossed | `WF_VAL_LEVEL_<n>_*` flows |

---

## 13. Capital Allocation (future-ready, off by default)

| Cohort | Signal |
|---|---|
| Top 20% OSS within level | `budget_signal: scale_up` |
| Bottom 20% OSS within level | `budget_signal: restrict_or_retrain` |

Consumed by the future Capital Allocation layer. OSS itself never mutates spend.

---

## 14. Admin & User View Contract

**Per-user card:**
```
OSS:  78    Band: Strong
AS:   70    SS: 82    RS: 75    CS: 85
Strength: Skill
Weakness: Activity
Suggested action: increase call volume
Level: L4   Rank in level: 7 / 42
```

**Visibility:**
- User: own score + components + suggested action.
- L4+ peers: leaderboard names + scores within level.
- Admin: all components, all users, override log.

---

## 15. Governance

1. **Auditability** — every recomputation, override, and promotion suggestion is logged.
2. **Versioning** — this spec is V1. Weight or formula changes bump the version and write a `oss_version` event per user on first recompute under the new version.
3. **Reversibility** — admin overrides expire after 30 days unless renewed.
4. **No silent thresholds** — all bands and weights live only here. No duplication in code.

---

## 16. Final System Effect

| Capability | Status |
|---|---|
| Deterministic workflows | ✅ Workflow Registry V1 |
| Event-driven communication | ✅ Communication Blueprint |
| KPI tracking + bottleneck detection | ✅ Control Engine V1 |
| Operator measurement & ranking | ✅ OSS V1 (this doc) |

ETC is now a **meritocratic, data-driven performance economy**: status = performance, growth = measurable, success = predictable.

---

## 17. Cross-References

- 5-block model: [`system-architecture-canonical.md`](./system-architecture-canonical.md)
- Behavioral spec: [`communication-engine-blueprint.md`](./communication-engine-blueprint.md)
- Deterministic workflows: [`communication-engine-workflows.md`](./communication-engine-workflows.md)
- Closed-loop optimizer: [`control-engine-bottleneck-system.md`](./control-engine-bottleneck-system.md)
- Role hierarchy: `mem://governance/role-definitions-v11`
- Promotion engine: `mem://features/placement-engine`
- Event taxonomy: `mem://technical/master-integration-event-architecture`
- Idempotency: `mem://technical/event-idempotency-and-hygiene`

*Canonical V1. Update only via explicit architectural review.*
