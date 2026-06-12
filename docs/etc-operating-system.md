# ETC Operating System™ — Layer 47 (Meta-Canon)

> **You are not building a product — you are defining a category.**

ETC is an **Operating System for Revenue + Talent + Learning**, not a funnel,
not a CRM, not a coaching product. This document is the formal system
definition all other canons answer to.

Source of truth: [`src/lib/etc-operating-system.ts`](../src/lib/etc-operating-system.ts)
Canon-Map ID: **M1** (Meta)
Diagram: [`/mnt/documents/ETC_Operating_System.mmd`](../../mnt/documents/ETC_Operating_System.mmd)

---

## 1. The 4 Layers

| Layer | Purpose | Output |
|---|---|---|
| **1. Revenue Engine** | Convert leads into revenue. | New team members (`closed_won → L1`). |
| **2. Talent Engine** | Develop people into operators. | Performance + retention + scalable revenue. |
| **3. Intelligence Layer (Brain)** | Observe both, decide, optimize, learn. | Next-best-actions, auto-fixes, A/B winners. |
| **4. Visualization Layer (Face)** | Make the system understandable. | 3 dashboards. |

### Revenue Engine flow
`Traffic → Landing → Engagement → Booking → Setter → Showing → Closer → Revenue`

### Talent Engine flow
`Applicant → L1 → L2 → L3 → L4 → L5 → L6 → L7 → L8 → Partner`

### Intelligence Layer
`Data Collection → AI Models → Decision Logic → Communication Orchestration → Learning Loop`

---

## 2. The 3 Dashboards (final)

| Dashboard | Serves | Route | Primary KPIs |
|---|---|---|---|
| **Revenue Flow Map™** | Revenue Engine | `/members/admin/conversion-intelligence` | ROAS · Revenue/Lead · Conversion Chain · Bottlenecks |
| **Talent Flow Map™** | Talent Engine | `/members/admin/performance` | Members/Level · Revenue/Member · Promotion · Retention · Split |
| **Intelligence Control™** | Brain | `/members/dashboard/operator-control` | Touchpoints · Communication · AI Actions · Optimization · Experiments |

> Dashboards **never send**. They read aggregates and trigger Intelligence proposals.

---

## 3. Connection Logic

```
Revenue Engine  ──── closed_won ───▶  Talent Engine
Talent Engine   ──── trained ops ──▶  Revenue Engine
Intelligence    ──── NBA / Auto-Fix ▶  Revenue Engine
Intelligence    ──── OSS + PSP ────▶  Talent Engine
Visualization   ──── exposes ──────▶  All
```

Every connection has a documented canon path (see `CONNECTIONS` in source).

---

## 4. Unified Data Pool (invariant)

- **Source of truth:** Supabase (single project).
- **Execution only:** GHL (SMS/email), Twilio (WA/voice), Stripe (payments).
- **Hard rules:**
  1. No layer maintains its own private store.
  2. All KPIs derive from canonical events (`canonical-events.ts`).
  3. Dashboards never send.
  4. Lovable is SoT — GHL/Twilio/Stripe never override state.
  5. One Object → One Lifecycle.

---

## 5. Learning Loop (universal)

Applies to **both** engines:

```
data → insight → action → result → learning
```

| Step | Source canons |
|---|---|
| data | `outbound_events`, `calls`, `payments`, `level_history` |
| insight | I3 Bottleneck · I6 Funnel · I9 Sales Brain · I10 Training |
| action | I7/I8 Self-Opt proposal · NBA · Auto-Fix |
| result | `measurement_window`: observed vs baseline |
| learning | accept/reject + audit (G5) |

---

## 6. Role Compression

| Level | Sees | Dashboards |
|---|---|---|
| L1–L3 | own commissions, own leads | — |
| L4–L5 | own funnel, team revenue | — |
| L6 | all leads in assigned funnels | Intelligence Control |
| L7 | all leads + all team performance | All 3 |
| L8 | all + B2B + ecosystem | All + B2B aggregates |

---

## 7. Audit Gate

`auditOperatingSystem()` enforces:
- every canon referenced by a layer exists in `CANON_MAP`
- every active canon is claimed by ≥1 layer (orphan detector)
- exactly 3 dashboards

Run in admin diagnostics; never user-facing.

---

## 8. Final Goal

The system **must**:
1. generate revenue
2. develop people
3. improve itself
4. make everything visible

If any layer drifts from this, it violates the OS canon.
