/**
 * CAPI client — fire-and-forget mirror to Meta via Supabase Edge Function.
 * Uses the SAME event_id as the browser Pixel call → Meta dedupes automatically.
 *
 * Security: only the public Pixel ID lives in the browser. The CAPI access
 * token is never sent to or referenced by the client — the edge function holds
 * it as a server-only secret (META_CAPI_ACCESS_TOKEN).
 *
 * Never throws. Never blocks funnel logic.
 */
import { supabase } from "@/integrations/supabase/client";
import { pushCapiPending, patchCapiResult } from "./capi-debug-store";

export type CapiEventName =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "CompleteRegistration"
  | "Schedule"
  | "Purchase"
  | "InitiateCheckout"
  | "ApplyCtaClick"
  | "QuizStarted"
  | "BookingStarted"
  | "BookingCreated"
  | "LowLeadResultView"
  | "ApplicantAccessProvisioned"
  | "ApplicantAccessProvisioningFailed"
  | "QualifiedShow"
  | "OfferMade"
  | "HighQualityLead";

export interface CapiUserData {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
}

export interface CapiCustomData {
  lead_id?: string;
  session_id?: string;
  quiz_score?: number;
  lead_quality?: "high" | "mid" | "low";
  funnel_step?: string;
  appointment_id?: string;
  [k: string]: unknown;
}

export interface CapiPayload extends CapiUserData {
  event_name: CapiEventName;
  event_id: string;
  value?: number;
  currency?: string;
  custom_data?: CapiCustomData;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : undefined;
}

const SESSION_KEY = "etc_session_id";
const EVENT_ID_INDEX_KEY = "etc_event_id_index_v1";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now()}`;
  }
}

export function getSessionId(): string {
  return getOrCreateSessionId();
}

/**
 * Read/write the per-session map of `${eventName}:${entityId}` → event_id.
 * Stored in sessionStorage so re-renders, route changes, and pixel/CAPI
 * mirrors all converge on the SAME id for the SAME logical event.
 */
function readEventIdIndex(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(EVENT_ID_INDEX_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeEventIdIndex(idx: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(EVENT_ID_INDEX_KEY, JSON.stringify(idx));
  } catch {
    /* storage full / blocked — fall through, next call will regenerate */
  }
}

/**
 * Generate a STABLE, dedupable event_id. Same logical event (same name +
 * same entity) always returns the SAME id within a session — eliminating
 * re-render and Pixel/CAPI mirror duplicates.
 *
 * Identity formula:
 *   key = `${event_name}:${entity_id || session_id}`
 *   id  = `${event_name}_${entity_id || session_id}_${stable_suffix}`
 *
 * `stable_suffix` is generated once per (event, entity) pair and persisted
 * in sessionStorage. Cross-session (next browser visit) yields a new id —
 * intentional: those are genuinely different funnel walks.
 *
 * For one-shot events that should be unique per call site (e.g. PageView
 * on every route change), pass an explicit `entityId` carrying the
 * uniqueness (e.g. the current path).
 */
export function buildEventId(
  eventName: string,
  entityId?: string | null,
): string {
  const id = entityId ?? getOrCreateSessionId();
  const key = `${eventName}:${id}`;
  const idx = readEventIdIndex();
  if (idx[key]) return idx[key];

  // Stable per-pair suffix. Random base36 — enough entropy to avoid collisions
  // across distinct (event, entity) pairs, but identical for repeat calls.
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const eventId = `${eventName}_${id}_${suffix}`;
  idx[key] = eventId;
  writeEventIdIndex(idx);
  return eventId;
}

export function sendCapiEvent(payload: CapiPayload): void {
  if (typeof window === "undefined") return;
  try {
    const enriched = {
      ...payload,
      currency: payload.currency ?? "EUR",
      fbp: readCookie("_fbp"),
      fbc: readCookie("_fbc"),
      event_source_url: window.location.href,
      client_user_agent: navigator.userAgent,
    };
    if (import.meta.env.DEV) {
      // No PII — only event metadata.
      console.debug("[capi]", payload.event_name, payload.event_id);
    }

    // Debug log (only when ?pixel_debug=1; store no-ops otherwise).
    let debugId = "";
    try {
      debugId = pushCapiPending(payload.event_name, payload.event_id);
    } catch { /* ignore */ }


    supabase.functions
      .invoke("send-meta-event", { body: enriched })
      .then((res) => {
        if (!debugId) return;
        try {
          const data = (res?.data ?? {}) as {
            success?: boolean;
            status?: number;
            meta?: { fbtrace_id?: string };
            error?: string;
          };
          const fbtrace_id = data?.meta?.fbtrace_id ?? null;
          if (res.error) {
            patchCapiResult(debugId, {
              status: "error",
              error: String(res.error?.message ?? res.error),
              fbtrace_id,
            });
          } else if (data.success === false) {
            patchCapiResult(debugId, {
              status: "error",
              http_status: data.status,
              fbtrace_id,
              error: data.error ?? `HTTP ${data.status ?? "?"}`,
            });
          } else {
            patchCapiResult(debugId, {
              status: "ok",
              http_status: data.status ?? 200,
              fbtrace_id,
            });
          }
        } catch { /* ignore */ }
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn("[capi] invoke failed", err);
        if (!debugId) return;
        try {
          patchCapiResult(debugId, {
            status: "error",
            error: String(err?.message ?? err),
          });
        } catch { /* ignore */ }
      });
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[capi] threw", err);
  }
}
