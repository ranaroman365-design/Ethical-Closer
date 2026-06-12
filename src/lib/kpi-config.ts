import { normalizeBusinessStage } from '@/lib/stage-utils';
import { PRODUCT } from '@/config/product';

/**
 * KPI Career System Configuration
 * Performance-based career OS — references PRODUCT config for career levels
 */

// ─── Commission Rates per Level (from product config) ───
export const COMMISSION_RATES = PRODUCT.commissions;

// ─── Career Level Mapping ───

// ─── Career Level Mapping (derived from product config) ───
export const CAREER_LEVELS = PRODUCT.career.levels.map(l => ({
  level: l.level,
  key: l.key,
  title: l.de,
  titleEn: l.en,
  role: l.role,
}));

// ─── KPI Definitions ───

export type KpiKey =
  | 'closing_rate'
  | 'show_rate'
  | 'revenue_closed'
  | 'commission_earned'
  | 'storno_rate'
  | 'response_time'
  | 'follow_up_rate'
  | 'crm_hygiene_score'
  | 'lead_quality_sensitivity'
  | 'earnings_per_call'
  | 'qualification_accuracy'
  | 'handover_rate'
  | 'leads_assigned'
  | 'setter_influenced_revenue';

export interface KpiDefinition {
  key: KpiKey;
  label: string;
  suffix: string;
  category: 'performance' | 'execution' | 'advanced' | 'revenue';
  /** true = lower is better (e.g. storno_rate, response_time) */
  invert?: boolean;
  /** Minimum career level where this KPI is shown */
  minLevel: number;
  /** Maximum career level where this KPI is shown (optional) */
  maxLevel?: number;
  /** Format hint for display */
  format?: 'currency' | 'number' | 'percent';
}

export const KPI_DEFINITIONS: KpiDefinition[] = [
  // Revenue KPIs
  { key: 'commission_earned', label: 'Provision', suffix: '€', category: 'revenue', minLevel: 1, format: 'currency' },
  { key: 'revenue_closed', label: 'Umsatz (gesamt)', suffix: '€', category: 'revenue', minLevel: 4, format: 'currency' },
  { key: 'setter_influenced_revenue', label: 'Beeinflusster Umsatz', suffix: '€', category: 'revenue', minLevel: 2, maxLevel: 3, format: 'currency' },

  // Performance KPIs (Core)
  { key: 'closing_rate', label: 'Close Rate', suffix: '%', category: 'performance', minLevel: 4, format: 'percent' },
  { key: 'show_rate', label: 'Show Rate', suffix: '%', category: 'performance', minLevel: 1, format: 'percent' },
  { key: 'storno_rate', label: 'Storno Rate', suffix: '%', category: 'performance', invert: true, minLevel: 1, format: 'percent' },

  // Setter-specific KPIs
  { key: 'leads_assigned', label: 'Leads zugewiesen', suffix: '', category: 'execution', minLevel: 2, maxLevel: 3, format: 'number' },
  { key: 'qualification_accuracy', label: 'Qualifikationsrate', suffix: '%', category: 'execution', minLevel: 2, maxLevel: 3, format: 'percent' },
  { key: 'handover_rate', label: 'Übergaberate', suffix: '%', category: 'execution', minLevel: 2, maxLevel: 3, format: 'percent' },

  // Execution KPIs (Core)
  { key: 'response_time', label: 'Response Time', suffix: 'min', category: 'execution', invert: true, minLevel: 1, format: 'number' },
  { key: 'follow_up_rate', label: 'Follow-Up', suffix: '%', category: 'execution', minLevel: 1, format: 'percent' },
  { key: 'crm_hygiene_score', label: 'CRM Hygiene', suffix: '%', category: 'execution', minLevel: 1, format: 'percent' },

  // Advanced KPIs
  { key: 'lead_quality_sensitivity', label: 'Lead Quality', suffix: '', category: 'advanced', minLevel: 4, format: 'number' },
  { key: 'earnings_per_call', label: 'EPC', suffix: '€', category: 'advanced', minLevel: 5, format: 'currency' },
];

// ─── Thresholds per Level ───

export interface KpiThreshold {
  min?: number;
  max?: number;
  /** Yellow zone starts at this value (between red and green) */
  yellowAt?: number;
}

export type LevelThresholds = Partial<Record<KpiKey, KpiThreshold>>;

export const KPI_THRESHOLDS: Record<number, LevelThresholds> = {
  // Level 1 – Trainee (Opener)
  1: {
    show_rate: { min: 60, yellowAt: 55 },
    storno_rate: { max: 15, yellowAt: 12 },
    response_time: { max: 30, yellowAt: 20 },
    follow_up_rate: { min: 80, yellowAt: 70 },
    crm_hygiene_score: { min: 80, yellowAt: 70 },
  },

  // Level 2 – Setter (Mentee)
  2: {
    show_rate: { min: 70, yellowAt: 65 },
    qualification_accuracy: { min: 60, yellowAt: 50 },
    handover_rate: { min: 50, yellowAt: 40 },
    storno_rate: { max: 12, yellowAt: 10 },
    response_time: { max: 15, yellowAt: 12 },
    follow_up_rate: { min: 90, yellowAt: 85 },
    crm_hygiene_score: { min: 90, yellowAt: 85 },
  },

  // Level 3 – Senior Setter (Mentor)
  3: {
    show_rate: { min: 77, yellowAt: 72 },
    qualification_accuracy: { min: 70, yellowAt: 60 },
    handover_rate: { min: 60, yellowAt: 50 },
    storno_rate: { max: 10, yellowAt: 8 },
    response_time: { max: 10, yellowAt: 8 },
    follow_up_rate: { min: 95, yellowAt: 90 },
    crm_hygiene_score: { min: 95, yellowAt: 90 },
  },

  // Level 4 – Closer (Junior, Getting Placement Ready)
  4: {
    closing_rate: { min: 20, yellowAt: 17 },
    show_rate: { min: 75, yellowAt: 70 },
    revenue_closed: { min: 10000, yellowAt: 7500 },
    storno_rate: { max: 10, yellowAt: 8 },
    response_time: { max: 10, yellowAt: 8 },
    follow_up_rate: { min: 95, yellowAt: 90 },
    crm_hygiene_score: { min: 95, yellowAt: 90 },
  },

  // Level 5 – Closer (Advanced / Mentor, Placement Track)
  5: {
    closing_rate: { min: 27, yellowAt: 23 },
    show_rate: { min: 80, yellowAt: 75 },
    revenue_closed: { min: 25000, yellowAt: 18000 },
    storno_rate: { max: 8, yellowAt: 6 },
    response_time: { max: 5, yellowAt: 4 },
    follow_up_rate: { min: 100, yellowAt: 95 },
    crm_hygiene_score: { min: 98, yellowAt: 95 },
  },

  // Level 6 – Top Closer (Placed)
  6: {
    closing_rate: { min: 32, yellowAt: 28 },
    show_rate: { min: 85, yellowAt: 80 },
    revenue_closed: { min: 50000, yellowAt: 35000 },
    storno_rate: { max: 5, yellowAt: 4 },
    response_time: { max: 5, yellowAt: 3 },
    follow_up_rate: { min: 100, yellowAt: 98 },
    crm_hygiene_score: { min: 98, yellowAt: 96 },
  },
};

// ─── Placement Ready Definition ───

export const PLACEMENT_READY_THRESHOLDS: Record<string, number> = {
  closing_rate: 25,
  show_rate: 75,
  revenue_closed: 20000,
  storno_rate: 8,      // max
  response_time: 10,   // max (minutes)
  follow_up_rate: 95,
  crm_hygiene_score: 95,
  lead_quality_sensitivity: 0, // not checked
  earnings_per_call: 0,        // not checked
};

/** Minimum weeks of stable KPI performance required */
export const PLACEMENT_STABILITY_WEEKS = 3;

// ─── Helpers ───

export function getLevelForStage(stage: string): number {
  const normalizedStage = normalizeBusinessStage(stage);
  const found = CAREER_LEVELS.find(l => l.key === normalizedStage);
  return found?.level ?? 0;
}

export function getKpisForLevel(level: number): KpiDefinition[] {
  return KPI_DEFINITIONS.filter(kpi => kpi.minLevel <= level && (kpi.maxLevel === undefined || kpi.maxLevel >= level));
}

export function getKpiStatus(
  key: KpiKey,
  value: number,
  level: number,
): 'green' | 'yellow' | 'red' | 'neutral' {
  const thresholds = KPI_THRESHOLDS[level];
  if (!thresholds) return 'neutral';

  const t = thresholds[key];
  if (!t) return 'neutral';

  const def = KPI_DEFINITIONS.find(d => d.key === key);
  const invert = def?.invert ?? false;

  if (invert) {
    // Lower is better (storno_rate, response_time)
    if (t.max !== undefined) {
      if (value <= (t.yellowAt ?? t.max)) return 'green';
      if (value <= t.max) return 'yellow';
      return 'red';
    }
  } else {
    // Higher is better
    if (t.min !== undefined) {
      if (value >= t.min) return 'green';
      if (value >= (t.yellowAt ?? t.min)) return 'yellow';
      return 'red';
    }
  }

  return 'neutral';
}

export function isPlacementReady(kpis: Record<string, number>): {
  ready: boolean;
  checks: { key: string; label: string; current: number; target: number; met: boolean }[];
} {
  const coreKeys = [
    'closing_rate', 'show_rate', 'revenue_closed', 'storno_rate',
    'response_time', 'follow_up_rate', 'crm_hygiene_score',
  ];

  const checks = coreKeys.map(key => {
    const def = KPI_DEFINITIONS.find(d => d.key === key)!;
    const target = PLACEMENT_READY_THRESHOLDS[key];
    const current = kpis[key] ?? 0;
    const met = def.invert ? current <= target : current >= target;
    return { key, label: def.label, current, target, met };
  });

  return { ready: checks.every(c => c.met), checks };
}
