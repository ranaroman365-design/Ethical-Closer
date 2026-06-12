/**
 * Canonical Auto-Fix Engine (Layer 46)
 * ------------------------------------
 * Composes L34 (Funnel Intelligence) detection + L36 v2 (Self-Optimization) execution.
 *
 * Block: Intelligence (primary) + Governance.
 * NOT a new canon — pure detection→recommendation→prioritization layer.
 *
 * Flow: KPIs → detectFixes() → AutoFixCandidate[] → persist to auto_fix_queue.
 *
 * Hard rules:
 *  - Thresholds are configurable but ship with conservative defaults.
 *  - Each fix maps to exactly ONE problem class.
 *  - Recommendations are advisory; never auto-execute outside L36 v2 pipeline.
 */

export type AutoFixStage =
  | "traffic"
  | "landing"
  | "engagement"
  | "booking"
  | "setter"
  | "showing"
  | "closer"
  | "offer"
  | "revenue";

export type AutoFixProblemClass =
  | "traffic_quality"
  | "landing"
  | "engagement"
  | "booking"
  | "setter"
  | "showing"
  | "closer"
  | "offer";

export type AutoFixSeverity = "weak" | "critical";

export interface AutoFixThreshold {
  metricKey: string;
  /** human label for the metric */
  label: string;
  weakBelow: number;
  criticalBelow: number;
  /** baseline impact score (0..100) — multiplied later by severity */
  baseImpact: number;
  /** baseline effort score (0..100, lower = easier) */
  baseEffort: number;
}

export const AUTO_FIX_THRESHOLDS: Record<AutoFixProblemClass, AutoFixThreshold> = {
  traffic_quality: {
    metricKey: "lead_to_engagement_pct",
    label: "Engagement rate from traffic",
    weakBelow: 30,
    criticalBelow: 15,
    baseImpact: 70,
    baseEffort: 60,
  },
  landing: {
    metricKey: "landing_to_quiz_pct",
    label: "Landing → quiz start",
    weakBelow: 35,
    criticalBelow: 20,
    baseImpact: 65,
    baseEffort: 30,
  },
  engagement: {
    metricKey: "quiz_completion_pct",
    label: "Quiz completion",
    weakBelow: 50,
    criticalBelow: 30,
    baseImpact: 60,
    baseEffort: 25,
  },
  booking: {
    metricKey: "lead_to_booking_pct",
    label: "Lead → booking rate",
    weakBelow: 20,
    criticalBelow: 10,
    baseImpact: 80,
    baseEffort: 35,
  },
  setter: {
    metricKey: "setter_qualified_pct",
    label: "Setter qualification rate",
    weakBelow: 50,
    criticalBelow: 30,
    baseImpact: 70,
    baseEffort: 45,
  },
  showing: {
    metricKey: "show_rate_pct",
    label: "Show-up rate",
    weakBelow: 75,
    criticalBelow: 60,
    baseImpact: 90,
    baseEffort: 25,
  },
  closer: {
    metricKey: "close_rate_pct",
    label: "Close rate",
    weakBelow: 15,
    criticalBelow: 8,
    baseImpact: 95,
    baseEffort: 50,
  },
  offer: {
    metricKey: "offer_acceptance_pct",
    label: "Offer acceptance",
    weakBelow: 40,
    criticalBelow: 20,
    baseImpact: 75,
    baseEffort: 55,
  },
};

export const PROBLEM_TO_STAGE: Record<AutoFixProblemClass, AutoFixStage> = {
  traffic_quality: "traffic",
  landing: "landing",
  engagement: "engagement",
  booking: "booking",
  setter: "setter",
  showing: "showing",
  closer: "closer",
  offer: "offer",
};

export interface AutoFixDeepLink {
  label: string;
  href: string;
}

export interface AutoFixRecommendationSet {
  label: string;
  explanation: (value: number) => string;
  recommendations: string[];
  deepLinks: AutoFixDeepLink[];
  /** L36 v2 module key if eligible for self-optimization proposal */
  selfOptModule?:
    | "message_ab"
    | "channel_priority"
    | "send_timing"
    | "ai_setter_script"
    | "no_show_recovery"
    | "high_value_routing";
}

export const AUTO_FIX_RECOMMENDATIONS: Record<AutoFixProblemClass, AutoFixRecommendationSet> = {
  traffic_quality: {
    label: "Traffic quality issue",
    explanation: (v) =>
      `Only ${v.toFixed(1)}% of visitors engage. Traffic source mix is likely off.`,
    recommendations: [
      "Audit top traffic sources by engagement",
      "Pause or down-weight low-quality channels",
      "Tighten ad targeting to qualified personas",
    ],
    deepLinks: [
      { label: "Open Funnel Intelligence", href: "/members/admin/funnel-intelligence" },
    ],
  },
  landing: {
    label: "Landing not converting",
    explanation: (v) =>
      `Landing → quiz is ${v.toFixed(1)}%. Page is losing visitors before commitment.`,
    recommendations: [
      "Simplify the hero — one promise, one CTA",
      "Reduce above-the-fold cognitive load",
      "Test a sharper headline against current",
    ],
    deepLinks: [{ label: "Open landing page", href: "/system" }],
  },
  engagement: {
    label: "Engagement / quiz drop-off",
    explanation: (v) =>
      `Quiz completion is ${v.toFixed(1)}%. Friction inside the quiz flow.`,
    recommendations: [
      "Cut optional questions",
      "Move sensitive fields (phone) to the end",
      "Add progress indicator if missing",
    ],
    deepLinks: [{ label: "Open quiz editor", href: "/members/admin/quiz" }],
  },
  booking: {
    label: "Booking friction",
    explanation: (v) =>
      `Lead → booking is ${v.toFixed(1)}%. Leads finish the quiz but don't book.`,
    recommendations: [
      "Reduce time between quiz completion and booking prompt",
      "Add WhatsApp confirmation step",
      "A/B test booking page headline",
    ],
    deepLinks: [
      { label: "Touchpoint sequences", href: "/members/dashboard/touchpoint-sequences" },
      { label: "Message Library", href: "/members/admin/message-library" },
    ],
    selfOptModule: "message_ab",
  },
  setter: {
    label: "Setter qualification weak",
    explanation: (v) =>
      `Qualified rate is ${v.toFixed(1)}%. Setter conversations not converting to held calls.`,
    recommendations: [
      "Review last 10 call recordings",
      "Tighten qualification questions",
      "Adjust AI Setter script gates",
    ],
    deepLinks: [
      { label: "AI Setter guardrails", href: "/members/admin/ai-setter-guardrails" },
      { label: "Operator Control", href: "/members/dashboard/operator-control" },
    ],
    selfOptModule: "ai_setter_script",
  },
  showing: {
    label: "No-show problem",
    explanation: (v) =>
      `Show rate is ${v.toFixed(1)}%. Booked leads are not attending.`,
    recommendations: [
      "Add T-2h WhatsApp reminder",
      "Shorten booking → call window",
      "Surface reschedule option earlier",
    ],
    deepLinks: [
      { label: "Touchpoint sequences", href: "/members/dashboard/touchpoint-sequences" },
      { label: "Message Library", href: "/members/admin/message-library" },
    ],
    selfOptModule: "no_show_recovery",
  },
  closer: {
    label: "Closer performance issue",
    explanation: (v) =>
      `Close rate is ${v.toFixed(1)}%. Held calls are not converting to revenue.`,
    recommendations: [
      "Review top 3 objections (Sales Brain)",
      "Pair underperforming closer with mentor",
      "Reinforce one-recommendation handoff",
    ],
    deepLinks: [
      { label: "Operator Control", href: "/members/dashboard/operator-control" },
      { label: "Self-Optimization", href: "/members/admin/self-optimization" },
    ],
  },
  offer: {
    label: "Offer mismatch",
    explanation: (v) =>
      `Offer acceptance is ${v.toFixed(1)}%. Pricing or framing not landing.`,
    recommendations: [
      "Audit which tier is rejected most",
      "Test reframed offer presentation",
      "Validate split-pay messaging",
    ],
    deepLinks: [{ label: "Revenue Engine settings", href: "/members/admin/revenue" }],
  },
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface AutoFixCandidate {
  funnelKey: string | null;
  scopeLabel: string | null;
  stageKey: AutoFixStage;
  problemClass: AutoFixProblemClass;
  severity: AutoFixSeverity;
  metricKey: string;
  metricValue: number;
  metricThreshold: number;
  impactScore: number;
  effortScore: number;
  priorityRank: number;
  problemLabel: string;
  problemExplanation: string;
  recommendations: string[];
  deepLinks: AutoFixDeepLink[];
  selfOptModule?: AutoFixRecommendationSet["selfOptModule"];
}

export interface AutoFixInputMetrics {
  funnelKey?: string | null;
  scopeLabel?: string | null;
  /** Provide whichever metrics are available; missing ones are skipped. */
  lead_to_engagement_pct?: number | null;
  landing_to_quiz_pct?: number | null;
  quiz_completion_pct?: number | null;
  lead_to_booking_pct?: number | null;
  setter_qualified_pct?: number | null;
  show_rate_pct?: number | null;
  close_rate_pct?: number | null;
  offer_acceptance_pct?: number | null;
}

/** Pure detection — no I/O. */
export function detectAutoFixes(input: AutoFixInputMetrics): AutoFixCandidate[] {
  const out: AutoFixCandidate[] = [];

  for (const [klass, threshold] of Object.entries(AUTO_FIX_THRESHOLDS) as [
    AutoFixProblemClass,
    AutoFixThreshold,
  ][]) {
    const raw = (input as Record<string, number | null | undefined>)[threshold.metricKey];
    if (raw == null || Number.isNaN(raw)) continue;

    let severity: AutoFixSeverity | null = null;
    if (raw < threshold.criticalBelow) severity = "critical";
    else if (raw < threshold.weakBelow) severity = "weak";
    if (!severity) continue;

    const rec = AUTO_FIX_RECOMMENDATIONS[klass];
    const severityMultiplier = severity === "critical" ? 1.2 : 1.0;
    // Larger gap below threshold → larger impact
    const gapPct = Math.max(0, threshold.weakBelow - raw) / Math.max(1, threshold.weakBelow);
    const impactScore = Math.min(
      100,
      Math.round(threshold.baseImpact * severityMultiplier * (0.7 + gapPct * 0.6)),
    );
    const effortScore = threshold.baseEffort;
    // priority = impact / effort scaled to 0..100
    const priorityRank = Math.round((impactScore / Math.max(10, effortScore)) * 30);

    out.push({
      funnelKey: input.funnelKey ?? null,
      scopeLabel: input.scopeLabel ?? null,
      stageKey: PROBLEM_TO_STAGE[klass],
      problemClass: klass,
      severity,
      metricKey: threshold.metricKey,
      metricValue: raw,
      metricThreshold: threshold.weakBelow,
      impactScore,
      effortScore,
      priorityRank,
      problemLabel: rec.label,
      problemExplanation: rec.explanation(raw),
      recommendations: rec.recommendations,
      deepLinks: rec.deepLinks,
      selfOptModule: rec.selfOptModule,
    });
  }

  // Sort by priorityRank desc; cap at top 5
  out.sort((a, b) => b.priorityRank - a.priorityRank);
  return out.slice(0, 5);
}

export function severityColorClass(s: AutoFixSeverity): string {
  return s === "critical"
    ? "border-destructive/50 bg-destructive/10 text-destructive"
    : "border-amber-500/40 bg-amber-500/10 text-amber-700";
}
