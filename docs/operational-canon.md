# ETC Operational Canon (Hardwired)

**Status:** Canonical · Hardwired · Operational Governance
**Stack Position:** Layer 12 of the ETC Architecture
**Source of truth:** `src/lib/operational-canon.ts`
**Sibling layer:** Canonical Role Naming (Layer 11) — `src/lib/canonical-roles.ts`

---

## 🎯 Objective

Lock the 10 operational invariants that prevent system drift at scale:

1. Event Dictionary
2. User State Machine
3. KPI Formulas (definitions, not values)
4. Time Windows
5. Dashboard Hierarchy
6. Action Types
7. Access / Permission Matrix
8. Data Ownership
9. Terminology
10. North-Star Metric

These are **immutable system laws**, not features.

---

## ⚠️ Hard Rules

| Rule | Status |
|------|--------|
| Invent new event names | ❌ Forbidden |
| Invent new action types | ❌ Forbidden |
| Reinterpret an existing KPI formula | ❌ Forbidden |
| Duplicate a source of truth | ❌ Forbidden |
| Use a forbidden synonym from §9 | ❌ Forbidden |
| Import from `src/lib/operational-canon.ts` for events/actions/KPIs | ✅ Mandatory |

---

## 1️⃣ Canonical Event Dictionary

**Rule:** 1 real-world action = 1 event. 1 event = 1 meaning forever.

| Domain | Event | Meaning |
|--------|-------|---------|
| Acquisition | `lead_created` | New lead enters the system |
| Acquisition | `quiz_started` | Quiz first question answered |
| Acquisition | `quiz_completed` | Quiz fully submitted |
| Acquisition | `booked` | Appointment reserved |
| Acquisition | `no_show` | Booked appointment missed |
| Acquisition | `call_completed` | Call ended (any outcome) |
| Acquisition | `deal_won` | Closed-won outcome |
| Acquisition | `deal_lost` | Closed-lost outcome |
| Lifecycle | `level_up` | User advanced one level |
| Lifecycle | `inactive_3d` | No qualifying activity for 3 days |
| Lifecycle | `inactive_7d` | No qualifying activity for 7 days |
| Economy | `payment_completed` | Successful charge |
| Economy | `community_joined` | Granted community access |

**Adding a new event** requires updating this file + `operational-canon.ts` + a memory rule. Otherwise: forbidden.

---

## 2️⃣ Canonical User State Machine

**Rule:** A user is ALWAYS in exactly ONE primary state.

```
LEAD → QUIZ → BOOKED → SHOWED → CLOSED_WON
                                      │
                                      ▼
                                     L1 → L2 → L3 → L4 → L5 → L6 → L7 → L8
```

- Backward transitions require admin override (logged via `audit_logs`).
- `no_show` keeps the user in `BOOKED` until rebooked or recovered.
- Use `canTransition(from, to)` from `operational-canon.ts`.

---

## 3️⃣ Canonical KPI Formulas

**Rule:** Each KPI has exactly ONE formula. Forever.
**Thresholds (values)** still live in `src/lib/kpi-config.ts`. This layer only fixes **definitions**.

| KPI | Formula |
|-----|---------|
| Booking Rate | `booked / quiz_completed` |
| Show Rate | `showed / booked` |
| Close Rate | `deal_won / showed` |
| No-Show Rate | `no_show / booked` |
| Revenue per Lead | `sum(deal_won.revenue) / lead_created` |
| Revenue per Operator | `sum(deal_won.revenue) / active_operators` |

Use `computeKpi(numerator, denominator)` — returns `null` (not NaN) when denominator is 0.

---

## 4️⃣ Canonical Time Windows

**Rule:** Every dashboard, every score, every trend uses the same windows.

| Window | Days | Used by |
|--------|------|---------|
| Activity | **7** | OSS activity, daily-execution dashboards |
| Revenue | **30** | OSS revenue, earnings cards, North Star |
| Trend short | **7** | Short leg of trend comparison |
| Trend long | **30** | Long leg of trend comparison |
| Inactive warn | **3** | Emits `inactive_3d` |
| Inactive risk | **7** | Emits `inactive_7d` |

---

## 5️⃣ Canonical Dashboard Hierarchy

Every dashboard section, in this order:

1. **Status** — Where am I right now?
2. **Trend** — Which direction am I moving?
3. **Benchmark** — How do I compare?
4. **Insight** — What does this mean?
5. **Action** — What do I do next?

Use `DASHBOARD_HIERARCHY` from `operational-canon.ts` to enforce ordering in code reviews.

---

## 6️⃣ Canonical Action Types

The system **never** invents new action types.

| Action | Meaning |
|--------|---------|
| `communicate` | Send a message via the Communication Engine |
| `coach` | Training, feedback, mentoring |
| `allocate` | Assign / reassign work or leads |
| `flag` | Mark for review (no immediate action) |
| `escalate` | Raise to higher role / admin / break-glass |

---

## 7️⃣ Canonical Access / Permission Matrix

**Rule:** Access is 100% deterministic by level. See / Do / Unlock per level.

| Lx | See | Do | Unlock |
|----|-----|----|--------|
| L0 | applicant_portal | quiz, booking | — |
| L1 | basic_dashboard, academy | training, opener_workspace | — |
| L2 | setter_dashboard, calendar | setting, qualification | setter_workspace |
| L3 | setter_dashboard, mentor_overview | setting, mentor_setters | mentor_space |
| L4 | revenue_metrics, closer_dashboard | close_deals | closing_os, offer_deck |
| L5 | revenue_metrics, mentor_overview | close_deals, mentor_closers | call_review |
| L6 | operator_dashboard, origin_metrics | own_funnel, manage_budget | performance_command_center |
| L7 | director_dashboard, team_kpis | manage_operators, allocate_resources | director_workspace |
| L8 | partner_dashboard, system_economics | b2b_sales, license_system | partner_hub, white_label |

Use `accessFor(level)` from `operational-canon.ts`.

---

## 8️⃣ Canonical Data Ownership

**Rule:** No duplicated source of truth.

| Domain | Owner |
|--------|-------|
| Events | Lovable |
| KPIs | Lovable |
| User State | Lovable |
| Communication (templates + dispatch) | Lovable (GHL = delivery channel only) |
| Commissions | Lovable |
| Access matrix | Lovable |
| Identity | Lovable (auth.users + profiles) |

---

## 9️⃣ Canonical Terminology

**Rule:** One concept = one word across the entire system.

| Concept | Use | Forbid |
|---------|-----|--------|
| Booking | "Booking" | appointment, call slot, session slot, meeting |
| Show | "Show" | attended, joined, arrived, present |
| Deal Won | "Deal Won" | sale, success, win, conversion |
| Level Up | "Level Up" | promotion, upgrade, advancement, rank up |
| L6 (external) | "Senior Closer" | "Operator" externally — see Layer 11 |
| Lead | "Lead" | prospect (externally), contact |
| Quiz | "Quiz" | assessment, survey, questionnaire |

---

## 🔟 Canonical North-Star Metric

**Primary:** **Revenue per Operator** (30-day window)
- Formula: `sum(deal_won.revenue) / active_operators`

**Secondary:** **L6 Senior Closers Created (30d)**
- Formula: `count(level_up where to_level = 6 within 30d)`

Every dashboard, decision, and roadmap discussion ladders to one of these two.

---

## 🧠 Final Truth

Most systems define features and flows.
This layer defines **immutable system laws**.

When events, states, KPIs, time, actions, access, ownership, and terminology are locked — the system becomes:

- Predictable
- Scalable
- Debuggable
- Trainable
- Sellable

---

*Layer 12 of the ETC architecture stack — operational governance.*
