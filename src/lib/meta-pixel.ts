/**
 * Meta Pixel — Canonical Event Layer
 * ──────────────────────────────────────────────────────────────────────────
 * Source-of-truth: Supabase (funnel_events_v2). Meta Pixel is for ad-platform
 * optimization & retargeting only — NOT for internal KPI calculation.
 *
 * Pixel-ID is intentionally NOT hard-coded. Inject it via either:
 *   1. window.__META_PIXEL_ID__ = "1234567890" (e.g. via Lovable env)
 *   2. localStorage.setItem("meta_pixel_id", "1234567890") (admin override)
 *
 * If no ID is set, the layer becomes a no-op (events are still fired into a
 * console-debug queue so wiring can be verified before the pixel goes live).
 *
 * Canonical funnel events (mapped to Meta standard or custom events):
 *   LP_VIEW          → PageView
 *   QUIZ_STARTED     → CustomEvent "QuizStarted"
 *   QUIZ_COMPLETED   → CustomEvent "QuizCompleted"
 *   BOOKING_STARTED  → InitiateCheckout
 *   BOOKED           → Schedule
 *   SHOWED_UP        → CustomEvent "ShowedUp"
 *   OFFER_MADE       → CustomEvent "OfferMade"
 *   CLOSED_WON       → Purchase
 */

import { buildEventId } from "./meta-capi";
import { pushPixelDebugEvent } from "./pixel-debug-store";
import { getAbContextParams } from "./ab-active-test";

/**
 * Production hostname gate. Real Meta Pixel events ONLY fire on the
 * production domain. Localhost / preview / staging fire into the debug
 * panel but never into fbq or CAPI.
 */
const PRODUCTION_HOSTS: ReadonlySet<string> = new Set([
  "ethicalcloser.de",
  "www.ethicalcloser.de",
]);

function isProductionHost(): boolean {
  // In dev / test builds, skip the host gate so local QA + vitest work.
  // In production builds, only the real ethicalcloser.de domains fire.
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return false;
  try {
    return PRODUCTION_HOSTS.has(window.location.hostname);
  } catch {
    return false;
  }
}

declare global {
  interface Window {
    __META_PIXEL_ID__?: string;
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export type CanonicalPixelEvent =
  | "LP_VIEW"
  | "ROUTE_VIEW"
  | "APPLY_VIEW"
  | "APPLY_CTA_CLICK"
  | "QUIZ_STARTED"
  | "QUIZ_COMPLETED"
  | "LEAD_CAPTURED"
  | "LOW_LEAD_RESULT_VIEW"
  | "BOOKING_STARTED"
  | "BOOKING_CREATED"
  | "BOOKING_CONFIRMED"
  | "BOOKED"
  | "SHOWED_UP"
  | "OFFER_MADE"
  | "FASTLANE_PAYMENT_COMPLETED"
  | "APPLICANT_ACCESS_PROVISIONED"
  | "APPLICANT_ACCESS_PROVISIONING_FAILED"
  | "CLOSED_WON"
  | "HIGH_QUALITY_LEAD";

interface MetaMapping {
  type: "standard" | "custom";
  event: string;
}

const MAP: Record<CanonicalPixelEvent, MetaMapping> = {
  LP_VIEW:                              { type: "standard", event: "PageView" },
  ROUTE_VIEW:                           { type: "standard", event: "PageView" },
  APPLY_VIEW:                           { type: "standard", event: "ViewContent" },
  APPLY_CTA_CLICK:                      { type: "custom",   event: "ApplyCtaClick" },
  QUIZ_STARTED:                         { type: "custom",   event: "QuizStarted" },
  QUIZ_COMPLETED:                       { type: "custom",   event: "QuizCompleted" },
  LEAD_CAPTURED:                        { type: "standard", event: "Lead" },
  LOW_LEAD_RESULT_VIEW:                 { type: "custom",   event: "LowLeadResultView" },
  BOOKING_STARTED:                      { type: "custom",   event: "BookingStarted" },
  BOOKING_CREATED:                      { type: "custom",   event: "BookingCreated" },
  BOOKING_CONFIRMED:                    { type: "standard", event: "Schedule" },
  BOOKED:                               { type: "standard", event: "Schedule" },
  SHOWED_UP:                            { type: "custom",   event: "QualifiedShow" },
  OFFER_MADE:                           { type: "custom",   event: "OfferMade" },
  FASTLANE_PAYMENT_COMPLETED:           { type: "standard", event: "Purchase" },
  APPLICANT_ACCESS_PROVISIONED:         { type: "custom",   event: "ApplicantAccessProvisioned" },
  APPLICANT_ACCESS_PROVISIONING_FAILED: { type: "custom",   event: "ApplicantAccessProvisioningFailed" },
  CLOSED_WON:                           { type: "standard", event: "Purchase" },
  HIGH_QUALITY_LEAD:                    { type: "custom",   event: "HighQualityLead" },
};

/**
 * Mirror map: canonical ETC funnel event names (as written by `trackFunnelEvent`
 * into Supabase `event_logs`) → CanonicalPixelEvent. This is the ONLY bridge
 * from ETC funnel truth into the Meta layer. Case-insensitive on input.
 *
 * Keep this list narrow — only events that have real ad-optimization value.
 * Internal pipeline states (lead_saved, confirmation_view, etc.) are intentionally
 * NOT mirrored.
 */
const FUNNEL_TO_PIXEL: Record<string, CanonicalPixelEvent> = {
  apply_view:                              "APPLY_VIEW",
  apply_cta_click:                         "APPLY_CTA_CLICK",
  quiz_started:                            "QUIZ_STARTED",
  quiz_completed:                          "QUIZ_COMPLETED",
  // APPLY_* parity → mirror to existing canonical Pixel events.
  apply_quiz_started:                      "QUIZ_STARTED",
  apply_quiz_completed:                    "QUIZ_COMPLETED",
  apply_high_intent:                       "APPLY_VIEW",
  lead_captured:                           "LEAD_CAPTURED",
  low_lead_result_view:                    "LOW_LEAD_RESULT_VIEW",
  booking_started:                         "BOOKING_STARTED",
  booking_created:                         "BOOKING_CREATED",
  booking_confirmed:                       "BOOKING_CONFIRMED",
  booking_success:                         "BOOKING_CONFIRMED",
  booked:                                  "BOOKING_CONFIRMED",
  showed:                                  "SHOWED_UP",
  offer_made:                              "OFFER_MADE",
  fastlane_payment_completed:              "FASTLANE_PAYMENT_COMPLETED",
  applicant_access_provisioned:            "APPLICANT_ACCESS_PROVISIONED",
  applicant_access_provisioning_failed:    "APPLICANT_ACCESS_PROVISIONING_FAILED",
  closed_won:                              "CLOSED_WON",
};

/** Resolve a raw funnel event name to its Pixel canonical event, or null. */
export function mapFunnelEventToPixel(name: string): CanonicalPixelEvent | null {
  return FUNNEL_TO_PIXEL[name?.toLowerCase?.() ?? ""] ?? null;
}

let initialized = false;

/**
 * Route-scoped Meta Pixel for /apply (legacy, now origin-locked).
 *
 * Historically /apply used its own dedicated pixel. That broke attribution
 * for visitors who entered via /masterofsales (or any other LP on the
 * global pixel) and then continued into /apply/quiz → booking → thank-you:
 * the journey was split across two Pixel IDs and counted as two funnels.
 *
 * Contract (Funnel-Origin Lock):
 *   - First page in the session is captured in sessionStorage.
 *   - First touch NOT on /apply (e.g. /masterofsales, /, /freiheit, …)
 *     → entire session, including any later /apply/* visit, stays on the
 *       GLOBAL pixel (window.__META_PIXEL_ID__).
 *   - First touch on /apply/* (direct ad → apply) keeps the dedicated
 *     APPLY pixel for the whole session.
 *
 * Pure pixel-routing fix. Quiz / Lead / Booking / CRM / Calendly / DB are
 * untouched.
 */
export const APPLY_PIXEL_ID = "1925554318156919";

const FUNNEL_ORIGIN_KEY = "etc_funnel_origin_v1";

function readFunnelOrigin(): "apply" | "global" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(FUNNEL_ORIGIN_KEY);
    return v === "apply" || v === "global" ? v : null;
  } catch {
    return null;
  }
}

function captureFunnelOriginIfNeeded(): "apply" | "global" {
  const existing = readFunnelOrigin();
  if (existing) return existing;
  let origin: "apply" | "global" = "global";
  try {
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/apply")) {
      origin = "apply";
    }
  } catch { /* ignore */ }
  try {
    window.sessionStorage.setItem(FUNNEL_ORIGIN_KEY, origin);
  } catch { /* ignore */ }
  return origin;
}

function isApplyRoute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.location.pathname.startsWith("/apply");
  } catch {
    return false;
  }
}

function resolvePixelId(): string | null {
  if (typeof window === "undefined") return null;
  if (window.__META_PIXEL_ID__) return window.__META_PIXEL_ID__;
  try {
    return localStorage.getItem("meta_pixel_id");
  } catch {
    return null;
  }
}

/**
 * Pixel ID for the current event — locked to the session's funnel origin
 * so cross-LP journeys (e.g. /masterofsales → /apply/quiz) keep a single
 * pixel and a single attribution chain.
 */
function resolveActivePixelId(): string | null {
  const origin = captureFunnelOriginIfNeeded();
  if (origin === "apply") return APPLY_PIXEL_ID;
  return resolvePixelId();
}

let applyPixelInitialized = false;
export function ensureApplyPixelInit(): void {
  if (applyPixelInitialized) return;
  if (typeof window === "undefined" || !window.fbq) return;
  try {
    window.fbq("init", APPLY_PIXEL_ID);
    applyPixelInitialized = true;
  } catch { /* ignore */ }
}

/** Pixel is already loaded by the exact Meta snippet in index.html.
 *  This function is kept for compatibility but does NOT inject the loader again.
 */
export function initMetaPixel(): void {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
}

/**
 * Fire a canonical funnel event. Always also logs to console in dev so we
 * can verify wiring before a pixel ID is set.
 *
 * @param event   canonical funnel event
 * @param params  optional event parameters (value, currency, content_name, …)
 */
let lastRouteViewPath: string | null = null;

/**
 * Lightweight failure reporter. Never throws. In DEV: full console.error with
 * stack. In PROD: single concise console.warn so monitoring (Sentry, LogRocket,
 * browser error trackers) can pick it up without spamming users.
 *
 * Failures are also queued on `window.__metaPixelErrors__` (capped at 50) so an
 * admin/debug overlay can inspect recent issues without external tooling.
 */
function reportPixelFailure(
  stage: "track" | "map" | "init",
  event: CanonicalPixelEvent | string,
  err: unknown,
  context?: Record<string, unknown>
): void {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const entry = {
      stage,
      event,
      message,
      context: context ?? {},
      ts: new Date().toISOString(),
    };

    // In-memory ring buffer (last 50) for ad-hoc debugging.
    if (typeof window !== "undefined") {
      const w = window as unknown as { __metaPixelErrors__?: typeof entry[] };
      if (!Array.isArray(w.__metaPixelErrors__)) w.__metaPixelErrors__ = [];
      w.__metaPixelErrors__!.push(entry);
      if (w.__metaPixelErrors__!.length > 50) w.__metaPixelErrors__!.shift();
    }

    if (import.meta.env.DEV) {
      console.error("[meta-pixel:error]", entry, err);
    } else {
      console.warn("[meta-pixel:error]", stage, event, message);
    }
  } catch {
    // Reporter itself must never throw.
  }
}

// CAPI-mirrorable Meta events. Must match send-meta-event edge function whitelist.
// All Meta event names supported by the CAPI edge function. Mirror EVERY
// canonical funnel event server-side so iOS/adblocker losses are recovered.
const CAPI_MIRROR_NAMES: ReadonlySet<string> = new Set([
  "PageView",
  "ViewContent",
  "Lead",
  "QuizCompleted",
  "Schedule",
  "Purchase",
  "InitiateCheckout",
  "ApplyCtaClick",
  "QuizStarted",
  "BookingStarted",
  "BookingCreated",
  "LowLeadResultView",
  "ApplicantAccessProvisioned",
  "ApplicantAccessProvisioningFailed",
  "QualifiedShow",
  "OfferMade",
  "HighQualityLead",
]);

/** Fire-and-forget QA log to Supabase (PII-safe). */
function logBrowserQa(args: {
  event_name: string;
  event_id: string;
  lead_id?: string;
  session_id?: string;
  appointment_id?: string;
  origin_key?: string;
}): void {
  try {
    import("@/integrations/supabase/client").then(({ supabase }) => {
      try {
        const p = supabase.rpc("log_meta_event_browser" as never, {
          _event_name: args.event_name,
          _event_id: args.event_id,
          _lead_id: args.lead_id ?? null,
          _session_id: args.session_id ?? null,
          _appointment_id: args.appointment_id ?? null,
          _origin_key: args.origin_key ?? null,
        } as never) as unknown as Promise<unknown>;
        Promise.resolve(p).catch(() => undefined);
      } catch { /* ignore */ }
    }).catch(() => undefined);
  } catch {
    /* never throw */
  }
}

export function trackPixelEvent(
  event: CanonicalPixelEvent,
  params?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;

  try {
    const mapping = MAP[event];
    if (!mapping) {
      reportPixelFailure("map", event, new Error("Unknown canonical event"), { params });
      return;
    }

    // De-dupe SPA PageViews on identical paths (rerenders, replace state, etc.)
    if (event === "ROUTE_VIEW") {
      const path = (params?.path as string | undefined) ?? window.location.pathname;
      if (path === lastRouteViewPath) return;
      lastRouteViewPath = path;
    }

    // Shared event_id for Pixel ↔ CAPI deduplication.
    let event_id = params?.event_id as string | undefined;
    if (!event_id) {
      const entityId =
        (params?.lead_id as string | undefined) ??
        (params?.appointment_id as string | undefined) ??
        (params?.session_id as string | undefined);
      event_id = buildEventId(mapping.event, entityId ?? null);
    }

    // Auto-enrich every event with A/B test + session + landing context, and
    // default Lead value/currency for ROAS optimization.
    const abCtx = getAbContextParams();
    const leadDefaults =
      mapping.event === "Lead"
        ? { value: 1, currency: "EUR" }
        : undefined;
    const fbqParams: Record<string, unknown> = {
      ...leadDefaults,
      ...abCtx,
      ...(params ?? {}),
      event_id,
    };

    if (import.meta.env.DEV) {
      console.debug("[meta-pixel]", event, "→", mapping.event, { event_id, ab: abCtx.ab_variant });
    }

    // Browser Pixel — pass event_id via 4th arg so Meta dedupes vs CAPI.
    // CONSENT GATE: only fire fbq if visitor has accepted cookies.
    // PRODUCTION GATE: only fire on ethicalcloser.de (no preview/staging pollution).
    let browserFired = false;
    const consentGranted =
      typeof window !== "undefined" && window.__metaPixelActivated__ === true;
    const productionGate = isProductionHost();
    const activePixelId = resolveActivePixelId();
    if (consentGranted && productionGate && activePixelId && window.fbq) {
      try {
        // Lazy-init the /apply pixel the first time we route an event to it.
        if (isApplyRoute() && activePixelId === APPLY_PIXEL_ID) ensureApplyPixelInit();
        // trackSingle*: send to EXACTLY this pixel — never both. Prevents
        // duplicate PageView/Lead/etc. across initialized pixels.
        if (mapping.type === "standard") {
          window.fbq("trackSingle", activePixelId, mapping.event, fbqParams, { eventID: event_id });
        } else {
          window.fbq("trackSingleCustom", activePixelId, mapping.event, fbqParams, { eventID: event_id });
        }
        browserFired = true;
      } catch (fbqErr) {
        reportPixelFailure("track", event, fbqErr, { mapping, params: fbqParams });
      }
    }

    // Debug panel — always log canonical events for inspection.
    pushPixelDebugEvent(event, mapping.event, fbqParams);

    // QA log — only when browser actually fired (avoids polluting in dry-run).
    if (browserFired) {
      logBrowserQa({
        event_name: mapping.event,
        event_id,
        lead_id: typeof params?.lead_id === "string" ? (params.lead_id as string) : undefined,
        session_id: typeof params?.session_id === "string" ? (params.session_id as string) : undefined,
        appointment_id: typeof params?.appointment_id === "string" ? (params.appointment_id as string) : undefined,
        origin_key: typeof params?.origin_key === "string" ? (params.origin_key as string) : undefined,
      });
    }

    // CAPI mirror — every whitelisted event flows server-side too.
    // Also gated by consent: server-side tracking without opt-in would
    // defeat the purpose of consent management.
    if (consentGranted && productionGate && CAPI_MIRROR_NAMES.has(mapping.event)) {
      import("./meta-capi").then(({ sendCapiEvent }) => {
        const cd: Record<string, unknown> = {};
        const passthrough = [
          "lead_id", "session_id", "quiz_score", "lead_quality",
          "funnel_step", "appointment_id", "content_name", "content_category",
          "origin_key", "operator_email",
          "ab_test_name", "ab_variant", "funnel_source", "landing_page",
        ] as const;
        for (const k of passthrough) {
          const v = fbqParams?.[k];
          if (v !== undefined && v !== null && v !== "") cd[k] = v;
        }
        sendCapiEvent({
          event_name: mapping.event as Parameters<typeof sendCapiEvent>[0]["event_name"],
          event_id: event_id!,
          email: typeof fbqParams?.email === "string" ? (fbqParams.email as string) : undefined,
          phone: typeof fbqParams?.phone === "string" ? (fbqParams.phone as string) : undefined,
          first_name: typeof fbqParams?.first_name === "string" ? (fbqParams.first_name as string) : undefined,
          last_name: typeof fbqParams?.last_name === "string" ? (fbqParams.last_name as string) : undefined,
          value: typeof fbqParams?.value === "number" ? (fbqParams.value as number) : undefined,
          currency: typeof fbqParams?.currency === "string" ? (fbqParams.currency as string) : "EUR",
          custom_data: Object.keys(cd).length > 0 ? cd : undefined,
        });
      }).catch(() => { /* never throw */ });
    }
  } catch (outerErr) {
    reportPixelFailure("track", event, outerErr, { params });
  }
}
