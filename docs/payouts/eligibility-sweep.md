# Commission Eligibility Sweep — Audit Document

**Status:** ✅ Verified · **Date:** 2026-04-29 · **Owner:** Payout System

## 1. Purpose

After a deal closes, a commission row is inserted with `payout_status = 'pending'`.
After a **14-day validation hold** (refund / chargeback / cancellation buffer), it must
transition to `payout_status = 'eligible'` so it appears in the Admin Payout Queue.

The sweep is **the only mechanism** that performs this transition. It **never moves money**.

## 2. Function

`public.sweep_commissions_eligibility(_delay_days integer DEFAULT 14)`

- Language: `plpgsql`
- Security: `SECURITY DEFINER`, `search_path = public`
- Returns: `jsonb { success, promoted, delay_days }`

```sql
UPDATE public.commissions
   SET payout_status = 'eligible',
       eligible_at   = now()
 WHERE payout_status = 'pending'
   AND created_at   <= now() - make_interval(days => _delay_days)
   AND is_simulation = false;
```

### Guarantees

| Guarantee | Mechanism |
|---|---|
| Only `pending` rows are touched | `WHERE payout_status = 'pending'` |
| `paid` rows cannot be reverted | `commissions_protect_finalized` trigger |
| `reversed` rows cannot be re-promoted | trigger + status filter |
| Simulation data excluded | `is_simulation = false` |
| Idempotent | re-running on already-eligible rows is a no-op |
| **No payout execution** | No call to `mark_commission_paid` / `mark_commissions_paid_batch` / Stripe / SEPA / any external API |

## 3. Schedule

| jobid | jobname | schedule | command |
|---|---|---|---|
| 44 | `sweep-commissions-eligibility-hourly` | `15 * * * *` (every hour, :15) | `SELECT public.sweep_commissions_eligibility(14);` |

Hourly cadence ensures a commission becomes eligible within ≤1h of crossing the 14-day mark.

## 4. Manual Trigger (Admin)

`/members/admin/payouts` → **"Sweep ausführen"** button → calls the same RPC.
Useful for testing or after manual data corrections. Identical behavior, identical guarantees.

## 5. Separation of Concerns

```
sweep_commissions_eligibility(14)   →  pending  →  eligible    [AUTOMATIC, hourly]
mark_commissions_paid_batch(...)    →  eligible →  paid        [MANUAL, admin only]
mark_commission_reversed(id, ...)   →  any      →  reversed    [MANUAL, admin only]
```

The sweep cannot pay. The payout RPCs cannot promote `pending → eligible`.
**No code path exists that auto-pays.**

## 6. Acceptance Tests (verified)

- ✅ `pending` commission older than 14 days → moves to `eligible` on next sweep
- ✅ `pending` commission younger than 14 days → stays `pending`
- ✅ `paid` commission → untouched (trigger blocks any change anyway)
- ✅ `reversed` commission → untouched
- ✅ Simulation rows → ignored
- ✅ Re-running sweep within the same hour → 0 additional promotions
- ✅ Sweep never invokes any payment provider, edge function, or money-moving code

## 7. Observability

```sql
-- Distribution
SELECT payout_status, count(*) FROM public.commissions GROUP BY 1;

-- Next candidates (will be promoted on next sweep)
SELECT id, user_id, amount, created_at, now() - created_at AS age
  FROM public.commissions
 WHERE payout_status = 'pending'
   AND is_simulation = false
   AND created_at <= now() - interval '14 days';

-- Cron job health
SELECT * FROM cron.job_run_details
 WHERE jobid = 44 ORDER BY start_time DESC LIMIT 20;
```
