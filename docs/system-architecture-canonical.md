# ETC System Architecture — Canonical 5-Block Model

> **Status:** Read-only structural reference. This document defines the canonical mental model for the Ethical Top Closer platform inside Lovable. **It does not change code, schema, workflows, routes, or UI.**
>
> All future development, refactors, feature proposals, and analytical reasoning MUST classify their work into exactly one of the five blocks below.

---

## 0. Operating Principles

1. **MECE.** The five blocks are Mutually Exclusive and Collectively Exhaustive. Every component, table, route, edge function, and feature in the system maps to **exactly one** block.
2. **No Refactor.** This is a semantic layer. Existing code, table names, RLS, workflows, and UI behavior remain untouched.
3. **Communication is internal.** The Communication Engine is a first-class internal capability of Lovable. GHL (when used) is treated as a delivery substrate for SMS/WhatsApp/VoIP only — never as a logic owner.
4. **Event-driven.** Cross-block coordination happens exclusively through canonical events (see §6).
5. **Single Source of Truth.** Lovable / Supabase owns all state. No external system holds authoritative data.

---

## 1. Acquisition Engine

### Definition
The full L0 pipeline from cold traffic to a closed customer (`deal_won`).

### Scope
- Landing pages (`/high-income-skill`, etc.)
- Quiz system + lead-quality scoring
- Lead capture (name, email, phone) — 100% gated
- Booking system (standard + priority/fastlane)
- Calendar logic, slot reservation, never-empty calendar engine
- Setter pre-qualification (AI Setter, applicant scoring)
- Show-up tracking (RSVP, commitments, join clicks)
- Closer pipeline through `deal_won` / `deal_lost`

### KPI Ownership
- LP Conversion Rate
- Quiz Completion Rate
- Booking Rate
- Show Rate
- Close Rate
- CAC, Revenue, Revenue per Call

### Boundary
**Ends at `deal_won`.** Handoff to Value Engine occurs at `community_access = true`.

### Primary Tables (informational)
`leads`, `appointments`, `calls`, `applicant_scores`, `availability_slots`, `ai_setter_sessions`, `appointment_commitments`, `checkout_consent_log`, `ad_spend_daily`.

---

## 2. Value Engine (Career Engine L1–L8)

### Definition
Transforms paying customers into productive operators and partners.

### Levels
| Level | Role |
|---|---|
| L0 | Applicant (input boundary) |
| L1 | Trainee |
| L2 | Setter |
| L3 | Senior / Advanced Setter |
| L4 | Junior Closer |
| L5 | Managing Closer |
| L6 | Senior Closer / Operator |
| L7 | Director |
| L8 | Partner |

### Core Functions
- Career path progression + KPI-based promotion
- Skill development (modules, certifications)
- Placement track (L4–L6)
- Operator ownership (L6+ owns own funnel/landing page)
- Director aggregation (L7)
- Partner economics (L8)

### Critical Transitions
- **L1 → L2** Activation
- **L2 → L4** Monetization
- **L4 → L6** Ownership

### KPI Ownership
- Calls completed, revenue generated, close rate
- Promotion criteria, retention, activity streaks
- Certification readiness

### Primary Tables (informational)
`profiles`, `user_roles`, `certification_status`, `community_modules`, `member_progress`, `member_kpis`, `commissions`.

---

## 3. Application Layer

### Definition
All in-platform tools, modules, and features available to users.

### Examples
- Closing OS / Daily Execution OS
- Voice Closing Simulator (Simulation Lab)
- Closer AI Copilot (Listening Copilot)
- Dashboards (member, setter, closer, director, admin)
- CRM / lead workspace views
- Training modules, EEG Academy
- Calendar Hub

### STRICT Mapping Rule
Every application/feature MUST map to exactly one purpose:
1. **Revenue Increase**
2. **Conversion Increase**
3. **Throughput Increase**
4. **Skill Certification**

If a feature does not map → it is non-essential and should not be built or maintained.

### Relationship
The Application Layer **supports the Value Engine primarily** (and the Acquisition Engine secondarily through setter/closer workspaces).

---

## 4. Control Engine (System Brain)

### Definition
The analytical and decision-making layer that observes all engines and surfaces the system's biggest constraint at any moment.

### Scope
- KPI aggregation across all engines
- Funnel analytics (`/members/admin/funnel-analytics`, `view_*` analytical views)
- Operator comparison (equal-budget, multi-origin attribution)
- Bottleneck detection
- Performance Command Center (`/members/admin/performance`)
- Capital allocation logic (future-ready)
- Assignment Intelligence
- Auto-fix / governance dashboards

### Core Function
At any moment, answer:
> **"Where is the biggest constraint in the system right now?"**

### Output Types
- Insights, alerts, rankings, recommendations
- Forecasts (revenue forecast, throughput projections)

### Primary Tables / Views (informational)
`view_director_team_kpis`, `view_performance_rankings`, `view_user_promotion_status`, `funnel_events`, `event_logs`, `audit_logs`, `auto_fix_incidents`.

---

## 5. Communication Engine (Internalized — No GHL Dependency)

### Definition
The event-driven behavioral execution layer. Operates **across all engines** as the system's actuator.

### Positioning
- **NOT** part of Acquisition or Value
- A **horizontal capability** that activates the other engines
- Lovable owns the brain (when, who, what, why); delivery substrates (in-app, email, SMS, WhatsApp, VoIP) are interchangeable. GHL, if present, is a dumb delivery channel only.

### Core Logic Model
```
Event → Decision → Communication → Behavior → New Event
```

### Channels
- In-app notifications
- Email (transactional, behavioral)
- SMS
- WhatsApp
- Call tasks / setter/closer reminders

### Trigger Source (STRICT)
Communication fires **only** from explicit canonical system events. No time-based broadcasts. No manual sends inside the engine. Examples:
- `quiz_completed`
- `lead_captured`
- `booked`
- `appointment_confirmed`
- `no_show`
- `call_completed`
- `deal_won`
- `deal_lost`
- `level_up`
- `inactive_7d`
- `certification_ready`
- `placement_ready`

### Functional Areas

#### A. Acquisition Communication (Conversion)
- Lead → Quiz completion nudge
- Quiz → Booking nudge
- Booking → Show (T-24h, T-3h, T-15m, pre-call priming)
- No-show recovery (soft / direct / final / rebooking link)
- Post-call closing reinforcement (offer recap, objection handlers, urgency, payment reminder)

#### B. Value Chain Communication (Retention & Progression)
- Onboarding (L0 → L1): welcome, first action, identity shift
- Activation (L1 → L2)
- Monetization (L2 → L4)
- Operator enablement / placement track (L4 → L6)
- Inactivity recovery, streak break recovery, level-up motivation

### Critical Principle
> Communication is **behavioral enforcement of the system state machine** — not messaging.

If a message does not move a user from one state to the next, it does not belong in the Communication Engine.

---

## 6. Engine Relationship Model

```
┌──────────────────────────────────────────────────────────────┐
│                    CONTROL ENGINE (Brain)                     │
│              observes • diagnoses • recommends                │
└──────────▲────────────▲────────────▲────────────▲────────────┘
           │            │            │            │
           │ observes   │ observes   │ observes   │ observes
           │            │            │            │
   ┌───────┴──────┐ ┌───┴────────┐ ┌─┴──────────┐ │
   │ ACQUISITION  │→│   VALUE    │ │APPLICATION │ │
   │   ENGINE     │ │  ENGINE    │←│   LAYER    │ │
   │  (L0 → won)  │ │  (L1–L8)   │ │            │ │
   └───────▲──────┘ └─────▲──────┘ └─────▲──────┘ │
           │              │              │        │
           │ activates    │ activates    │        │
           │              │              │        │
           └──────────────┴──────────────┴────────┘
                              │
                  ┌───────────┴────────────┐
                  │ COMMUNICATION ENGINE   │
                  │ (event-driven actuator)│
                  └────────────────────────┘
```

- **Acquisition → Value:** handoff at `deal_won` / `community_access`
- **Control → All:** read-only observation
- **Communication → All:** event-driven activation (write-side actuator)
- **Application → Value (primary), Acquisition (secondary):** supports operators in performing their jobs

---

## 7. Admin Role (Meta-Layer)

The **Admin** is not a sixth engine. It is a meta-role with global oversight across all five blocks.

### Capabilities
- Full read visibility across all five blocks
- Access to: performance dashboards (global + per-operator), funnel analytics, career progression, communication flows, audit/governance
- Identify bottlenecks, compare operators, oversee system health
- Override governance only via documented break-glass / approval flows

---

## 8. Hard Constraints (Enforcement)

Lovable MUST:
- ❌ NOT refactor existing code based on this document alone
- ❌ NOT rename database fields, tables, or routes
- ❌ NOT modify workflows or RLS policies
- ❌ NOT change UI logic or routing
- ✅ ONLY use this document as a semantic / classification layer

Any future change request must declare:
1. Which block it belongs to
2. Which KPI it moves
3. Which event(s) it consumes or emits

If it cannot, it is out of scope.

---

## 9. Component → Block Classification (Reference Map)

| Component / Surface | Block |
|---|---|
| `/high-income-skill`, quiz, `/booking`, fastlane, calendar slots | Acquisition |
| `applicant_scores`, AI Setter, lead routing, closer pipeline up to `deal_won` | Acquisition |
| `profiles.current_phase`, `user_roles`, certification, modules, promotions | Value |
| Closing OS, Simulation Lab, Closer Copilot, member dashboards, CRM views | Application |
| Funnel analytics, Performance Command Center, Operator Comparison, Assignment Intelligence | Control |
| `outbound_events`, `process-outbound-events`, `dispatch-appointment-reminders`, in-app notifications, transactional email queue, GHL tag dispatcher | Communication |
| Admin Control Center, audit logs, governance, break-glass | Admin (meta) |

---

## 10. Final Note

This system is a **self-optimizing, event-driven operator production system**.

- Not a funnel.
- Not a course platform.
- Not a CRM.

All future logic must align with this 5-block structure. When in doubt: classify first, build second.

---

*Canonical version. Update only via explicit architectural review.*
