/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC CANON CONSTITUTION — Supreme System Rulebook
 * The highest-order meta-canon of the ETC OS.
 * Defines what an active canon IS, how canons live, merge, and die.
 * Spec: docs/canon-constitution.md
 * Audit surface: CANON_MAP (src/lib/canon-map.ts)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * SUPREME RULE:
 *   One domain = one active canon = one source of truth.
 *
 * TRUTH HIERARCHY (top wins):
 *   Constitution → Active Canon → Enforced Registry → Feature → UI/Copy
 */

import { CANON_MAP, type CanonBlock, type CanonEntry } from './canon-map';

// ─────────────────────────────────────────────────────────────────────
// 1. Constitutional types
// ─────────────────────────────────────────────────────────────────────

export type CanonStatus = 'active' | 'dormant' | 'deprecated' | 'merged' | 'demoted';

export type CanonLifecycle =
  | 'proposed'   // candidate, not yet validated
  | 'validated'  // passed gap + non-duplication + block checks
  | 'active'     // installed as live governing truth
  | 'reviewed'   // reassessed after audit/usage
  | 'merged'     // absorbed into another canon
  | 'deprecated' // no longer governing
  | 'demoted';   // reclassified as feature/UI/impl spec

export type EnforcementMechanism =
  | 'typed_registry' | 'lint_rule' | 'ts_enum' | 'db_enum'
  | 'rpc' | 'db_constraint' | 'route_gate' | 'helper_fn'
  | 'documented_only';

export type EnforcementStatus = 'enforced' | 'partially_enforced' | 'codified_only';

export const VALID_BLOCKS: readonly CanonBlock[] = Object.freeze([
  'foundation', 'acquisition', 'conversion', 'value', 'intelligence', 'governance',
]);

// ─────────────────────────────────────────────────────────────────────
// 2. Constitutional principles (machine-readable)
// ─────────────────────────────────────────────────────────────────────

export const CONSTITUTION = Object.freeze({
  version: '1.0.0',
  installed_at: '2026-04-23',
  supreme_rule: 'one_domain_one_active_canon_one_source_of_truth',
  truth_hierarchy: ['constitution', 'active_canon', 'enforced_registry', 'feature', 'ui_copy'] as const,
  blocks: VALID_BLOCKS,
  forbidden_buckets: ['cross-cutting', 'misc', 'temporary', 'hybrid'] as const,
  principles: [
    'A canon is valid only if it is an invariant, has one block, has one owner, and is auditable.',
    'No two active canons may govern the same primary domain.',
    'No active canon may exist outside the 6-block map.',
    'Every canon must move toward enforced state, not stay merely codified.',
    'Conflicts must be resolved structurally (scope, merge, hierarchy, demotion) — never by context.',
    'No feature may be added without naming its block and governing canon.',
  ] as const,
} as const);

// ─────────────────────────────────────────────────────────────────────
// 3. Constitutional gates (validation predicates)
// ─────────────────────────────────────────────────────────────────────

export interface ConstitutionalViolation {
  rule: string;
  detail: string;
  canonId?: string;
}

/** Gate 1 — Every active canon belongs to exactly one valid block. */
export function gateBlockMembership(map: readonly CanonEntry[] = CANON_MAP): ConstitutionalViolation[] {
  return map
    .filter(c => c.status === 'active' && !VALID_BLOCKS.includes(c.block))
    .map(c => ({ rule: 'block_membership', detail: `Invalid block "${c.block}"`, canonId: c.id }));
}

/** Gate 2 — Each domain (block) may have multiple canons, but no duplicate id/name. */
export function gateUniqueOwnership(map: readonly CanonEntry[] = CANON_MAP): ConstitutionalViolation[] {
  const seenIds = new Map<string, string>();
  const seenNames = new Map<string, string>();
  const violations: ConstitutionalViolation[] = [];
  for (const c of map) {
    if (c.status !== 'active') continue;
    if (seenIds.has(c.id)) {
      violations.push({ rule: 'unique_ownership', detail: `Duplicate canon id ${c.id}`, canonId: c.id });
    }
    if (seenNames.has(c.name)) {
      violations.push({ rule: 'unique_ownership', detail: `Duplicate canon name "${c.name}"`, canonId: c.id });
    }
    seenIds.set(c.id, c.id);
    seenNames.set(c.name, c.id);
  }
  return violations;
}

/** Gate 3 — Every active canon must declare a source of truth. */
export function gateSourceOfTruth(map: readonly CanonEntry[] = CANON_MAP): ConstitutionalViolation[] {
  return map
    .filter(c => c.status === 'active' && (!c.source || c.source.trim().length === 0))
    .map(c => ({ rule: 'source_of_truth', detail: 'Missing source path', canonId: c.id }));
}

/** Gate 4 — No "cross-cutting" / "misc" buckets allowed. */
export function gateNoForbiddenBuckets(map: readonly CanonEntry[] = CANON_MAP): ConstitutionalViolation[] {
  const forbidden = new Set<string>(CONSTITUTION.forbidden_buckets);
  return map
    .filter(c => forbidden.has(c.block as unknown as string))
    .map(c => ({ rule: 'no_forbidden_buckets', detail: `Block "${c.block}" is forbidden`, canonId: c.id }));
}

/** Run all constitutional gates. */
export function auditConstitution(map: readonly CanonEntry[] = CANON_MAP): {
  passed: boolean;
  activeCount: number;
  byBlock: Record<CanonBlock, number>;
  violations: ConstitutionalViolation[];
} {
  const violations = [
    ...gateBlockMembership(map),
    ...gateUniqueOwnership(map),
    ...gateSourceOfTruth(map),
    ...gateNoForbiddenBuckets(map),
  ];
  const active = map.filter(c => c.status === 'active');
  const byBlock = active.reduce((acc, c) => {
    acc[c.block] = (acc[c.block] ?? 0) + 1;
    return acc;
  }, {} as Record<CanonBlock, number>);
  return { passed: violations.length === 0, activeCount: active.length, byBlock, violations };
}

// ─────────────────────────────────────────────────────────────────────
// 4. Future-feature filter (must answer all 4 questions)
// ─────────────────────────────────────────────────────────────────────

export interface FeatureProposal {
  name: string;
  block: CanonBlock;
  governingCanonId: string;     // must reference an existing active canon id
  duplicatesExisting: boolean;  // honest self-declaration
  requiresNewCanon: boolean;
}

export function validateFeatureProposal(
  p: FeatureProposal,
  map: readonly CanonEntry[] = CANON_MAP,
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!VALID_BLOCKS.includes(p.block)) reasons.push(`Block "${p.block}" not in 6-block map`);
  const canon = map.find(c => c.id === p.governingCanonId && c.status === 'active');
  if (!canon) reasons.push(`Governing canon "${p.governingCanonId}" not active`);
  if (canon && canon.block !== p.block) reasons.push(`Block mismatch: feature=${p.block}, canon=${canon.block}`);
  if (p.duplicatesExisting) reasons.push('Feature duplicates existing capability — merge instead');
  if (p.requiresNewCanon) reasons.push('New canon required — must pass proposed→validated→active lifecycle first');
  return { allowed: reasons.length === 0, reasons };
}

// ─────────────────────────────────────────────────────────────────────
// 5. Canon lifecycle helpers
// ─────────────────────────────────────────────────────────────────────

export const LIFECYCLE_TRANSITIONS: Readonly<Record<CanonLifecycle, readonly CanonLifecycle[]>> = Object.freeze({
  proposed:   ['validated', 'deprecated'],
  validated:  ['active', 'deprecated'],
  active:     ['reviewed', 'merged', 'deprecated', 'demoted'],
  reviewed:   ['active', 'merged', 'deprecated', 'demoted'],
  merged:     [],
  deprecated: [],
  demoted:    [],
});

export function canTransition(from: CanonLifecycle, to: CanonLifecycle): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}
