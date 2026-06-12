/**
 * Browser-Session-ID & dediziertes TTL-Reassignment-Event
 *
 * - `getBrowserSessionId()` liefert eine stabile, opake ID für die aktuelle
 *   Tab-Session (sessionStorage). Wechselt mit jedem neuen Tab/Window, damit
 *   Reassignments pro Browsersitzung sauber zählbar sind, ohne langfristiges
 *   Tracking-ID-Risiko.
 * - `trackAbReassigned()` feuert genau ein `ab_reassigned`-Event pro echtem
 *   TTL-Reroll mit Test-Key, alter & neuer Variante, Alter des abgelaufenen
 *   Buckets und der Browser-Session-ID. Wird zusätzlich zum bestehenden
 *   `<test>_assigned`-Event aufgerufen, damit Auswertungen die Neuwahl ohne
 *   Payload-Filter (`reassigned: true`) direkt am Eventnamen erkennen.
 */
import { trackFunnelEvent } from "@/lib/track-event";

const SESSION_KEY = "ab_browser_session_v1";

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fallthrough */
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Stabile, opake ID für die aktuelle Browser-Tab-Session. SSR-safe. */
export function getBrowserSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = newId();
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // Privacy mode / Storage blockiert → ephemere ID, ohne Persistenz.
    return newId();
  }
}

export interface AbReassignedPayload {
  testKey: string;
  fromVariant: string;
  toVariant: string;
  /** Wie alt war der abgelaufene Bucket beim Reroll, in Tagen (gerundet auf 0.1). */
  expiredAfterDays: number;
  ttlDays: number;
  /** Optionale Zusatz-Metadaten für Tests mit Holdout (`H`) etc. */
  meta?: Record<string, unknown>;
}

/**
 * Feuert `ab_reassigned` (canonical event) wenn ein TTL-Bucket neu gewürfelt
 * wurde. Nicht aufrufen für Erst-Zuweisungen — dafür existiert weiterhin das
 * `<testKey>_assigned`-Event mit `reassigned: false`.
 */
export function trackAbReassigned({
  testKey,
  fromVariant,
  toVariant,
  expiredAfterDays,
  ttlDays,
  meta,
}: AbReassignedPayload): void {
  trackFunnelEvent("ab_reassigned", {
    funnel: "apply",
    ab_test: testKey,
    test_key: testKey,
    from_variant: fromVariant,
    to_variant: toVariant,
    variant_changed: fromVariant !== toVariant,
    expired_after_days: Math.round(expiredAfterDays * 10) / 10,
    ttl_days: ttlDays,
    browser_session_id: getBrowserSessionId(),
    ...(meta ?? {}),
  });
}
