/**
 * Canonical KPI Hierarchy — Layer 52 (BINDING)
 *
 * ONE unified KPI truth model. All dashboards, hooks, and edge functions
 * MUST resolve KPIs through this hierarchy. No inline computation.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * HIERARCHY (top → bottom):
 *
 *   L1  System KPIs          (cross-domain, North Star)
 *   L2  Domain KPIs          (Revenue / Talent / Intelligence / Traffic)
 *   L3  Operator KPIs        (per-user performance metrics)
 *   L4  Diagnostic KPIs      (drill-down, ethical, advanced)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TABLE OWNERSHIP (canonical mapping):
 *
 *   Table                       │ Layer │ Owner          │ Status
 *   ────────────────────────────┼───────┼────────────────┼──────────
 *   real_kpi_snapshot (view)    │ L1/L2 │ Intelligence   │ CANONICAL — funnel aggregates
 *   kpi_snapshots               │ L3    │ Talent         │ CANONICAL — weekly per-operator
 *   member_kpis                 │ L3/L4 │ Talent         │ CANONICAL — latest per-operator (extended)
 *   users_kpi_snapshot          │ —     │ —              │ DEPRECATED → use member_kpis
 *   dashboard_daily_aggregates  │ —     │ —              │ DEPRECATED → use real_kpi_snapshot
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── KPI Tiers ──────────────────────────────────────────────────────

export type KpiTier = 'system' | 'domain' | 'operator' | 'diagnostic';

export interface CanonicalKpiMeta {
  id: string;
  label_de: string;
  label_en: string;
  tier: KpiTier;
  domain: 'revenue' | 'talent' | 'intelligence' | 'traffic' | 'cross';
  /** Which canonical table is the source of truth */
  source_table: 'real_kpi_snapshot' | 'kpi_snapshots' | 'member_kpis';
  /** Column name in source table (or JSONB path for real_kpi_snapshot) */
  source_column: string;
  unit: 'percent' | 'currency_eur' | 'count' | 'minutes' | 'ratio' | 'score';
  /** true = lower is better */
  invert: boolean;
  /** Minimum operator level to see this KPI */
  min_level: number;
  /** Maximum operator level (undefined = no cap) */
  max_level?: number;
}

// ─── L1: System KPIs (North Star + Cross-Domain) ────────────────────

export const SYSTEM_KPIS: CanonicalKpiMeta[] = [
  {
    id: 'north_star_revenue_per_operator',
    label_de: 'Revenue per Operator (30d)',
    label_en: 'Revenue per Operator (30d)',
    tier: 'system',
    domain: 'cross',
    source_table: 'real_kpi_snapshot',
    source_column: 'revenue_per_operator', // derived: revenue / active operator count
    unit: 'currency_eur',
    invert: false,
    min_level: 6,
  },
  {
    id: 'system_total_revenue',
    label_de: 'Gesamtumsatz',
    label_en: 'Total Revenue',
    tier: 'system',
    domain: 'revenue',
    source_table: 'real_kpi_snapshot',
    source_column: 'revenue',
    unit: 'currency_eur',
    invert: false,
    min_level: 6,
  },
];

// ─── L2: Domain KPIs (Funnel / Pipeline Aggregates) ─────────────────

export const DOMAIN_KPIS: CanonicalKpiMeta[] = [
  {
    id: 'funnel_booking_rate',
    label_de: 'Buchungsrate',
    label_en: 'Booking Rate',
    tier: 'domain',
    domain: 'revenue',
    source_table: 'real_kpi_snapshot',
    source_column: 'booking_rate',
    unit: 'percent',
    invert: false,
    min_level: 4,
  },
  {
    id: 'funnel_show_rate',
    label_de: 'Show Rate (Funnel)',
    label_en: 'Show Rate (Funnel)',
    tier: 'domain',
    domain: 'revenue',
    source_table: 'real_kpi_snapshot',
    source_column: 'show_rate',
    unit: 'percent',
    invert: false,
    min_level: 4,
  },
  {
    id: 'funnel_close_rate',
    label_de: 'Close Rate (Funnel)',
    label_en: 'Close Rate (Funnel)',
    tier: 'domain',
    domain: 'revenue',
    source_table: 'real_kpi_snapshot',
    source_column: 'close_rate',
    unit: 'percent',
    invert: false,
    min_level: 4,
  },
  {
    id: 'funnel_revenue_per_lead',
    label_de: 'Revenue per Lead',
    label_en: 'Revenue per Lead',
    tier: 'domain',
    domain: 'revenue',
    source_table: 'real_kpi_snapshot',
    source_column: 'revenue_per_lead',
    unit: 'currency_eur',
    invert: false,
    min_level: 4,
  },
  {
    id: 'funnel_revenue_per_show',
    label_de: 'Revenue per Show',
    label_en: 'Revenue per Show',
    tier: 'domain',
    domain: 'revenue',
    source_table: 'real_kpi_snapshot',
    source_column: 'revenue_per_show',
    unit: 'currency_eur',
    invert: false,
    min_level: 4,
  },
  {
    id: 'funnel_total_leads',
    label_de: 'Leads gesamt',
    label_en: 'Total Leads',
    tier: 'domain',
    domain: 'traffic',
    source_table: 'real_kpi_snapshot',
    source_column: 'total_leads',
    unit: 'count',
    invert: false,
    min_level: 4,
  },
  {
    id: 'funnel_no_show_count',
    label_de: 'No-Shows',
    label_en: 'No-Shows',
    tier: 'domain',
    domain: 'revenue',
    source_table: 'real_kpi_snapshot',
    source_column: 'no_shows',
    unit: 'count',
    invert: true,
    min_level: 4,
  },
];

// ─── L3: Operator KPIs (Per-User Weekly/Latest) ─────────────────────

export const OPERATOR_KPIS: CanonicalKpiMeta[] = [
  {
    id: 'op_closing_rate',
    label_de: 'Close Rate',
    label_en: 'Close Rate',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'closing_rate',
    unit: 'percent',
    invert: false,
    min_level: 4,
  },
  {
    id: 'op_show_rate',
    label_de: 'Show Rate',
    label_en: 'Show Rate',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'show_rate',
    unit: 'percent',
    invert: false,
    min_level: 1,
  },
  {
    id: 'op_revenue_closed',
    label_de: 'Umsatz',
    label_en: 'Revenue Closed',
    tier: 'operator',
    domain: 'revenue',
    source_table: 'member_kpis',
    source_column: 'revenue_closed',
    unit: 'currency_eur',
    invert: false,
    min_level: 4,
  },
  {
    id: 'op_commission_earned',
    label_de: 'Provision',
    label_en: 'Commission',
    tier: 'operator',
    domain: 'revenue',
    source_table: 'member_kpis',
    source_column: 'commission_earned',
    unit: 'currency_eur',
    invert: false,
    min_level: 1,
  },
  {
    id: 'op_storno_rate',
    label_de: 'Storno Rate',
    label_en: 'Cancellation Rate',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'storno_rate',
    unit: 'percent',
    invert: true,
    min_level: 1,
  },
  {
    id: 'op_response_time',
    label_de: 'Reaktionszeit',
    label_en: 'Response Time',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'response_time',
    unit: 'minutes',
    invert: true,
    min_level: 1,
  },
  {
    id: 'op_follow_up_rate',
    label_de: 'Follow-Up Rate',
    label_en: 'Follow-Up Rate',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'follow_up_rate',
    unit: 'percent',
    invert: false,
    min_level: 1,
  },
  {
    id: 'op_crm_hygiene',
    label_de: 'CRM Hygiene',
    label_en: 'CRM Hygiene',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'crm_hygiene_score',
    unit: 'percent',
    invert: false,
    min_level: 1,
  },
  {
    id: 'op_calls_handled',
    label_de: 'Calls bearbeitet',
    label_en: 'Calls Handled',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'calls_handled',
    unit: 'count',
    invert: false,
    min_level: 1,
  },
  {
    id: 'op_earnings_per_call',
    label_de: 'EPC',
    label_en: 'Earnings per Call',
    tier: 'operator',
    domain: 'revenue',
    source_table: 'member_kpis',
    source_column: 'earnings_per_call',
    unit: 'currency_eur',
    invert: false,
    min_level: 5,
  },
  // Setter-specific
  {
    id: 'op_qualification_accuracy',
    label_de: 'Qualifikationsrate',
    label_en: 'Qualification Accuracy',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'qualification_accuracy',
    unit: 'percent',
    invert: false,
    min_level: 2,
    max_level: 3,
  },
  {
    id: 'op_handover_rate',
    label_de: 'Übergaberate',
    label_en: 'Handover Rate',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'handover_rate',
    unit: 'percent',
    invert: false,
    min_level: 2,
    max_level: 3,
  },
  {
    id: 'op_leads_assigned',
    label_de: 'Leads zugewiesen',
    label_en: 'Leads Assigned',
    tier: 'operator',
    domain: 'talent',
    source_table: 'member_kpis',
    source_column: 'leads_assigned',
    unit: 'count',
    invert: false,
    min_level: 2,
    max_level: 3,
  },
  {
    id: 'op_setter_influenced_revenue',
    label_de: 'Beeinflusster Umsatz',
    label_en: 'Setter Influenced Revenue',
    tier: 'operator',
    domain: 'revenue',
    source_table: 'member_kpis',
    source_column: 'setter_influenced_revenue',
    unit: 'currency_eur',
    invert: false,
    min_level: 2,
    max_level: 3,
  },
];

// ─── L4: Diagnostic KPIs (Ethical, Advanced, Drill-Down) ────────────

export const DIAGNOSTIC_KPIS: CanonicalKpiMeta[] = [
  {
    id: 'diag_lead_quality_sensitivity',
    label_de: 'Lead-Qualitäts-Sensitivität',
    label_en: 'Lead Quality Sensitivity',
    tier: 'diagnostic',
    domain: 'intelligence',
    source_table: 'member_kpis',
    source_column: 'lead_quality_sensitivity',
    unit: 'score',
    invert: false,
    min_level: 4,
  },
  {
    id: 'diag_arrival_score',
    label_de: 'Ankunfts-Score',
    label_en: 'Arrival Score',
    tier: 'diagnostic',
    domain: 'intelligence',
    source_table: 'member_kpis',
    source_column: 'arrival_score',
    unit: 'score',
    invert: false,
    min_level: 4,
  },
  {
    id: 'diag_context_score',
    label_de: 'Kontext-Score',
    label_en: 'Context Score',
    tier: 'diagnostic',
    domain: 'intelligence',
    source_table: 'member_kpis',
    source_column: 'context_score',
    unit: 'score',
    invert: false,
    min_level: 4,
  },
  {
    id: 'diag_ethical_alignment',
    label_de: 'Ethical Alignment',
    label_en: 'Ethical Alignment',
    tier: 'diagnostic',
    domain: 'intelligence',
    source_table: 'member_kpis',
    source_column: 'ethical_alignment_score',
    unit: 'score',
    invert: false,
    min_level: 4,
  },
  {
    id: 'diag_pressure_index',
    label_de: 'Druck-Index',
    label_en: 'Pressure Index',
    tier: 'diagnostic',
    domain: 'intelligence',
    source_table: 'member_kpis',
    source_column: 'pressure_index',
    unit: 'score',
    invert: true,
    min_level: 4,
  },
  {
    id: 'diag_decision_conversion',
    label_de: 'Entscheidungsrate',
    label_en: 'Decision Conversion Rate',
    tier: 'diagnostic',
    domain: 'intelligence',
    source_table: 'member_kpis',
    source_column: 'decision_conversion_rate',
    unit: 'percent',
    invert: false,
    min_level: 4,
  },
];

// ─── Full Registry ──────────────────────────────────────────────────

export const ALL_CANONICAL_KPIS: CanonicalKpiMeta[] = [
  ...SYSTEM_KPIS,
  ...DOMAIN_KPIS,
  ...OPERATOR_KPIS,
  ...DIAGNOSTIC_KPIS,
];

// ─── Lookup Helpers ─────────────────────────────────────────────────

export function getCanonicalKpi(id: string): CanonicalKpiMeta | undefined {
  return ALL_CANONICAL_KPIS.find(k => k.id === id);
}

export function getKpisByTier(tier: KpiTier): CanonicalKpiMeta[] {
  return ALL_CANONICAL_KPIS.filter(k => k.tier === tier);
}

export function getKpisByDomain(domain: CanonicalKpiMeta['domain']): CanonicalKpiMeta[] {
  return ALL_CANONICAL_KPIS.filter(k => k.domain === domain);
}

export function getKpisForOperatorLevel(level: number): CanonicalKpiMeta[] {
  return ALL_CANONICAL_KPIS.filter(
    k => k.min_level <= level && (k.max_level === undefined || k.max_level >= level)
  );
}

export function getKpiLabel(id: string, lang: 'de' | 'en' = 'de'): string {
  const kpi = getCanonicalKpi(id);
  if (!kpi) return id;
  return lang === 'de' ? kpi.label_de : kpi.label_en;
}

// ─── Table Ownership Map ────────────────────────────────────────────

export const KPI_TABLE_OWNERSHIP = {
  /** CANONICAL: Funnel-level aggregates (view). Owner: Intelligence. Read-only. */
  real_kpi_snapshot: {
    status: 'canonical' as const,
    tier: 'domain' as const,
    owner: 'intelligence',
    description: 'Funnel-level aggregates derived from leads + calls. View, not table.',
  },
  /** CANONICAL: Weekly per-operator snapshots. Owner: Talent. Written by calculate-kpi-snapshots cron. */
  kpi_snapshots: {
    status: 'canonical' as const,
    tier: 'operator' as const,
    owner: 'talent',
    description: 'Weekly per-operator performance history. Used for trend analysis and promotion evaluation.',
  },
  /** CANONICAL: Latest per-operator KPIs (extended with ethical/diagnostic scores). Owner: Talent. Written by sync-kpis. */
  member_kpis: {
    status: 'canonical' as const,
    tier: 'operator' as const,
    owner: 'talent',
    description: 'Latest per-operator KPIs including ethical and diagnostic scores. Primary source for operator dashboards.',
  },
  /** DEPRECATED: Simplified derivative of member_kpis. Migrate consumers to member_kpis. */
  users_kpi_snapshot: {
    status: 'deprecated' as const,
    tier: 'operator' as const,
    owner: 'none',
    description: 'DEPRECATED — redundant subset of member_kpis. All consumers must migrate.',
    migrateTo: 'member_kpis',
  },
  /** DEPRECATED: Barely used (2 rows). Funnel aggregates belong in real_kpi_snapshot. */
  dashboard_daily_aggregates: {
    status: 'deprecated' as const,
    tier: 'domain' as const,
    owner: 'none',
    description: 'DEPRECATED — 2 rows, JSONB blob. Use real_kpi_snapshot for funnel aggregates.',
    migrateTo: 'real_kpi_snapshot',
  },
} as const;

// ─── Deprecation Warnings ───────────────────────────────────────────

export const DEPRECATED_TABLES = ['users_kpi_snapshot', 'dashboard_daily_aggregates'] as const;

/**
 * Call this from dev/test to detect deprecated KPI table usage.
 * Will console.warn in development.
 */
export function warnIfDeprecatedKpiTable(tableName: string): void {
  if (DEPRECATED_TABLES.includes(tableName as any)) {
    const info = KPI_TABLE_OWNERSHIP[tableName as keyof typeof KPI_TABLE_OWNERSHIP];
    if (info && 'migrateTo' in info) {
      console.warn(
        `[KPI Hierarchy] Table "${tableName}" is DEPRECATED. Migrate to "${info.migrateTo}". ${info.description}`
      );
    }
  }
}

// ─── Audit Function ─────────────────────────────────────────────────

export interface KpiHierarchyAudit {
  totalKpis: number;
  byTier: Record<KpiTier, number>;
  byDomain: Record<string, number>;
  canonicalTables: string[];
  deprecatedTables: string[];
  violations: string[];
}

export function auditKpiHierarchy(): KpiHierarchyAudit {
  const violations: string[] = [];

  // Check for duplicate source_column references across same tier
  const seen = new Map<string, string>();
  for (const kpi of ALL_CANONICAL_KPIS) {
    const key = `${kpi.source_table}:${kpi.source_column}`;
    if (seen.has(key)) {
      violations.push(
        `Duplicate source: ${kpi.id} and ${seen.get(key)} both read ${key}`
      );
    }
    seen.set(key, kpi.id);
  }

  // Check for KPIs referencing deprecated tables
  for (const kpi of ALL_CANONICAL_KPIS) {
    if (DEPRECATED_TABLES.includes(kpi.source_table as any)) {
      violations.push(`KPI "${kpi.id}" references deprecated table "${kpi.source_table}"`);
    }
  }

  const byTier: Record<KpiTier, number> = { system: 0, domain: 0, operator: 0, diagnostic: 0 };
  const byDomain: Record<string, number> = {};
  for (const kpi of ALL_CANONICAL_KPIS) {
    byTier[kpi.tier]++;
    byDomain[kpi.domain] = (byDomain[kpi.domain] || 0) + 1;
  }

  return {
    totalKpis: ALL_CANONICAL_KPIS.length,
    byTier,
    byDomain,
    canonicalTables: ['real_kpi_snapshot', 'kpi_snapshots', 'member_kpis'],
    deprecatedTables: [...DEPRECATED_TABLES],
    violations,
  };
}
