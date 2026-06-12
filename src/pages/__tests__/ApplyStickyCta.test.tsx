/**
 * Sticky CTA — T1–T7 acceptance tests
 *
 * Spec recap (from latest sticky-CTA brief):
 *   T1: appears after ~1.5s timer + scroll > 300px (hybrid trigger).
 *   T2: works on mobile AND desktop (no breakpoint fully hides the CTA).
 *   T3: once visible, stays visible (no exit on scroll-up).
 *   T4: only one CTA instance per page.
 *   T5: CTA is on top (high z-index).
 *   T6: no flicker — `hasScrolled` is latched after first crossing.
 *   T7: tracking fires exactly once per impression and per click.
 *
 * Strategy: render the extracted `StickyCta` component in isolation, mock the
 * framer-motion `AnimatePresence` so visibility maps directly to DOM presence,
 * mock the tracking + state libs, and drive the hybrid trigger with fake
 * timers + manual scroll dispatch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ----- Module mocks (must be hoisted before component import) -----

const { trackFunnelEvent, trackPixelEvent } = vi.hoisted(() => ({
  trackFunnelEvent: vi.fn(),
  trackPixelEvent: vi.fn(),
}));

vi.mock("@/lib/track-event", () => ({ trackFunnelEvent }));
vi.mock("@/lib/meta-pixel", () => ({ trackPixelEvent }));

vi.mock("@/lib/sticky-cta-state", () => ({
  writeStickyCtaState: vi.fn(),
  clearStickyCtaState: vi.fn(),
}));

vi.mock("@/lib/sticky-ab-test", () => ({
  getStickyAbVariant: () => "B",
}));

vi.mock("@/lib/apply-ab-test", () => ({
  APPLY_AB_COPY: { A: {}, B: {} },
  APPLY_AB_TEST_KEY: "social_proof_v1",
  getApplyAbBucket: () => "A",
  getApplyAbVariant: () => "A",
}));

vi.mock("@/lib/apply-debug-mode", () => ({
  isApplyDebugActive: () => false,
}));

vi.mock("@/lib/scroll-context", () => ({
  getScrollContext: () => ({ scroll_depth_pct: 0, scroll_y: 0 }),
}));

// Strip framer-motion's animation wrapper so visibility === DOM presence.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  type DivProps = React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode };
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: new Proxy(
      {},
      {
        get:
          () =>
          ({ children, ...rest }: DivProps) =>
            <div {...rest}>{children}</div>,
      },
    ),
  };
});

// i18n / Language context isn't needed by StickyCta but ApplyLanding imports
// pull it transitively via re-exports — defensive stub kept minimal.

// ----- Helpers -----

import { StickyCta } from "@/pages/ApplyLanding";

const renderSticky = () =>
  render(
    <MemoryRouter>
      <StickyCta />
    </MemoryRouter>,
  );

const setViewport = (width: number) => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  // Re-stub matchMedia to reflect new width (StickyCta uses `(max-width: 767px)`).
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("max-width") ? width <= 767 : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
};

const scrollTo = async (y: number) => {
  Object.defineProperty(window, "scrollY", { writable: true, configurable: true, value: y });
  await act(async () => {
    fireEvent.scroll(window);
    // Flush the rAF-queued evaluator that the component schedules.
    vi.advanceTimersByTime(20);
  });
};

const advanceTimers = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

const getCtaLinks = () => screen.queryAllByRole("link", { name: /strategie-call sichern/i });

beforeEach(() => {
  // Use fake timers but let queueMicrotask + Promise.resolve work normally; we
  // stub rAF onto setTimeout so advancing timers also drains rAF callbacks.
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  Object.defineProperty(window, "scrollY", { writable: true, configurable: true, value: 0 });
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  trackFunnelEvent.mockReset();
  trackPixelEvent.mockReset();
});

// ----- Tests -----

describe("Sticky CTA — hybrid trigger (T1, T6)", () => {
  it("T1: stays hidden when only the timer elapsed (no scroll)", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(2000);
    expect(getCtaLinks()).toHaveLength(0);
  });

  it("T1: stays hidden when only scrolled past 300px (no timer)", async () => {
    setViewport(1280);
    renderSticky();
    await scrollTo(800);
    expect(getCtaLinks()).toHaveLength(0);
  });

  it("T1 + T6: appears once timer AND scroll thresholds both met, no flicker on scroll-up", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(400);
    expect(getCtaLinks().length).toBeGreaterThanOrEqual(1);

    // T6: scrolling back below threshold must NOT remove it.
    await scrollTo(0);
    expect(getCtaLinks().length).toBeGreaterThanOrEqual(1);
  });
});

describe("Sticky CTA — cross-device (T2, T3)", () => {
  it("T2: renders on desktop viewport", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    expect(getCtaLinks().length).toBeGreaterThanOrEqual(1);
  });

  it("T2: renders on mobile viewport", async () => {
    setViewport(375);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    expect(getCtaLinks().length).toBeGreaterThanOrEqual(1);
  });

  it("T3: stays visible across multiple scroll events after first reveal", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    const before = getCtaLinks().length;
    expect(before).toBeGreaterThanOrEqual(1);

    for (const y of [1200, 50, 2400, 0, 9999]) {
      await scrollTo(y);
    }
    expect(getCtaLinks().length).toBe(before);
  });
});

describe("Sticky CTA — single instance + stacking (T4, T5)", () => {
  it("T4: renders exactly one motion wrapper (one logical CTA surface)", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    // Mobile + desktop layouts are inside ONE wrapper (CSS-toggled), so exactly
    // one element should carry the high z-index style.
    const fixed = document.querySelectorAll('[style*="z-index: 9999"]');
    expect(fixed.length).toBe(1);
  });

  it("T5: top stacking — z-index >= 9999", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    const wrapper = document.querySelector('[style*="z-index: 9999"]') as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper!.style.zIndex).toBe("9999");
  });
});

describe("Sticky CTA — tracking exactly once (T7)", () => {
  it("desktop: fires `sticky_cta_shown` exactly once per pageview", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);

    // Re-render-trigger: extra scroll events must not duplicate the impression.
    await scrollTo(1000);
    await scrollTo(2000);
    await scrollTo(0);

    const impressions = trackFunnelEvent.mock.calls.filter(
      ([name]) => name === "sticky_cta_shown",
    );
    expect(impressions).toHaveLength(1);
    expect(impressions[0][1]).toMatchObject({
      device: "desktop",
      location: "floating_bottom_right",
    });
  });

  it("desktop: does NOT fire mobile-only `sticky_hint_click` on click", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);

    const link = getCtaLinks()[0];
    fireEvent.click(link);

    const hintClicks = trackFunnelEvent.mock.calls.filter(
      ([name]) => name === "sticky_hint_click",
    );
    expect(hintClicks).toHaveLength(0);

    // Standard CTA event still fires once.
    const ctaClicks = trackFunnelEvent.mock.calls.filter(
      ([name]) => name === "apply_cta_click",
    );
    expect(ctaClicks).toHaveLength(1);
    expect(ctaClicks[0][1]).toMatchObject({ location: "sticky_desktop" });
  });

  it("mobile: each click fires `apply_cta_click` exactly once and `sticky_hint_click` exactly once", async () => {
    setViewport(375);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);

    fireEvent.click(getCtaLinks()[0]);

    const ctaClicks = trackFunnelEvent.mock.calls.filter(([n]) => n === "apply_cta_click");
    const hintClicks = trackFunnelEvent.mock.calls.filter(([n]) => n === "sticky_hint_click");
    expect(ctaClicks).toHaveLength(1);
    expect(hintClicks).toHaveLength(1);
    expect(ctaClicks[0][1]).toMatchObject({ location: "sticky_mobile" });
  });

  it("mobile: does NOT fire desktop `sticky_cta_shown` impression", async () => {
    setViewport(375);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);

    const impressions = trackFunnelEvent.mock.calls.filter(
      ([n]) => n === "sticky_cta_shown",
    );
    expect(impressions).toHaveLength(0);
  });
});
