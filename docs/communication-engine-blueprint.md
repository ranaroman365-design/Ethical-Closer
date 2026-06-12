# ETC Communication Engine — Event → Action Blueprint

> **Status:** Canonical execution reference for the Communication Engine (Block 5 of the [5-Block Architecture](./system-architecture-canonical.md)).
>
> **Scope:** Semantic + behavioral specification. Defines every flow, trigger, sequence, channel, and KPI link. **Does not modify existing code, workflows, or schema.** Use this as the single source of truth when implementing or auditing any communication flow.

---

## 0. Operating Rules

1. **Every communication is triggered by an explicit canonical event.** No time-based broadcasts. No manual sends inside the engine.
2. **Every sequence is tied to exactly one primary KPI.** If a flow does not move a KPI, it does not exist.
3. **No random nurturing.** Communication = behavioral state-machine enforcement.
4. **No channel without purpose.** Each step declares: channel, urgency tier, expected user action.
5. **Idempotency:** every send keys off `(event_id, flow_id, step_id)` to prevent duplicate sends on retries.
6. **Lovable owns the brain.** GHL (when used) is a delivery substrate only. V6.1 lock preserved.

---

## Core Logic

```
Event → Trigger → Sequence → Channel → User Action → New Event
```

---

## 1. Acquisition Engine — Communication Flows

### Flow A1 — Lead → Quiz Completion
- **Trigger:** `lead_created` OR `lp_viewed_no_quiz`
- **KPI:** Quiz Completion Rate
- **Sequence:**
  | Offset | Channel | Purpose |
  |---|---|---|
  | T+5min | Email | "Finish your application" — CTA: Resume quiz |
  | T+2h | SMS | Short urgency nudge |
  | T+24h | Email | Social proof + reminder |
- **Exit condition:** `quiz_completed` event fires.

### Flow A2 — Quiz → Booking
- **Trigger:** `quiz_completed`
- **KPI:** Booking Rate
- **Sequence:**
  | Offset | Channel | Purpose |
  |---|---|---|
  | Instant | Email | "You are pre-qualified" — CTA: Book call |
  | T+1h | SMS | Urgency ("limited slots") |
  | T+24h | Email | Consequence framing (missed opportunity) |
- **Exit condition:** `booked` event fires.

### Flow A3 — Booking → Show (CRITICAL — highest leverage)
- **Trigger:** `booked`
- **KPI:** Show Rate
- **Sequence (multi-channel stacked):**
  | Offset | Channel | Purpose |
  |---|---|---|
  | Instant | Email | Confirmation + calendar link |
  | T+1h | SMS | Confirmation reinforcement |
  | T-24h | Email | Expectation setting ("what will happen") |
  | T-2h | SMS | Reminder |
  | T-10min | SMS / WhatsApp | Final push |
- **Exit condition:** `call_started` event fires.

### Flow A4 — No-Show Recovery
- **Trigger:** `no_show`
- **KPI:** Rebooking Rate
- **Sequence:**
  | Offset | Channel | Purpose |
  |---|---|---|
  | T+10min | SMS | "You missed your call" |
  | T+1h | Email | Rebooking link |
  | T+24h | SMS | Final chance framing |
- **Exit condition:** `rebooked` event fires.

### Flow A5 — Post-Call → Close
- **Trigger:** `call_completed` AND NOT `deal_won`
- **KPI:** Close Rate
- **Sequence:**
  | Offset | Channel | Purpose |
  |---|---|---|
  | T+1h | Email | Recap + offer clarity |
  | T+24h | SMS | Objection handling |
  | T+48h | Email | Urgency / deadline |
- **Exit condition:** `deal_won` OR `deal_lost` event fires.

---

## 2. Value Engine — Communication Flows

### Flow V1 — Onboarding (L0 → L1)
- **Trigger:** `deal_won`
- **KPI:** Activation Rate
- **Sequence:**
  | Offset | Channel | Purpose |
  |---|---|---|
  | Instant | Email | Welcome + next step |
  | T+1h | In-app | Onboarding checklist |
  | T+24h | Email | "Start your first task" |
- **Exit condition:** `first_action_completed` event fires.

### Flow V2 — Activation (L1 → L2)
- **Trigger:** `level = L1` AND no activity (rolling)
- **KPI:** L1 → L2 Conversion
- **Sequence (daily while inactive):**
  | Channel | Purpose |
  |---|---|
  | In-app | Task reminder |
  | Email | "Complete your first calls" |
- **Exit condition:** `level_up` to L2.

### Flow V3 — Monetization (L2 → L4)
- **Trigger:** `level = L2`
- **KPI:** Revenue Generation
- **Sequence:**
  | Channel | Purpose |
  |---|---|
  | Email | "Start closing" |
  | In-app | Call targets |
  | SMS (optional) | Performance push |
- **Exit condition:** `level_up` to L4.

### Flow V4 — Operator Enablement (L4 → L6)
- **Trigger:** `level >= L4`
- **KPI:** Revenue / Performance
- **Sequence:**
  | Cadence | Channel | Purpose |
  |---|---|---|
  | Weekly | Email | KPI report |
  | Real-time | In-app | Performance dashboard alerts |
  | On threshold | SMS | Critical KPI drop |
- **Exit condition:** `level_up` to L6 (operator status).

### Flow V5 — Inactivity Recovery
- **Trigger:** `inactive_3d` OR `inactive_7d`
- **KPI:** Retention
- **Sequence:**
  | Offset | Channel | Purpose |
  |---|---|---|
  | 3 days | Email | Reminder |
  | 7 days | SMS | Reactivation push |
- **Exit condition:** any `user_active` event.

---

## 3. Channel Stacking Logic

### Priority Order
1. **SMS** — highest attention
2. **WhatsApp**
3. **Email**
4. **In-app**

### Rules
| Urgency | Channel mix |
|---|---|
| High | SMS / WhatsApp |
| Medium | Email + SMS |
| Low | Email only |
| Platform behavior | In-app |

---

## 4. KPI → Communication Mapping (Auto-Optimization)

When the Control Engine detects a KPI drop, it triggers reinforcement of the corresponding flow:

| KPI Drop | Reinforce |
|---|---|
| Show Rate ↓ | Flow A3 |
| Close Rate ↓ | Flow A5 |
| Booking Rate ↓ | Flow A2 |
| Quiz CR ↓ | Flow A1 |
| Rebooking ↓ | Flow A4 |
| L1 Activation ↓ | Flow V2 |
| Retention ↓ | Flow V5 |
| L2→L4 conversion ↓ | Flow V3 |

---

## 5. Global Priority Matrix

### Tier 1 — Highest revenue impact
- Booking → Show (A3)
- Call → Close (A5)

### Tier 2 — High impact
- Quiz → Booking (A2)
- L1 → L2 Activation (V2)

### Tier 3 — Optimization
- Lead → Quiz (A1)
- No-show recovery (A4)
- Retention flows (V5)

---

## 6. Lovable Implementation Constraints

Lovable MUST guarantee:
1. Every canonical event maps to **at most one** primary flow (no conflicting triggers)
2. Every flow declares: `{ trigger, sequence, channels, primary_kpi, exit_condition }`
3. **No orphan events** — any new event requires either a flow or an explicit "no-comms" declaration
4. **No duplicate triggers** — flows are mutually exclusive on their trigger
5. Each step is idempotent on `(event_id, flow_id, step_id)`
6. Flow definitions live in Lovable; GHL only executes the resulting send

---

## 7. System View

```
                  ┌─────────────────────────────────┐
                  │   COMMUNICATION ENGINE          │
                  │   (Behavior Enforcement Layer)  │
                  └────┬───────────┬──────────┬─────┘
                       │           │          │
              drives   │           │ drives   │ optimized by
              conversion│          │progression│
                       ▼           ▼          ▼
              ┌──────────────┐ ┌────────┐ ┌──────────┐
              │ ACQUISITION  │ │ VALUE  │ │ CONTROL  │
              │   ENGINE     │ │ ENGINE │ │ ENGINE   │
              └──────────────┘ └────────┘ └──────────┘
```

---

## 8. Final Principle

> The Communication Engine does not "send messages."
> It **programs human behavior along the funnel and career system.**

If a proposed message does not move a user from one state to the next, it does not belong in this engine.

---

## 9. Cross-References

- Architecture model: [`system-architecture-canonical.md`](./system-architecture-canonical.md)
- V6.1 GHL execution lock: see `mem://technical/ghl-integration-strategy-v6`
- Event idempotency: see `mem://technical/event-idempotency-and-hygiene`
- Master event taxonomy: see `mem://technical/master-integration-event-architecture`

*Canonical version. Update only via explicit architectural review.*
