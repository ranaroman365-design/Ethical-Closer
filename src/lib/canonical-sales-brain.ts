/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL SALES BRAIN — Layer 41 (Pre-Call Intelligence + Post-Call Learning)
 * Block: Intelligence (primary) + Conversion + Governance
 * Canon-Map: I9
 *
 * Additive intelligence layer on top of L38 (Conversational AI),
 * L39 (Psych State), L40 (Personality), L32 (Message Perf), L33 (Voice Perf).
 *
 * Hard rules:
 *   - NEVER auto-closes deals (L7 in safety list)
 *   - NEVER fabricates outcomes / uses pressure tactics
 *   - NEVER overrides consent or compliance (DNC / quiet hours)
 *   - All recommendations are advisory; human Closer decides
 *   - Reads from existing tables; writes only to L41-owned tables
 * ═══════════════════════════════════════════════════════════════════════
 */

export const SALES_BRAIN_VERSION = '1.0.0';

/** Personality types mirror L40. */
export type SBPersonality = 'dominant' | 'analytical' | 'relational' | 'expressive' | 'unknown';

/** Psychological states mirror L39. */
export type SBState = 'uncertain' | 'busy' | 'rational' | 'dominant' | 'neutral';

/** Risk tier derived from probability + signals. */
export type SBRiskTier = 'low' | 'medium' | 'high';

export interface LeadProfileSummary {
  lead_id: string;
  name: string | null;
  funnel: string | null;
  source: string | null;
  lead_score: number | null;
  booking_status: string | null;
  responsiveness: 'high' | 'medium' | 'low' | 'unknown';
  urgency: 'high' | 'medium' | 'low' | 'unknown';
  intent: 'high' | 'medium' | 'low' | 'unknown';
  dominant_personality: SBPersonality;
  dominant_state: SBState;
  objections_raised: string[];
  conversation_message_count: number;
  conversion_probability: number; // 0..1
  risk_tier: SBRiskTier;
  summary_profile: string; // 1-2 sentences
}

export interface PreCallInsight {
  lead_id: string;
  generated_at: string;
  personality: SBPersonality;
  state: SBState;
  likely_objections: string[];
  recommended_approach: string;
  best_opening_line: string;
  key_leverage_points: string[];
  avoid: string[];
  close_probability: number; // 0..1
  confidence: number; // 0..1 of the model output itself
}

/** Five canonical call-strategy beats (Operator Workflow C2). */
export const CALL_STRATEGY_BEATS = Object.freeze([
  'opener',
  'qualification',
  'value_framing',
  'objection_handling',
  'closing_angle',
] as const);
export type CallStrategyBeat = typeof CALL_STRATEGY_BEATS[number];

export interface PostCallAnalysis {
  call_id: string;
  lead_id: string | null;
  outcome: 'closed_won' | 'closed_lost' | 'follow_up' | 'no_decision';
  objections: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  what_worked: string[];
  what_failed: string[];
  improvement_suggestions: string[];
  pre_call_match_score: number; // how close pre-call insight matched reality (0..1)
}

/** Hard safety rules — never violated by Sales Brain. */
export const SALES_BRAIN_SAFETY = Object.freeze({
  NEVER_AUTO_CLOSE: true,
  NEVER_FABRICATE_CLAIMS: true,
  NEVER_PRESSURE_TACTICS: true,
  NEVER_OVERRIDE_CONSENT: true,
  NEVER_OVERRIDE_DNC: true,
  REQUIRES_HUMAN_FOR_FINAL_OFFER: true,
  ADVISORY_ONLY: true,
} as const);

/** Threshold mapping probability → risk tier. */
export function probabilityToRiskTier(p: number): SBRiskTier {
  if (p >= 0.6) return 'low';
  if (p >= 0.3) return 'medium';
  return 'high';
}

/** Coarse heuristic when AI is unavailable / disabled. */
export function heuristicProbability(input: {
  lead_score?: number | null;
  message_count?: number | null;
  booking_status?: string | null;
  has_objections?: boolean;
}): number {
  let p = 0.2;
  if ((input.lead_score ?? 0) >= 70) p += 0.25;
  else if ((input.lead_score ?? 0) >= 40) p += 0.1;
  if ((input.message_count ?? 0) >= 4) p += 0.15;
  if (input.booking_status === 'booked') p += 0.25;
  if (input.has_objections) p -= 0.05;
  return Math.max(0.05, Math.min(0.95, p));
}

/** Maps personality → preferred opener tone (advisory). */
export const PERSONALITY_TONE_MAP: Record<SBPersonality, string> = {
  dominant: 'direct, outcome-first, no preamble',
  analytical: 'structured, factual, low-emotion',
  relational: 'warm, personal, trust-first',
  expressive: 'energetic, vision-first, enthusiastic',
  unknown: 'neutral, observational, ask before assuming',
};

/** Maps state → conversational guardrail (advisory). */
export const STATE_GUARDRAIL_MAP: Record<SBState, string> = {
  uncertain: 'reduce options, give clarity, low pressure',
  busy: 'short, respect time, propose concrete slot',
  rational: 'data + structure, avoid emotional framing',
  dominant: 'mirror confidence, get to point fast',
  neutral: 'open with curiosity question, then qualify',
};
