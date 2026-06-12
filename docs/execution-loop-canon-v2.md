# Execution Loop Canon v2 — Institutional Grade

**Status:** Installed · 2026-04-23
**Type:** Behavioral engine canon (orchestration across the 6 blocks — NOT a 7th block)
**Source of truth:** `src/lib/execution-loop-canon.ts`
**Constitution:** governed by `src/lib/canon-constitution.ts` (supreme rule)
**Block:** spans Foundation/Acquisition/Conversion/Value/Intelligence/Governance dynamically

---

## 0. Why v2

v1 closed the conceptual loop. v2 closes the five remaining gaps:

1. **Communication split** — Trigger / Message / Channel are now separate concerns.
2. **Governance concrete** — fixed decision set; `ignore` must be explicit.
3. **Failure / Recovery** — first-class layer with capped attempts + escalation.
4. **Priority rule** — deterministic dominant-action picker, 4 ranked dimensions.
5. **Time layer** — every loop declares `immediate | short_term | long_term`.

---

## 1. Final Loop Model

```
Trigger
 └─► Communication (Trigger · Message · Channel)
      └─► Action (exactly one type)
           └─► Measurement (canonical_event | get_kpi_truth | state_transition)
                └─► Governance Decision (prioritize · reassign · intervene · escalate · reinforce · ignore)
                     └─► Recovery (capped attempts → escalate)
                          └─► next Trigger
```

**Rule:** no meaningful event ends without a defined action path, a measurable outcome, and a next-state.

---

## 2. Communication Split (the critical fix)

| Layer | Defines | Examples |
|---|---|---|
| **Trigger** | WHEN | quiz stall 30m · T-24h before call · KPI floor breach 3d · inactivity 7d |
| **Message Logic** | WHAT (one purpose, one behavior, one CTA) | reminder · reactivation · urgency · correction · encouragement · escalation |
| **Channel Delivery** | WHERE (Lovable=brain, GHL=arms) | email · sms · whatsapp · in_app · mentor_intervention · admin_escalation |

A single `MessageSpec` may have **only one** `purpose` and **only one** `primary_cta`. Channel cascades via `fallback`.

---

## 3. Action Engine

Allowed `ActionType` (one per communication):
`book` · `show_up` · `complete_task` · `review_call` · `respond` · `upgrade` · `re_engage` · `escalate`

Each action declares: `success_condition`, `failure_condition`, `measurement_source ∈ {canonical_event, get_kpi_truth, state_transition}`.

---

## 4. Performance Map

Every action maps to either a **canonical event** (`canonical-events.ts`) or a **KPI** served by `get_kpi_truth()`. No silent actions.

---

## 5. Governance Decision Map

Fixed decision set: `prioritize · reassign · intervene · escalate · reinforce · ignore`.
**`ignore` must be explicit, never accidental.**

| Signal | Default decision |
|---|---|
| `kpi_gap` | intervene |
| `inactivity` | reinforce → escalate |
| `conversion_drop` | prioritize |
| `no_show` | intervene (recovery owns it first) |
| `non_compliance` | escalate |
| `on_track` | ignore (explicit) |

---

## 6. Failure / Recovery Map

| Failure | Recovery | Max attempts | Escalate after |
|---|---|---|---|
| `no_response` | `reminder` | 2 | `ignore` |
| `no_booking` | `re_entry_path` | 2 | `ignore` |
| `no_show` | `rescue_flow` | 3 | `escalate` |
| `task_not_completed` | `task_simplification` | 2 | `mentor_intervention` |
| `kpi_below_threshold` | `mentor_intervention` | 2 | `escalate` (director) |
| `activity_drop` | `mentor_intervention` | 2 | `escalate` |

Recovery is a **first-class loop** (`LoopMode = 'recovery'`), not a side-effect.

---

## 7. Priority Logic — one dominant next action

Ranked dimensions (lower index wins, deterministic tiebreaker):
1. `revenue_impact`
2. `diagnosis_confidence`
3. `urgency`
4. `execution_speed`

Implementation: `pickDominant(candidates)` in `execution-loop-canon.ts`. The system MUST surface only one primary lever; lower-priority noise is suppressed.

---

## 8. Time Horizon Map

| Horizon | Range | Examples |
|---|---|---|
| `immediate` | 0..1h | quiz rescue · result-page CTA · booking confirmation |
| `short_term` | 1h..14d | follow-ups · reminders · daily execution · no-show recovery |
| `long_term` | 14d+ | progression · retention · KPI stabilization |

Bounds in `TIME_HORIZON_BOUNDS`. Every loop declares `time_horizon`.

---

## 9. Loop Modes (4 canonical)

| Mode | Path |
|---|---|
| `conversion` | lead → quiz → booking → show → close |
| `retention` | activity → task → KPI progression → milestone |
| `recovery` | drop / failure → rescue → re-entry |
| `performance` | KPI gap → feedback → task → improved KPI |

Seeded loops in `EXECUTION_LOOPS`:
- `LOOP_CONV_QUIZ_RESCUE` (immediate)
- `LOOP_CONV_BOOKING_TO_SHOW` (short_term)
- `LOOP_RET_DAILY_EXEC` (short_term)
- `LOOP_REC_NO_SHOW_REBOOK` (short_term)
- `LOOP_PERF_KPI_GAP_FEEDBACK` (long_term)

---

## 10. Block Integration

Execution Loop v2 orchestrates **across** the 6 blocks; it is not a new block.

| Block | Role in the loop |
|---|---|
| Foundation | thresholds · role naming · canonical events |
| Acquisition | trigger generation for funnel behavior |
| Conversion | booking, call, closing actions |
| Value | task execution · progression · mentoring |
| Intelligence | measurement · diagnosis · recommendations |
| Governance | prioritization · intervention · escalation |

Each loop declares its `block_touchpoints[]`.

---

## 11. Validation Gates

`auditExecutionLoops(EXECUTION_LOOPS)` enforces:
- trigger condition present
- message has exactly one CTA
- action declares a measurement source
- measurement references an event or KPI
- governance decision is explicit (including `ignore`)
- failure maps to a recovery path
- time horizon is declared

A loop missing any of these is invalid and must not ship.

---

## 12. Highest-Leverage Open Items

- Wire `LOOP_PERF_KPI_GAP_FEEDBACK` to the existing Bottleneck Control Engine output (`Intelligence` block).
- Replace ad-hoc `outbound_events.event_name` strings in legacy comm sequences with the loop registry's `MessageSpec.id`.
- Add `loop_id` column to `outbound_events` (future migration) so every delivered message traces back to a registered loop.
