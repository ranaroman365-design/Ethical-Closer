# Canonical Channel Abstraction — Layer 23

**Status:** Installed · 2026-04-23
**Source of truth:** `src/lib/canonical-channel.ts`
**Block:** Foundation (primary) · Conversion · Value (supporting)
**Constitution:** governed by `canon-constitution`
**Loop integration:** feeds `execution-loop-canon-v2` Communication slot

---

## 0. Why this canon

The M-Canon Audit (Part 3 — Communication) flagged the risk of mixing
Trigger / Message / Channel concerns in the same construct. Even though
`execution-loop-canon-v2` already separated them at the loop level, no
dedicated canon file enforced the separation as the only legal shape for an
outbound communication.

This canon makes the separation **structural and audit-gated**.

---

## 1. The three concerns

| Concern | Question | Type |
|---|---|---|
| **Trigger** | WHEN does it fire? | `TriggerSpec` (event \| time \| inactivity \| kpi_breach) |
| **Message** | WHAT does it say? | `MessageSpec` (one purpose, one CTA) |
| **Channel** | WHERE is it delivered? | `ChannelCascade` (ordered, first-success-wins) |

A `CommunicationSpec` is the **only** legal composition of these three.
Anything outside this shape is a canon violation.

---

## 2. Hard rules

- A `MessageSpec` has **exactly one** `purpose` and **exactly one**
  `primary_cta`. Multi-purpose messages are forbidden.
- A `TriggerSpec` may NOT directly reference a channel — it emits a
  MessageSpec; channel resolution is the cascade's job.
- A `ChannelCascade` may NOT contain logic — channels transport only.
- New channel orders require a **canon update** (add to `CASCADES`), not an
  inline override.

---

## 3. Canonical cascades

Reusable cascades exported from `CASCADES`:

| Cascade | Order | Use case |
|---|---|---|
| `EMAIL_FIRST` | email → sms | Default reactivation |
| `SMS_FIRST` | sms → whatsapp → email | Time-sensitive (T-2h, T-10min) |
| `IN_APP_FIRST` | in_app → email | Engaged community/member nudges |
| `URGENT_MULTI` | sms → whatsapp → email → in_app | Critical (T-10min, no-show recovery) |
| `MENTOR_ESCALATION` | mentor_intervention | `member_idle.d7`, `closed_won_idle.d7` |
| `ADMIN_ESCALATION` | admin_escalation | KPI breach, non-compliance |

---

## 4. Audit gates

`auditCommunicationSpec(spec)` enforces per-spec:
- trigger has the field its `kind` requires
- message has a non-empty `primary_cta`
- message declares ≥1 locale
- cascade has ≥1 channel and no duplicates

`auditCommunicationSpecs(specs[])` additionally checks for duplicate spec ids.

A spec failing audit MUST NOT ship.

---

## 5. Integration points

| Consumer | How |
|---|---|
| `canonical-reactivation` (Layer 22) | Each stage already conforms — id, purpose, channels, CTA |
| `execution-loop-canon-v2` | Communication slot is a `CommunicationSpec` |
| `automation-and-recovery` engine | Resolves cascades at dispatch time |
| `outbound_events.metadata` | Persists `trigger_id` + `message_id` for trace |

No new tables. No schema migration. The canon is structural, not data.

---

## 6. Position in the 4-fix package

This is **Fix 5** of the audit's final 6 fixes. Together with Fix 1
(Threshold Registry), Fix 2 (Event Enum Lock — soft), Fix 3 (Execution Loop
Enforcement, already shipped via Loop v2), Fix 4 (Retention Canon, Layer 22),
and Fix 6 (Priority Engine, already shipped via `pickDominant()`), this
brings the system to enforced 9.5+/10.
