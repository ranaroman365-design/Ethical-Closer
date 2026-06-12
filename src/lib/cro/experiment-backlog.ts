/**
 * CRO Experiment Backlog — Phase 5 (Autonomous Generation).
 * ----------------------------------------------------------
 * Pure static catalog. No runtime side-effects, no flow changes.
 * Surfaces candidate experiments for human review in the CRO dashboard.
 * Nothing here writes to the DB or registers experiments — manual approval
 * is required (operator copies key/variants into a migration to launch).
 *
 * Positioning lock (DO NOT VIOLATE):
 *   audience  = coaches, consultants, experts
 *   pains     = burned by agencies, distrust marketing, wasted money,
 *               inconsistent leads, no visibility into results
 *   themes    = trust · control · transparency · predictability · risk-reduction
 *   forbidden = scale, freedom, 10k months, millionaire, "passive income"
 */

export type CroSurface =
  | "hero_headline"
  | "hero_subheadline"
  | "primary_cta_label"
  | "primary_cta_placement"
  | "sticky_cta_label"
  | "trust_block_order"
  | "testimonial_layout"
  | "objection_section"
  | "faq_section"
  | "social_proof_block";

export type CroTheme =
  | "trust"
  | "control"
  | "transparency"
  | "predictability"
  | "risk_reduction";

export type CroRisk = "low" | "medium" | "high";
export type CroPriority = "P0" | "P1" | "P2";

export interface CroExperimentProposal {
  /** Stable backlog id — NOT yet a live experiment key. */
  id: string;
  surface: CroSurface;
  /** File that would be touched if approved. Display-only. */
  affected_files: string[];
  /** Rough share of total funnel traffic this surface receives (0..1). */
  traffic_share: number;
  /** 1..5 — closer to top-of-funnel = higher leverage. */
  funnel_position: 1 | 2 | 3 | 4 | 5;
  /** Estimated absolute conversion-rate lift, mid-point %. */
  est_lift_pct: number;
  /** Subjective confidence in the estimate (0..1). */
  confidence: number;
  risk: CroRisk;
  themes: CroTheme[];
  hypothesis: string;
  control: string;
  variants: { label: string; copy: string; theme: CroTheme }[];
  notes?: string;
}

/**
 * Priority = traffic_share × funnel_position × est_lift × confidence ÷ risk-penalty.
 * Display-only; no allocator reads this.
 */
export function scoreProposal(p: CroExperimentProposal): number {
  const riskPenalty = p.risk === "low" ? 1 : p.risk === "medium" ? 1.5 : 2.25;
  return (p.traffic_share * p.funnel_position * p.est_lift_pct * p.confidence) / riskPenalty;
}

export function priorityOf(p: CroExperimentProposal): CroPriority {
  const s = scoreProposal(p);
  if (s >= 0.6) return "P0";
  if (s >= 0.25) return "P1";
  return "P2";
}

/** Static backlog. Add new ideas here — never auto-launch. */
export const CRO_EXPERIMENT_BACKLOG: CroExperimentProposal[] = [
  {
    id: "hero_headline_transparency_v1",
    surface: "hero_headline",
    affected_files: ["src/components/landing/RootRouterV3.tsx"],
    traffic_share: 1.0,
    funnel_position: 5,
    est_lift_pct: 8,
    confidence: 0.55,
    risk: "low",
    themes: ["transparency", "trust"],
    hypothesis:
      "Transparency-led headline outperforms aspiration framing for consultants burned by agencies.",
    control: "Werde High-Ticket Closer —",
    variants: [
      { label: "Transparency", copy: "Sieh genau, wie unsere Closer arbeiten — bevor du dich entscheidest.", theme: "transparency" },
      { label: "Risk-Reduction", copy: "Wir liefern qualifizierte Gespräche — oder du zahlst nichts.", theme: "risk_reduction" },
      { label: "Predictability", copy: "Planbare Closing-Gespräche statt Lead-Lotterie.", theme: "predictability" },
    ],
  },
  {
    id: "hero_subheadline_control_v1",
    surface: "hero_subheadline",
    affected_files: ["src/components/landing/RootRouterV3.tsx"],
    traffic_share: 1.0,
    funnel_position: 5,
    est_lift_pct: 5,
    confidence: 0.5,
    risk: "low",
    themes: ["control", "transparency"],
    hypothesis:
      "Subheadline that emphasizes operator control over the process reduces bounce vs generic outcome promise.",
    control: "Closing-System mit Daten, KPIs und echter Begleitung.",
    variants: [
      { label: "Control", copy: "Du behältst die Kontrolle: jede KPI, jedes Gespräch, jeder Closer.", theme: "control" },
      { label: "Transparency", copy: "Volle Sicht auf Pipeline, Closer-Performance und Umsatz — in Echtzeit.", theme: "transparency" },
    ],
  },
  {
    id: "primary_cta_label_riskreduction_v1",
    surface: "primary_cta_label",
    affected_files: [
      "src/components/landing/RootRouterV3.tsx",
      "src/components/landing/StickyCtaBar.tsx",
    ],
    traffic_share: 1.0,
    funnel_position: 4,
    est_lift_pct: 6,
    confidence: 0.6,
    risk: "low",
    themes: ["risk_reduction", "trust"],
    hypothesis:
      "Low-commitment CTA framing (eligibility check) outperforms application framing for distrustful audiences.",
    control: "Eignung prüfen",
    variants: [
      { label: "Risk-Reduction", copy: "Unverbindlich Eignung prüfen", theme: "risk_reduction" },
      { label: "Transparency", copy: "Zahlen & System ansehen", theme: "transparency" },
      { label: "Control", copy: "Selbst entscheiden — Eignung prüfen", theme: "control" },
    ],
    notes: "Final-CTA at conversion endpoint is locked to 'Jetzt Bewerbung starten' — exclude from variant.",
  },
  {
    id: "sticky_cta_predictability_v1",
    surface: "sticky_cta_label",
    affected_files: ["src/components/landing/StickyCtaBar.tsx"],
    traffic_share: 0.7,
    funnel_position: 3,
    est_lift_pct: 4,
    confidence: 0.45,
    risk: "low",
    themes: ["predictability"],
    hypothesis: "Sticky CTA with predictability frame increases scroll-depth conversions.",
    control: "Eignung prüfen",
    variants: [
      { label: "Predictability", copy: "Planbare Gespräche prüfen", theme: "predictability" },
      { label: "Trust", copy: "Echte Closer treffen", theme: "trust" },
    ],
  },
  {
    id: "trust_block_order_v2",
    surface: "trust_block_order",
    affected_files: ["src/components/landing/RootRouterV3.tsx"],
    traffic_share: 0.9,
    funnel_position: 3,
    est_lift_pct: 3,
    confidence: 0.4,
    risk: "low",
    themes: ["trust", "transparency"],
    hypothesis:
      "Lead with operator-name + verifiable results before testimonials for audiences burned by agencies.",
    control: "Default order (already A/B tested as trust_order_v1)",
    variants: [
      { label: "Receipts-First", copy: "Operator-Name → KPI-Screenshots → Stimmen", theme: "transparency" },
      { label: "Process-First", copy: "Wie der Prozess läuft → KPIs → Stimmen", theme: "control" },
    ],
    notes: "Extension of existing trust_order_v1. Do not duplicate — propose as v2 only after v1 reaches winner.",
  },
  {
    id: "testimonial_layout_transparency_v1",
    surface: "testimonial_layout",
    affected_files: ["src/components/landing/RootRouterV3.tsx"],
    traffic_share: 0.6,
    funnel_position: 2,
    est_lift_pct: 4,
    confidence: 0.4,
    risk: "medium",
    themes: ["transparency", "trust"],
    hypothesis:
      "Testimonials with full name + verifiable LinkedIn + concrete KPI outperform generic quote cards.",
    control: "Quote cards with photo + first name",
    variants: [
      { label: "Receipts", copy: "Vollname + LinkedIn-Link + 1 konkrete KPI pro Stimme", theme: "transparency" },
    ],
  },
  {
    id: "objection_section_v1",
    surface: "objection_section",
    affected_files: ["src/components/landing/RootRouterV3.tsx"],
    traffic_share: 0.5,
    funnel_position: 2,
    est_lift_pct: 5,
    confidence: 0.5,
    risk: "low",
    themes: ["trust", "risk_reduction"],
    hypothesis:
      "Explicit 'Why this is NOT for you' section reduces unqualified bookings and increases qualified-lead-rate.",
    control: "(no objection section)",
    variants: [
      { label: "Disqualifier", copy: "Block: 'Wann ETC NICHT passt' — 4 ehrliche Ausschlusskriterien", theme: "trust" },
    ],
    notes: "Watch booking-rate harm-guard — may reduce raw bookings but improve qualified-lead rate.",
  },
  {
    id: "faq_section_control_v1",
    surface: "faq_section",
    affected_files: ["src/components/landing/RootRouterV3.tsx"],
    traffic_share: 0.4,
    funnel_position: 2,
    est_lift_pct: 3,
    confidence: 0.4,
    risk: "low",
    themes: ["control", "transparency"],
    hypothesis:
      "FAQ ordered by 'what you control' (data, cancellation, results) > generic FAQ improves trust signals.",
    control: "Generic FAQ order",
    variants: [
      { label: "Control-First FAQ", copy: "Reihenfolge: Datenhoheit → Ausstieg → Ergebnisse → Investment", theme: "control" },
    ],
  },
  {
    id: "social_proof_block_predictability_v1",
    surface: "social_proof_block",
    affected_files: ["src/components/landing/RootRouterV3.tsx"],
    traffic_share: 0.8,
    funnel_position: 3,
    est_lift_pct: 4,
    confidence: 0.45,
    risk: "low",
    themes: ["predictability", "transparency"],
    hypothesis:
      "Aggregate KPI proof ('Ø X Gespräche/Woche pro Closer') outperforms vague 'hunderte Kunden' framing.",
    control: "Logo wall + count",
    variants: [
      { label: "Aggregate KPI", copy: "Ø qualifizierte Gespräche/Woche · Ø Show-Rate · Ø Closing-Rate", theme: "predictability" },
    ],
  },
];

/** Forbidden tokens that must not appear in any proposal copy. */
export const FORBIDDEN_TOKENS = [
  "scale", "scaling", "freedom", "10k", "10 k", "10.000",
  "millionaire", "millionär", "passive income", "passives einkommen",
] as const;

/** Lints the backlog for positioning violations. Called by the panel. */
export function lintBacklog(items: CroExperimentProposal[]): string[] {
  const issues: string[] = [];
  for (const p of items) {
    const haystack = [p.control, ...p.variants.map((v) => v.copy), p.hypothesis]
      .join(" ")
      .toLowerCase();
    for (const tok of FORBIDDEN_TOKENS) {
      if (haystack.includes(tok)) issues.push(`${p.id}: forbidden token "${tok}"`);
    }
  }
  return issues;
}
