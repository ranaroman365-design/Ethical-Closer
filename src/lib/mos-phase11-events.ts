/**
 * Phase 11 MOS event helpers — additive, MOS-gated, session-deduped.
 *
 * Mirrors the contract of `fireMosCroEvent` (master_funnel_id,
 * attribution_source, ab_slots auto-attached). Separate file to avoid
 * touching the existing event-type union.
 */
import { trackFunnelEvent } from "@/lib/track-event";
import { getAttributionSource } from "@/lib/attribution-source";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";
import { ensureMasterFunnelId } from "@/lib/master-funnel-id";

export type MosPhase11Event =
  | "MASTER_LP_ACTION_MODE_VIEW"
  | "MASTER_LP_VISUAL_FOCUS_VIEW"
  | "MASTER_LP_ZERO_TEXT_VIEW"
  | "MASTER_LP_INSTANT_START_VIEW"
  | "MASTER_LP_MESSAGE_MATCH_VIEW"
  | "MASTER_Q1_MOMENTUM_VIEW"
  | "MASTER_WHATSAPP_SENT"
  | "MASTER_ICS_CREATED"
  | "MASTER_ICS_DOWNLOADED"
  // Internal-only booking alert events (lead is never a recipient).
  | "MASTER_INTERNAL_WA_SENT"
  | "MASTER_INTERNAL_SMS_SENT"
  | "MASTER_INTERNAL_ICS_CREATED"
  | "MASTER_INTERNAL_NOTIFICATION_FAILED";

const FIRED_KEY = "mos_phase11_events_fired_v1";

function isMosSession(): boolean {
  if (typeof window === "undefined") return false;
  const src = getAttributionSource();
  return !!src && src.startsWith("masterofsales");
}

function readFired(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(FIRED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function writeFired(s: Set<string>) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(FIRED_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

export function fireMosPhase11Event(
  name: MosPhase11Event,
  variantKey: string,
  extra?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!isMosSession()) return;
  const key = `${name}:${variantKey}`;
  const fired = readFired();
  if (fired.has(key)) return;
  fired.add(key); writeFired(fired);
  try {
    let mfid: string | null = null;
    try { mfid = ensureMasterFunnelId(); } catch { /* ignore */ }
    trackFunnelEvent(name, {
      funnel: "masterofsales",
      attribution_source: getAttributionSource(),
      master_funnel_id: mfid,
      ab_slots: getActiveSlotSummary(),
      variant: variantKey,
      ...extra,
    });
  } catch { /* never throw */ }
}
