/**
 * Funnel-Pixel Origin Lock — regression test.
 *
 * Visitors who enter the funnel via a non-/apply landing page (e.g.
 * /masterofsales) MUST stay on the global Meta Pixel for the entire
 * session, including any later /apply/* visit. This prevents the
 * /masterofsales → /apply/quiz attribution break.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GLOBAL_PIXEL = "788225560805467";
const APPLY_PIXEL = "1925554318156919";

function setLocation(path: string): void {
  Object.defineProperty(window, "location", {
    value: { ...window.location, pathname: path, href: `https://x${path}`, hostname: "x" },
    writable: true,
    configurable: true,
  });
}

describe("funnel-pixel origin lock", () => {
  let fbq: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    sessionStorage.clear();
    localStorage.clear();
    fbq = vi.fn();
    (window as any).fbq = fbq;
    (window as any).__metaPixelActivated__ = true;
    (window as any).__META_PIXEL_ID__ = GLOBAL_PIXEL;
  });

  afterEach(() => {
    delete (window as any).fbq;
    delete (window as any).__metaPixelActivated__;
    delete (window as any).__META_PIXEL_ID__;
  });

  it("locks to GLOBAL pixel when first touch is /masterofsales, even later on /apply/quiz", async () => {
    setLocation("/masterofsales");
    const { trackPixelEvent } = await import("@/lib/meta-pixel");
    trackPixelEvent("ROUTE_VIEW", { path: "/masterofsales" });

    setLocation("/apply/quiz");
    trackPixelEvent("ROUTE_VIEW", { path: "/apply/quiz" });
    trackPixelEvent("QUIZ_STARTED");
    trackPixelEvent("LEAD_CAPTURED");

    const pixelIdsUsed = fbq.mock.calls
      .filter((c) => c[0] === "trackSingle" || c[0] === "trackSingleCustom")
      .map((c) => c[1]);

    expect(pixelIdsUsed.length).toBeGreaterThan(0);
    expect(pixelIdsUsed.every((id) => id === GLOBAL_PIXEL)).toBe(true);
    expect(pixelIdsUsed).not.toContain(APPLY_PIXEL);
  });

  it("locks to APPLY pixel only when first touch is /apply/*", async () => {
    setLocation("/apply/quiz");
    const { trackPixelEvent } = await import("@/lib/meta-pixel");
    trackPixelEvent("ROUTE_VIEW", { path: "/apply/quiz" });
    trackPixelEvent("LEAD_CAPTURED");

    const pixelIdsUsed = fbq.mock.calls
      .filter((c) => c[0] === "trackSingle" || c[0] === "trackSingleCustom")
      .map((c) => c[1]);
    expect(pixelIdsUsed.every((id) => id === APPLY_PIXEL)).toBe(true);
  });
});
