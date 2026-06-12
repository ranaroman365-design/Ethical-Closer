/**
 * Lead Scoring Engine — Layer 50 (Conversion Intelligence)
 *
 * Three deterministic scores derived from existing lead + appointment data:
 *   1. Lead Score (0–100) — weighted composite of Intent, Behavior, Speed, Source, Completeness
 *   2. Show Probability (0–100%) — likelihood the lead appears for the call
 *   3. Close Probability (0–100%) — likelihood of a successful close
 *
 * All formulas are pure functions — no DB calls, no side effects.
 * The caller provides the input struct from whatever data is available.
 *
 * Block: Intelligence (primary) + Conversion
 * Canon-Map: I10 (under ETC OS Layer 47)
 */

// ── Input type ──

export interface LeadScoringInput {
  // Intent signals
  quizScore: number | null;             // 0–14 from qualification engine
  qualificationBucket: string | null;   // "high" | "mid" | "low"
  sourceFunnel: string | null;          // e.g. "fastlane", "apply", "quiz", etc.
  hasPriorityBooking: boolean;

  // Behavior signals
  messagesCount: number;                // total messages from/to lead
  hasRespondedToMessage: boolean;       // lead replied at least once
  responseTimeMinutes: number | null;   // avg response time in minutes (null = unknown)

  // Speed signals
  firstContactMinutes: number | null;   // minutes from lead creation to first contact
  bookingToCallMinutes: number | null;  // minutes from booking creation to appointment start

  // Source
  originType: string | null;            // e.g. "organic", "paid", "referral"

  // Data completeness
  hasName: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasQuizData: boolean;
  hasSetterNotes: boolean;

  // History
  totalCallsBooked: number;
  totalCallsAttended: number;
  totalNoShows: number;

  // Setter qualification
  setterProblemClarity: string | null;  // "clear" | "partial" | "unclear" | null
  setterBudgetReadiness: string | null; // "ready" | "maybe" | "not_ready" | null
  setterDecisionReadiness: string | null;
  setterQualificationScore: number | null; // 0–10 from setter
}

// ── Output type ──

export interface LeadScoringResult {
  leadScore: number;              // 0–100
  showProbability: number;        // 0–100
  closeProbability: number;       // 0–100

  // Breakdown for transparency
  breakdown: {
    intent: number;               // 0–100
    behavior: number;             // 0–100
    speed: number;                // 0–100
    sourceQuality: number;        // 0–100
    dataCompleteness: number;     // 0–100
  };

  // Tier labels
  leadTier: "excellent" | "good" | "medium" | "weak";
  showTier: "high" | "medium" | "risk";
  closeTier: "high" | "medium" | "risk";
}

// ── Weights ──

const LEAD_SCORE_WEIGHTS = {
  intent: 0.25,
  behavior: 0.25,
  speed: 0.20,
  sourceQuality: 0.15,
  dataCompleteness: 0.15,
} as const;

// ── Sub-scores ──

function scoreIntent(input: LeadScoringInput): number {
  let score = 0;

  // Quiz score (0–14 → mapped to 0–40)
  const qs = input.quizScore ?? 0;
  if (qs >= 10) score += 40;
  else if (qs >= 7) score += 30;
  else if (qs >= 4) score += 20;
  else if (qs > 0) score += 10;

  // Funnel source
  const funnel = (input.sourceFunnel ?? "").toLowerCase();
  if (funnel.includes("fastlane") || funnel.includes("fast-track") || funnel.includes("priority")) {
    score += 30;
  } else if (funnel.includes("apply") || funnel.includes("closerpath")) {
    score += 20;
  } else if (funnel.includes("quiz") || funnel.includes("qualify")) {
    score += 15;
  } else if (funnel) {
    score += 5;
  }

  // Qualification bucket boost
  if (input.qualificationBucket === "high") score += 15;
  else if (input.qualificationBucket === "mid") score += 5;

  // Priority booking
  if (input.hasPriorityBooking) score += 15;

  return clamp(score, 0, 100);
}

function scoreBehavior(input: LeadScoringInput): number {
  let score = 50; // neutral baseline

  if (input.hasRespondedToMessage) {
    score += 25;
    // Fast response bonus
    if (input.responseTimeMinutes != null) {
      if (input.responseTimeMinutes <= 30) score += 25;
      else if (input.responseTimeMinutes <= 120) score += 15;
      else if (input.responseTimeMinutes <= 480) score += 5;
    }
  } else if (input.messagesCount > 0) {
    // We sent messages but got no reply
    score -= 30;
  }

  // Multiple touchpoints
  if (input.messagesCount >= 5) score += 10;
  else if (input.messagesCount >= 2) score += 5;

  // No-show history penalty
  if (input.totalNoShows >= 3) score -= 30;
  else if (input.totalNoShows >= 2) score -= 20;
  else if (input.totalNoShows >= 1) score -= 10;

  // Attended calls bonus
  if (input.totalCallsAttended >= 2) score += 10;
  else if (input.totalCallsAttended >= 1) score += 5;

  return clamp(score, 0, 100);
}

function scoreSpeed(input: LeadScoringInput): number {
  let score = 50;

  // Time to first contact
  if (input.firstContactMinutes != null) {
    if (input.firstContactMinutes <= 5) score += 30;
    else if (input.firstContactMinutes <= 30) score += 20;
    else if (input.firstContactMinutes <= 60) score += 10;
    else if (input.firstContactMinutes > 240) score -= 20;
  }

  // Booking → Call gap
  if (input.bookingToCallMinutes != null) {
    const hours = input.bookingToCallMinutes / 60;
    if (hours <= 24) score += 20;
    else if (hours <= 72) score += 10;
    else if (hours > 168) score -= 15; // >7 days
  }

  return clamp(score, 0, 100);
}

function scoreSourceQuality(input: LeadScoringInput): number {
  let score = 30; // baseline

  const funnel = (input.sourceFunnel ?? "").toLowerCase();
  const origin = (input.originType ?? "").toLowerCase();

  // Funnel quality
  if (funnel.includes("fastlane") || funnel.includes("fast-track")) score += 40;
  else if (funnel.includes("apply") || funnel.includes("closerpath")) score += 30;
  else if (funnel.includes("quiz")) score += 20;
  else if (funnel.includes("webinar")) score += 15;

  // Origin type
  if (origin === "referral") score += 20;
  else if (origin === "paid") score += 10;
  else if (origin === "organic") score += 5;

  return clamp(score, 0, 100);
}

function scoreDataCompleteness(input: LeadScoringInput): number {
  let score = 0;
  const fields = [
    input.hasName,
    input.hasEmail,
    input.hasPhone,
    input.hasQuizData,
    input.hasSetterNotes,
  ];
  const filled = fields.filter(Boolean).length;

  // 5/5 = 100, 4/5 = 80, etc.
  score = (filled / fields.length) * 70;

  // Setter qualification data bonus
  if (input.setterProblemClarity) score += 10;
  if (input.setterBudgetReadiness) score += 10;
  if (input.setterDecisionReadiness) score += 10;

  return clamp(Math.round(score), 0, 100);
}

// ── Main scoring function ──

export function calculateLeadScore(input: LeadScoringInput): LeadScoringResult {
  const breakdown = {
    intent: scoreIntent(input),
    behavior: scoreBehavior(input),
    speed: scoreSpeed(input),
    sourceQuality: scoreSourceQuality(input),
    dataCompleteness: scoreDataCompleteness(input),
  };

  const leadScore = Math.round(
    breakdown.intent * LEAD_SCORE_WEIGHTS.intent +
    breakdown.behavior * LEAD_SCORE_WEIGHTS.behavior +
    breakdown.speed * LEAD_SCORE_WEIGHTS.speed +
    breakdown.sourceQuality * LEAD_SCORE_WEIGHTS.sourceQuality +
    breakdown.dataCompleteness * LEAD_SCORE_WEIGHTS.dataCompleteness
  );

  // ── Show Probability ──
  // 40% Lead Score + 30% Communication + 30% Time Gap
  const commScore = (() => {
    let s = 50;
    if (input.hasRespondedToMessage) s += 30;
    else if (input.messagesCount > 0) s -= 30;
    if (input.totalNoShows >= 2) s -= 20;
    if (input.totalCallsAttended > 0) s += 20;
    return clamp(s, 0, 100);
  })();

  const timeGapScore = (() => {
    if (input.bookingToCallMinutes == null) return 50;
    const hours = input.bookingToCallMinutes / 60;
    if (hours <= 24) return 80;
    if (hours <= 72) return 60;
    if (hours <= 168) return 40;
    return 25;
  })();

  const showProbability = clamp(Math.round(
    leadScore * 0.4 + commScore * 0.3 + timeGapScore * 0.3
  ), 0, 100);

  // ── Close Probability ──
  // 40% Intent + 30% Show Readiness + 30% Lead Quality (Pain clarity)
  const showReadinessScore = (() => {
    let s = 50;
    if (input.totalCallsAttended > 0 && input.totalNoShows === 0) s += 30;
    else if (input.totalNoShows > 0 && input.totalCallsAttended === 0) s -= 30;
    if (input.hasRespondedToMessage) s += 10;
    return clamp(s, 0, 100);
  })();

  const leadQualityScore = (() => {
    let s = 40;
    // Setter qualification signals
    if (input.setterProblemClarity === "clear") s += 30;
    else if (input.setterProblemClarity === "partial") s += 10;
    else if (input.setterProblemClarity === "unclear") s -= 10;

    if (input.setterBudgetReadiness === "ready") s += 20;
    else if (input.setterBudgetReadiness === "maybe") s += 5;
    else if (input.setterBudgetReadiness === "not_ready") s -= 15;

    if (input.setterDecisionReadiness === "ready") s += 10;

    // Setter qualification score (0–10)
    if (input.setterQualificationScore != null) {
      if (input.setterQualificationScore >= 8) s += 15;
      else if (input.setterQualificationScore >= 5) s += 5;
    }

    return clamp(s, 0, 100);
  })();

  const closeProbability = clamp(Math.round(
    breakdown.intent * 0.4 + showReadinessScore * 0.3 + leadQualityScore * 0.3
  ), 0, 100);

  return {
    leadScore: clamp(leadScore, 0, 100),
    showProbability,
    closeProbability,
    breakdown,
    leadTier: leadScore >= 75 ? "excellent" : leadScore >= 55 ? "good" : leadScore >= 35 ? "medium" : "weak",
    showTier: showProbability >= 70 ? "high" : showProbability >= 50 ? "medium" : "risk",
    closeTier: closeProbability >= 65 ? "high" : closeProbability >= 40 ? "medium" : "risk",
  };
}

// ── Helper to build input from RPC context data ──

export function buildScoringInput(
  lead: Record<string, any> | null,
  appointment: Record<string, any>,
  stats: { calls_count: number; messages_count: number; appointments_count: number; avg_response_time_minutes?: number | null; has_lead_replied?: boolean; first_contact_minutes?: number | null; lead_reply_count?: number } | undefined,
  lastQuiz: Record<string, any> | null,
): LeadScoringInput {
  const l = lead ?? {};
  const a = appointment;

  // Time calculations
  const leadCreated = l.created_at ? new Date(l.created_at).getTime() : null;
  const firstAction = l.first_action_at ? new Date(l.first_action_at).getTime() : null;
  const apptCreated = a.created_at ? new Date(a.created_at).getTime() : null;
  const apptStarts = a.starts_at ? new Date(a.starts_at).getTime() : null;

  return {
    quizScore: l.qualification_score ?? l.quiz_score ?? lastQuiz?.score ?? null,
    qualificationBucket: l.qualification_bucket ?? lastQuiz?.bucket ?? null,
    sourceFunnel: l.source_funnel ?? l.funnel_id ?? a.origin_source ?? a.booking_source ?? null,
    hasPriorityBooking: a.pricing_tier === "priority" || l.preferred_calendar === "priority",

    messagesCount: stats?.messages_count ?? 0,
    hasRespondedToMessage: stats?.has_lead_replied ?? (stats?.messages_count ?? 0) > 0,
    responseTimeMinutes: stats?.avg_response_time_minutes ?? null,

    firstContactMinutes: stats?.first_contact_minutes ?? (
      leadCreated && firstAction
        ? Math.max(0, (firstAction - leadCreated) / 60_000)
        : null
    ),
    bookingToCallMinutes: apptCreated && apptStarts
      ? Math.max(0, (apptStarts - apptCreated) / 60_000)
      : null,

    originType: l.origin_type ?? null,

    hasName: !!l.name,
    hasEmail: !!l.email,
    hasPhone: !!l.phone,
    hasQuizData: !!(l.qualification_score || l.quiz_score || lastQuiz),
    hasSetterNotes: !!l.setter_notes || !!a.setter_notes,

    totalCallsBooked: l.total_calls_booked ?? 0,
    totalCallsAttended: l.total_calls_attended ?? 0,
    totalNoShows: l.total_no_shows ?? 0,

    setterProblemClarity: l.setter_problem_clarity ?? null,
    setterBudgetReadiness: l.setter_budget_readiness ?? null,
    setterDecisionReadiness: l.setter_decision_readiness ?? null,
    setterQualificationScore: l.setter_qualification_score ?? null,
  };
}

// ── Tier color mapping for UI ──

export type ScoreTier = "high" | "medium" | "risk";

export function getTierColor(tier: ScoreTier | "excellent" | "good" | "weak"): string {
  switch (tier) {
    case "excellent":
    case "high":
      return "text-emerald-700 dark:text-emerald-400";
    case "good":
    case "medium":
      return "text-amber-700 dark:text-amber-400";
    case "weak":
    case "risk":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-muted-foreground";
  }
}

export function getTierBg(tier: ScoreTier | "excellent" | "good" | "weak"): string {
  switch (tier) {
    case "excellent":
    case "high":
      return "bg-emerald-500/15 border-emerald-500/30";
    case "good":
    case "medium":
      return "bg-amber-500/15 border-amber-500/30";
    case "weak":
    case "risk":
      return "bg-red-500/15 border-red-500/30";
    default:
      return "bg-muted border-border";
  }
}

export function getTierEmoji(tier: ScoreTier | "excellent" | "good" | "weak"): string {
  switch (tier) {
    case "excellent":
    case "high":
      return "🟢";
    case "good":
    case "medium":
      return "🟡";
    case "weak":
    case "risk":
      return "🔴";
    default:
      return "⚪";
  }
}

// ── Utility ──

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
