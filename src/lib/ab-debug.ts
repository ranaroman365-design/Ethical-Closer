/**
 * A/B Debug-Inspektor (read-only)
 *
 * Liest die in localStorage hinterlegten A/B-Buckets der drei aktiven Stores
 * (`social_proof_v1`, `playbook_microcopy_v1`, sticky-CTA-Tests …) **ohne**
 * Re-Roll und ohne Tracking-Event, damit das Debug-Overlay den echten,
 * aktuell wirksamen Zustand anzeigt — inklusive `assignedAt`, verbleibender
 * TTL und ob die Zuordnung beim letzten Mount neu gewürfelt wurde.
 *
 * Reassignment-Marker werden von den Stores per `markAbReassigned()` gesetzt
 * (siehe sticky-/apply-/playbook-ab-test.ts) und überleben die aktuelle
 * Tab-Session via sessionStorage.
 */
import { getAbStorage, getAbStorageBackend, type AbStorageBackend } from "@/lib/ab-storage";

// Inlined to avoid a circular import: apply-ab-test / playbook-ab-test import
// `markAbReassigned` from this file, so re-importing their KEY exports here
// puts them in the TDZ during module init and crashes the app.
const APPLY_AB_TEST_KEY = "social_proof_v1";
const PLAYBOOK_AB_TEST_KEY = "playbook_microcopy_v1";

const REASSIGN_FLAG_KEY = "ab_debug_reassign_v1";
const TTL_MS_DEFAULT = 30 * 24 * 60 * 60 * 1000;

export interface AbInspectResult {
  testKey: string;
  storageKey: string;
  variant: string | null;
  assignedAt: number | null;
  ageMs: number | null;
  remainingMs: number | null;
  ttlMs: number;
  expired: boolean;
  reassignedThisSession: boolean;
  fromVariant: string | null;
  rawValue: string | null;
  backend: AbStorageBackend;
}

/** Storage-Key-Konvention pro Test (synchron mit den jeweiligen Stores). */
const STORAGE_KEY_BY_TEST: Record<string, string> = {
  [APPLY_AB_TEST_KEY]: "apply_social_proof_ab_v1",
  [PLAYBOOK_AB_TEST_KEY]: `ab:${PLAYBOOK_AB_TEST_KEY}`,
};

function stickyStorageKey(testKey: string) {
  return `ab_${testKey}_v1`;
}

interface ReassignFlag {
  testKey: string;
  from: string;
  to: string;
  at: number;
}

/**
 * Markiere einen TTL-Reassign für die aktuelle Tab-Session, damit das Debug-
 * Overlay ihn nach dem Re-Render anzeigen kann. Wird von den Stores aufgerufen.
 */
export function markAbReassigned(flag: ReassignFlag): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(REASSIGN_FLAG_KEY);
    const list: ReassignFlag[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((f) => f.testKey !== flag.testKey);
    filtered.push(flag);
    window.sessionStorage.setItem(REASSIGN_FLAG_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore quota / privacy mode */
  }
}

function readReassignFlag(testKey: string): ReassignFlag | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(REASSIGN_FLAG_KEY);
    if (!raw) return null;
    const list: ReassignFlag[] = JSON.parse(raw);
    return list.find((f) => f.testKey === testKey) ?? null;
  } catch {
    return null;
  }
}

function pickVariant(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const v = o.variant ?? o.bucket;
  return typeof v === "string" ? v : null;
}

function pickAssignedAt(parsed: unknown): number | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  return typeof o.assignedAt === "number" ? o.assignedAt : null;
}

/**
 * Liest einen Bucket **ohne Re-Roll** direkt aus localStorage. Akzeptiert das
 * neue `{ variant|bucket, assignedAt }`-Schema und Plain-Legacy-Werte.
 */
export function inspectAbBucket(
  testKey: string,
  opts?: { storageKey?: string; ttlMs?: number },
): AbInspectResult {
  const storageKey =
    opts?.storageKey ?? STORAGE_KEY_BY_TEST[testKey] ?? stickyStorageKey(testKey);
  const ttlMs = opts?.ttlMs ?? TTL_MS_DEFAULT;
  const backend = getAbStorageBackend();
  const empty: AbInspectResult = {
    testKey,
    storageKey,
    variant: null,
    assignedAt: null,
    ageMs: null,
    remainingMs: null,
    ttlMs,
    expired: false,
    reassignedThisSession: false,
    fromVariant: null,
    rawValue: null,
    backend,
  };
  if (typeof window === "undefined") return empty;

  let raw: string | null = null;
  try {
    raw = getAbStorage().read(storageKey);
  } catch {
    return empty;
  }
  const flag = readReassignFlag(testKey);
  if (!raw) {
    return {
      ...empty,
      reassignedThisSession: Boolean(flag),
      fromVariant: flag?.from ?? null,
      variant: flag?.to ?? null,
    };
  }

  let variant: string | null = null;
  let assignedAt: number | null = null;
  try {
    const parsed = JSON.parse(raw);
    variant = pickVariant(parsed);
    assignedAt = pickAssignedAt(parsed);
  } catch {
    // Plain-Legacy-Wert (z. B. "A")
    variant = raw;
  }

  const now = Date.now();
  const ageMs = assignedAt != null ? now - assignedAt : null;
  const remainingMs = assignedAt != null ? Math.max(0, ttlMs - (now - assignedAt)) : null;
  const expired = ageMs != null ? ageMs >= ttlMs : false;

  return {
    testKey,
    storageKey,
    variant,
    assignedAt,
    ageMs,
    remainingMs,
    ttlMs,
    expired,
    reassignedThisSession: Boolean(flag),
    fromVariant: flag?.from ?? null,
    rawValue: raw,
    backend,
  };
}

/** Aktiv, wenn `?ab_debug=1` in der URL ODER `localStorage.ab_debug = "1"`. */
export function isAbDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ab_debug") === "1") {
      window.localStorage.setItem("ab_debug", "1");
      return true;
    }
    if (params.get("ab_debug") === "0") {
      window.localStorage.removeItem("ab_debug");
      return false;
    }
    return window.localStorage.getItem("ab_debug") === "1";
  } catch {
    return false;
  }
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
