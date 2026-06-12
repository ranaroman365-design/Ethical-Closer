/**
 * CRO Audience Intelligence — Phase 7.
 * ------------------------------------------------------
 * PURE, ADDITIVE, READ-ONLY.
 *   - No allocation changes.
 *   - No CRM / booking / quiz / auth / routing touched.
 *   - No schema changes — derives everything from `event_logs`.
 *
 * Purpose: learn which AUDIENCE PSYCHOLOGY × MESSAGE THEME
 * combination produces the highest qualified leads, bookings,
 * show-ups, and revenue.
 *
 * Two taxonomies live here:
 *   1. AudienceSegment — derived from observable behavior
 *      (quiz answers, traffic source, page dwell, etc.).
 *   2. MessageTheme     — psychology category every experiment
 *      variant maps onto.
 *
 * Experiments register their (test_name, variant) → theme(s)
 * mapping in EXPERIMENT_THEME_MAP. The dashboard joins event_logs
 * against this map to produce theme-level lift reports.
 */

// ===== Audience segments =====
export type AudienceSegment =
  | "agency_burned"
  | "trust_seeking"
  | "risk_averse"
  | "control_seeking"
  | "opportunity_seeking"
  | "income_focused"
  | "career_change"
  | "closer_specific"
  | "unknown";

export const AUDIENCE_LABELS_DE: Record<AudienceSegment, string> = {
  agency_burned: "Agentur-geschädigt",
  trust_seeking: "Vertrauens-orientiert",
  risk_averse: "Risiko-avers",
  control_seeking: "Kontroll-orientiert",
  opportunity_seeking: "Chancen-orientiert",
  income_focused: "Einkommens-fokussiert",
  career_change: "Karriere-Wechsler",
  closer_specific: "Closer-spezifisch",
  unknown: "Unklassifiziert",
};

// ===== Message themes =====
export type MessageTheme =
  | "trust"
  | "control"
  | "transparency"
  | "risk_reduction"
  | "income_opportunity"
  | "authority"
  | "proof"
  | "security"
  | "freedom"
  | "urgency"
  // Phase 9.1 — performance audience themes
  | "performance"
  | "achievement"
  | "status"
  | "competence"
  | "career"
  | "professionalism"
  | "mastery";

export const THEME_LABELS_DE: Record<MessageTheme, string> = {
  trust: "Vertrauen",
  control: "Kontrolle",
  transparency: "Transparenz",
  risk_reduction: "Risiko-Reduktion",
  income_opportunity: "Einkommens-Chance",
  authority: "Autorität",
  proof: "Beweis",
  security: "Sicherheit",
  freedom: "Freiheit",
  urgency: "Dringlichkeit",
  performance: "Leistung",
  achievement: "Erfolg",
  status: "Status",
  competence: "Kompetenz",
  career: "Karriere",
  professionalism: "Professionalität",
  mastery: "Meisterschaft",
};

// ===== Experiment → theme map =====
// Manual mapping of every active/historical experiment variant onto themes.
// Update this whenever a new variant ships.
export interface ExperimentThemeEntry {
  test_name: string;
  variant: string; // "A" | "B" | "C" ...
  themes: MessageTheme[];
  /** Free-form note for dashboard readability. */
  note?: string;
}

export const EXPERIMENT_THEME_MAP: ExperimentThemeEntry[] = [
  // hero_copy_v1
  { test_name: "hero_copy_v1", variant: "A", themes: ["authority", "income_opportunity"], note: "Control: aspirational hero" },
  { test_name: "hero_copy_v1", variant: "B", themes: ["transparency", "trust"], note: "Transparency-led rewrite" },
  // cta_label_v1
  { test_name: "cta_label_v1", variant: "A", themes: ["income_opportunity"], note: "Control: outcome CTA" },
  { test_name: "cta_label_v1", variant: "B", themes: ["risk_reduction", "control"], note: "Low-commitment CTA" },
  // trust_order_v1
  { test_name: "trust_order_v1", variant: "A", themes: ["proof"], note: "Control trust ordering" },
  { test_name: "trust_order_v1", variant: "B", themes: ["trust", "authority"], note: "Reordered trust block" },
  // masterofsales_hero_v1
  { test_name: "masterofsales_hero_v1", variant: "A", themes: ["authority"] },
  { test_name: "masterofsales_hero_v1", variant: "B", themes: ["transparency", "control"] },
  // Phase 9 — LP psychology slots
  { test_name: "mos_lp_psychology_headline", variant: "trust", themes: ["trust"] },
  { test_name: "mos_lp_psychology_headline", variant: "transparency", themes: ["transparency"] },
  { test_name: "mos_lp_psychology_headline", variant: "control_msg", themes: ["control"] },
  { test_name: "mos_lp_psychology_headline", variant: "risk_reduction", themes: ["risk_reduction"] },
  { test_name: "mos_lp_psychology_subline", variant: "trust", themes: ["trust"] },
  { test_name: "mos_lp_psychology_subline", variant: "transparency", themes: ["transparency"] },
  { test_name: "mos_lp_psychology_subline", variant: "control_msg", themes: ["control"] },
  { test_name: "mos_lp_psychology_subline", variant: "risk_reduction", themes: ["risk_reduction"] },
  { test_name: "mos_lp_cta_psychology", variant: "risk_reduction", themes: ["risk_reduction"] },
  { test_name: "mos_lp_cta_psychology", variant: "transparency", themes: ["transparency"] },
  { test_name: "mos_lp_cta_psychology", variant: "control_msg", themes: ["control"] },
  { test_name: "mos_lp_micro_trust_inline", variant: "A_3stat", themes: ["transparency"] },
  { test_name: "mos_lp_micro_trust_inline", variant: "B_testimonial_line", themes: ["proof", "trust"] },
  { test_name: "mos_lp_micro_trust_inline", variant: "C_no_promise", themes: ["transparency", "risk_reduction"] },
  { test_name: "mos_lp_trust_block_position", variant: "above_fold", themes: ["trust", "proof"] },
  { test_name: "mos_lp_trust_block_position", variant: "just_below_cta", themes: ["trust"] },
  { test_name: "mos_lp_trust_block_position", variant: "sticky_footer", themes: ["trust"] },
  { test_name: "mos_lp_scroll_progress", variant: "thin_top_bar", themes: ["control"] },
  { test_name: "mos_lp_scroll_progress", variant: "section_dots", themes: ["control"] },
  { test_name: "mos_lp_competing_cta_suppress", variant: "suppress_secondary_mobile", themes: ["control", "risk_reduction"] },
  // Phase 9.1 — audience-aligned variants
  { test_name: "mos_lp_psychology_headline", variant: "competence", themes: ["competence", "mastery"] },
  { test_name: "mos_lp_psychology_headline", variant: "professional", themes: ["professionalism", "status"] },
  { test_name: "mos_lp_psychology_headline", variant: "market_reality", themes: ["competence", "performance"] },
  { test_name: "mos_lp_psychology_headline", variant: "career_competence", themes: ["career", "competence"] },
  { test_name: "mos_lp_psychology_subline", variant: "skill_fit", themes: ["competence", "career"] },
  { test_name: "mos_lp_psychology_subline", variant: "growth_no_shortcut", themes: ["career", "achievement"] },
  { test_name: "mos_lp_psychology_subline", variant: "performance_standard", themes: ["performance", "status"] },
  { test_name: "mos_lp_cta_psychology", variant: "eignung_pruefen", themes: ["competence", "transparency"] },
  { test_name: "mos_lp_cta_psychology", variant: "eignungstest", themes: ["competence", "professionalism"] },
  { test_name: "mos_lp_cta_psychology", variant: "passt_zu_mir", themes: ["transparency", "competence"] },
  { test_name: "mos_lp_cta_psychology", variant: "karriere_potenzial", themes: ["career", "achievement"] },
  { test_name: "mos_lp_cta_psychology", variant: "faehigkeiten_test", themes: ["mastery", "competence"] },
  { test_name: "mos_lp_micro_trust_inline", variant: "D_competence_focus", themes: ["competence", "career"] },
  { test_name: "mos_lp_micro_trust_inline", variant: "E_performance_line", themes: ["performance", "status"] },
];

export function themesForVariant(
  test_name: string,
  variant: string
): MessageTheme[] {
  const hit = EXPERIMENT_THEME_MAP.find(
    (e) => e.test_name === test_name && e.variant === variant
  );
  return hit?.themes ?? [];
}

// ===== Behavioral classifier =====
// Classifies a session into an AudienceSegment from a bag of observed
// signals (event names + payload keywords). Pure, deterministic, no I/O.
export interface SessionSignals {
  /** Lowercase event names observed in the session. */
  events: string[];
  /** Lowercase free-text payload fragments (quiz answers, utm terms, etc.). */
  textFragments: string[];
  /** Lowercase utm_source / referrer / channel labels. */
  channels: string[];
}

export function classifyAudience(s: SessionSignals): AudienceSegment {
  const text = s.textFragments.join(" ");
  const has = (...needles: string[]) =>
    needles.some((n) => text.includes(n));

  if (has("agentur", "agency", "verbrannt", "burned", "abgezockt"))
    return "agency_burned";
  if (has("closer", "sales", "vertrieb", "abschluss"))
    return "closer_specific";
  if (has("karriere", "career", "wechsel", "umsteig", "quereinsteiger"))
    return "career_change";
  if (has("sicher", "garantie", "risiko", "safe", "guarantee"))
    return "risk_averse";
  if (has("kontrolle", "control", "transparenz", "selbst", "eigen"))
    return "control_seeking";
  if (has("vertrauen", "trust", "seriös", "ehrlich"))
    return "trust_seeking";
  if (has("einkommen", "income", "10k", "geld", "verdienen"))
    return "income_focused";
  if (has("chance", "opportunity", "möglich", "potential"))
    return "opportunity_seeking";

  return "unknown";
}

// ===== Aggregation helpers (pure functions) =====
export interface VariantFunnelRow {
  test_name: string;
  variant: string;
  themes: MessageTheme[];
  pageviews: number;
  leads: number;
  qualified_leads: number;
  bookings: number;
  show_ups: number;
  closed_won: number;
  revenue: number;
}

export interface ThemeRollup {
  theme: MessageTheme;
  variants: number;
  pageviews: number;
  qualified_lead_rate: number;
  booking_rate: number;
  show_up_rate: number;
  closed_won_rate: number;
  revenue: number;
}

export function rollupByTheme(rows: VariantFunnelRow[]): ThemeRollup[] {
  const acc = new Map<
    MessageTheme,
    {
      variants: number;
      pv: number;
      leads: number;
      ql: number;
      book: number;
      show: number;
      won: number;
      rev: number;
    }
  >();
  for (const r of rows) {
    for (const t of r.themes) {
      const cur = acc.get(t) ?? {
        variants: 0,
        pv: 0,
        leads: 0,
        ql: 0,
        book: 0,
        show: 0,
        won: 0,
        rev: 0,
      };
      cur.variants += 1;
      cur.pv += r.pageviews;
      cur.leads += r.leads;
      cur.ql += r.qualified_leads;
      cur.book += r.bookings;
      cur.show += r.show_ups;
      cur.won += r.closed_won;
      cur.rev += r.revenue;
      acc.set(t, cur);
    }
  }
  const out: ThemeRollup[] = [];
  for (const [theme, v] of acc.entries()) {
    out.push({
      theme,
      variants: v.variants,
      pageviews: v.pv,
      qualified_lead_rate: v.pv > 0 ? v.ql / v.pv : 0,
      booking_rate: v.pv > 0 ? v.book / v.pv : 0,
      show_up_rate: v.book > 0 ? v.show / v.book : 0,
      closed_won_rate: v.pv > 0 ? v.won / v.pv : 0,
      revenue: v.rev,
    });
  }
  return out.sort((a, b) => b.revenue - a.revenue);
}

/**
 * Compute lift of each theme vs the global average across all themes.
 * Read-only — used for "Top Winning / Losing Themes" insight cards.
 */
export interface ThemeLift {
  theme: MessageTheme;
  metric: "qualified_lead_rate" | "booking_rate" | "closed_won_rate" | "revenue";
  baseline: number;
  value: number;
  lift_pct: number; // (value - baseline) / baseline
}

export function computeThemeLifts(
  rollups: ThemeRollup[],
  metric: ThemeLift["metric"]
): ThemeLift[] {
  if (rollups.length === 0) return [];
  const baseline =
    rollups.reduce((s, r) => s + (r[metric] as number), 0) / rollups.length;
  if (baseline <= 0) return [];
  return rollups
    .map((r) => ({
      theme: r.theme,
      metric,
      baseline,
      value: r[metric] as number,
      lift_pct: ((r[metric] as number) - baseline) / baseline,
    }))
    .sort((a, b) => b.lift_pct - a.lift_pct);
}
