/**
 * Meta Pixel — Consent Gate
 * ──────────────────────────────────────────────────────────────────────────
 * The Meta Pixel script (fbevents.js) MUST NOT load until the visitor opts in
 * via the cookie banner. This module owns:
 *   - reading the persisted consent state ('accepted' | 'declined' | null)
 *   - injecting fbevents.js exactly ONCE on grant
 *   - firing the initial PageView exactly ONCE per session/grant
 *   - revoking consent (clears fbq, sets opt-out flag)
 *
 * Duplicate-PageView contract:
 *   1. index.html no longer fires `fbq('track','PageView')` automatically.
 *   2. grantConsent() loads the script, inits the pixel, and fires PageView
 *      for the CURRENT path via trackPixelEvent('ROUTE_VIEW', …) — this also
 *      seeds the route-listener dedup state so the next navigation doesn't
 *      double-fire on the same path.
 *   3. MetaPixelRouteListener still skips its very first render, so cold loads
 *      with prior consent don't fire twice either.
 */

import { trackPixelEvent } from "./meta-pixel";

export const CONSENT_KEY = "cookie_consent";
export type ConsentState = "accepted" | "declined" | null;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    __metaPixelActivated__?: boolean;
  }
}

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === "accepted" || v === "declined") return v;
    return null;
  } catch {
    return null;
  }
}

export function hasPixelConsent(): boolean {
  return getConsent() === "accepted";
}

/**
 * Inject fbevents.js (the actual Meta loader). Idempotent: subsequent calls
 * are no-ops because the official snippet bails when `f.fbq` is already set.
 */
function injectFbevents(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.fbq) return;
  // Standard Meta loader, inlined verbatim (queue + async script tag).
  /* eslint-disable */
  // @ts-ignore
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
}

/**
 * Grant pixel consent. Safe to call multiple times — initialization and the
 * activation PageView are guarded by `__metaPixelActivated__`.
 */
export function grantPixelConsent(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONSENT_KEY, "accepted");
  } catch { /* ignore */ }

  if (window.__metaPixelActivated__) return;

  const pixelId = window.__META_PIXEL_ID__;
  if (!pixelId) return;

  injectFbevents();

  try {
    window.fbq?.("consent", "grant");
    window.fbq?.("init", pixelId);
  } catch { /* ignore */ }

  window.__metaPixelActivated__ = true;

  // Fire the activation PageView via the canonical layer so the
  // route-listener dedup is seeded (lastRouteViewPath = current path) and
  // CAPI mirroring stays consistent. This is the ONE PageView per page-load.
  try {
    const path =
      typeof window.location !== "undefined" ? window.location.pathname : "/";
    trackPixelEvent("ROUTE_VIEW", { path });
  } catch { /* never throw */ }
}

/**
 * Revoke consent. We can't unload fbevents.js once injected, but we can flip
 * the Meta consent flag and persist the decision so future loads don't init.
 */
export function revokePixelConsent(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONSENT_KEY, "declined");
  } catch { /* ignore */ }
  try {
    window.fbq?.("consent", "revoke");
  } catch { /* ignore */ }
}
