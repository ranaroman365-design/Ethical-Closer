/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC CANONICAL ROLE NAMING SYSTEM (Hardwired)
 * Layer 11 — Naming Governance
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for L0–L8 role labels.
 *
 * HARD RULES:
 *   ❌ Never rename levels (L0–L8 are fixed anchors)
 *   ❌ Never use free-text role names anywhere in the codebase
 *   ❌ Never mix internal and external labels in the same context
 *   ✅ Always import `roleLabel(level, context)` from this file
 *
 * CONTEXTS:
 *   internal → admin/system/DB views                e.g. "L6 Operator"
 *   external → user-facing UI, marketing, comms     e.g. "Senior Closer"
 *   hybrid   → onboarding, dashboards, mixed views  e.g. "Senior Closer (L6)"
 *
 * CRITICAL: L6 must ALWAYS be "Senior Closer" externally.
 *           "Operator" is internal-only (system/admin language).
 *
 * Spec: docs/canonical-role-naming.md
 * Memory: mem://architecture/canonical-role-naming-system
 * ═══════════════════════════════════════════════════════════════════════
 */

export type LevelNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type RoleContext = 'internal' | 'external' | 'hybrid';

export interface CanonicalRole {
  level: LevelNumber;
  /** System anchor — never localized, never changed. */
  anchor: `L${LevelNumber}`;
  /** Internal/system label (admin, DB, logic). */
  internal: string;
  /** External/market-facing label (UI, comms, marketing). */
  external: string;
  /** German external label (i18n parity). */
  externalDe: string;
}

/**
 * Canonical mapping. Order matters (index = level).
 * DO NOT modify without updating docs/canonical-role-naming.md
 * and the architecture memory rule.
 */
export const CANONICAL_ROLES: readonly CanonicalRole[] = Object.freeze([
  { level: 0, anchor: 'L0', internal: 'Applicant',       external: 'Applicant',         externalDe: 'Bewerber' },
  { level: 1, anchor: 'L1', internal: 'Trainee',         external: 'Trainee / Opener',  externalDe: 'Trainee / Opener' },
  { level: 2, anchor: 'L2', internal: 'Setter',          external: 'Associate Setter',  externalDe: 'Associate Setter' },
  { level: 3, anchor: 'L3', internal: 'Advanced Setter', external: 'Senior Setter',     externalDe: 'Senior Setter' },
  { level: 4, anchor: 'L4', internal: 'Junior Closer',   external: 'Junior Closer',     externalDe: 'Junior Closer' },
  { level: 5, anchor: 'L5', internal: 'Closer',          external: 'Managing Closer',   externalDe: 'Managing Closer' },
  // ⚠️ L6: "Operator" is INTERNAL ONLY. External must be "Senior Closer".
  { level: 6, anchor: 'L6', internal: 'Operator',        external: 'Senior Closer',     externalDe: 'Senior Closer' },
  { level: 7, anchor: 'L7', internal: 'Director',        external: 'Director',          externalDe: 'Director' },
  { level: 8, anchor: 'L8', internal: 'Partner',         external: 'Partner',           externalDe: 'Partner' },
]);

const ROLE_BY_LEVEL = new Map<number, CanonicalRole>(
  CANONICAL_ROLES.map(r => [r.level, r]),
);

/** Safe lookup. Defaults to L0 (Applicant) for unknown/invalid input. */
export function getCanonicalRole(level: number | null | undefined): CanonicalRole {
  if (level == null || !Number.isFinite(level)) return CANONICAL_ROLES[0];
  return ROLE_BY_LEVEL.get(Math.max(0, Math.min(8, Math.trunc(level)))) ?? CANONICAL_ROLES[0];
}

/**
 * Canonical label resolver — the ONLY function the rest of the codebase
 * should use to render a role name.
 *
 * @example
 *   roleLabel(6, 'external')        → "Senior Closer"
 *   roleLabel(6, 'internal')        → "L6 Operator"
 *   roleLabel(6, 'hybrid')          → "Senior Closer (L6)"
 *   roleLabel(6, 'external', 'de')  → "Senior Closer"
 */
export function roleLabel(
  level: number | null | undefined,
  context: RoleContext = 'external',
  lang: 'en' | 'de' = 'en',
): string {
  const r = getCanonicalRole(level);
  const ext = lang === 'de' ? r.externalDe : r.external;
  switch (context) {
    case 'internal': return `${r.anchor} ${r.internal}`;
    case 'hybrid':   return `${ext} (${r.anchor})`;
    case 'external':
    default:         return ext;
  }
}

/** Admin-only convenience: "L6 — Operator (Senior Closer)" */
export function roleLabelAdmin(level: number | null | undefined): string {
  const r = getCanonicalRole(level);
  return `${r.anchor} — ${r.internal} (${r.external})`;
}

/** Guard: throws in dev if a forbidden internal name leaks into external context. */
const FORBIDDEN_EXTERNAL = new Set(['Operator']);
export function assertExternalSafe(label: string): void {
  if (import.meta.env?.DEV && FORBIDDEN_EXTERNAL.has(label.trim())) {
    // eslint-disable-next-line no-console
    console.error(
      `[CanonicalRoleNaming] Forbidden internal label "${label}" used in external context. ` +
      `Use roleLabel(level, 'external') instead.`,
    );
  }
}
