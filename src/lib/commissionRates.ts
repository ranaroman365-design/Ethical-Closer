/**
 * Canonical Commission Rates Layer
 * ---------------------------------
 * Read-only access to the canonical `commission_rates` table.
 *
 * SHADOW LAYER — does NOT mutate any payouts. The existing `distribute_commissions`
 * RPC and JSONB-based commission resolution remain the source of execution.
 * This module only EXPOSES the canonical matrix and AUDITS drift.
 *
 * Override resolution belongs to the application layer; SQL never auto-applies.
 */

import { supabase } from '@/integrations/supabase/client';

export type OverrideScope = 'direct_only' | 'same_unit' | 'subtree' | 'global';

export interface CommissionRate {
  id: number;
  level: number;
  role_label: string;
  business_stages: string[];
  revenue_commission_pct: number;
  override_pct: number;
  override_on_levels: number[];
  override_scope: OverrideScope;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RawRow {
  id: number;
  level: number;
  role_label: string;
  business_stages: string[] | null;
  revenue_commission_pct: number | string;
  override_pct: number | string;
  override_on_levels: number[] | null;
  override_scope: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = 'commission_rates' as const;

function normalize(row: RawRow): CommissionRate {
  return {
    id: row.id,
    level: row.level,
    role_label: row.role_label,
    business_stages: row.business_stages ?? [],
    revenue_commission_pct: Number(row.revenue_commission_pct),
    override_pct: Number(row.override_pct),
    override_on_levels: row.override_on_levels ?? [],
    override_scope: (row.override_scope as OverrideScope) ?? 'direct_only',
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Resolve canonical commission config for a given business_stage.
 * Returns null for unknown stages — never throws.
 */
export async function getCommissionConfig(
  businessStage: string
): Promise<CommissionRate | null> {
  if (!businessStage) return null;

  try {
    // Use untyped client to avoid coupling to types.ts regen lag.
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .contains('business_stages', [businessStage])
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[commissionRates] getCommissionConfig error:', error.message);
      return null;
    }
    if (!data) return null;
    return normalize(data as RawRow);
  } catch (err) {
    console.warn('[commissionRates] getCommissionConfig exception:', err);
    return null;
  }
}

/**
 * Load all active commission rates (canonical matrix).
 */
export async function getAllCommissionRates(): Promise<CommissionRate[]> {
  try {
    const { data, error } = await (supabase as any)
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .order('level', { ascending: true });
    if (error) {
      console.warn('[commissionRates] getAllCommissionRates error:', error.message);
      return [];
    }
    return (data as RawRow[]).map(normalize);
  } catch (err) {
    console.warn('[commissionRates] getAllCommissionRates exception:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT / DEBUG UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export interface RateMismatch {
  business_stage: string;
  jsonb_rate_pct: number | null;
  canonical_rate_pct: number | null;
}

export interface CompareSourcesReport {
  missing_stages_in_canonical: string[];
  orphan_stages_in_canonical: string[];
  rate_mismatches: RateMismatch[];
  duplicate_mappings: Array<{ stage: string; levels: number[] }>;
  scanned_at: string;
}

/**
 * Compare new canonical commission_rates against legacy JSONB
 * (product_config.config.commission_rates). Audit only — no mutation.
 */
export async function compareCommissionConfigSources(
  productKey: string = 'etc'
): Promise<CompareSourcesReport> {
  const scanned_at = new Date().toISOString();
  const empty: CompareSourcesReport = {
    missing_stages_in_canonical: [],
    orphan_stages_in_canonical: [],
    rate_mismatches: [],
    duplicate_mappings: [],
    scanned_at,
  };

  try {
    const [canonicalRes, configRes] = await Promise.all([
      (supabase as any).from(TABLE).select('*').eq('is_active', true),
      supabase.from('product_config').select('config').eq('product_key', productKey).maybeSingle(),
    ]);

    if (canonicalRes.error) {
      console.warn('[commissionRates] compare canonical error:', canonicalRes.error.message);
    }
    if (configRes.error) {
      console.warn('[commissionRates] compare jsonb error:', configRes.error.message);
    }

    const canonical = ((canonicalRes.data ?? []) as RawRow[]).map(normalize);
    const cfg = (configRes.data?.config as Record<string, any> | undefined) ?? {};
    const jsonbRates = (cfg.commission_rates ?? {}) as Record<string, any>;

    // Build canonical stage map
    const canonicalStageMap = new Map<string, CommissionRate[]>();
    for (const row of canonical) {
      for (const stage of row.business_stages) {
        const arr = canonicalStageMap.get(stage) ?? [];
        arr.push(row);
        canonicalStageMap.set(stage, arr);
      }
    }

    const jsonbStages = Object.keys(jsonbRates);

    // Missing: present in JSONB, absent in canonical
    const missing_stages_in_canonical = jsonbStages.filter((s) => !canonicalStageMap.has(s));

    // Orphan: present in canonical, absent in JSONB
    const orphan_stages_in_canonical = Array.from(canonicalStageMap.keys()).filter(
      (s) => !jsonbStages.includes(s)
    );

    // Duplicate coverage in canonical
    const duplicate_mappings = Array.from(canonicalStageMap.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([stage, rows]) => ({ stage, levels: rows.map((r) => r.level) }));

    // Rate mismatches
    const rate_mismatches: RateMismatch[] = [];
    for (const stage of jsonbStages) {
      const jsonbEntry = jsonbRates[stage];
      const jsonbRatePct =
        typeof jsonbEntry === 'number'
          ? jsonbEntry * 100
          : typeof jsonbEntry?.rate === 'number'
            ? jsonbEntry.rate * 100
            : null;
      const canonicalRows = canonicalStageMap.get(stage);
      const canonicalRatePct = canonicalRows?.[0]?.revenue_commission_pct ?? null;
      if (
        jsonbRatePct !== null &&
        canonicalRatePct !== null &&
        Math.abs(jsonbRatePct - canonicalRatePct) > 0.01
      ) {
        rate_mismatches.push({
          business_stage: stage,
          jsonb_rate_pct: jsonbRatePct,
          canonical_rate_pct: canonicalRatePct,
        });
      }
    }

    return {
      missing_stages_in_canonical,
      orphan_stages_in_canonical,
      rate_mismatches,
      duplicate_mappings,
      scanned_at,
    };
  } catch (err) {
    console.warn('[commissionRates] compareCommissionConfigSources exception:', err);
    return empty;
  }
}

export interface StageCoverageReport {
  uncovered_stages: string[];
  duplicate_coverage: Array<{ stage: string; levels: number[] }>;
  inactive_mappings: string[];
  scanned_at: string;
}

/**
 * Validate that every distinct profiles.business_stage is covered by an
 * active canonical commission_rates row. Audit only.
 */
export async function validateCommissionStageCoverage(): Promise<StageCoverageReport> {
  const scanned_at = new Date().toISOString();
  const empty: StageCoverageReport = {
    uncovered_stages: [],
    duplicate_coverage: [],
    inactive_mappings: [],
    scanned_at,
  };

  try {
    const [profilesRes, ratesRes] = await Promise.all([
      supabase.from('profiles').select('business_stage'),
      (supabase as any).from(TABLE).select('*'),
    ]);

    if (profilesRes.error) {
      console.warn('[commissionRates] coverage profiles error:', profilesRes.error.message);
    }
    if (ratesRes.error) {
      console.warn('[commissionRates] coverage rates error:', ratesRes.error.message);
    }

    const allRates = ((ratesRes.data ?? []) as RawRow[]).map(normalize);
    const activeMap = new Map<string, CommissionRate[]>();
    const inactiveStages = new Set<string>();

    for (const row of allRates) {
      for (const stage of row.business_stages) {
        if (row.is_active) {
          const arr = activeMap.get(stage) ?? [];
          arr.push(row);
          activeMap.set(stage, arr);
        } else {
          inactiveStages.add(stage);
        }
      }
    }

    const distinctStages = Array.from(
      new Set(
        ((profilesRes.data ?? []) as Array<{ business_stage: string | null }>)
          .map((p) => p.business_stage)
          .filter((s): s is string => !!s)
      )
    );

    const uncovered_stages = distinctStages.filter((s) => !activeMap.has(s));

    const duplicate_coverage = Array.from(activeMap.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([stage, rows]) => ({ stage, levels: rows.map((r) => r.level) }));

    const inactive_mappings = Array.from(inactiveStages).filter((s) => !activeMap.has(s));

    return { uncovered_stages, duplicate_coverage, inactive_mappings, scanned_at };
  } catch (err) {
    console.warn('[commissionRates] validateCommissionStageCoverage exception:', err);
    return empty;
  }
}

/**
 * Optional shadow-debug helper. Call alongside the existing
 * distribute_commissions pipeline to compare the canonical rate against
 * whatever rate the legacy path would use. PURE LOGGING.
 */
export async function debugShadowCompareRate(opts: {
  businessStage: string;
  legacyRatePct: number | null;
  context?: Record<string, unknown>;
}): Promise<void> {
  const canonical = await getCommissionConfig(opts.businessStage);
  const canonicalPct = canonical?.revenue_commission_pct ?? null;
  const drift =
    canonicalPct !== null && opts.legacyRatePct !== null
      ? Math.abs(canonicalPct - opts.legacyRatePct) > 0.01
      : false;

  console.debug('[commissionRates:shadow]', {
    stage: opts.businessStage,
    legacy_pct: opts.legacyRatePct,
    canonical_pct: canonicalPct,
    drift,
    canonical_level: canonical?.level ?? null,
    context: opts.context ?? {},
  });
}
