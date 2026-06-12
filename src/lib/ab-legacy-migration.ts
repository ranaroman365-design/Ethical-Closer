/**
 * Einmalige Legacy-Migration für A/B-Bucket-Storage
 *
 * Ältere Versionen der A/B-Tests haben den Bucket als Plain-String
 * (`"A"` / `"B"` / `"H"`) in localStorage abgelegt. Die aktuellen Stores
 * erwarten ein Objekt `{ bucket|variant, assignedAt }` mit TTL.
 *
 * Diese Helfer migrieren beim ersten Lesen verlustfrei:
 *  - Plain-Wert erkannt  → in neues Schema überführen, `assignedAt = now`,
 *                          identischer Bucket bleibt erhalten (sticky!).
 *  - Bereits neues Schema → unverändert zurückgeben.
 *  - Defekt / unbekannt   → `null` (Aufrufer würfelt neu).
 *
 * Tracking: Beim erfolgreichen Umschreiben feuert ein einmaliges
 * `ab_legacy_migrated`-Event je Storage-Key, damit wir die Migration
 * im Funnel beobachten können.
 */
import { trackFunnelEvent } from "@/lib/track-event";
import { getAbStorage } from "@/lib/ab-storage";

type Json = object;

const MIGRATION_FLAG_PREFIX = "ab_legacy_migrated__";

/** Liest den Storage-Key & migriert Plain-Werte einmalig in das neue Schema. */
export function migrateLegacyAbValue<T extends Json>(opts: {
  storageKey: string;
  /** Erlaubte Plain-Buckets (z. B. ["A","B"] oder ["A","B","H"]). */
  allowedPlain: readonly string[];
  /** Baut aus einem Plain-Bucket das neue Storage-Objekt. */
  toSchema: (plain: string, now: number) => T;
  /** Ist der bereits geparste Wert im neuen Schema gültig? */
  isValidSchema: (parsed: unknown) => parsed is T;
  /** Test-Key für Analytics (z. B. "social_proof_v1"). */
  testKey: string;
}): T | null {
  if (typeof window === "undefined") return null;

  const storage = getAbStorage();
  let raw: string | null = null;
  try {
    raw = storage.read(opts.storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  // Fall 1: Plain-Legacy-Wert → migrieren.
  if (opts.allowedPlain.includes(raw)) {
    const now = Date.now();
    const next = opts.toSchema(raw, now);
    try {
      storage.write(opts.storageKey, JSON.stringify(next));
      fireMigratedOnce(opts.storageKey, opts.testKey, raw);
    } catch {
      /* Storage voll/blockiert — wir geben den migrierten Wert dennoch zurück. */
    }
    return next;
  }

  // Fall 2: bereits neues Schema (oder Fremdformat).
  try {
    const parsed = JSON.parse(raw);
    if (opts.isValidSchema(parsed)) return parsed;
  } catch {
    /* fällt auf null durch → Aufrufer würfelt neu */
  }
  return null;
}

function fireMigratedOnce(storageKey: string, testKey: string, fromBucket: string) {
  const flagKey = MIGRATION_FLAG_PREFIX + storageKey;
  try {
    if (window.localStorage.getItem(flagKey) === "1") return;
    window.localStorage.setItem(flagKey, "1");
  } catch {
    /* ohne Flag → wir feuern trotzdem nur 1x pro Pageload via Set unten */
  }
  if (firedThisSession.has(storageKey)) return;
  firedThisSession.add(storageKey);

  trackFunnelEvent("ab_legacy_migrated", {
    funnel: "apply",
    ab_test: testKey,
    storage_key: storageKey,
    from_bucket: fromBucket,
    migrated_at: Date.now(),
  });
}

const firedThisSession = new Set<string>();
