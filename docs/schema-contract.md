# ETC Schema Contract — v1.0

> **This document defines the canonical sources of truth for the ETC database schema.**
> All code — frontend, edge functions, RPCs, views — MUST conform to this contract.
> Violations must fail visibly, never silently.

---

## 1. User Identity

| Source | Field | Notes |
|--------|-------|-------|
| `auth.users` | `id` | Supabase-managed, never query directly |
| `profiles` | `id` | Primary user table in public schema |
| `profiles` | `email`, `full_name` | Display fields |

## 2. Role / Level

| Canonical Source | Field | Notes |
|------------------|-------|-------|
| `user_roles` | `role` | Source of truth for role assignment |
| `src/lib/canonical-roles.ts` | `roleLabel()` | All UI labels must use this resolver |
| **❌ FORBIDDEN** | `profiles.level` | Column does NOT exist. Never reference. |

**Rule:** Role and level must be resolved through `user_roles` table or the `user_access_contract` view. Never hardcode role strings outside `canonical-roles.ts`.

## 3. User Phase / Stage

| Canonical Source | Field | Notes |
|------------------|-------|-------|
| `profiles` | `current_phase` (integer) | Canonical progression field |
| `profiles` | `business_stage` (text) | Human-readable stage name |
| **❌ DEPRECATED** | `profiles.current_stage` | Column does NOT exist. Never reference. |

**Rule:** Use `current_phase` for numeric comparisons. Use `business_stage` for display and commission lookups.

## 4. Processed Events

| Canonical Source | Field | Notes |
|------------------|-------|-------|
| `processed_events` | `event_key` (text PK) | Unique idempotency key |
| **❌ DEPRECATED** | `processed_events.event_id` | Column does NOT exist. Use `event_key`. |

**Rule:** All event deduplication must use `event_key`. Edge functions must check `event_key` before processing.

## 5. Team Hierarchy

| Canonical Source | Notes |
|------------------|-------|
| `profiles.director_id` | Direct manager relationship |
| `operator_team_performance` (view) | Performance aggregation — NOT team membership source |
| `team_membership_contract` (view) | Canonical team membership including zero-performance members |

**Rule:** Team membership queries must use `team_membership_contract`, not `operator_team_performance`. The latter is for KPI display only.

## 6. Calls Lifecycle

| Field | Constraint |
|-------|-----------|
| `calls.booked_at` | Set when call is scheduled |
| `calls.showed_at` | Set when lead appears. Required before `closed_at` (except payment-link flow) |
| `calls.closed_at` | Set on close. Requires `showed_at` unless payment-link auto-lifecycle |
| `calls.result` | `'won'` or `'closed_won'` for revenue |

**Rule:** The `validate_call_lifecycle` trigger enforces `showed_at` before `closed_at`. Payment-link flows set all three atomically.

## 7. Revenue

| Source | Purpose |
|--------|---------|
| `calls.revenue` | Primary revenue truth per closed call |
| `payment_links.amount` | Payment link amount (may differ from deal negotiation) |
| `leads.deal_value` | Lead-level estimate — NOT primary revenue source |

**Rule:** Revenue KPIs must source from `calls` where `result = 'won'` and `is_simulation = false`.

## 8. Simulation

| Field | Rule |
|-------|------|
| `calls.is_simulation` | Must be excluded from all production KPI views |
| `leads.is_simulation` | Must be excluded from all production KPI views |

**Rule:** `WHERE COALESCE(is_simulation, false) = false` in all KPI queries. Simulation data visible only in admin/debug views.

---

## Contract Views

| View | Purpose |
|------|---------|
| `user_access_contract` | Unified user identity + role + level + phase |
| `team_membership_contract` | Team hierarchy including zero-performance members |
| `payment_contract` | Payment link lifecycle |
| `event_contract` | Processed events with `event_key` + backward-compat `event_id` alias |

---

## Forbidden Patterns

```
❌ profiles.level            → Does not exist
❌ profiles.current_stage    → Does not exist
❌ processed_events.event_id → Does not exist (use event_key)
❌ operator_team_performance as team membership → Use team_membership_contract
❌ Hardcoded role strings    → Use canonical-roles.ts
❌ Silent catch blocks on DB errors → Must log structured error
❌ Infinite loading without timeout → Must show error after 10s
```
