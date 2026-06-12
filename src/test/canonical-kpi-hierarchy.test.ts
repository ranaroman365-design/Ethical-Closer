import { describe, it, expect } from 'vitest';
import {
  ALL_CANONICAL_KPIS,
  SYSTEM_KPIS,
  DOMAIN_KPIS,
  OPERATOR_KPIS,
  DIAGNOSTIC_KPIS,
  KPI_TABLE_OWNERSHIP,
  DEPRECATED_TABLES,
  auditKpiHierarchy,
  getKpisByTier,
  getKpisForOperatorLevel,
  getCanonicalKpi,
} from '@/lib/canonical-kpi-hierarchy';

describe('Canonical KPI Hierarchy (Layer 52)', () => {
  it('has exactly 4 tiers', () => {
    const tiers = new Set(ALL_CANONICAL_KPIS.map(k => k.tier));
    expect(tiers).toEqual(new Set(['system', 'domain', 'operator', 'diagnostic']));
  });

  it('all KPIs have unique IDs', () => {
    const ids = ALL_CANONICAL_KPIS.map(k => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no KPI references a deprecated table', () => {
    const violations = ALL_CANONICAL_KPIS.filter(k =>
      DEPRECATED_TABLES.includes(k.source_table as any)
    );
    expect(violations).toEqual([]);
  });

  it('all KPIs reference only canonical tables', () => {
    const allowed = new Set(['real_kpi_snapshot', 'kpi_snapshots', 'member_kpis']);
    for (const kpi of ALL_CANONICAL_KPIS) {
      expect(allowed.has(kpi.source_table)).toBe(true);
    }
  });

  it('system tier contains North Star KPI', () => {
    const northStar = SYSTEM_KPIS.find(k => k.id === 'north_star_revenue_per_operator');
    expect(northStar).toBeDefined();
    expect(northStar!.domain).toBe('cross');
  });

  it('deprecated tables are documented', () => {
    expect(DEPRECATED_TABLES).toContain('users_kpi_snapshot');
    expect(DEPRECATED_TABLES).toContain('dashboard_daily_aggregates');
    expect(KPI_TABLE_OWNERSHIP.users_kpi_snapshot.status).toBe('deprecated');
    expect(KPI_TABLE_OWNERSHIP.dashboard_daily_aggregates.status).toBe('deprecated');
  });

  it('canonical tables have correct ownership', () => {
    expect(KPI_TABLE_OWNERSHIP.real_kpi_snapshot.owner).toBe('intelligence');
    expect(KPI_TABLE_OWNERSHIP.kpi_snapshots.owner).toBe('talent');
    expect(KPI_TABLE_OWNERSHIP.member_kpis.owner).toBe('talent');
  });

  it('L1 operator sees only appropriate KPIs', () => {
    const l1 = getKpisForOperatorLevel(1);
    expect(l1.every(k => k.min_level <= 1)).toBe(true);
    expect(l1.some(k => k.id === 'op_show_rate')).toBe(true);
    expect(l1.some(k => k.id === 'op_closing_rate')).toBe(false); // min_level 4
  });

  it('L6 operator sees all non-setter KPIs', () => {
    const l6 = getKpisForOperatorLevel(6);
    expect(l6.some(k => k.id === 'op_closing_rate')).toBe(true);
    expect(l6.some(k => k.id === 'north_star_revenue_per_operator')).toBe(true);
    // Setter-specific KPIs capped at L3
    expect(l6.some(k => k.id === 'op_qualification_accuracy')).toBe(false);
  });

  it('audit passes with zero violations', () => {
    const result = auditKpiHierarchy();
    expect(result.violations).toEqual([]);
    expect(result.totalKpis).toBeGreaterThan(20);
    expect(result.canonicalTables).toHaveLength(3);
    expect(result.deprecatedTables).toHaveLength(2);
  });

  it('getCanonicalKpi returns correct metadata', () => {
    const kpi = getCanonicalKpi('op_closing_rate');
    expect(kpi).toBeDefined();
    expect(kpi!.source_table).toBe('member_kpis');
    expect(kpi!.source_column).toBe('closing_rate');
    expect(kpi!.unit).toBe('percent');
  });

  it('tier counts are balanced', () => {
    expect(SYSTEM_KPIS.length).toBeGreaterThanOrEqual(2);
    expect(DOMAIN_KPIS.length).toBeGreaterThanOrEqual(5);
    expect(OPERATOR_KPIS.length).toBeGreaterThanOrEqual(10);
    expect(DIAGNOSTIC_KPIS.length).toBeGreaterThanOrEqual(5);
  });
});
