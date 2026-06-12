/**
 * scroll-context — lightweight snapshot of user-intent signals at the moment
 * an event is fired. Used to enrich tracking events (e.g. sticky_hint_*) so
 * CTR can be segmented by scroll depth and dwell time on the page.
 *
 * Returned shape is JSON-safe + flat (spreadable into trackFunnelEvent payloads).
 *
 * Anchors:
 *   - scroll_depth_pct  : 0–100, current scroll position relative to scrollable height.
 *                         100 = bottom of page reached. 0 if page is not scrollable.
 *   - scroll_depth_px   : raw pixel offset from top (window.scrollY).
 *   - viewport_height   : px — useful to interpret depth on small screens.
 *   - ms_since_load     : ms since browser-level navigation start (performance.timeOrigin).
 *                         Survives SPA route changes; reflects true page-load anchor.
 */

export interface ScrollContextSnapshot {
  scroll_depth_pct: number | null;
  scroll_depth_px: number | null;
  viewport_height: number | null;
  ms_since_load: number | null;
}

const EMPTY: ScrollContextSnapshot = {
  scroll_depth_pct: null,
  scroll_depth_px: null,
  viewport_height: null,
  ms_since_load: null,
};

export function getScrollContext(): ScrollContextSnapshot {
  if (typeof window === "undefined" || typeof document === "undefined") return EMPTY;

  try {
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
    const viewportH = window.innerHeight ?? 0;
    const docH = Math.max(
      document.documentElement?.scrollHeight ?? 0,
      document.body?.scrollHeight ?? 0,
    );
    const scrollable = Math.max(0, docH - viewportH);
    const pct = scrollable > 0
      ? Math.min(100, Math.max(0, Math.round((scrollY / scrollable) * 100)))
      : 0;

    // performance.now() is ms since timeOrigin (≈ navigation start), the most
    // stable "since page load" anchor available without extra bookkeeping.
    const ms = typeof performance !== "undefined" && typeof performance.now === "function"
      ? Math.round(performance.now())
      : null;

    return {
      scroll_depth_pct: pct,
      scroll_depth_px: Math.round(scrollY),
      viewport_height: viewportH,
      ms_since_load: ms,
    };
  } catch {
    return EMPTY;
  }
}
