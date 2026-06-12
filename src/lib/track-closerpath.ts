import { supabase } from "@/integrations/supabase/client";
import { trackFunnelEvent } from "@/lib/track-event";

/**
 * Canonical event dictionary for the /closerpath funnel.
 * One name = one meaning. No duplicates. No overlap.
 */
export const CLOSERPATH_EVENTS = [
  "lp_view",
  "quiz_started",
  "quiz_completed",
  "lead_submitted",
  "result_viewed",
  "booking_viewed",
  "booking_completed",
  "call_showed",
  "deal_won",
  "deal_lost",
] as const;

export type CloserPathEvent = (typeof CLOSERPATH_EVENTS)[number];

interface TrackOptions {
  email?: string;
  variant?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Track a /closerpath funnel event.
 *
 * Hybrid model:
 *  1) Writes to legacy `event_logs` via trackFunnelEvent (compatibility)
 *  2) Writes to dedicated `funnel_events_v2` for fast KPI queries
 *
 * Fire-and-forget. Never throws.
 */
export async function trackCloserPath(
  eventType: CloserPathEvent,
  options: TrackOptions = {},
): Promise<void> {
  const { email: emailOpt, variant, metadata = {} } = options;

  // 1) Legacy mirror — keep existing dashboards working
  void trackFunnelEvent(eventType, { funnel: "closerpath", variant, ...metadata });

  // 2) Dedicated funnel telemetry
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const storedEmail =
      typeof window !== "undefined"
        ? localStorage.getItem("lead_email") ?? undefined
        : undefined;
    const email = emailOpt ?? storedEmail ?? user?.email ?? "anonymous@closerpath.local";

    await supabase.from("funnel_events_v2").insert({
      event_type: eventType,
      event_source: "closerpath",
      origin_email: email, // legacy required column — reuse for identity
      email,
      user_id: user?.id ?? null,
      variant: variant ?? null,
      metadata: metadata as Record<string, unknown>,
    } as never);
  } catch (err) {
    console.warn("[trackCloserPath] failed:", err);
  }
}
