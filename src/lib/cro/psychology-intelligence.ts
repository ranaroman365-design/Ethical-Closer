/**
 * CRO Psychological Intelligence — Phase 8.
 * ------------------------------------------------------
 * PURE, ADDITIVE, READ-ONLY.
 *   - No allocation changes.
 *   - No funnel / CRM / quiz / booking / auth changes.
 *   - No schema changes — joins event_logs against the in-code
 *     VARIANT_PSYCHOLOGY map.
 *
 * Purpose: explain WHY variants win — not just WHICH variant wins.
 * Every experiment variant is annotated with a dominant + secondary
 * psychological driver, emotional intensity, commitment level, and
 * perceived risk. The dashboard correlates drivers with downstream
 * KPIs (CTR → QL → Booking → Show → Won → Revenue).
 */

import {
  EXPERIMENT_THEME_MAP,
  type MessageTheme,
} from "@/lib/cro/audience-intelligence";

// ===== Psychological drivers =====
export type PsychDriver =
  | "trust"
  | "control"
  | "transparency"
  | "risk_reduction"
  | "certainty"
  | "belonging"
  | "status"
  | "identity"
  | "authority"
  | "safety"
  | "opportunity"
  | "autonomy";

export const PSYCH_LABELS_DE: Record<PsychDriver, string> = {
  trust: "Vertrauen",
  control: "Kontrolle",
  transparency: "Transparenz",
  risk_reduction: "Risiko-Reduktion",
  certainty: "Gewissheit",
  belonging: "Zugehörigkeit",
  status: "Status",
  identity: "Identität",
  authority: "Autorität",
  safety: "Sicherheit",
  opportunity: "Chance",
  autonomy: "Autonomie",
};

// 1 = ruhig/sachlich, 5 = stark emotional.
export type EmotionalIntensity = 1 | 2 | 3 | 4 | 5;
// 1 = mikro-Commitment (e.g. "weiterlesen"), 5 = harter Kauf.
export type CommitmentLevel = 1 | 2 | 3 | 4 | 5;
// 1 = praktisch risikofrei, 5 = hoch wahrgenommenes Risiko.
export type PerceivedRisk = 1 | 2 | 3 | 4 | 5;

export interface VariantPsychology {
  test_name: string;
  variant: string;
  dominant: PsychDriver;
  secondary?: PsychDriver;
  intensity: EmotionalIntensity;
  commitment: CommitmentLevel;
  risk: PerceivedRisk;
  rationale?: string;
}

/**
 * Heuristic seed map. Curated from existing experiment copy. Extend
 * whenever a new variant ships. Anything not listed falls back to
 * theme-derived attributes (see `derivePsychology` below).
 */
export const VARIANT_PSYCHOLOGY: VariantPsychology[] = [
  { test_name: "hero_copy_v1", variant: "A", dominant: "opportunity", secondary: "authority", intensity: 4, commitment: 3, risk: 3, rationale: "Aspirational hero" },
  { test_name: "hero_copy_v1", variant: "B", dominant: "transparency", secondary: "trust", intensity: 2, commitment: 2, risk: 1, rationale: "Transparency-led rewrite" },
  { test_name: "cta_label_v1", variant: "A", dominant: "opportunity", intensity: 4, commitment: 4, risk: 4 },
  { test_name: "cta_label_v1", variant: "B", dominant: "risk_reduction", secondary: "autonomy", intensity: 1, commitment: 1, risk: 1, rationale: "Low-commitment CTA" },
  { test_name: "trust_order_v1", variant: "A", dominant: "authority", intensity: 2, commitment: 2, risk: 2 },
  { test_name: "trust_order_v1", variant: "B", dominant: "trust", secondary: "belonging", intensity: 2, commitment: 2, risk: 2 },
  { test_name: "masterofsales_hero_v1", variant: "A", dominant: "authority", secondary: "status", intensity: 3, commitment: 3, risk: 3 },
  { test_name: "masterofsales_hero_v1", variant: "B", dominant: "control", secondary: "transparency", intensity: 2, commitment: 2, risk: 1 },
];

const THEME_TO_DRIVER: Record<MessageTheme, PsychDriver> = {
  trust: "trust",
  control: "control",
  transparency: "transparency",
  risk_reduction: "risk_reduction",
  income_opportunity: "opportunity",
  authority: "authority",
  proof: "trust",
  security: "safety",
  freedom: "autonomy",
  urgency: "certainty",
  // Phase 9.1 — performance audience
  performance: "status",
  achievement: "status",
  status: "status",
  competence: "authority",
  career: "identity",
  professionalism: "authority",
  mastery: "authority",
};

export function derivePsychology(
  test_name: string,
  variant: string
): VariantPsychology | null {
  const hit = VARIANT_PSYCHOLOGY.find(
    (p) => p.test_name === test_name && p.variant === variant
  );
  if (hit) return hit;
  const themes = EXPERIMENT_THEME_MAP.find(
    (e) => e.test_name === test_name && e.variant === variant
  )?.themes;
  if (!themes || themes.length === 0) return null;
  return {
    test_name,
    variant,
    dominant: THEME_TO_DRIVER[themes[0]],
    secondary: themes[1] ? THEME_TO_DRIVER[themes[1]] : undefined,
    intensity: 3,
    commitment: 3,
    risk: 3,
    rationale: "Derived from theme map",
  };
}

// ===== Driver-level aggregation =====
export interface VariantKpiRow {
  test_name: string;
  variant: string;
  ctr: number;
  qualified_lead_rate: number;
  booking_rate: number;
  show_up_rate: number;
  closed_won_rate: number;
  revenue: number;
  pageviews: number;
}

export interface DriverRollup {
  driver: PsychDriver;
  variants: number;
  pageviews: number;
  ctr: number;
  qualified_lead_rate: number;
  booking_rate: number;
  show_up_rate: number;
  closed_won_rate: number;
  revenue: number;
}

export function rollupByDriver(rows: VariantKpiRow[]): DriverRollup[] {
  const acc = new Map<
    PsychDriver,
    {
      v: number;
      pv: number;
      ctr_w: number; // weighted by pv
      ql_w: number;
      book_w: number;
      show_w: number;
      won_w: number;
      rev: number;
    }
  >();
  for (const r of rows) {
    const psych = derivePsychology(r.test_name, r.variant);
    if (!psych) continue;
    const keys: PsychDriver[] = psych.secondary
      ? [psych.dominant, psych.secondary]
      : [psych.dominant];
    for (const d of keys) {
      const cur = acc.get(d) ?? {
        v: 0,
        pv: 0,
        ctr_w: 0,
        ql_w: 0,
        book_w: 0,
        show_w: 0,
        won_w: 0,
        rev: 0,
      };
      cur.v += 1;
      cur.pv += r.pageviews;
      cur.ctr_w += r.ctr * r.pageviews;
      cur.ql_w += r.qualified_lead_rate * r.pageviews;
      cur.book_w += r.booking_rate * r.pageviews;
      cur.show_w += r.show_up_rate * r.pageviews;
      cur.won_w += r.closed_won_rate * r.pageviews;
      cur.rev += r.revenue;
      acc.set(d, cur);
    }
  }
  const out: DriverRollup[] = [];
  for (const [driver, v] of acc.entries()) {
    const pv = Math.max(1, v.pv);
    out.push({
      driver,
      variants: v.v,
      pageviews: v.pv,
      ctr: v.ctr_w / pv,
      qualified_lead_rate: v.ql_w / pv,
      booking_rate: v.book_w / pv,
      show_up_rate: v.show_w / pv,
      closed_won_rate: v.won_w / pv,
      revenue: v.rev,
    });
  }
  return out.sort((a, b) => b.revenue - a.revenue);
}

export type DriverMetric =
  | "ctr"
  | "qualified_lead_rate"
  | "booking_rate"
  | "show_up_rate"
  | "closed_won_rate"
  | "revenue";

export interface DriverLift {
  driver: PsychDriver;
  metric: DriverMetric;
  baseline: number;
  value: number;
  lift_pct: number;
}

export function computeDriverLifts(
  rollups: DriverRollup[],
  metric: DriverMetric
): DriverLift[] {
  if (rollups.length === 0) return [];
  const baseline =
    rollups.reduce((s, r) => s + (r[metric] as number), 0) / rollups.length;
  if (baseline <= 0) return [];
  return rollups
    .map((r) => ({
      driver: r.driver,
      metric,
      baseline,
      value: r[metric] as number,
      lift_pct: ((r[metric] as number) - baseline) / baseline,
    }))
    .sort((a, b) => b.lift_pct - a.lift_pct);
}

/**
 * Surface-level pattern detection — picks the best-performing driver
 * for each major decision surface (CTA / Trust / Headline). Reads
 * the EXPERIMENT_THEME_MAP to infer which surface each test targets.
 */
export type Surface = "cta" | "trust" | "headline" | "other";

export function inferSurface(test_name: string): Surface {
  const t = test_name.toLowerCase();
  if (t.includes("cta")) return "cta";
  if (t.includes("trust")) return "trust";
  if (t.includes("hero") || t.includes("headline")) return "headline";
  return "other";
}

export interface SurfacePattern {
  surface: Surface;
  best_driver: PsychDriver | null;
  best_metric_value: number;
  metric: DriverMetric;
}

export function bestPatternPerSurface(
  rows: VariantKpiRow[],
  metric: DriverMetric
): SurfacePattern[] {
  const groups = new Map<Surface, VariantKpiRow[]>();
  for (const r of rows) {
    const s = inferSurface(r.test_name);
    const list = groups.get(s) ?? [];
    list.push(r);
    groups.set(s, list);
  }
  const out: SurfacePattern[] = [];
  for (const [surface, list] of groups.entries()) {
    const rollups = rollupByDriver(list);
    const best = rollups.sort(
      (a, b) => (b[metric] as number) - (a[metric] as number)
    )[0];
    out.push({
      surface,
      best_driver: best?.driver ?? null,
      best_metric_value: (best?.[metric] as number) ?? 0,
      metric,
    });
  }
  return out;
}
