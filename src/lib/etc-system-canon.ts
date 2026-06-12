/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC SYSTEM CANON v1.1 — Alignment & Execution Upgrade
 * Single source of truth that ALIGNS (does not replace) the four pillars:
 *   1. Canon Constitution v1        (supreme meta-rules)
 *   2. Canon Consolidation v2       (21 active canons, 6-block map)
 *   3. Canon Enforcement Pack v1    (thresholds · events · roles · KPI RPC · 6-block)
 *   4. Execution Loop Canon v2      (Trigger→Comm→Action→Measure→Govern→Recover)
 *
 * Spec: docs/etc-system-canon-v1.1.md
 * Goal: maximize Conversion · Retention · LTV by activating existing logic.
 * NOT a new feature. NOT new business logic. Alignment + activation only.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { CANON_MAP, type CanonBlock } from './canon-map';
import { auditConstitution, CONSTITUTION } from './canon-constitution';
import { EXECUTION_LOOPS, auditExecutionLoops, type LoopMode } from './execution-loop-canon';

// ─────────────────────────────────────────────────────────────────────
// 1. Block function definitions (locked)
// ─────────────────────────────────────────────────────────────────────

export const BLOCK_FUNCTIONS: Readonly<Record<CanonBlock, string>> = Object.freeze({
  foundation:   'invariants — roles, thresholds, events, tenant scoping, idempotency',
  acquisition:  'traffic & entry — lead generation, narrative, routing, booking conversion',
  conversion:   'monetization — call delivery, communication, operator workflow, recovery',
  value:        'delivery & progression — onboarding, progression, mentoring, compensation',
  intelligence: 'measurement & insight — KPI truth, OSS/PSP, bottleneck control engine',
  governance:   'decisions & control — performance surfaces, B2B governance',
  meta:         'system shape — ETC Operating System (Layer 47): defines the 4 layers + 3 dashboards + unified data pool',
});

// ─────────────────────────────────────────────────────────────────────
// 2. Enforcement manifest — what must remain technically enforced
// ─────────────────────────────────────────────────────────────────────

export type EnforcementMechanismKey =
  | 'thresholds_registry'
  | 'events_registry'
  | 'role_naming_lint'
  | 'kpi_truth_rpc'
  | 'six_block_map'
  | 'execution_loop_audit'
  | 'constitution_audit';

export interface EnforcementEntry {
  key: EnforcementMechanismKey;
  source: string;
  guarantees: string;
}

export const ENFORCEMENT_MANIFEST: readonly EnforcementEntry[] = Object.freeze([
  { key: 'thresholds_registry',   source: 'src/lib/canonical-thresholds.ts',  guarantees: 'no hardcoded numeric gates' },
  { key: 'events_registry',       source: 'src/lib/canonical-events.ts',      guarantees: 'no free-text event names' },
  { key: 'role_naming_lint',      source: 'eslint.config.js (etc-canon/no-hardcoded-role-label)', guarantees: 'no hardcoded role labels in UI' },
  { key: 'kpi_truth_rpc',         source: 'rpc:get_kpi_truth + src/lib/operational-canon.ts', guarantees: 'single KPI formula source' },
  { key: 'six_block_map',         source: 'src/lib/canon-map.ts',             guarantees: 'every active canon in exactly one block' },
  { key: 'execution_loop_audit',  source: 'src/lib/execution-loop-canon.ts',  guarantees: 'every loop has trigger/CTA/measurement/decision/recovery/horizon' },
  { key: 'constitution_audit',    source: 'src/lib/canon-constitution.ts',    guarantees: 'block membership · unique ownership · source of truth' },
]);

// ─────────────────────────────────────────────────────────────────────
// 3. Canon alignment graph — which v1.1 part connects to which canon
// ─────────────────────────────────────────────────────────────────────

export const ALIGNMENT_GRAPH = Object.freeze({
  execution_loop_to_canons: {
    trigger_layer:        ['F4', 'C1'],   // canonical events + comm delivery
    message_logic:        ['A1'],          // narrative stack
    channel_delivery:     ['C1'],          // communication delivery canon
    action_engine:        ['C2', 'A3'],   // operator workflow + booking conversion
    performance_layer:    ['I1'],          // KPI truth layer
    governance_engine:    ['G1', 'I3'],   // performance surface + control engine
    recovery_engine:      ['C3'],          // appointment recovery & reschedule
    priority_engine:      ['I3', 'A2'],   // bottleneck + lead routing (Fast Track / Quality)
    time_layer:           ['F3'],          // canonical thresholds (windows)
  },
  loop_modes_to_blocks: {
    conversion:  ['acquisition', 'conversion'],
    retention:   ['value', 'intelligence'],
    recovery:    ['conversion', 'governance'],
    performance: ['intelligence', 'governance', 'value'],
  } as Record<LoopMode, readonly CanonBlock[]>,
} as const);

// ─────────────────────────────────────────────────────────────────────
// 4. Success conditions (Part 13) — runtime check
// ─────────────────────────────────────────────────────────────────────

export interface AlignmentReport {
  version: string;
  passed: boolean;
  pillars: {
    constitution: { passed: boolean; activeCanons: number; violations: number };
    execution_loops: { passed: boolean; total: number; violations: number };
    enforcement_mechanisms: number;
    blocks_covered: number;
  };
  unmet_conditions: string[];
}

/** Validate the v1.1 alignment surface is internally consistent. */
export function auditSystemCanon(): AlignmentReport {
  const c = auditConstitution(CANON_MAP);
  const l = auditExecutionLoops(EXECUTION_LOOPS);
  const blocksCovered = new Set(CANON_MAP.filter(x => x.status === 'active').map(x => x.block)).size;

  const unmet: string[] = [];
  if (!c.passed) unmet.push(`constitution_violations:${c.violations.length}`);
  if (!l.passed) unmet.push(`execution_loop_violations:${l.violations.length}`);
  if (blocksCovered !== 6) unmet.push(`blocks_covered_${blocksCovered}_of_6`);
  if (ENFORCEMENT_MANIFEST.length < 7) unmet.push('enforcement_manifest_incomplete');

  return {
    version: '1.1.0',
    passed: unmet.length === 0,
    pillars: {
      constitution:   { passed: c.passed, activeCanons: c.activeCount, violations: c.violations.length },
      execution_loops:{ passed: l.passed, total: l.total, violations: l.violations.length },
      enforcement_mechanisms: ENFORCEMENT_MANIFEST.length,
      blocks_covered: blocksCovered,
    },
    unmet_conditions: unmet,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 5. Public manifest (read-only)
// ─────────────────────────────────────────────────────────────────────

export const SYSTEM_CANON = Object.freeze({
  version: '1.1.0',
  installed_at: '2026-04-23',
  governs: 'alignment_and_activation_only',
  constitution_version: CONSTITUTION.version,
  blocks: CONSTITUTION.blocks,
  block_functions: BLOCK_FUNCTIONS,
  enforcement: ENFORCEMENT_MANIFEST,
  alignment: ALIGNMENT_GRAPH,
  success_conditions: [
    'every trigger → communication',
    'every communication → action',
    'every action → measured',
    'every measurement → decision',
    'every failure → recovery',
    'every user → guided',
  ] as const,
} as const);
