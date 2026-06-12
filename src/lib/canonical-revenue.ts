/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC CANONICAL REVENUE ACCELERATION (Hardwired)
 * Layer 24 — LTV Maximization Layer
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Source of truth for HOW the system converts user state into revenue.
 *
 * Closes the audit's Revenue Acceleration gap by formalizing:
 *
 *   REVENUE PRINCIPLE   — every user always on a monetization path
 *   REVENUE LOOPS       — primary, recovery, value→revenue
 *   REVENUE MOMENTS     — fixed, state-triggered (no manual timing)
 *   SINGLE-OFFER RULE   — exactly one primary offer per state
 *   UPGRADE PATH        — Free → Community(€27) → Program → Placement
 *
 * HARD RULES:
 *   ❌ Multiple competing primary offers in the same state are forbidden.
 *   ❌ Revenue moments may NOT be triggered by manual timing — only by
 *      canonical events (canonical-events.ts) or KPI breaches.
 *   ❌ A user may NEVER exist without a `next_value_step` resolved.
 *   ✅ Revenue-impacting actions outrank non-revenue actions
 *      (delegated to pickDominant()).
 *
 * Block:        Value (primary) · Conversion · Governance (supporting)
 * Constitution: governed by `canon-constitution`
 * Loop integration: feeds `execution-loop-canon-v2` Action slot
 *                   composes with `canonical-channel` for delivery
 *                   composes with `canonical-reactivation` for recovery loop
 *
 * Spec:   docs/canonical-revenue.md
 * Memory: mem://architecture/canonical-revenue
 * Siblings:
 *   - src/lib/canonical-events.ts        (trigger event names)
 *   - src/lib/canonical-channel.ts       (delivery composition)
 *   - src/lib/canonical-reactivation.ts  (recovery loop consumer)
 *   - src/lib/canonical-thresholds.ts    (qualification thresholds)
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { CanonicalEventName } from './canonical-events';

// ─── 1. UPGRADE PATH — fixed, ordered, no skipping w/o qualification ────

export type UpgradeTier = 'free' | 'community' | 'program' | 'placement';

export interface UpgradePathStep {
  readonly tier: UpgradeTier;
  /** Stable label used in UI + audit */
  readonly label: string;
  /** Price in EUR (display only — pricing logic stays in monetization_offers) */
  readonly price_eur: number | null;
  /** Canonical event that marks entry into this tier */
  readonly entry_event: CanonicalEventName;
  /** What the user gets — single value proposition */
  readonly benefit: string;
  /** Next tier in the path (null = terminal) */
  readonly next_tier: UpgradeTier | null;
  /** Expected ROI signal — qualitative, drives ordering */
  readonly expected_roi: 'low' | 'medium' | 'high' | 'highest';
}

/**
 * The canonical upgrade ladder. No tier may be skipped without an explicit
 * qualification rule (e.g. fast-track score >= 75 → direct to program).
 */
export const UPGRADE_PATH: readonly UpgradePathStep[] = Object.freeze([
  {
    tier: 'free',
    label: 'Free Access',
    price_eur: 0,
    entry_event: 'lead_created',
    benefit: 'Quiz + result + first orientation',
    next_tier: 'community',
    expected_roi: 'low',
  },
  {
    tier: 'community',
    label: 'Community',
    price_eur: 27,
    entry_event: 'community_joined',
    benefit: 'Path to First €1k + structured progression',
    next_tier: 'program',
    expected_roi: 'medium',
  },
  {
    tier: 'program',
    label: 'Program',
    price_eur: 1600,
    entry_event: 'purchase_completed',
    benefit: 'Full ETC system + certification path',
    next_tier: 'placement',
    expected_roi: 'high',
  },
  {
    tier: 'placement',
    label: 'Placement / High Ticket',
    price_eur: null,
    entry_event: 'placement_ready',
    benefit: 'Active deal flow + earnings',
    next_tier: null,
    expected_roi: 'highest',
  },
]);

// ─── 2. REVENUE MOMENTS — fixed, state-triggered ────────────────────────

export type RevenueMomentKind =
  | 'immediate'        // conversion: post-quiz, post-result, booking intent
  | 'short_term'       // post-onboarding, first engagement, first KPI
  | 'performance'      // milestone, improvement, first success
  | 'recovery';        // no booking, no show, inactivity

export interface RevenueMomentSpec {
  /** Stable id, written to audit logs + outbound_events.metadata.moment_id */
  readonly id: string;
  readonly kind: RevenueMomentKind;
  /** Canonical event that fires the moment */
  readonly trigger_event: CanonicalEventName;
  /** Which upgrade tier this moment promotes */
  readonly target_tier: UpgradeTier;
  /** Single dominant offer key (matches monetization_offers.offer_key when applicable) */
  readonly primary_offer_key: string | null;
  /** Optional fallback offer if primary is rejected (Single-Offer Principle: only ONE fallback) */
  readonly fallback_offer_key?: string;
  /** Human-readable note for audits */
  readonly description: string;
}

/**
 * Canonical revenue moments. The system evaluates these against current
 * user state to surface exactly ONE primary moment at a time.
 */
export const REVENUE_MOMENTS: readonly RevenueMomentSpec[] = Object.freeze([
  // IMMEDIATE
  {
    id: 'immediate.quiz_completed',
    kind: 'immediate',
    trigger_event: 'quiz_completed',
    target_tier: 'community',
    primary_offer_key: null, // booking is the dominant action; no offer competes
    description: 'Post-quiz: dominant action is booking, no monetization offer competes',
  },
  {
    id: 'immediate.booking_intent_lost',
    kind: 'immediate',
    trigger_event: 'rescue_shown',
    target_tier: 'community',
    primary_offer_key: 'community_27',
    description: 'Quiz completed but no booking → community as recovery on-ramp',
  },
  // SHORT_TERM
  {
    id: 'short_term.community_joined',
    kind: 'short_term',
    trigger_event: 'community_joined',
    target_tier: 'community',
    primary_offer_key: null,
    description: 'Onboarding to community Path — no upgrade pressure yet',
  },
  {
    id: 'short_term.path_step_completed',
    kind: 'short_term',
    trigger_event: 'path_step_completed',
    target_tier: 'program',
    primary_offer_key: 'radiant',
    description: 'First Path milestone unlocks program preview',
  },
  // PERFORMANCE
  {
    id: 'performance.path_completed',
    kind: 'performance',
    trigger_event: 'path_completed',
    target_tier: 'program',
    primary_offer_key: 'radiant',
    description: 'Path to First €1k completed → program is the natural next step',
  },
  {
    id: 'performance.level_up',
    kind: 'performance',
    trigger_event: 'level_up',
    target_tier: 'program',
    primary_offer_key: 'booster',
    fallback_offer_key: 'scale_lab',
    description: 'Level threshold reached → performance booster offer',
  },
  // RECOVERY
  {
    id: 'recovery.inactive_3d',
    kind: 'recovery',
    trigger_event: 'inactive_3d',
    target_tier: 'community',
    primary_offer_key: null,
    description: 'Reactivation belongs to canonical-reactivation; revenue stays silent',
  },
  {
    id: 'recovery.inactive_7d',
    kind: 'recovery',
    trigger_event: 'inactive_7d',
    target_tier: 'community',
    primary_offer_key: 'community_27',
    description: '7d inactive → low-friction re-entry via community',
  },
]);

// ─── 3. REVENUE LOOPS — every loop must terminate at revenue ────────────

export type RevenueLoopKind = 'primary' | 'recovery' | 'value_to_revenue';

export interface RevenueLoopSpec {
  readonly id: string;
  readonly kind: RevenueLoopKind;
  /** Ordered canonical events describing the loop */
  readonly path: readonly CanonicalEventName[];
  /** Terminal event = revenue realisation */
  readonly terminal_event: CanonicalEventName;
  readonly description: string;
}

export const REVENUE_LOOPS: readonly RevenueLoopSpec[] = Object.freeze([
  {
    id: 'loop.primary',
    kind: 'primary',
    path: ['lead_created', 'booking_created', 'showed', 'deal_won'],
    terminal_event: 'deal_won',
    description: 'Lead → booking → show → close',
  },
  {
    id: 'loop.recovery',
    kind: 'recovery',
    path: ['lead_created', 'rescue_shown', 'community_joined', 'upgrade_converted'],
    terminal_event: 'upgrade_converted',
    description: 'No booking → community €27 → upgrade',
  },
  {
    id: 'loop.value_to_revenue',
    kind: 'value_to_revenue',
    path: ['community_joined', 'path_step_completed', 'path_completed', 'purchase_completed'],
    terminal_event: 'purchase_completed',
    description: 'Member → progression → reinvestment / upgrade',
  },
]);

// ─── 4. AUDIT GATE ──────────────────────────────────────────────────────

export function auditRevenueCanon(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  // 4a. Single-Offer per kind+target_tier+trigger (no two primaries compete)
  const primaryByKey = new Map<string, string>();
  for (const m of REVENUE_MOMENTS) {
    if (m.primary_offer_key === null) continue;
    const k = `${m.kind}::${m.target_tier}::${m.trigger_event}`;
    const existing = primaryByKey.get(k);
    if (existing) {
      errors.push(
        `Single-Offer violation: ${m.id} and ${existing} both claim primary for ${k}`,
      );
    }
    primaryByKey.set(k, m.id);
  }

  // 4b. Upgrade path is connected (next_tier chain)
  const tiers = UPGRADE_PATH.map(s => s.tier);
  for (let i = 0; i < UPGRADE_PATH.length; i++) {
    const step = UPGRADE_PATH[i];
    if (step.next_tier === null && i !== UPGRADE_PATH.length - 1) {
      errors.push(`Upgrade path has terminal tier ${step.tier} but more tiers follow`);
    }
    if (step.next_tier && !tiers.includes(step.next_tier)) {
      errors.push(`Upgrade path: ${step.tier}.next_tier=${step.next_tier} not in path`);
    }
  }

  // 4c. Every loop terminates at revenue (= terminal event present in path)
  for (const loop of REVENUE_LOOPS) {
    if (!loop.path.includes(loop.terminal_event)) {
      errors.push(`Loop ${loop.id}: terminal_event ${loop.terminal_event} missing from path`);
    }
  }

  // 4d. Unique ids
  const ids = new Set<string>();
  for (const m of REVENUE_MOMENTS) {
    if (ids.has(m.id)) errors.push(`Duplicate moment id: ${m.id}`);
    ids.add(m.id);
  }

  return { ok: errors.length === 0, errors };
}

// ─── 5. RESOLVER — single-offer enforcement at runtime ──────────────────

/**
 * Given the user's current canonical state + level, return the ONE primary
 * revenue moment that applies. Caller should respect Priority Engine and
 * defer if a higher-priority non-revenue action exists.
 */
export function resolvePrimaryMoment(opts: {
  recentEvent: CanonicalEventName | null;
  currentTier: UpgradeTier;
}): RevenueMomentSpec | null {
  if (!opts.recentEvent) return null;
  // Highest-ROI tier match wins; if multiple, performance > short_term > immediate > recovery
  const order: RevenueMomentKind[] = ['performance', 'short_term', 'immediate', 'recovery'];
  const candidates = REVENUE_MOMENTS.filter(m => m.trigger_event === opts.recentEvent);
  candidates.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return candidates[0] ?? null;
}

export function nextUpgradeStep(currentTier: UpgradeTier): UpgradePathStep | null {
  const idx = UPGRADE_PATH.findIndex(s => s.tier === currentTier);
  if (idx === -1 || idx === UPGRADE_PATH.length - 1) return null;
  return UPGRADE_PATH[idx + 1];
}
