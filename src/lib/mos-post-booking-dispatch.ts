/**
 * Phase 11 — Post-booking INTERNAL alert dispatch.
 *
 * STRICTLY ADDITIVE. Called fire-and-forget AFTER a successful
 * `create-appointment` invocation on `/booking` and `/book`.
 *
 * IMPORTANT: This logic must NEVER send WhatsApp/SMS/ICS to the lead.
 * Only internal recipients (setter, senior_closer, admin) configured in
 * `mos_internal_notification_recipients` receive the alert.
 *
 * Behavior:
 *   - MOS-gated: only fires when attribution_source starts with `masterofsales`.
 *   - Idempotent per appointment_id (sessionStorage guard, plus DB-side
 *     per-role dedup inside the edge function).
 *   - Invokes the `mos-internal-booking-alert` edge function which fans out
 *     to internal recipients via the existing dispatch-communication channel.
 *   - ICS link uses the existing public `appointment-ics` edge function,
 *     keyed by appointment id (unguessable UUID).
 *
 * Hard guarantees:
 *   - Never throws.
 *   - Never blocks booking confirmation UX.
 *   - Does NOT modify CRM, GHL, attribution, pixel, CAPI, or booking row.
 *   - `args.phone` (lead phone) is forwarded only as DISPLAY data inside
 *     the internal message body — never as a recipient address.
 */
import { supabase } from "@/integrations/supabase/client";
import { getAttributionSource } from "@/lib/attribution-source";
import { fireMosPhase11Event } from "@/lib/mos-phase11-events";

const DISPATCH_DEDUP_KEY = "mos_post_booking_dispatch_v1";
const SUPABASE_FN_BASE = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1`;

interface DispatchArgs {
  appointment_id: string;
  lead_id?: string | null;
  email?: string | null;
  /** Lead phone — DISPLAY ONLY inside the internal message, never a recipient. */
  phone?: string | null;
  name?: string | null;
  starts_at?: string | null;
  /** Optional enrichment for internal alert body. */
  development_score?: number | string | null;
  placement_intent_score?: number | string | null;
  qualification_cluster?: string | null;
  quiz_summary?: string | null;
  booking_url?: string | null;
}

function isMosSession(): boolean {
  if (typeof window === "undefined") return false;
  const src = getAttributionSource();
  return !!src && src.startsWith("masterofsales");
}

function alreadyDispatched(appointmentId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = sessionStorage.getItem(DISPATCH_DEDUP_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    if (set.has(appointmentId)) return true;
    set.add(appointmentId);
    sessionStorage.setItem(DISPATCH_DEDUP_KEY, JSON.stringify([...set]));
    return false;
  } catch { return false; }
}

export function buildIcsUrl(appointmentId: string): string {
  return `${SUPABASE_FN_BASE}/appointment-ics?id=${encodeURIComponent(appointmentId)}`;
}

function splitName(full?: string | null): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

function last4(phone?: string | null): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").slice(-4);
}

/**
 * Fire-and-forget post-booking internal dispatch. Safe to call from any
 * booking-success handler. No-op for non-MOS sessions and duplicates.
 * NEVER sends anything to the lead.
 */
export function dispatchMosPostBooking(args: DispatchArgs): void {
  if (!args?.appointment_id) return;
  if (!isMosSession()) return;
  if (alreadyDispatched(args.appointment_id)) return;

  const icsUrl = buildIcsUrl(args.appointment_id);
  const { first, last } = splitName(args.name);

  // Tracking — ICS is deterministic, can fire immediately.
  fireMosPhase11Event("MASTER_INTERNAL_ICS_CREATED", args.appointment_id, {
    appointment_id: args.appointment_id,
    ics_url: icsUrl,
  });

  void supabase.functions
    .invoke("mos-internal-booking-alert", {
      body: {
        appointment_id: args.appointment_id,
        lead_id: args.lead_id ?? null,
        first_name: first,
        last_name: last,
        // DISPLAY ONLY — never a recipient. The edge function injects these
        // strings into the internal message body for setter/senior-closer/admin.
        lead_phone: args.phone ?? null,
        lead_email: args.email ?? null,
        starts_at: args.starts_at ?? null,
        attribution_source: getAttributionSource(),
        development_score: args.development_score ?? null,
        placement_intent_score: args.placement_intent_score ?? null,
        qualification_cluster: args.qualification_cluster ?? null,
        quiz_summary: args.quiz_summary ?? null,
        booking_url: args.booking_url ?? null,
      },
    })
    .then(({ data, error }) => {
      if (error) {
        console.warn("[mos-post-booking] internal dispatch failed (non-blocking)", error);
        fireMosPhase11Event("MASTER_INTERNAL_NOTIFICATION_FAILED", args.appointment_id, {
          appointment_id: args.appointment_id,
          error: error.message,
        });
        return;
      }
      const results = (data as { results?: Array<Record<string, unknown>> } | null)?.results ?? [];
      for (const r of results) {
        const role = String(r.role ?? "");
        const channel = String(r.channel ?? "");
        const status = String(r.status ?? "");
        const phoneLast4 = String(r.recipient_phone_last4 ?? "");
        if (status === "sent" && channel === "whatsapp") {
          fireMosPhase11Event("MASTER_INTERNAL_WA_SENT", `${args.appointment_id}:${role}`, {
            appointment_id: args.appointment_id, recipient_role: role,
            recipient_phone_last4: phoneLast4,
          });
        } else if (status === "sent" && channel === "sms") {
          fireMosPhase11Event("MASTER_INTERNAL_SMS_SENT", `${args.appointment_id}:${role}`, {
            appointment_id: args.appointment_id, recipient_role: role,
            recipient_phone_last4: phoneLast4,
          });
        } else if (status === "failed") {
          fireMosPhase11Event("MASTER_INTERNAL_NOTIFICATION_FAILED", `${args.appointment_id}:${role}:${channel}`, {
            appointment_id: args.appointment_id, recipient_role: role, channel,
            recipient_phone_last4: phoneLast4,
            error: r.error ?? null,
          });
        }
      }
    })
    .catch((e) => {
      console.warn("[mos-post-booking] internal dispatch threw (non-blocking)", e);
      fireMosPhase11Event("MASTER_INTERNAL_NOTIFICATION_FAILED", args.appointment_id, {
        appointment_id: args.appointment_id,
        error: e instanceof Error ? e.message : "unknown",
      });
    });
}

// Backwards-compat: avoid breaking any test importing this helper.
export { last4 as _last4ForTests };
