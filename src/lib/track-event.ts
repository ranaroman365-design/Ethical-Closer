import { supabase } from '@/integrations/supabase/client';
import { mapFunnelEventToPixel, trackPixelEvent } from '@/lib/meta-pixel';
import { resolveFunnelSource, getCachedTrafficOwner } from '@/lib/funnel-source';
import { getAdAttribution, hasAdAttribution } from '@/lib/ad-attribution';
import { getOrCreateSessionId } from '@/lib/ab-auto/session';
import { getActiveSlotSummary } from '@/lib/ab-multivariant';
import { fireVariantConversion } from '@/lib/experiment-engine';
import {
  getMasterTrackingContext,
  eventIdFor,
  claimMasterEvent,
} from '@/lib/master-funnel-id';

type EventCategory = 'funnel' | 'lead_ops' | 'product' | 'admin' | 'dashboard';

interface TrackEventParams {
  eventName: string;
  category: EventCategory;
  pagePath?: string;
  moduleKey?: string;
  metadata?: Record<string, unknown>;
  leadId?: string;
}

/**
 * Track a platform event consistently into event_logs.
 * Fire-and-forget — errors are silently logged to console.
 *
 * Meta Pixel mirror: for `category: 'funnel'` events whose name is registered
 * in `FUNNEL_TO_PIXEL` (see meta-pixel.ts), the matching Meta event is fired
 * alongside the Supabase write. Pixel calls never throw and never block.
 * Supabase remains the single source of truth; Meta is a one-way mirror for
 * ad optimization only.
 */
export async function trackEvent({
  eventName,
  category,
  pagePath,
  moduleKey,
  metadata = {},
  leadId,
}: TrackEventParams): Promise<void> {
  // Master Funnel Tracking v2 — auto-attach funnel id + deterministic event_id
  // for Pixel/CAPI dedup, and enforce idempotency for MASTER_* events.
  const masterCtx = getMasterTrackingContext();
  const isMasterEvent = /^MASTER_/.test(eventName);
  const stepFromName = (() => {
    const m = /_STEP_(\d+)$/.exec(eventName);
    return m ? Number(m[1]) : (typeof metadata.step === 'number' ? metadata.step : undefined);
  })();
  const eventId =
    typeof metadata.event_id === 'string'
      ? metadata.event_id
      : (isMasterEvent && masterCtx.master_funnel_id)
        ? eventIdFor(eventName, stepFromName)
        : null;

  // Block duplicate MASTER_* dispatches inside the same session (refresh, back-nav, double-mount).
  if (isMasterEvent && eventId && !claimMasterEvent(eventId)) {
    // Idempotency guard hit — emit a silent internal counter so the debug
    // overlay can show how many duplicates were prevented.
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('lovable:track:deduped', {
          detail: { eventName, eventId },
        }));
      } catch { /* never throw */ }
    }
    return;
  }

  // Meta mirror — synchronous, safe no-op if pixel/event isn't mapped.
  if (category === 'funnel') {
    const pixelEvent = mapFunnelEventToPixel(eventName);
    if (pixelEvent) {
      const pixelParams: Record<string, unknown> = {};
      if (typeof metadata.value === 'number') pixelParams.value = metadata.value;
      if (typeof metadata.currency === 'string') pixelParams.currency = metadata.currency;
      if (typeof metadata.funnel === 'string') pixelParams.content_name = metadata.funnel;
      if (eventId) pixelParams.eventID = eventId;
      try { trackPixelEvent(pixelEvent, pixelParams); } catch { /* never throw */ }
    }
  }

  // Debug bus — only listened to when ?debug=ab or ?debug_tracking is active. No-op otherwise.
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('lovable:track', {
          detail: { eventName, category, metadata, pagePath, moduleKey, leadId, eventId },
        }),
      );
    } catch { /* never throw */ }
  }

  // Experiment tag — auto-attach for apply/qualify A/B variants so every
  // payload is consistently attributable without touching call sites.
  const resolvedPagePath =
    pagePath ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const funnelTag = typeof metadata.funnel === 'string' ? metadata.funnel : null;
  const onExperimentRoute =
    resolvedPagePath.startsWith('/apply') || resolvedPagePath.startsWith('/qualify');
  const inExperimentFunnel = funnelTag === 'apply' || funnelTag === 'qualify';
  const experimentId =
    typeof metadata.experiment_id === 'string'
      ? metadata.experiment_id
      : (onExperimentRoute || inExperimentFunnel)
        ? 'apply_vs_qualify_v1'
        : null;

  try {
    const { data: { user } } = await supabase.auth.getUser();

    const attribution = getAdAttribution();
    const attributionPayload: Record<string, string | null> = hasAdAttribution(attribution)
      ? {
          utm_source: attribution.utm_source,
          utm_medium: attribution.utm_medium,
          utm_campaign: attribution.utm_campaign,
          utm_term: attribution.utm_term,
          utm_content: attribution.utm_content,
          fbclid: attribution.fbclid,
          gclid: attribution.gclid,
        }
      : {};

    // session_id is required for Auto A/B join (ab_allocations.session_id ↔ payload.session_id).
    // Safe additive default — caller can override via metadata.session_id.
    const sessionId = getOrCreateSessionId();

    // Experiment Engine: every event carries the visitor's active variant
    // assignments so the rollup can attribute downstream conversions to the
    // hero/CTA/etc. variants they were originally exposed to. Caller-supplied
    // `ab_slots` always wins.
    const callerSlots = typeof metadata.ab_slots === 'string' ? metadata.ab_slots : null;
    const autoSlots = callerSlots ?? getActiveSlotSummary();

    await supabase.from('event_logs').insert({
      event_name: eventName,
      email: user?.email ?? null,
      payload: {
        category,
        page_path: resolvedPagePath,
        module_key: moduleKey ?? null,
        lead_id: leadId ?? null,
        user_id: user?.id ?? null,
        funnel_source: resolveFunnelSource(),
        traffic_owner: getCachedTrafficOwner(),
        session_id: sessionId,
        master_funnel_id: masterCtx.master_funnel_id,
        tracking_version: masterCtx.tracking_version,
        attribution_source: masterCtx.attribution_source,
        ...(eventId ? { event_id: eventId } : {}),
        ...attributionPayload,
        ...(experimentId ? { experiment_id: experimentId } : {}),
        ...(autoSlots ? { ab_slots: autoSlots } : {}),
        ...metadata,
      },
      status: 'received',
    });

    // Fire MASTER_VARIANT_* analysis events (internal only, deduped per
    // (event_name, session). Never replaces Meta events.
    if (category === 'funnel' && autoSlots) {
      fireVariantConversion(eventName, autoSlots);
    }
  } catch (err) {
    console.warn('[trackEvent] failed:', err);
  }
}

// Convenience helpers
export const trackFunnelEvent = (eventName: string, metadata?: Record<string, unknown>) =>
  trackEvent({ eventName, category: 'funnel', metadata });

export const trackProductEvent = (eventName: string, metadata?: Record<string, unknown>) =>
  trackEvent({ eventName, category: 'product', metadata });

export const trackLeadEvent = (eventName: string, leadId: string, metadata?: Record<string, unknown>) =>
  trackEvent({ eventName, category: 'lead_ops', leadId, metadata });

export const trackDashboardEvent = (eventName: string, metadata?: Record<string, unknown>) =>
  trackEvent({ eventName, category: 'dashboard', metadata });
