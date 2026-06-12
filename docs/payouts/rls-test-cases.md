# RLS Acceptance & Security Test Cases — Appointments & Commissions

**Scope:** Verifies that Row-Level Security (RLS) on `appointments` and `commissions` (plus related payout objects) grants admins full visibility and confines every other role to its legitimate scope. All tests are executed as authenticated users via `supabase.auth.signInWithPassword` (or service-role impersonation in CI). Service-role bypass is **out of scope** — server-only.

Aligns with: Layer 12 (Operational Canon), Layer 17 (Compensation), Reassignment-Aware Closer Commission patch, Appointment Detail RLS — L6 + Closer + Team.

---

## 0 · Test Personas

| Code | Role / Level | Notes |
|------|--------------|-------|
| `ADMIN` | `has_role(uid,'admin') = true` | Must see EVERYTHING. |
| `L7_DIR` | Director (L7+) | Full team subtree visibility. |
| `L6_LEAD` | Senior Closer / Team Lead (L6) | Subtree of own team only. |
| `L4_CLOSER` | Closer (L4–L5) | Own appointments + own commissions only. |
| `L2_SETTER` | Setter (L1–L3) | Own bookings + own commissions only. |
| `OUTSIDER` | Authenticated user, no role | Must see nothing. |
| `ANON` | Unauthenticated | Must be blocked at `auth.uid() IS NULL`. |

Fixture appointment graph (created in seed):
- `APPT_A` — setter=`L2_SETTER`, original_owner=`L4_CLOSER`, current_owner=`L4_CLOSER`
- `APPT_B` — setter=`L2_SETTER`, original_owner=`L4_CLOSER`, current_owner=`L6_LEAD` (reassigned)
- `APPT_C` — setter=`OTHER_SETTER` (outside subtree), closer=`OTHER_CLOSER`
- `APPT_D` — admin-only diagnostic appointment (no team relation to L6_LEAD)

Each appointment has a matching `calls` row and a fully distributed `commissions` set (setter + closer + L+1 mentor + L+2 mentor + override stages).

---

## 1 · Acceptance Tests — `ADMIN` sees everything

| ID | Action | Expected |
|----|--------|----------|
| A-ADM-01 | `select count(*) from appointments` | Equals total fixture count (4). |
| A-ADM-02 | `rpc('get_appointment_full_context', {id: APPT_D})` | Returns `ok` with full lead + commission payload. |
| A-ADM-03 | `select * from commissions` | All rows of all users returned. |
| A-ADM-04 | `select * from payout_batches` | All batches across all recipients returned. |
| A-ADM-05 | `rpc('mark_commissions_paid_batch', …)` on any user | Succeeds (admin path). |
| A-ADM-06 | Open `AppointmentDetailModal` for APPT_C | Renders full detail, no `forbidden` / `not_found`. |
| A-ADM-07 | CSV/Excel export on Admin Payout tab | Includes every eligible recipient, masked IBAN visible. |

**Acceptance:** Every row above MUST return data. Any `forbidden`, `not_found`, or empty result is a regression.

---

## 2 · Acceptance Tests — Role-scoped READ

### 2.1 `L7_DIR` (Director, full subtree)

| ID | Action | Expected |
|----|--------|----------|
| A-DIR-01 | `select id from appointments` | Returns APPT_A, APPT_B, APPT_C **iff** in subtree; otherwise excluded. |
| A-DIR-02 | `rpc('get_appointment_full_context', APPT_B)` | `ok` (reassignment to L6_LEAD inside subtree). |
| A-DIR-03 | `select sum(amount_cents) from commissions where user_id in (subtree)` | Equals fixture aggregate. |

### 2.2 `L6_LEAD` (Team lead)

| ID | Action | Expected |
|----|--------|----------|
| A-L6-01 | `rpc('get_appointment_full_context', APPT_A)` | `ok` — team subtree (setter is L6's report). |
| A-L6-02 | `rpc('get_appointment_full_context', APPT_B)` | `ok` — current_owner = self. |
| A-L6-03 | `rpc('get_appointment_full_context', APPT_D)` | `forbidden` (exists, not in subtree). |
| A-L6-04 | `select * from commissions` | Returns own + subtree commissions; no APPT_D rows. |

### 2.3 `L4_CLOSER` (Closer)

| ID | Action | Expected |
|----|--------|----------|
| A-CL-01 | `rpc('get_appointment_full_context', APPT_A)` | `ok` (closer = self). |
| A-CL-02 | `rpc('get_appointment_full_context', APPT_B)` | `ok` (original_owner_id = self, even after reassign). |
| A-CL-03 | `rpc('get_appointment_full_context', APPT_C)` | `forbidden`. |
| A-CL-04 | `select * from commissions` | Only rows where `user_id = self`. |
| A-CL-05 | Open Payout Dashboard | Sees own totals; never sees other closers' payout batches. |

### 2.4 `L2_SETTER` (Setter)

| ID | Action | Expected |
|----|--------|----------|
| A-ST-01 | `rpc('get_appointment_full_context', APPT_A)` | `ok` (setter = self). |
| A-ST-02 | `rpc('get_appointment_full_context', APPT_C)` | `forbidden`. |
| A-ST-03 | `select * from commissions` | Only setter-stage commissions for own bookings. |
| A-ST-04 | Payout Dashboard renders own L1 commissions only. |

---

## 3 · Security Tests — Negative / Out-of-scope

| ID | Persona | Action | Expected |
|----|---------|--------|----------|
| S-NEG-01 | `OUTSIDER` | `select * from appointments` | Empty set. |
| S-NEG-02 | `OUTSIDER` | `select * from commissions` | Empty set. |
| S-NEG-03 | `OUTSIDER` | `rpc('get_appointment_full_context', any_id)` | `forbidden` or `not_found`; never row data. |
| S-NEG-04 | `ANON` | Any `select` on `appointments` / `commissions` | Blocked — no rows. |
| S-NEG-05 | `L4_CLOSER` | `update commissions set payout_status='paid' where id=…` | Denied (only admin RPC may transition to `paid`). |
| S-NEG-06 | `L4_CLOSER` | `update commissions set payout_batch_id=…` | Denied by `trg_commissions_protect_payout_batch`. |
| S-NEG-07 | `L6_LEAD` | `rpc('mark_commissions_paid_batch', …)` for non-subtree user | Denied (admin-only RPC). |
| S-NEG-08 | `L2_SETTER` | `select * from payout_batches where user_id <> self` | Empty set. |
| S-NEG-09 | `L4_CLOSER` | Try to read `appointments.notes` of APPT_C via direct `select` | Empty / column not exposed. |
| S-NEG-10 | `L6_LEAD` | `update appointments set current_closer_id=self where id=APPT_D` | Denied by RLS WITH CHECK. |
| S-NEG-11 | Any non-admin | `delete from commissions where id=…` | Denied. |
| S-NEG-12 | `L4_CLOSER` | Re-pay an already-paid commission | Pre-flight `check_violation` from `mark_commissions_paid_batch`; partial unique index also blocks. |

---

## 4 · Reassignment Edge Cases

| ID | Scenario | Expected |
|----|----------|----------|
| R-01 | After `appointments.current_closer_id` flips from L4_CLOSER → L6_LEAD, both still see APPT_B detail. | `ok` for both. |
| R-02 | `distribute_commissions(APPT_B.call_id)` credits **L6_LEAD** (effective closer), not L4_CLOSER. | Audit row `commission_reassigned_close` exists. |
| R-03 | Second `distribute_commissions` call after reassignment → no new closer commission (idempotent ON CONFLICT). | No duplicate rows; no audit re-fire. |
| R-04 | L4_CLOSER opens APPT_B in Payout Dashboard | Sees the appointment context but **no** closer commission credited to self. |

---

## 5 · Implementation Notes for the Test Harness

- Place suite under `tests/rls/` and run via `bunx vitest run tests/rls`.
- Use a **dedicated test schema seed** that wipes & re-creates the persona graph before each suite (do not run against production data).
- For each persona, create a real `auth.users` entry and sign in to obtain a JWT — RLS evaluation depends on `auth.uid()` and `has_role()`, both of which require a real session.
- Wrap admin-only RPC calls (`mark_commissions_paid_batch`, eligibility sweep) in try/catch and assert the **exact Postgres error code** (`42501` insufficient_privilege, `23514` check_violation, `23505` unique_violation).
- Snapshot the `commission_audit_log` after each mutation test and diff against an expected fixture — silent permission drift is the most common regression.

---

## 6 · Pass Criteria

The RLS surface is considered **green** when:

1. All §1 + §2 acceptance tests return the expected payloads.
2. All §3 negative tests are denied or return empty sets — never partial data.
3. §4 reassignment tests prove credit always follows the **effective** closer, never the original.
4. No persona other than `ADMIN` ever observes a row outside its declared scope across `appointments`, `calls`, `commissions`, `payout_batches`, `commission_audit_log`.

Any failure here is a **P0 security incident** — block release and roll back the offending migration.
