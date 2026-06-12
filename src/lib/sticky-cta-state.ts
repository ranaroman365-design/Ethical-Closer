/**
 * Sticky-CTA runtime status — read-only snapshot for analytics enrichment.
 *
 * The mobile sticky CTA (`StickyCta` in ApplyLanding.tsx) is the only on-page
 * persistent conversion surface besides inline CTAs. To attribute *which*
 * surfaces a lead was exposed to before converting (e.g. on the playbook
 * lead-magnet), we mirror its runtime state onto a small `window` object that
 * other components can read synchronously inside event handlers — no React
 * coupling, no prop drilling.
 *
 * Contract:
 *   window.__stickyCtaState = {
 *     mounted:  boolean   // component is rendered (mobile viewport)
 *     visible:  boolean   // currently on-screen (after scroll threshold)
 *     hint:     "A"|"B"|null  // active hint A/B variant ("hidden" if shown=false)
 *     hintShown:boolean
 *   }
 *
 * Producers: `StickyCta` component writes on every state transition.
 * Consumers: any analytics call that wants sticky-surface attribution.
 */

import type { StickyAbVariant } from "@/lib/sticky-ab-test";

export interface StickyCtaState {
  mounted: boolean;
  visible: boolean;
  hint: StickyAbVariant | null;
  hintShown: boolean;
}

const DEFAULT_STATE: StickyCtaState = {
  mounted: false,
  visible: false,
  hint: null,
  hintShown: false,
};

declare global {
  interface Window {
    __stickyCtaState?: StickyCtaState;
  }
}

/** Producer: called by StickyCta on every relevant state change. */
export const writeStickyCtaState = (patch: Partial<StickyCtaState>) => {
  if (typeof window === "undefined") return;
  const prev = window.__stickyCtaState ?? DEFAULT_STATE;
  window.__stickyCtaState = { ...prev, ...patch };
};

/** Producer: called on unmount to clear stale state. */
export const clearStickyCtaState = () => {
  if (typeof window === "undefined") return;
  window.__stickyCtaState = { ...DEFAULT_STATE };
};

/**
 * Consumer: returns a flat, JSON-safe attribution object suitable for spreading
 * into trackFunnelEvent payloads. Always returns valid keys (never throws).
 */
export const getStickyCtaAttribution = () => {
  const s = (typeof window !== "undefined" && window.__stickyCtaState) || DEFAULT_STATE;
  return {
    sticky_mounted: s.mounted,
    sticky_visible: s.visible,
    sticky_hint_shown: s.hintShown,
    sticky_hint_variant: s.hint,
  };
};
