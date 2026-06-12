/**
 * Canonical Commission — Shadow Validation Layer
 * -----------------------------------------------
 * Read-only access to the `commission_diff_audit` table and the shadow RPCs.
 *
 * SHADOW LAYER ONLY — never drives payouts.
 * Legacy JSONB resolution in `distribute_commissions` remains the executing
 * source of truth. This module exposes the diffs the DB trigger records.
 *
 * Block: Value · Layer: Revenue Engine · Canon-id: V (commission canon)
 */

import { supabase } from '@/integrations/supabase/client';

export type DiffSeverity = 'safe' | 'warning' | 'critical';

export interface CommissionDiffRow {
  id: string;
  call_id: string;
  user_id: string | null;
  role: string;
  business_stage: string | null;
  canonical_level: number | null;
  legacy_rate_pct: number | null;
  canonical_rate_pct: number | null;
  legacy_amount: number | null;
  canonical_amount: number | null;
  delta: number | null;
  percentage_delta: number | null;
  diff_severity: DiffSeverity;
  diff_reason: string | null;
  revenue: number | null;
  legacy_source: string;
  canonical_source: string;
  computed_at: string;
}

export interface CommissionDiffSummaryRow {
  day: string;
  diff_severity: DiffSeverity;
  rows: number;
  abs_delta_sum: number;
  net_delta_sum: number;
  calls_affected: number;
  users_affected: number;
}

const TABLE = 'commission_diff_audit' as const;
const VIEW = 'commission_diff_audit_summary' as const;

/** Latest N diff rows, newest first. Admin-only via RLS. */
export async function getRecentCommissionDiffs(
  limit = 50,
  severity?: DiffSeverity,
): Promise<CommissionDiffRow[]> {
  try {
    let q = (supabase as any).from(TABLE).select('*').order('computed_at', { ascending: false }).limit(limit);
    if (severity) q = q.eq('diff_severity', severity);
    const { data, error } = await q;
    if (error) {
      console.warn('[commission-shadow] getRecentCommissionDiffs:', error.message);
      return [];
    }
    return (data ?? []) as CommissionDiffRow[];
  } catch (err) {
    console.warn('[commission-shadow] exception:', err);
    return [];
  }
}

/** All diffs for a single call. */
export async function getDiffsForCall(callId: string): Promise<CommissionDiffRow[]> {
  try {
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select('*')
      .eq('call_id', callId)
      .order('role', { ascending: true });
    if (error) {
      console.warn('[commission-shadow] getDiffsForCall:', error.message);
      return [];
    }
    return (data ?? []) as CommissionDiffRow[];
  } catch (err) {
    console.warn('[commission-shadow] exception:', err);
    return [];
  }
}

/** 90-day rollup by day × severity. */
export async function getCommissionDiffSummary(): Promise<CommissionDiffSummaryRow[]> {
  try {
    const { data, error } = await (supabase as any).from(VIEW).select('*');
    if (error) {
      console.warn('[commission-shadow] getCommissionDiffSummary:', error.message);
      return [];
    }
    return (data ?? []) as CommissionDiffSummaryRow[];
  } catch (err) {
    console.warn('[commission-shadow] exception:', err);
    return [];
  }
}

/**
 * Force-recompute diff for a single call (idempotent — uses upsert).
 * Useful for backfill or re-evaluation after a `commission_rates` change.
 */
export async function recomputeShadowDiff(callId: string): Promise<{ ok: boolean; recorded?: number; error?: string }> {
  try {
    const { data, error } = await (supabase as any).rpc('record_commission_shadow_diff', { p_call_id: callId });
    if (error) return { ok: false, error: error.message };
    return { ok: true, recorded: (data as any)?.recorded ?? 0 };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Read-only: what would the canonical commission_rates layer produce for this call? */
export async function previewCanonicalCommission(callId: string): Promise<unknown> {
  try {
    const { data, error } = await (supabase as any).rpc('shadow_compute_canonical_commission', { p_call_id: callId });
    if (error) {
      console.warn('[commission-shadow] previewCanonicalCommission:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

// ─── Cutover-readiness scoring ──────────────────────────────────────────

export interface CutoverReadinessScore {
  total_diffs: number;
  safe_count: number;
  warning_count: number;
  critical_count: number;
  safe_pct: number;
  ready: boolean; // true if >= 99% safe and 0 critical
  abs_delta_sum: number;
  scanned_at: string;
}

/** Aggregate readiness signal: are we safe to cut over to canonical? */
export async function computeCutoverReadiness(): Promise<CutoverReadinessScore> {
  const summary = await getCommissionDiffSummary();
  const totals = summary.reduce(
    (acc, r) => {
      acc.total += r.rows;
      acc.abs_delta_sum += Number(r.abs_delta_sum ?? 0);
      if (r.diff_severity === 'safe') acc.safe += r.rows;
      if (r.diff_severity === 'warning') acc.warning += r.rows;
      if (r.diff_severity === 'critical') acc.critical += r.rows;
      return acc;
    },
    { total: 0, safe: 0, warning: 0, critical: 0, abs_delta_sum: 0 },
  );
  const safe_pct = totals.total > 0 ? (totals.safe / totals.total) * 100 : 0;
  return {
    total_diffs: totals.total,
    safe_count: totals.safe,
    warning_count: totals.warning,
    critical_count: totals.critical,
    safe_pct,
    abs_delta_sum: totals.abs_delta_sum,
    ready: totals.total >= 30 && safe_pct >= 99 && totals.critical === 0,
    scanned_at: new Date().toISOString(),
  };
}
