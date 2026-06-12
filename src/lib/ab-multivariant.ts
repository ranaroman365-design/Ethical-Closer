/**
 * Multivariant A/B-Layer mit Auto-Winner-Logik
 * ──────────────────────────────────────────────────────────────────────────
 * Additive Erweiterung zu `ab-active-test.ts` — bestehende API bleibt
 * unverändert. Dieser Layer erlaubt beliebig viele Varianten pro Slot und
 * benutzt server-seitig gerollte Gewichte (`ab_slot_weights`-Tabelle), um
 * Verlierer automatisch herunterzugewichten und Gewinner zu fördern.
 *
 * Regeln:
 *  - Bucket pro Slot bleibt sticky (LocalStorage `ab_slot_<name>_v1`).
 *  - Bucket-Auswahl bei Neuzuweisung: deterministisch per (session_id, slot),
 *    aber gewichtet anhand der zuletzt gepollten Server-Gewichte.
 *  - Server-Gewichte fließen NUR bei Neuzuweisungen ein — bestehende sticky
 *    Buckets werden nicht rotiert (kein Flicker, valide Conversion-Messung).
 *  - SSR-safe.
 */
import { getBrowserSessionId } from "@/lib/ab-session";

export interface AbSlotVariant {
  id: string;
  /** Statisches Basis-Gewicht; Server-Override hat Vorrang sobald geladen. */
  baseWeight?: number;
}

export interface AbSlotDef {
  /** Slot-Identifier (z. B. `mos_hero_headline`). */
  slot: string;
  variants: readonly AbSlotVariant[];
}

interface StoredBucket {
  slot: string;
  variant: string;
  assigned_at: number;
}

const storageKey = (slot: string) => `ab_slot_${slot}_v1`;
const WEIGHT_CACHE_KEY = "ab_slot_weights_cache_v1";

interface WeightCache {
  fetched_at: number;
  weights: Record<string, Record<string, number>>; // slot → variant → weight
}

/** Schreibt Server-Gewichte in den Cache, von `useAbWeights` aufgerufen. */
export function cacheSlotWeights(
  rows: Array<{ slot: string; variant: string; weight: number | null }>,
): void {
  if (typeof window === "undefined") return;
  const next: WeightCache = { fetched_at: Date.now(), weights: {} };
  for (const r of rows) {
    if (!r.slot || !r.variant) continue;
    const w = typeof r.weight === "number" ? r.weight : 1;
    next.weights[r.slot] = next.weights[r.slot] ?? {};
    next.weights[r.slot][r.variant] = Math.max(0, Math.min(1, w));
  }
  try {
    window.localStorage.setItem(WEIGHT_CACHE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function readSlotWeights(slot: string): Record<string, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WEIGHT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeightCache;
    return parsed.weights?.[slot] ?? null;
  } catch {
    return null;
  }
}

/** Deterministischer Float ∈ [0,1) aus einer Eingabe. */
function hashToUnit(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  // Map auf [0,1)
  return (Math.abs(h) % 100000) / 100000;
}

function pickWeighted(
  variants: readonly AbSlotVariant[],
  serverWeights: Record<string, number> | null,
  unit: number,
): string {
  // Effektive Gewichte (Server > base > 1). weight === 0 = pausierte
  // Variante; ausschließen, sofern mindestens eine andere Variante > 0 hat.
  const rawWeights = variants.map((v) => {
    const w = serverWeights?.[v.id];
    if (typeof w === "number") return Math.max(0, w);
    return Math.max(0.0001, v.baseWeight ?? 1);
  });
  const anyAlive = rawWeights.some((w) => w > 0);
  const weights = rawWeights.map((w) => (anyAlive && w === 0 ? 0 : Math.max(0.0001, w)));
  const total = weights.reduce((a, b) => a + b, 0);
  const target = unit * total;
  let acc = 0;
  for (let i = 0; i < variants.length; i++) {
    acc += weights[i];
    if (target <= acc && weights[i] > 0) return variants[i].id;
  }
  // Fallback: first non-zero
  const firstAlive = variants.find((_, i) => weights[i] > 0);
  return firstAlive?.id ?? variants[variants.length - 1].id;
}

export interface AbSlotAssignment {
  slot: string;
  variant: string;
}

/**
 * Liest `?force_slot=slot:variant[,slot2:variant2]` aus window.location.search.
 * Liefert die erzwungene Variante für `slot` zurück, falls vorhanden und gültig.
 * Wird NICHT in LocalStorage persistiert — reine Debug-/QA-Preview, beeinflusst
 * keine echte Bucket-Verteilung oder Conversion-Messung.
 */
function readForcedSlotVariant(slot: string, variants: readonly AbSlotVariant[]): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = new URLSearchParams(window.location.search).getAll("force_slot");
    if (raw.length === 0) return null;
    const entries = raw.flatMap((s) => s.split(","));
    for (const entry of entries) {
      const [s, v] = entry.split(":").map((x) => x?.trim());
      if (s === slot && v && variants.some((vv) => vv.id === v)) {
        return v;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Liefert die Zuweisung für einen Slot. Sticky pro (slot, browser session).
 * Gibt den ersten Variant-ID als sicheren Fallback in SSR/Privacy-Mode.
 *
 * Debug-Override: `?force_slot=slot:variant` (kommasepariert für mehrere)
 * erzwingt die Variante für QA, ohne LocalStorage zu verändern.
 */
export function getAbSlot(def: AbSlotDef): AbSlotAssignment {
  const fallback: AbSlotAssignment = {
    slot: def.slot,
    variant: def.variants[0]?.id ?? "control",
  };
  if (typeof window === "undefined") return fallback;
  if (def.variants.length === 0) return fallback;

  // Debug-Override (höchste Priorität, nicht persistent)
  const forced = readForcedSlotVariant(def.slot, def.variants);
  if (forced) return { slot: def.slot, variant: forced };

  const key = storageKey(def.slot);

  // Cached?
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const stored = JSON.parse(raw) as StoredBucket;
      const known = def.variants.some((v) => v.id === stored.variant);
      if (stored.slot === def.slot && known) {
        return { slot: def.slot, variant: stored.variant };
      }
    }
  } catch {
    /* re-assign */
  }

  // Neue Zuweisung: deterministisch + gewichtet
  const sessionId = getBrowserSessionId();
  const unit = hashToUnit(`${def.slot}:${sessionId}`);
  const variant = pickWeighted(def.variants, readSlotWeights(def.slot), unit);

  const next: StoredBucket = { slot: def.slot, variant, assigned_at: Date.now() };
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return { slot: def.slot, variant };
}


/**
 * Liefert alle aktuell gesetzten Slot-Zuordnungen als kompakter String, um
 * sie als zusätzliche Property an Funnel-Events zu hängen. Beispiel-Output:
 *   "mos_hero_headline:still_moment,mos_primary_cta:peek"
 */
export function getActiveSlotSummary(): string {
  if (typeof window === "undefined") return "";
  const parts: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("ab_slot_") || !k.endsWith("_v1")) continue;
      try {
        const raw = window.localStorage.getItem(k);
        if (!raw) continue;
        const stored = JSON.parse(raw) as StoredBucket;
        if (stored?.slot && stored?.variant) {
          parts.push(`${stored.slot}:${stored.variant}`);
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    return "";
  }
  return parts.join(",");
}
