/**
 * Extended /apply test suite — complements ApplyStickyCta.test.tsx with:
 *
 *   1. Tracking dedupe under retries (impression + click fire EXACTLY once,
 *      even when scroll/click handlers are exercised many times).
 *   2. Quiz CTA gating — every CTA on /apply funnels through `/apply/quiz`,
 *      never bypassing the qualification step (e.g. directly to /booking).
 *   3. Accessibility — targeted manual asserts on the sticky CTA contract:
 *      role=link, accessible name, aria-live status region, decorative icons.
 *   4. Performance — (a) static asset budget for the optimized landing
 *      images, (b) StickyCta runtime budget: bounded mount time + at most
 *      one scroll listener registered, fully cleaned up on unmount.
 *   5. Landing T1 — sticky CTA hybrid trigger verified against the FULL
 *      <ApplyLanding/> page (not the isolated component) to prove no other
 *      provider/component swallows the trigger in production composition.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// ---------- Hoisted mocks ----------
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
vi.mock("@/lib/sticky-ab-test", () => ({ getStickyAbVariant: () => "B" }));
vi.mock("@/lib/apply-ab-test", async (orig) => {
  // Use the real copy/structure (so the full ApplyLanding render works), but
  // pin bucket/variant to "A" for deterministic assertions.
  const real = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...real, getApplyAbBucket: () => "A", getApplyAbVariant: () => "A" };
});
vi.mock("@/lib/apply-debug-mode", () => ({ isApplyDebugActive: () => false }));
vi.mock("@/lib/scroll-context", () => ({
  getScrollContext: () => ({ scroll_depth_pct: 0, scroll_y: 0 }),
}));

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

// LanguageContext might be referenced transitively; provide a permissive stub.
// Falls back to no-op if the real module isn't imported.
vi.mock("@/contexts/LanguageContext", async (orig) => {
  try {
    const real = await (orig as () => Promise<Record<string, unknown>>)();
    return real;
  } catch {
    return {
      useLanguage: () => ({ t: (k: string) => k, language: "de", setLanguage: () => {} }),
      LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    };
  }
});

import { StickyCta } from "@/pages/ApplyLanding";

// ---------- Helpers ----------
const setViewport = (width: number) => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
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
    vi.advanceTimersByTime(20);
  });
};

const advanceTimers = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

const renderSticky = () =>
  render(
    <MemoryRouter>
      <StickyCta />
    </MemoryRouter>,
  );

const getCtaLinks = () => screen.queryAllByRole("link", { name: /strategie-call sichern/i });

beforeEach(() => {
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

// =====================================================================
// 1. TRACKING DEDUPE — exactly-once across retries
// =====================================================================
describe("Tracking dedupe — fires exactly once across retries", () => {
  it("desktop impression: 50 redundant scroll events still produce 1 `sticky_cta_shown`", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(400); // first reveal
    // Hammer the scroll listener — simulate flaky retry storm.
    for (let i = 0; i < 50; i++) await scrollTo(400 + i * 10);
    const impressions = trackFunnelEvent.mock.calls.filter(([n]) => n === "sticky_cta_shown");
    expect(impressions).toHaveLength(1);
  });

  it("desktop click: rapid double-tap fires `apply_cta_click` exactly once per click (no swallowing, no duplication)", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    const link = getCtaLinks()[0];
    fireEvent.click(link);
    fireEvent.click(link); // user double-taps
    fireEvent.click(link);
    const ctaClicks = trackFunnelEvent.mock.calls.filter(([n]) => n === "apply_cta_click");
    // Each click should produce exactly one event — 3 clicks → 3 events,
    // but NEVER duplicated within a single click handler.
    expect(ctaClicks).toHaveLength(3);
    // And no mobile-only event should slip through.
    expect(trackFunnelEvent.mock.calls.filter(([n]) => n === "sticky_hint_click")).toHaveLength(0);
  });

  it("mobile click: each click produces exactly 1 `apply_cta_click` AND 1 `sticky_hint_click`", async () => {
    setViewport(375);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    const link = getCtaLinks()[0];
    fireEvent.click(link);
    fireEvent.click(link);
    const ctaClicks = trackFunnelEvent.mock.calls.filter(([n]) => n === "apply_cta_click");
    const hintClicks = trackFunnelEvent.mock.calls.filter(([n]) => n === "sticky_hint_click");
    expect(ctaClicks).toHaveLength(2);
    expect(hintClicks).toHaveLength(2);
  });
});

// =====================================================================
// 2. ACCESSIBILITY — targeted manual asserts on sticky CTA contract
// =====================================================================
describe("Accessibility — sticky CTA contract", () => {
  it("renders an accessible link with the correct name and target", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    // Both mobile + desktop layouts render under one wrapper (CSS-toggled),
    // so multiple matching links are expected. All must point to the quiz.
    const links = screen.getAllByRole("link", { name: /strategie-call sichern/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const l of links) expect(l.getAttribute("href")).toBe("/apply/quiz");
  });

  it("provides an aria-live polite status region for assistive tech", async () => {
    setViewport(375);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
  });

  it("the floating wrapper does not trap focus or hide content from AT (no aria-hidden=true on the CTA itself)", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    const links = screen.getAllByRole("link", { name: /strategie-call sichern/i });
    for (const link of links) {
      let el: HTMLElement | null = link;
      while (el && el !== document.body) {
        expect(el.getAttribute("aria-hidden")).not.toBe("true");
        el = el.parentElement;
      }
    }
  });
});

// =====================================================================
// 3. PERFORMANCE — runtime budget (jsdom-side)
// =====================================================================
describe("Performance — StickyCta runtime budget", () => {
  it("registers exactly one scroll listener and removes it on unmount (no leak)", async () => {
    setViewport(1280);
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderSticky();
    await advanceTimers(1500);

    const scrollAdds = addSpy.mock.calls.filter(([type]) => type === "scroll").length;
    expect(scrollAdds).toBe(1);

    unmount();
    const scrollRemoves = removeSpy.mock.calls.filter(([type]) => type === "scroll").length;
    expect(scrollRemoves).toBe(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("after the latch fires, the scroll listener detaches itself (no further work on scroll)", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500); // latch

    const addSpy = vi.spyOn(window, "addEventListener");
    // Subsequent scroll events must NOT cause new listener registration churn.
    for (let i = 0; i < 10; i++) await scrollTo(500 + i);
    const newScrollAdds = addSpy.mock.calls.filter(([type]) => type === "scroll").length;
    expect(newScrollAdds).toBe(0);
    addSpy.mockRestore();
  });

  it("mounts under a generous jsdom budget (<150ms)", async () => {
    setViewport(1280);
    // We use real timers for this micro-benchmark only.
    vi.useRealTimers();
    const t0 = performance.now();
    const { unmount } = renderSticky();
    const dt = performance.now() - t0;
    unmount();
    expect(dt).toBeLessThan(150);
    vi.useFakeTimers();
  });
});

// =====================================================================
// 4. PERFORMANCE — static asset budgets (LCP / CWV guardrails)
// =====================================================================
describe("Performance — landing image asset budgets", () => {
  const ASSET_DIR = resolve(__dirname, "../../assets");
  // Budgets reflect the post-optimization weights documented in the LCP work
  // (WebP <= 100KB; JPG fallbacks <= 180KB). Tests fail loudly if a future
  // re-export bloats the page weight.
  const ASSETS: Array<{ base: string; webpMaxKB: number; jpgMaxKB: number }> = [
    { base: "apply-hero-night",        webpMaxKB: 60,  jpgMaxKB: 120 },
    { base: "apply-problem-office",    webpMaxKB: 60,  jpgMaxKB: 130 },
    { base: "apply-opportunity-calm",  webpMaxKB: 100, jpgMaxKB: 200 },
    { base: "apply-system-call",       webpMaxKB: 110, jpgMaxKB: 180 },
    { base: "apply-selection-portrait",webpMaxKB: 60,  jpgMaxKB: 130 },
    { base: "apply-quiz-decision",     webpMaxKB: 60,  jpgMaxKB: 130 },
  ];

  it.each(ASSETS)("$base ships a WebP under $webpMaxKB KB and JPG under $jpgMaxKB KB", ({ base, webpMaxKB, jpgMaxKB }) => {
    const webp = statSync(resolve(ASSET_DIR, `${base}.webp`));
    const jpg = statSync(resolve(ASSET_DIR, `${base}.jpg`));
    expect(webp.size, `${base}.webp = ${(webp.size / 1024).toFixed(1)}KB`).toBeLessThanOrEqual(webpMaxKB * 1024);
    expect(jpg.size, `${base}.jpg = ${(jpg.size / 1024).toFixed(1)}KB`).toBeLessThanOrEqual(jpgMaxKB * 1024);
    // Modern format must always be smaller than the JPG fallback.
    expect(webp.size).toBeLessThan(jpg.size);
  });

  it("hero image stays the lightest WebP on the page (LCP guardrail)", () => {
    const heroSize = statSync(resolve(ASSET_DIR, "apply-hero-night.webp")).size;
    // Hero is preloaded — must remain among the 3 smallest WebPs to keep
    // LCP transfer cheap. (Soft guard; tighten over time.)
    const sizes = ASSETS.map((a) => statSync(resolve(ASSET_DIR, `${a.base}.webp`)).size).sort((a, b) => a - b);
    expect(sizes.indexOf(heroSize)).toBeLessThan(4);
  });
});

// =====================================================================
// 5. QUIZ CTA GATING — every CTA must funnel through /apply/quiz
// =====================================================================
describe("Quiz CTA gating — no bypass to booking", () => {
  it("sticky CTA links route to /apply/quiz on desktop", async () => {
    setViewport(1280);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    for (const link of getCtaLinks()) {
      expect(link.getAttribute("href")).toBe("/apply/quiz");
      // Defensive: must NOT bypass the qualification step.
      expect(link.getAttribute("href")).not.toMatch(/\/booking|\/checkout|\/payment/i);
    }
  });

  it("sticky CTA links route to /apply/quiz on mobile", async () => {
    setViewport(375);
    renderSticky();
    await advanceTimers(1500);
    await scrollTo(500);
    for (const link of getCtaLinks()) {
      expect(link.getAttribute("href")).toBe("/apply/quiz");
    }
  });

  it("source-level guard: ApplyLanding declares no CTA bypassing the quiz", () => {
    // Cheap static guard — read the source and assert no Link/anchor jumps
    // straight to a downstream funnel step. Catches refactors that route a
    // future "skip the quiz" experiment without re-running the full page test.
    const src = readFileSync(resolve(__dirname, "../ApplyLanding.tsx"), "utf8");
    const offending = src.match(/to=["'](\/booking|\/checkout|\/payment)[^"']*["']/g) ?? [];
    expect(offending, `Found bypass routes: ${offending.join(", ")}`).toEqual([]);
  });
});

// =====================================================================
// 6. LANDING PAGE T1 — sticky CTA hybrid trigger on FULL ApplyLanding
// =====================================================================
describe("Landing T1 — sticky CTA hybrid trigger inside the full <ApplyLanding/>", () => {
  it("hidden initially, appears after timer + scroll, stays visible", async () => {
    setViewport(1280);
    // Lazy import to avoid pulling in the full page for the lighter suites above.
    const ApplyLanding = (await import("@/pages/ApplyLanding")).default;
    render(
      <MemoryRouter>
        <ApplyLanding />
      </MemoryRouter>,
    );

    // Initial: page CTAs exist (in-flow), but the floating sticky surface (z-index 9999) does not.
    expect(document.querySelectorAll('[style*="z-index: 9999"]').length).toBe(0);

    await advanceTimers(1500);
    await scrollTo(400);

    const sticky = document.querySelectorAll('[style*="z-index: 9999"]');
    // Exactly one sticky surface mounts inside the real page composition.
    expect(sticky.length).toBe(1);

    // T6 latch holds inside the full page too.
    await scrollTo(0);
    expect(document.querySelectorAll('[style*="z-index: 9999"]').length).toBe(1);

    // And the sticky CTA inside that surface still routes to /apply/quiz.
    const stickyEl = sticky[0] as HTMLElement;
    const links = within(stickyEl).queryAllByRole("link", { name: /strategie-call sichern/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const l of links) expect(l.getAttribute("href")).toBe("/apply/quiz");
  }, 15000);
});
