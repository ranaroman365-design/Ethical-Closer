# Canonical Revenue Acceleration — Layer 24

**Status:** Installed · 2026-04-23
**Source of truth:** `src/lib/canonical-revenue.ts`
**Block:** Value (primary) · Conversion · Governance (supporting)
**Constitution:** governed by `canon-constitution`

---

## 0. Why this canon

The M-Canon Audit Part 4 (Revenue Acceleration) flagged that revenue
moments existed in the system but were not deterministically tied to user
state. Multiple offers could compete in the same state, the upgrade path
was implicit, and reactivation was not formally connected to revenue.

This canon makes the revenue layer **structural and audit-gated**.

---

## 1. The four primitives

| Primitive | Purpose | Source |
|---|---|---|
| **UpgradePathStep** | Fixed Free → Community → Program → Placement ladder | `UPGRADE_PATH` |
| **RevenueMomentSpec** | A state-triggered monetization opportunity | `REVENUE_MOMENTS` |
| **RevenueLoopSpec** | An ordered event chain that must terminate at revenue | `REVENUE_LOOPS` |
| **resolvePrimaryMoment()** | Runtime resolver enforcing the Single-Offer rule | exported function |

---

## 2. Hard rules

- **Single-Offer Principle** — at any moment, at most ONE primary offer per
  `(kind, target_tier, trigger_event)`. The audit gate rejects collisions.
- **No manual timing** — every moment fires from a `CanonicalEventName`,
  never from a wall-clock or human decision.
- **No upgrade-path skipping** without an explicit qualification rule
  (e.g. fast-track score ≥ 75 routes directly to `program`).
- **Loops must terminate at revenue** — `terminal_event` must be present
  in the loop's `path`.
- **Recovery is silent on revenue** — `recovery` moments with
  `primary_offer_key = null` defer to `canonical-reactivation` (Layer 22).

---

## 3. Upgrade ladder

| Tier | Price | Entry event | Next |
|---|---|---|---|
| `free` | €0 | `lead_created` | `community` |
| `community` | €27 | `community_joined` | `program` |
| `program` | €1 600 | `purchase_completed` | `placement` |
| `placement` | — | `placement_ready` | terminal |

---

## 4. Revenue moments

| Id | Kind | Trigger | Target tier | Primary offer |
|---|---|---|---|---|
| `immediate.quiz_completed` | immediate | `quiz_completed` | community | — (booking dominates) |
| `immediate.booking_intent_lost` | immediate | `rescue_shown` | community | `community_27` |
| `short_term.community_joined` | short_term | `community_joined` | community | — |
| `short_term.path_step_completed` | short_term | `path_step_completed` | program | `radiant` |
| `performance.path_completed` | performance | `path_completed` | program | `radiant` |
| `performance.level_up` | performance | `level_up` | program | `booster` (fb `scale_lab`) |
| `recovery.inactive_3d` | recovery | `inactive_3d` | community | — (Layer 22) |
| `recovery.inactive_7d` | recovery | `inactive_7d` | community | `community_27` |

---

## 5. Revenue loops

| Id | Path | Terminal |
|---|---|---|
| `loop.primary` | lead → booking → showed → deal_won | `deal_won` |
| `loop.recovery` | lead → rescue_shown → community_joined → upgrade_converted | `upgrade_converted` |
| `loop.value_to_revenue` | community → path_step → path_completed → purchase | `purchase_completed` |

---

## 6. Integration points

| Consumer | How |
|---|---|
| `useMonetizationOffers` | Existing hook continues to read `monetization_offers`; canon governs **which one** wins per state |
| `canonical-channel` (Layer 23) | Each revenue moment composes a `CommunicationSpec` for delivery |
| `canonical-reactivation` (Layer 22) | Owns recovery moments where `primary_offer_key = null` |
| `pickDominant()` (Priority Engine) | Revenue actions outrank non-revenue at equal urgency |
| `audit_revenue_offers` SQL function | Validates `monetization_offers` rows against canon, writes report to `audit_logs` |

No tables added. No pricing logic changed. The canon is structural.

---

## 7. Position in the audit

This is the final fix from the Revenue Acceleration Canon. It composes
with Layers 22 (Reactivation) and 23 (Channel) to form the complete
behavioral revenue loop:

```
event → revenue_moment → communication_spec → channel_cascade → action → outcome
```
