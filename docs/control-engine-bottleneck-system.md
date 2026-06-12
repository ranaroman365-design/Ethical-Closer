# ETC Control Engine — Bottleneck Detection & Auto-Action System (V1)

> **Status:** Canonical execution spec for the Control Engine (Block 4 of the [5-Block Architecture](./system-architecture-canonical.md)).
>
> **Doctrine:** ETC V6.1. Lovable = source of truth. The Control Engine is the closed-loop optimizer that turns the deterministic [Workflow Registry](./communication-engine-workflows.md) into a self-correcting machine.
>
> **Scope:** Semantic + governance only. Does NOT modify code, schema, or any deployed automation. No new workflows are created at runtime.

---

## 0. Hard Rules (non-negotiable)

1. **No dynamic workflow creation.** The Control Engine selects from the existing registry only.
2. **No logic mutation.** Workflows remain deterministic — only intensity/priority/flag state changes.
3. **No AI guessing.** Bottleneck selection is a pure mathematical operation against baselines.
4. **One bottleneck at a time per scope.** Largest negative deviation wins. Ties broken by Tier (Tier 1 > Tier 2 > Tier 3).
5. **All actions are reversible** — if KPI recovers, the engine deactivates the lever.
6. **Every detection + action is logged** as an immutable event for audit.

---

## Core Principle

```
Measure → Compare → Identify Constraint → Activate Lever
```

---

## 1. KPI Monitoring Layer

The Control Engine continuously tracks three KPI groups:

### Acquisition
| KPI | Source |
|---|---|
| LP Conversion Rate | `funnel_events_v2` (`lp_view` → `lead_created`) |
| Quiz Completion Rate | `lead_created` → `quiz_completed` |
| Booking Rate | `quiz_completed` → `booked` |
| Show Rate | `booked` → `call_started` |
| Close Rate | `call_completed` → `deal_won` |
| Revenue per Lead | revenue ÷ leads |

### Value
| KPI | Source |
|---|---|
| L1 Activation Rate | `deal_won` → `level_up_L1` (or `first_action_completed`) |
| L2 → L4 Conversion | `level_up_L2` → `level_up_L4` |
| Revenue per Operator | aggregated by `operator_id` |
| Retention Rate | `user_active` cohort persistence |

### Operator (L6)
Revenue, Close Rate, Show Rate, Booking Rate, Traffic Volume, CAC, Profit — all per `operator_id`.

---

## 2. Baseline System

For every tracked KPI the engine maintains:

| Baseline | Window | Use |
|---|---|---|
| `current` | last 24h | live value |
| `avg_7d` | rolling 7-day | short-term trend |
| `avg_30d` | rolling 30-day | medium-term trend |
| `benchmark` | system-defined target | absolute reference |
| `operator_benchmark` | percentile across active operators | relative reference |

**Example record:**
```
KPI: show_rate
current: 52%
avg_7d: 61%
avg_30d: 63%
benchmark: 65%
operator_benchmark_p50: 60%
```

---

## 3. Bottleneck Detection Logic

### Step 1 — Compute deviation
For each KPI:
```
Δ = current − benchmark        (absolute)
Δ% = (current − benchmark) / benchmark   (relative)
```

### Step 2 — Select primary bottleneck
The KPI with the **largest negative Δ%** within the active scope is the bottleneck. Ties resolve by Tier rank (see [Workflow Registry §6](./communication-engine-workflows.md)).

### Step 3 — Classify
| Class | Triggering KPIs |
|---|---|
| **A. Traffic** | LP Conv ↓, CAC ↑ |
| **B. Conversion** | Booking Rate ↓, Show Rate ↓ |
| **C. Sales** | Close Rate ↓ |
| **D. Activation** | L1 → L2 ↓ |
| **E. Retention** | Inactivity ↑ |

### Severity tiers
| Severity | Trigger |
|---|---|
| `info` | Δ% ∈ [−5%, 0%) |
| `warning` | Δ% ∈ [−15%, −5%) |
| `critical` | Δ% < −15% OR ≥3 KPIs in `warning` |

---

## 4. Auto-Action System

The engine may take **only** the following five action types. No others.

### Action 1 — Communication Intensification
Activates the `*_INTENSE` mode of an existing workflow. Intense mode = predefined extra steps already declared in the registry (extra SMS, WhatsApp escalation, tighter cadence). It does **not** invent new steps.

```
IF show_rate.Δ% < −10%
THEN activate WF_ACQ_BOOKED_SHOW_SEQUENCE [mode=INTENSE]
```

### Action 2 — Priority Flagging
Marks affected entities (leads, calls, operators) with a `priority_flag` consumed by dashboards. No communication side-effect.

### Action 3 — Operator Comparison Alert
When an operator's KPI < `operator_benchmark_p50 − 15%`, surface a comparison card with rank + gap. Read-only.

### Action 4 — Admin Alert
Emits a structured alert to the Admin Control Center:
```
⚠️ Bottleneck detected: <kpi>
Impact: <Δ%>
Class: <A–E>
Suggested lever: <workflow_id>
Scope: <global | operator:X>
```

### Action 5 — Budget Signal (future-ready, off by default)
Emits a `budget_signal` event (`scale_up` / `scale_down`) per operator. Consumed by the future Capital Allocation layer; the engine never mutates spend itself.

---

## 5. Bottleneck → Lever Mapping

| Bottleneck KPI | Primary Lever (Workflow) | Secondary Lever |
|---|---|---|
| LP Conversion ↓ | — (UX fix, not comms) | Admin Alert |
| Quiz Completion ↓ | `WF_ACQ_LEAD_CREATED_QUIZ_PUSH` | Admin Alert |
| Booking Rate ↓ | `WF_ACQ_QUIZ_COMPLETED_BOOKING_PUSH` | Admin Alert |
| Show Rate ↓ ⭐ | `WF_ACQ_BOOKED_SHOW_SEQUENCE` [INTENSE] | Operator Compare |
| Close Rate ↓ ⭐ | `WF_ACQ_CALL_COMPLETED_CLOSE_PUSH` [INTENSE] | Operator Compare |
| Rebooking ↓ | `WF_ACQ_NO_SHOW_RECOVERY` | Admin Alert |
| L1 Activation ↓ | `WF_VAL_DEAL_WON_ONBOARDING` | — |
| L1 → L2 ↓ | `WF_VAL_LEVEL_1_INACTIVE_ACTIVATION` | — |
| L2 → L4 ↓ | `WF_VAL_LEVEL_2_MONETIZATION_PUSH` | — |
| Retention ↓ | `WF_VAL_INACTIVE_7D_REACTIVATION` | — |

⭐ = Tier 1 (highest revenue impact).

---

## 6. Dashboard Output Contract

### Global view
```
Primary Bottleneck: Show Rate
Impact: −12%   Trend: ↓ (7d)
Lever active:  WF_ACQ_BOOKED_SHOW_SEQUENCE [INTENSE]
Severity:      warning
```

### Operator view
```
Operator: <name>
Strong:   Traffic, Booking
Weak:     Close Rate (−20% vs p50)
Bottleneck class: C — Sales Execution
Action:   priority_flag + operator_compare_alert
```

---

## 7. Execution Loop

```
User Behavior
   → Event (funnel_events_v2)
   → KPI Update (rolling baselines)
   → Control Engine Analysis (Δ% per KPI)
   → Bottleneck Detection (largest negative Δ%)
   → Auto-Action Trigger (1 of 5 action types)
   → Communication / Flag / Alert
   → New Behavior
   → loop
```

Loop cadence: ≤15 min for Tier 1 KPIs (Show, Close), ≤1h for Tier 2/3, daily for Value KPIs.

---

## 8. Governance

1. **Auditability** — every detection + action emits a `control_engine_event` with `{ kpi, current, benchmark, delta, action, scope, timestamp }`.
2. **Reversibility** — when a KPI recovers above benchmark for a full baseline window, the lever auto-deactivates.
3. **Single source** — bottleneck classifications and lever mappings live only in this doc + the Workflow Registry. No duplication.
4. **No silent escalation** — `critical` severity always emits an Admin Alert, never just a flag.

---

## 9. Final System State

After this layer:

| Capability | Status |
|---|---|
| Deterministic workflows | ✅ (Workflow Registry V1) |
| Event-driven communication | ✅ (Communication Blueprint) |
| KPI tracking | ✅ (this doc §1–2) |
| Bottleneck detection | ✅ (this doc §3) |
| Auto-response system | ✅ (this doc §4) |

ETC is now a **closed-loop optimization system**, not a CRM, funnel tool, or course platform.

---

## 10. Cross-References

- Architecture model: [`system-architecture-canonical.md`](./system-architecture-canonical.md)
- Behavioral spec: [`communication-engine-blueprint.md`](./communication-engine-blueprint.md)
- Deterministic workflows: [`communication-engine-workflows.md`](./communication-engine-workflows.md)
- V6.1 GHL execution lock: `mem://technical/ghl-integration-strategy-v6`
- Event idempotency: `mem://technical/event-idempotency-and-hygiene`
- Master event taxonomy: `mem://technical/master-integration-event-architecture`

*Canonical V1. Update only via explicit architectural review.*
