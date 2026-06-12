# ETC Autonomous System Mode (ASM) — Canonical V1

> **Status:** Canonical execution-control spec. Extends the [Admin Decision Console](./admin-decision-console.md) from a read surface into a **propose → prepare → approve → execute → monitor** loop with strict human-in-the-loop control.
>
> **Doctrine:** ETC V6.1. Lovable proposes, admin approves, system executes only what was approved. No autonomous mutation of core logic.
>
> **Scope:** Governance + flow contract only. No code, schema, or workflow definitions are changed by registering this spec. Implementation is a separate work item.

---

## 0. Hard Rules (non-negotiable)

1. **No fully autonomous execution.** Every state-changing action requires explicit admin approval. No exceptions at V1.
2. **No new workflows / KPIs / logic.** ASM only intensifies, flags, signals, or escalates within the existing architectural stack.
3. **No uncontrolled messaging.** Communication adjustments respect the channel hierarchy and per-user rate limits in §5.
4. **Strict action set.** Only the 4 categories in §2 are valid proposal types. Anything else is rejected at proposal time.
5. **Reversibility mandatory.** Every approved action must declare a rollback path before execution.
6. **Full audit trail.** Every proposal, decision, execution, and outcome is logged immutably.
7. **Backend rate-limiting infra is not yet established** — per-user message caps in §5 are enforced at the existing workflow layer (idempotency + cadence rules), not as new backend rate-limit primitives.

---

## 1. Core System Flow

```
KPI Change
   → Bottleneck Detection         (Control Engine)
   → Action Proposal              (ASM Proposal Engine — §1)
   → Admin Approval               (Approval Layer — §3)
   → Execution                    (Execution Layer — §4, scope-locked)
   → Monitoring                   (Monitoring Loop — §6)
   → Learning Record              (Learning Layer — §7, no logic mutation)
```

The loop never skips the Approval gate. A proposal that is not approved within its TTL (default 72h) auto-expires.

---

## 2. Action Categories (strict set — only these 4)

| Category | What ASM may propose | What it may NOT do |
|---|---|---|
| **A. Communication Adjustment** | Activate `[INTENSE]` mode of an existing workflow; toggle predefined extra steps (extra SMS / WhatsApp escalation / tighter cadence) | Create new workflow steps; invent message copy outside templates |
| **B. Operator Action** | Coaching recommendation; attention prioritization; performance flag (At Risk, High Potential, etc.) | Promote / demote; assign deals; bypass role engine |
| **C. Resource Allocation** *(future-ready, off by default)* | Emit `budget_signal: scale_up` / `scale_down` | Mutate spend, traffic routing, or budget directly |
| **D. System Attention** | Highlight broken KPI chain; escalate to admin alert; mark incident | Modify KPI thresholds; resolve incident without admin |

Any proposal outside these 4 categories is **rejected at the Proposal Engine**, not at the Approval gate.

---

## 3. Action Proposal Engine

### Inputs
- KPI deviations (from the Control Engine)
- OSS scores + components (from the OSS layer)
- PSP scores + segments (from the PSM layer)

### Output — canonical proposal record

```
ACTION PROPOSAL #<id>

Category:        A | B | C | D
Type:            <e.g. Communication Intensification>
Target:          <e.g. WF_ACQ_BOOKED_SHOW_SEQUENCE>
Trigger:         <KPI name> Δ% = <value> vs benchmark
Severity:        info | warning | critical
Affected scope:  <global | operator:X | cohort:Y>

Prepared actions (pre-defined, no novel steps):
  - <step 1, sourced from Workflow Registry>
  - <step 2>
  - ...

Expected impact:    +<low>% to +<high>% on <KPI>
Risk:               low | medium | high
Reversibility:      <rollback path>
Proposal TTL:       72h (default)
Source signals:     {control_engine_event_id, oss_snapshot_id, psp_snapshot_id}
```

### Determinism
The Proposal Engine is a pure function of (Control Engine output × OSS × PSP). Two identical input states produce identical proposals. No randomness, no LLM creativity in V1.

---

## 4. Admin Approval Layer

Each proposal renders the **5-line decision card** (canonical):

```
WHAT:    <plain-language action>
WHY:     <quantified KPI deviation>
WHO:     <affected operators / cohort>
HOW:     <existing workflow id + mode, or admin step>
IMPACT:  <expected delta range>
RISK:    <low | medium | high>
```

### Admin options
- **✅ Approve** → flows to Execution Layer with `approved_by`, `approved_at` stamps
- **❌ Reject** → archived with required `reason`
- **⏸ Delay** → snoozed for N hours, returns to queue

Bulk approval is allowed only within the same Category and same Severity bucket, and is logged with explicit `bulk=true`.

---

## 5. Execution Layer (post-approval, scope-locked)

### What Execution may do
- Activate the `[INTENSE]` variant of an already-existing workflow.
- Adjust frequency within the **predefined min/max bounds** stored in the Workflow Registry.
- Set / clear operator flags (`priority_flag`, `at_risk`, etc.).
- Trigger an existing communication flow whose registry entry permits this trigger source.

### What Execution may NOT do
- Create or modify workflow definitions.
- Send messages outside the templates referenced by the registry entry.
- Mutate KPIs, thresholds, or promotion rules.
- Auto-confirm any role transition (still owned by the role/promotion engine).

### Per-user safety caps (enforced at workflow layer)
| Limit | Default | Source of enforcement |
|---|---|---|
| Max comms per user / 24h | 4 | existing workflow cadence + idempotency |
| Min gap between sequential messages | 30 min | workflow registry cadence rules |
| `[INTENSE]` mode max duration | 7 days | proposal TTL + auto-deactivation |

These are NOT new backend rate-limit primitives — they are policy enforced via existing idempotency keys and workflow cadence definitions.

### Reversibility contract
Every executed action declares its rollback path **before** execution starts:
- `[INTENSE]` mode → revert to standard mode
- Operator flag → clear flag
- Budget signal → revoke signal event
- Comms trigger → no rollback for already-sent messages, but deactivation prevents further sends

---

## 6. Monitoring Loop

After execution the system tracks the targeted KPI for a **windowed before/after comparison**:

```
KPI:          show_rate
Before (7d):  51%
After (7d):   62%
Δ:            +11 pts   →  Action: SUCCESSFUL
```

Outcome states: `successful` · `partial` · `null_effect` · `regressive`. A `regressive` outcome triggers automatic rollback offer to admin and a Control Engine `critical` alert.

---

## 7. Learning Layer (controlled, observation-only)

Per executed action the system records:
- Inputs (Δ%, OSS, PSP at proposal time)
- Action taken (workflow id, mode, scope)
- Before/after KPI snapshot
- Outcome state

**Purpose:** improve future proposal *quality* (e.g., expected-impact ranges) — never change logic, weights, or thresholds. Learning influences only the `expected_impact` field of new proposals, which the admin still reviews.

Any change to OSS/PSM/Control Engine formulas remains a versioned architectural review, never an emergent ASM behavior.

---

## 8. Priority Queue

When multiple proposals coexist, ASM ranks them:

1. **KPI tier rank** — Tier 1 (Show, Close) > Tier 2 > Tier 3 (per Control Engine / Workflow Registry)
2. **Magnitude of deviation** — largest negative Δ% first within tier
3. **Lever speed** — fastest-to-impact lever first within tied magnitudes
4. **Severity** — `critical` always surfaces above `warning` regardless of order

Queue depth is exposed in the Admin Decision Console.

---

## 9. Admin Decision Console — New Section

ASM adds a **5th section** to the Admin Decision Console, placed below the existing 4:

```
┌─────────────────────────────────────────────────────────┐
│  5. AUTONOMOUS ACTIONS — Pending: 3                     │
├─────────────────────────────────────────────────────────┤
│  #1  Show Rate Fix         HIGH    [Approve][Reject]   │
│  #2  Operator B Coaching   MEDIUM  [Approve][Reject]   │
│  #3  Retention Flow        LOW     [Approve][Reject]   │
└─────────────────────────────────────────────────────────┘
```

Approval inline; full proposal record opens in a drawer. Section is read-write (the only such section in the Console at this stage).

---

## 10. Governance & Audit

- Every proposal emits `asm_proposal_event { id, category, target, trigger, severity, source_signals, ttl, created_at }`.
- Every decision emits `asm_decision_event { proposal_id, decision, actor_id, reason?, decided_at }`.
- Every execution emits `asm_execution_event { proposal_id, mode, scope, rollback_token, executed_at }`.
- Every monitoring outcome emits `asm_outcome_event { proposal_id, before, after, delta, outcome_state, measured_at }`.

All events immutable. Linked by `proposal_id` for full lifecycle traceability.

---

## 11. Final System State

| Capability | Status |
|---|---|
| Deterministic workflows | ✅ Workflow Registry V1 |
| Closed-loop optimization | ✅ Control Engine V1 |
| Present-performance scoring | ✅ OSS V1 |
| Future-potential prediction | ✅ PSM V1 |
| Non-destructive KPI integration | ✅ KPI Unification V1 |
| Single decision surface | ✅ Admin Decision Console V1 |
| **Human-in-the-loop action engine** | ✅ **ASM V1 (this doc)** |

ETC is now a **semi-autonomous performance system with human-in-the-loop control**. Detection is automatic. Execution is approved.

---

## 12. Cross-References

- 5-block model: [`system-architecture-canonical.md`](./system-architecture-canonical.md)
- Behavioral spec: [`communication-engine-blueprint.md`](./communication-engine-blueprint.md)
- Workflow registry: [`communication-engine-workflows.md`](./communication-engine-workflows.md)
- Closed-loop optimizer: [`control-engine-bottleneck-system.md`](./control-engine-bottleneck-system.md)
- Present performance: [`operator-scoring-system.md`](./operator-scoring-system.md)
- Future potential: [`predictive-success-model.md`](./predictive-success-model.md)
- KPI integration: [`kpi-unification-layer.md`](./kpi-unification-layer.md)
- Read surface: [`admin-decision-console.md`](./admin-decision-console.md)
- Idempotency / hygiene: `mem://technical/event-idempotency-and-hygiene`

*Canonical V1. Implementation = separate work item. Update only via explicit architectural review.*
