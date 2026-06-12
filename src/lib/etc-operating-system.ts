/**
 * ════════════════════════════════════════════════════════════════════════
 * ETC OPERATING SYSTEM™ — Layer 47 (META-CANON, SUPREME)
 * ════════════════════════════════════════════════════════════════════════
 *
 * This is NOT a feature.
 * This is the system definition — the formal architecture all other canons
 * answer to.
 *
 * Truth hierarchy:
 *   Canon Constitution v1 (rules)
 *     └─ ETC Operating System™ (this file — system shape)
 *         └─ Active Canons (21 active, see canon-map.ts)
 *             └─ Enforced registries (events, thresholds, roles, ...)
 *                 └─ Features
 *                     └─ UI
 *
 * THE 4 LAYERS
 * ────────────
 *   1. REVENUE ENGINE      — converts traffic into revenue → outputs people
 *   2. TALENT ENGINE       — develops people into operators → outputs scalable revenue
 *   3. INTELLIGENCE LAYER  — observes both, decides, optimizes, learns
 *   4. VISUALIZATION LAYER — 3 dashboards expose the system to humans
 *
 * UNIFIED DATA POOL
 * ─────────────────
 * All four layers read/write ONE Supabase pool. No fragmentation,
 * no parallel sources of truth. Lovable is SoT, GHL is execution-only.
 *
 * Block: this file is meta over all 6 blocks (Foundation/Acquisition/
 * Conversion/Value/Intelligence/Governance). It does not introduce a
 * 7th block — it explains how the existing 6 form a coherent OS.
 *
 * Canon-Map: M1 (Meta).
 * ════════════════════════════════════════════════════════════════════════
 */

import { CANON_MAP, type CanonBlock, type CanonEntry } from "./canon-map";

// ─────────────────────────────────────────────────────────────────────────
// LAYER DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────

export type EtcLayerKey = "revenue" | "talent" | "intelligence" | "visualization";

export interface EtcLayer {
  key: EtcLayerKey;
  name: string;
  purpose: string;
  /** Linear flow (left → right) for diagrams and explanations. */
  flow: readonly string[];
  /** What this layer outputs into the rest of the system. */
  output: string;
  /** Which Constitution blocks this layer is composed of. */
  blocks: readonly CanonBlock[];
  /** Canon-Map IDs governing this layer (subset of CANON_MAP). */
  governing_canons: readonly string[];
}

export const ETC_LAYERS: Readonly<Record<EtcLayerKey, EtcLayer>> = Object.freeze({
  revenue: {
    key: "revenue",
    name: "Revenue Engine",
    purpose: "Convert leads into revenue.",
    flow: [
      "Traffic",
      "Landing",
      "Engagement",
      "Booking",
      "Setter",
      "Showing",
      "Closer",
      "Revenue",
    ],
    output: "New team members (closed_won → L1 entry).",
    blocks: ["acquisition", "conversion"],
    // A1 Lead Lifecycle, A2 Routing, A3 Booking, C1-C11 conversion stack
    governing_canons: [
      "A1", "A2", "A3",
      "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11",
    ],
  },

  talent: {
    key: "talent",
    name: "Talent Engine",
    purpose: "Develop people into high-performing operators.",
    flow: [
      "Applicant",
      "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8",
      "Partner",
    ],
    output: "Performance + retention + scalable revenue.",
    blocks: ["value", "foundation"],
    // V1-V4 onboarding/progression/mentoring/compensation, F1 roles
    governing_canons: ["V1", "V2", "V3", "V4", "F1"],
  },

  intelligence: {
    key: "intelligence",
    name: "Intelligence Layer (Brain)",
    purpose: "Observe both engines, decide, optimize, learn.",
    flow: [
      "Data Collection",
      "AI Models",
      "Decision Logic",
      "Communication Orchestration",
      "Learning Loop",
    ],
    output:
      "Better next-actions for leads and operators · auto-fixes · A/B winners.",
    blocks: ["intelligence", "foundation"],
    // I1-I10 intelligence stack + F8 communication canon (orchestration)
    governing_canons: [
      "I1", "I2", "I3", "I4", "I5", "I6", "I7", "I8", "I9", "I10",
      "F7", "F8",
    ],
  },

  visualization: {
    key: "visualization",
    name: "Visualization Layer (Face)",
    purpose: "Make the system understandable and controllable.",
    flow: [
      "Revenue Flow Map",
      "Talent Flow Map",
      "Intelligence Control",
    ],
    output: "Three dashboards · one per engine + one for the brain.",
    blocks: ["governance"],
    governing_canons: ["G1", "G3", "G4", "G5"],
  },
});

// ─────────────────────────────────────────────────────────────────────────
// THE 3 DASHBOARDS (FINAL)
// ─────────────────────────────────────────────────────────────────────────

export type DashboardKey = "revenue_flow_map" | "talent_flow_map" | "intelligence_control";

export interface DashboardSpec {
  key: DashboardKey;
  name: string;
  serves: EtcLayerKey;          // which engine/layer it visualizes
  route: string;                // canonical UI route (admin)
  primary_kpis: readonly string[];
  /** Source canons it composes (read-only). */
  sources: readonly string[];
}

export const DASHBOARDS: Readonly<Record<DashboardKey, DashboardSpec>> = Object.freeze({
  revenue_flow_map: {
    key: "revenue_flow_map",
    name: "Revenue Flow Map™",
    serves: "revenue",
    route: "/members/admin/conversion-intelligence",
    primary_kpis: [
      "ROAS",
      "Revenue per Lead",
      "Conversion Chain (8 stages)",
      "Bottlenecks",
    ],
    sources: ["I6", "I3", "I7", "G4"],
  },
  talent_flow_map: {
    key: "talent_flow_map",
    name: "Talent Flow Map™",
    serves: "talent",
    route: "/members/admin/performance",
    primary_kpis: [
      "Members per Level",
      "Revenue per Member",
      "Promotion Rate",
      "Retention",
      "Performance Split",
    ],
    sources: ["V1", "V2", "V3", "V4", "I1", "I2"],
  },
  intelligence_control: {
    key: "intelligence_control",
    name: "Intelligence Control™",
    serves: "intelligence",
    route: "/members/admin/intelligence-control",
    primary_kpis: [
      "Touchpoints (active / queued)",
      "Communication (sent / failed / cooldown)",
      "AI Actions (proposed / approved / executed)",
      "Optimization History",
      "Experiments (A/B status)",
    ],
    sources: ["G4", "I7", "I8", "I9", "I10", "F8"],
  },
});

// ─────────────────────────────────────────────────────────────────────────
// CONNECTION LOGIC (immutable invariants)
// ─────────────────────────────────────────────────────────────────────────

export const CONNECTIONS = Object.freeze([
  {
    from: "revenue",
    to: "talent",
    via: "closed_won → onboarding (L0→L1)",
    canon_path: ["C2/C3 closing", "V1 onboarding"],
  },
  {
    from: "talent",
    to: "revenue",
    via: "trained operators staff Setter/Closer roles → improve conversion",
    canon_path: ["V2 progression", "C2 operator workflow"],
  },
  {
    from: "intelligence",
    to: "revenue",
    via: "Auto-Fix + Self-Optimization + Sales Brain → next best action per lead",
    canon_path: ["I3", "I7", "I8", "I9"],
  },
  {
    from: "intelligence",
    to: "talent",
    via: "OSS + PSP + Learning Loop → mentoring · promotion · training updates",
    canon_path: ["I2", "I10"],
  },
  {
    from: "visualization",
    to: "revenue",
    via: "Revenue Flow Map exposes bottlenecks → operator decisions",
    canon_path: ["G4 dashboard never sends · admin actions only"],
  },
  {
    from: "visualization",
    to: "talent",
    via: "Talent Flow Map exposes level health → director decisions",
    canon_path: ["G1 access matrix"],
  },
] as const);

// ─────────────────────────────────────────────────────────────────────────
// UNIFIED DATA POOL — invariant
// ─────────────────────────────────────────────────────────────────────────

export const UNIFIED_DATA_POOL = Object.freeze({
  source_of_truth: "Supabase (single project)",
  execution_only: ["GHL (SMS/email gateway)", "Twilio (WA/voice)", "Stripe (payments)"],
  hard_rules: [
    "No layer maintains its own private store.",
    "All KPIs derive from canonical events (canonical-events.ts).",
    "Dashboards NEVER send — they read aggregates and trigger Intelligence proposals.",
    "Lovable is SoT — GHL/Twilio/Stripe never override state.",
    "One Object → One Lifecycle (lead, appointment, call, payment, member).",
  ],
} as const);

// ─────────────────────────────────────────────────────────────────────────
// LEARNING LOOP — universal pattern (applies to BOTH engines)
// ─────────────────────────────────────────────────────────────────────────

export const LEARNING_LOOP_STEPS = Object.freeze([
  "data",     // outbound_events, calls, payments, level_history
  "insight",  // I3 bottleneck · I6 funnel · I9 sales brain · I10 training
  "action",   // I7/I8 self-opt proposal · NBA · auto-fix
  "result",   // measurement_window observed vs baseline
  "learning", // accept/reject + audit trail (G5)
] as const);

// ─────────────────────────────────────────────────────────────────────────
// USER ROLE COMPRESSION (final)
// ─────────────────────────────────────────────────────────────────────────

export const ROLE_COMPRESSION = Object.freeze({
  L1_L3: { sees: ["own commissions", "own leads"],      excludes: ["global revenue"] },
  L4_L5: { sees: ["own funnel", "team revenue"],        excludes: ["other directors' teams"] },
  L6:    { sees: ["all leads in assigned funnels"],     dashboards: ["intelligence_control"] },
  L7:    { sees: ["all leads + all team performance"],  dashboards: ["revenue_flow_map", "talent_flow_map", "intelligence_control"] },
  L8:    { sees: ["all + B2B + ecosystem"],              dashboards: ["all + B2B aggregates"] },
});

// ─────────────────────────────────────────────────────────────────────────
// AUDIT — verifies the OS is internally consistent
// ─────────────────────────────────────────────────────────────────────────

export interface OsAuditFinding {
  severity: "info" | "warning" | "critical";
  layer?: EtcLayerKey;
  message: string;
}

/**
 * Validates that every canon referenced by a layer actually exists in
 * CANON_MAP, and that every active canon is claimed by at least one layer.
 * Run in dev-time tests / admin diagnostics — never user-facing.
 */
export function auditOperatingSystem(): OsAuditFinding[] {
  const findings: OsAuditFinding[] = [];
  const canonIds = new Set<string>(CANON_MAP.map((c: CanonEntry) => c.id));

  const claimed = new Set<string>();

  for (const layer of Object.values(ETC_LAYERS)) {
    for (const cid of layer.governing_canons) {
      if (!canonIds.has(cid)) {
        findings.push({
          severity: "critical",
          layer: layer.key,
          message: `Layer "${layer.name}" references missing canon ${cid}.`,
        });
      } else {
        claimed.add(cid);
      }
    }
  }

  // Report any active canon not claimed by any layer (potential orphan).
  for (const c of CANON_MAP) {
    if (c.status === "active" && !claimed.has(c.id)) {
      findings.push({
        severity: "warning",
        message: `Active canon ${c.id} (${c.name}) not claimed by any ETC layer.`,
      });
    }
  }

  // Sanity: 3 dashboards, one per non-meta engine + one for brain.
  if (Object.keys(DASHBOARDS).length !== 3) {
    findings.push({
      severity: "critical",
      message: `Expected exactly 3 dashboards, found ${Object.keys(DASHBOARDS).length}.`,
    });
  }

  if (!findings.length) {
    findings.push({ severity: "info", message: "ETC OS coherent. All layers ↔ canons mapped." });
  }
  return findings;
}

// ─────────────────────────────────────────────────────────────────────────
// FINAL GOAL (asserted at compile time via type)
// ─────────────────────────────────────────────────────────────────────────

export const FINAL_GOAL = Object.freeze({
  must: [
    "generate revenue",
    "develop people",
    "improve itself",
    "make everything visible",
  ],
  positioning: "Operating System for Revenue + Talent + Learning — not a funnel, not a CRM, not a coaching product.",
} as const);
