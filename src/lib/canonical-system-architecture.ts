/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAYER 35 — CANONICAL SYSTEM ARCHITECTURE (Master System Map)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Production-level system architecture canon. Defines the 6 top-level
 * SYSTEM LAYERS and how they connect. This is a META layer — it does not
 * introduce new runtime behavior, it formally names and wires together
 * what already exists across L27..L34 + supporting subsystems.
 *
 * RULE: Every new feature must declare which SYSTEM LAYER it belongs to
 * and which canonical sub-engine inside that layer it extends.
 *
 * Block (Constitution v1): GOVERNANCE (primary) — this is a structural map.
 *
 * Spec: docs/canonical-system-architecture.md
 * ═══════════════════════════════════════════════════════════════════════
 */

export type SystemLayerId =
  | 'lead_engine'
  | 'ai_setter'
  | 'communication_orchestration'
  | 'sales_intelligence'
  | 'teamforce'
  | 'revenue_value';

export type ScalingTarget =
  | 'individual_closer'
  | 'team'
  | 'company'
  | 'scaling_org';

export interface SubEngine {
  /** Stable id used in feature proposals: e.g. 'lead_engine.qualification'. */
  id: string;
  name: string;
  /** Source of truth — file path, RPC, or memory key. */
  source: string;
  /** Canon ids from canon-map.ts that implement this sub-engine. */
  canon_ids: readonly string[];
}

export interface SystemLayer {
  id: SystemLayerId;
  name: string;
  /** Primary 6-block (Constitution v1) this layer reports into. */
  block:
    | 'foundation' | 'acquisition' | 'conversion'
    | 'value' | 'intelligence' | 'governance';
  purpose: string;
  sub_engines: readonly SubEngine[];
  /** Layers this one consumes data from. */
  consumes: readonly SystemLayerId[];
  /** Layers this one emits data/events to. */
  emits_to: readonly SystemLayerId[];
}

/**
 * SYSTEM LAYERS — frozen master map.
 * Order matches the production data flow:
 *   Lead Engine → AI Setter → Communication Orchestration
 *   → Sales Intelligence ↔ Teamforce → Revenue/Value
 */
export const SYSTEM_LAYERS: readonly SystemLayer[] = Object.freeze([
  {
    id: 'lead_engine',
    name: 'Lead Engine',
    block: 'acquisition',
    purpose:
      'Generate, capture, score and route demand. Single entry point for all leads regardless of source.',
    sub_engines: [
      {
        id: 'lead_engine.funnel',
        name: 'Funnel',
        source: 'src/lib/funnel-source.ts + src/components/funnel/* + landing pages',
        canon_ids: ['A1', 'A3'],
      },
      {
        id: 'lead_engine.lead_generation',
        name: 'Lead Generation',
        source: 'src/lib/lead-storage.ts + src/lib/lead-attribution.ts + outbound_events(lead_*)',
        canon_ids: ['A2', 'F4'],
      },
      {
        id: 'lead_engine.qualification',
        name: 'Qualification',
        source: 'src/lib/qualification-engine.ts + src/lib/fast-track-engine.ts + lead_quality scoring',
        canon_ids: ['A2', 'F3'],
      },
    ],
    consumes: [],
    emits_to: ['ai_setter', 'communication_orchestration', 'sales_intelligence'],
  },
  {
    id: 'ai_setter',
    name: 'AI Setter',
    block: 'conversion',
    purpose:
      'Pre-qualify leads via automated dialogue across two modalities — chat and voice — before human Setter/Closer time is spent.',
    sub_engines: [
      {
        id: 'ai_setter.chat',
        name: 'Chat AI',
        source: 'supabase/functions/ai-setter/index.ts (Lovable AI Gateway)',
        canon_ids: ['C5'],
      },
      {
        id: 'ai_setter.voice',
        name: 'Voice AI',
        source:
          'src/lib/canonical-ai-setter.ts + supabase/functions/ai-setter-place-call (Twilio gateway)',
        canon_ids: ['C5', 'I5'],
      },
    ],
    consumes: ['lead_engine'],
    emits_to: ['communication_orchestration', 'sales_intelligence'],
  },
  {
    id: 'communication_orchestration',
    name: 'Communication Orchestration Layer',
    block: 'conversion',
    purpose:
      'Single outbound surface. Orchestrates timing, channel cascade, template selection and delivery for every triggered message — replaces and absorbs the former "Smart Attendance" scope.',
    sub_engines: [
      {
        id: 'comm.attendance_os',
        name: 'Attendance / Show-up Orchestration',
        source: 'src/lib/canonical-attendance.ts + attendance_jobs + touchpoint_admin_guardrails',
        canon_ids: ['C4'],
      },
      {
        id: 'comm.lead_activation',
        name: 'Lead Activation Touchpoints',
        source: 'src/lib/canonical-lead-activation.ts',
        canon_ids: ['C6'],
      },
      {
        id: 'comm.level_messaging',
        name: 'Level-Based Messaging',
        source: 'src/lib/canonical-level-messaging.ts',
        canon_ids: ['C7'],
      },
      {
        id: 'comm.message_library',
        name: 'Unified Message Library + Channel Cascade',
        source:
          'src/lib/canonical-message-library.ts + src/lib/canonical-channel.ts + message_library_overrides',
        canon_ids: ['F7', 'C1'],
      },
    ],
    consumes: ['lead_engine', 'ai_setter', 'sales_intelligence', 'teamforce'],
    emits_to: ['sales_intelligence'],
  },
  {
    id: 'sales_intelligence',
    name: 'Sales Intelligence Layer',
    block: 'intelligence',
    purpose:
      'Read-only analytical brain. Detects lead/operator state, matches communication style to personality, predicts outcomes, and surfaces optimization signals back to Lead Engine, AI Setter and Communication Orchestration.',
    sub_engines: [
      {
        id: 'intel.state_detection',
        name: 'State Detection',
        source:
          'src/lib/canonical-funnel-intelligence.ts (insight_findings) + operational-canon state machine',
        canon_ids: ['I6', 'F2'],
      },
      {
        id: 'intel.personality_matching',
        name: 'Personality Matching',
        source:
          'src/lib/canonical-voice-performance.ts (intent_analysis) + Lovable AI Gateway classifiers',
        canon_ids: ['I5', 'I4'],
      },
      {
        id: 'intel.prediction',
        name: 'Prediction (PSP / forecast)',
        source:
          'mem://architecture/predictive-success-model + revenue-forecasting-and-visibility-logic',
        canon_ids: ['I2', 'I6'],
      },
      {
        id: 'intel.optimization',
        name: 'Optimization (Bottleneck + A/B)',
        source:
          'mem://architecture/control-engine-bottleneck-system + canonical-message-performance.ts (A/B winners)',
        canon_ids: ['I3', 'I4'],
      },
    ],
    consumes: [
      'lead_engine',
      'ai_setter',
      'communication_orchestration',
      'teamforce',
    ],
    emits_to: ['communication_orchestration', 'teamforce', 'revenue_value'],
  },
  {
    id: 'teamforce',
    name: 'Teamforce Layer',
    block: 'value',
    purpose:
      'Human capacity layer. Defines team structure, assigns roles, tracks performance, and applies scaling rules so the same system serves an individual closer, a team, a company, or a scaling org.',
    sub_engines: [
      {
        id: 'teamforce.structure',
        name: 'Team Structure',
        source:
          'mem://governance/role-definitions-v11 + operator_funnel_assignments + product_config (multi-tenant)',
        canon_ids: ['F1', 'F5'],
      },
      {
        id: 'teamforce.role_assignment',
        name: 'Role Assignment',
        source:
          'mem://technical/lead-assignment-logic + smart-routing.ts + closer_capacity / setter_capacity',
        canon_ids: ['A2', 'F1'],
      },
      {
        id: 'teamforce.performance_tracking',
        name: 'Performance Tracking',
        source:
          'mem://architecture/operator-scoring-system + mem://features/etc-operator-performance-system',
        canon_ids: ['I2', 'G1'],
      },
      {
        id: 'teamforce.scaling',
        name: 'Scaling Logic',
        source:
          'mem://architecture/canonical-progression + mem://architecture/canonical-b2b (SPaaS) + canonical-capacity.ts',
        canon_ids: ['V2', 'G2'],
      },
    ],
    consumes: ['sales_intelligence', 'communication_orchestration'],
    emits_to: ['communication_orchestration', 'revenue_value'],
  },
  {
    id: 'revenue_value',
    name: 'Revenue & Value',
    block: 'value',
    purpose:
      'Outcome layer. Closes loop: revenue, compensation, progression, retention. Validates that everything upstream produced value.',
    sub_engines: [
      {
        id: 'revenue_value.closing',
        name: 'Closing Engine',
        source: 'mem://monetization/revenue-closing-engine-v24',
        canon_ids: ['V4'],
      },
      {
        id: 'revenue_value.compensation',
        name: 'Compensation',
        source: 'mem://architecture/canonical-compensation',
        canon_ids: ['V4'],
      },
      {
        id: 'revenue_value.retention',
        name: 'Retention / Reactivation',
        source: 'mem://architecture/canonical-reactivation',
        canon_ids: ['C1', 'I6'],
      },
    ],
    consumes: ['teamforce', 'sales_intelligence', 'communication_orchestration'],
    emits_to: ['sales_intelligence'],
  },
]);

/* ──────────────────────────────────────────────────────────────────── */
/* SCALING TARGETS — every layer must work for all four targets.       */
/* ──────────────────────────────────────────────────────────────────── */

export const SCALING_TARGETS: readonly ScalingTarget[] = Object.freeze([
  'individual_closer',
  'team',
  'company',
  'scaling_org',
]);

/* ──────────────────────────────────────────────────────────────────── */
/* HELPERS                                                              */
/* ──────────────────────────────────────────────────────────────────── */

export function getLayer(id: SystemLayerId): SystemLayer | undefined {
  return SYSTEM_LAYERS.find((l) => l.id === id);
}

export function getSubEngine(subEngineId: string): SubEngine | undefined {
  for (const layer of SYSTEM_LAYERS) {
    const found = layer.sub_engines.find((s) => s.id === subEngineId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Constitutional gate. Every new feature proposal MUST resolve a
 * (system_layer, sub_engine) pair. Returns null when valid, else a
 * human-readable reason.
 */
export function validateFeaturePlacement(
  systemLayer: SystemLayerId,
  subEngineId: string,
): string | null {
  const layer = getLayer(systemLayer);
  if (!layer) return `Unknown system layer "${systemLayer}".`;
  const sub = layer.sub_engines.find((s) => s.id === subEngineId);
  if (!sub) {
    return `Sub-engine "${subEngineId}" does not belong to layer "${systemLayer}". Allowed: ${layer.sub_engines
      .map((s) => s.id)
      .join(', ')}`;
  }
  return null;
}

/**
 * Connectivity audit. Returns the list of layers each layer touches,
 * useful for diagrams and to assert no layer is orphaned.
 */
export function auditConnectivity(): {
  ok: boolean;
  orphans: SystemLayerId[];
  edges: Array<{ from: SystemLayerId; to: SystemLayerId }>;
} {
  const edges: Array<{ from: SystemLayerId; to: SystemLayerId }> = [];
  for (const l of SYSTEM_LAYERS) {
    for (const t of l.emits_to) edges.push({ from: l.id, to: t });
  }
  const touched = new Set<SystemLayerId>();
  edges.forEach((e) => {
    touched.add(e.from);
    touched.add(e.to);
  });
  const orphans = SYSTEM_LAYERS.map((l) => l.id).filter(
    (id) => !touched.has(id),
  );
  return { ok: orphans.length === 0, orphans, edges };
}
