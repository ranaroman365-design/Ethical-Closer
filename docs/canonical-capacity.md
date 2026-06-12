# Layer 25 — Capacity Control & Lead Protection

**Block:** Foundation (primary) + Conversion + Governance
**Source of truth:** `public.capacity_status()` SQL function + `src/lib/canonical-capacity.ts`

## Objective

Ensure growth never exceeds execution capacity. No lead is wasted, no closer/setter is
overloaded, no booking exceeds real capacity.

## Hard rules (system-enforced)

1. **No booking without available slot** — `try_reserve_slot(slot_id)` is the only legal
   path; uses `SELECT ... FOR UPDATE` to prevent races.
2. **No hidden overflow** — when slots are full, leads must enter `booking_waitlist`.
3. **No ignored leads** — overload opens deduplicated `capacity_incidents` per day.
4. **No manual override** — capacity is computed server-side; client cannot bypass.

## Components

| Layer | Object | Purpose |
|---|---|---|
| Config | `closer_capacity` | per-closer max calls/day, /week, warn threshold |
| Config | `setter_capacity` (extended) | + `response_sla_minutes`, `warn_threshold_pct` |
| Runtime | `capacity_status()` RPC | utilization & SAFE/WARNING/OVERLOADED |
| Enforcement | `try_reserve_slot()` RPC | atomic slot reservation, blocks overbooking |
| Recovery | `booking_waitlist` | leads pending when no slots available |
| Alerts | `capacity_incidents` + `detect_capacity_overload()` | open/ack/resolve workflow |
| UI | `CapacityControlPanel.tsx` | read-only surface for admin/ops_admin |

## Decision support (never auto-executed)

`suggestActions()` derives suggestions from the row state:
- `overloaded` → close booking slots, reduce ad spend
- `setter` + backlog > 0 → prioritize existing leads
- `warning` → follow-ups before new leads

Operator must approve every action manually (canon Autonomous System Mode rule).

## Integration points (additive only)

- **Booking flow** — replace direct `UPDATE availability_slots` with `try_reserve_slot()`
- **Public booking page** — when `slot_full`, surface waitlist CTA → insert into `booking_waitlist`
- **Operator dashboard** (admin/ops_admin) — embed `<CapacityControlPanel />`
- **Cron** — call `detect_capacity_overload()` every 15 minutes

## What this does NOT change

- Pricing, offers, funnels — untouched
- Existing assignment logic — untouched (only adds visibility)
- Setter/closer workflows — untouched (only enforces caps already implied)
