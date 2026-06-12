# ETC Communication Engine — Canonical Workflow Specification (V1)

> **Status:** Execution-grade workflow registry. Locks every flow defined in [`communication-engine-blueprint.md`](./communication-engine-blueprint.md) into deterministic 1-event → 1-workflow → 1-outcome contracts.
>
> **Doctrine:** ETC V6.1. Lovable = source of truth. GHL (when present) = dumb delivery substrate.
>
> **Scope:** Semantic + governance only. Does NOT modify code, schema, the existing 17 V6.1 workflows, or any deployed automation.

---

## 0. Hard Rules (non-negotiable)

1. **1 Event = 1 Workflow = 1 Outcome.** No multi-trigger workflows.
2. **No conditional branching inside a workflow.** No stage-based logic. No interpretation.
3. **No duplicated workflows.** No event reused across flows with different meaning.
4. Each workflow declares: `{ trigger_event, fixed_sequence, primary_kpi, channels, idempotency_key }`.
5. Idempotency key: `(event_id, workflow_id, step_id)`.
6. Every event must be logged in `funnel_events_v2` (or the canonical event store) and is **immutable**.

---

## 1. Naming System (strict)

```
WF_[ENGINE]_[EVENT]_[PURPOSE]
```

- `ENGINE` ∈ { `ACQ`, `VAL`, `CTRL` }
- `EVENT` = canonical trigger event name (uppercased)
- `PURPOSE` = the KPI the workflow moves (uppercased, ≤3 tokens)

Any new workflow that does not match this pattern is rejected at architectural review.

---

## 2. Acquisition Workflows

| Workflow ID | Trigger Event | Primary KPI | Fixed Sequence |
|---|---|---|---|
| `WF_ACQ_LEAD_CREATED_QUIZ_PUSH` | `lead_created` | Quiz Completion Rate | T+5m Email → T+2h SMS → T+24h Email |
| `WF_ACQ_QUIZ_COMPLETED_BOOKING_PUSH` | `quiz_completed` | Booking Rate | Instant Email → T+1h SMS → T+24h Email |
| `WF_ACQ_BOOKED_SHOW_SEQUENCE` ⭐ | `booked` | Show Rate (Tier 1) | Instant Email → T+1h SMS → T-24h Email → T-2h SMS → T-10m SMS/WA |
| `WF_ACQ_NO_SHOW_RECOVERY` | `no_show` | Rebooking Rate | T+10m SMS → T+1h Email → T+24h SMS |
| `WF_ACQ_CALL_COMPLETED_CLOSE_PUSH` ⭐ | `call_completed` | Close Rate (Tier 1) | T+1h Email → T+24h SMS → T+48h Email |

⭐ = Tier 1 (highest revenue impact).

**Exit conditions** (each workflow halts immediately when the next canonical event fires):
- `WF_ACQ_LEAD_CREATED_QUIZ_PUSH` → `quiz_completed`
- `WF_ACQ_QUIZ_COMPLETED_BOOKING_PUSH` → `booked`
- `WF_ACQ_BOOKED_SHOW_SEQUENCE` → `call_started`
- `WF_ACQ_NO_SHOW_RECOVERY` → `rebooked`
- `WF_ACQ_CALL_COMPLETED_CLOSE_PUSH` → `deal_won` OR `deal_lost`

---

## 3. Value Engine Workflows

| Workflow ID | Trigger Event | Primary KPI | Fixed Sequence |
|---|---|---|---|
| `WF_VAL_DEAL_WON_ONBOARDING` | `deal_won` | Activation Rate | Instant Email → T+1h In-app → T+24h Email |
| `WF_VAL_LEVEL_1_INACTIVE_ACTIVATION` | `inactive_3d` (scope: L1) | L1 → L2 Conversion | Instant In-app → T+2h Email |
| `WF_VAL_LEVEL_2_MONETIZATION_PUSH` | `level_up_L2` | Revenue Generation | Instant Email → T+24h In-app |
| `WF_VAL_LEVEL_4_OPERATOR_ENABLEMENT` | `level_up_L4` | Performance Scaling | Instant Email → T+24h In-app |
| `WF_VAL_INACTIVE_7D_REACTIVATION` | `inactive_7d` | Retention | Instant Email → T+2h SMS |

**Scope rule:** Workflows scoped to a level (e.g. L1) MUST verify the user's current level at trigger time and exit if level no longer matches.

**Exit conditions:**
- `WF_VAL_DEAL_WON_ONBOARDING` → `first_action_completed`
- `WF_VAL_LEVEL_1_INACTIVE_ACTIVATION` → `level_up_L2` OR any `user_active`
- `WF_VAL_LEVEL_2_MONETIZATION_PUSH` → `level_up_L4`
- `WF_VAL_LEVEL_4_OPERATOR_ENABLEMENT` → `level_up_L6`
- `WF_VAL_INACTIVE_7D_REACTIVATION` → any `user_active`

---

## 4. Channel Execution Standard

| Use Case | Channel |
|---|---|
| Time-critical (T-10m, T+10m) | SMS / WhatsApp |
| Reinforcement / framing | Email |
| Behavioral guidance / platform state | In-app |
| High-value moment (e.g. Show, Close) | Multi-channel stacking |

**Priority order (when stacking):** SMS > WhatsApp > Email > In-app.

---

## 5. Event Governance

Lovable MUST guarantee:

1. **Single ownership** — each canonical event triggers exactly 1 workflow. A registry (`workflow_registry`) holds the event → workflow mapping; conflicts are rejected at registration time.
2. **Immutability** — events in `funnel_events_v2` are append-only.
3. **No reinterpretation** — an event has the same meaning system-wide. If two flows need different semantics, two distinct events must exist.
4. **No orphan events** — every emitted event resolves to either a registered workflow or an explicit `no_op` declaration.

---

## 6. KPI → Workflow Mapping (Auto-Optimization Hook)

| KPI Drop | Workflow to Reinforce |
|---|---|
| Show Rate ↓ | `WF_ACQ_BOOKED_SHOW_SEQUENCE` |
| Close Rate ↓ | `WF_ACQ_CALL_COMPLETED_CLOSE_PUSH` |
| Booking Rate ↓ | `WF_ACQ_QUIZ_COMPLETED_BOOKING_PUSH` |
| Quiz CR ↓ | `WF_ACQ_LEAD_CREATED_QUIZ_PUSH` |
| Rebooking ↓ | `WF_ACQ_NO_SHOW_RECOVERY` |
| Activation ↓ | `WF_VAL_DEAL_WON_ONBOARDING` |
| L1 → L2 ↓ | `WF_VAL_LEVEL_1_INACTIVE_ACTIVATION` |
| Retention ↓ | `WF_VAL_INACTIVE_7D_REACTIVATION` |

---

## 7. System Integration

```
            ┌────────────────────────┐
            │  COMMUNICATION ENGINE  │
            │  (workflow registry)   │
            └─────┬───────┬──────┬───┘
                  │       │      │
        triggers  │       │      │ feedback
                  ▼       ▼      ▼
            ACQUISITION  VALUE  CONTROL
              ENGINE    ENGINE  ENGINE
```

- **Acquisition Engine** emits: `lead_created`, `quiz_completed`, `booked`, `no_show`, `call_started`, `call_completed`, `deal_won`, `deal_lost`, `rebooked`.
- **Value Engine** emits: `level_up_L*`, `first_action_completed`, `inactive_3d`, `inactive_7d`, `user_active`.
- **Control Engine** consumes KPIs and may request reinforcement of a workflow (no new logic injected — only frequency / urgency adjustment within the existing fixed sequence).

---

## 8. Cross-References

- Architecture: [`system-architecture-canonical.md`](./system-architecture-canonical.md)
- Behavioral spec: [`communication-engine-blueprint.md`](./communication-engine-blueprint.md)
- V6.1 GHL execution lock: `mem://technical/ghl-integration-strategy-v6`
- Event idempotency: `mem://technical/event-idempotency-and-hygiene`
- Master event taxonomy: `mem://technical/master-integration-event-architecture`

---

## 9. Final Principle

> Every user action → triggers exactly one workflow.
> Every KPI → has exactly one communication lever.
> Every performance drop → is traceable to one workflow.

Not a CRM. Not a funnel tool. Not a messaging system.
**A deterministic behavioral machine.**

*Canonical V1. Update only via explicit architectural review.*
