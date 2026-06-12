/**
 * E2E-Test: Meta Pixel PageView per Navigation
 *
 * Verifiziert:
 *  1. Bei erstem Laden ⇒ genau EINE PageView (vom HTML-Snippet in index.html;
 *     der MetaPixelRouteListener überspringt den Initial-Render).
 *  2. Bei jedem SPA-Routewechsel ⇒ genau EINE zusätzliche PageView via fbq().
 *  3. Bei wiederholtem Render auf derselben Route ⇒ KEINE Duplikate.
 *
 * Wir bauen den HTML-Initial-PageView nach, indem wir vor dem Mount EIN
 * fbq('track','PageView')-Aufruf simulieren — exakt so wie es das Snippet in
 * index.html bei einem Cold-Load tut. Der Listener wird dann gemountet und
 * darf den Initial-Render NICHT erneut tracken.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import MetaPixelRouteListener from "@/components/MetaPixelRouteListener";

type FbqCall = unknown[];

function installFbqMock(opts: { consent?: boolean } = {}): {
  calls: FbqCall[];
  reset: () => void;
} {
  const calls: FbqCall[] = [];
  const fbq = vi.fn((...args: unknown[]) => {
    calls.push(args);
  });
  (window as unknown as { fbq: unknown }).fbq = fbq;
  // Pixel-ID, damit trackPixelEvent durchgeht.
  (window as unknown as { __META_PIXEL_ID__?: string }).__META_PIXEL_ID__ =
    "788225560805467";
  // Consent-Gate: per Default an (sonst feuert trackPixelEvent kein fbq).
  (window as unknown as { __metaPixelActivated__?: boolean }).__metaPixelActivated__ =
    opts.consent ?? true;
  return {
    calls,
    reset: () => {
      calls.length = 0;
      (fbq as unknown as { mockClear: () => void }).mockClear();
    },
  };
}

function countPageViews(calls: FbqCall[]): number {
  return calls.filter((a) => {
    // Direct snippet form: fbq('track'|'trackCustom', 'PageView', ...)
    if ((a[0] === "track" || a[0] === "trackCustom") && a[1] === "PageView") return true;
    // Route-scoped form: fbq('trackSingle'|'trackSingleCustom', pixelId, 'PageView', ...)
    if ((a[0] === "trackSingle" || a[0] === "trackSingleCustom") && a[2] === "PageView") return true;
    return false;
  }).length;
}

describe("Meta Pixel — PageView per navigation", () => {
  beforeEach(() => {
    // Reset Listener-Internals (the _primed flag persists across tests).
    (MetaPixelRouteListener as unknown as { _primed?: boolean })._primed =
      false;
    // sessionStorage clear, damit event_id-Index frisch ist.
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("Cold load: genau 1 PageView (HTML-Snippet), Listener fügt KEINEN dupe hinzu", () => {
    const { calls } = installFbqMock();

    // 1) Simuliere den HTML-Snippet-PageView.
    window.fbq?.("init", "788225560805467");
    window.fbq?.("track", "PageView");
    expect(countPageViews(calls)).toBe(1);

    // 2) Mount Listener — darf Initial NICHT erneut tracken.
    render(
      <MemoryRouter initialEntries={["/"]}>
        <MetaPixelRouteListener />
      </MemoryRouter>
    );

    expect(countPageViews(calls)).toBe(1);
  });

  it("SPA-Routewechsel: jede Navigation feuert genau 1 zusätzliche PageView", async () => {
    const { calls, reset } = installFbqMock();

    // Initial-PageView aus dem HTML-Snippet.
    window.fbq?.("track", "PageView");
    expect(countPageViews(calls)).toBe(1);

    let navigateRef: ((to: string) => void) | null = null;
    function CaptureNavigate() {
      navigateRef = useNavigate();
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <MetaPixelRouteListener />
        <CaptureNavigate />
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/apply" element={<div>apply</div>} />
          <Route path="/apply/quiz" element={<div>quiz</div>} />
          <Route path="/booking" element={<div>booking</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Initial-Mount: Listener skipped → noch immer 1 PageView gesamt.
    expect(countPageViews(calls)).toBe(1);

    reset();

    // Jede Navigation = exakt 1 PageView.
    await act(async () => {
      navigateRef?.("/apply");
    });
    expect(countPageViews(calls)).toBe(1);

    await act(async () => {
      navigateRef?.("/apply/quiz");
    });
    expect(countPageViews(calls)).toBe(2);

    await act(async () => {
      navigateRef?.("/booking");
    });
    expect(countPageViews(calls)).toBe(3);
  });

  it("Wiederholter Render auf derselben Route: KEINE Duplikate", async () => {
    const { calls, reset } = installFbqMock();
    window.fbq?.("track", "PageView"); // HTML-Snippet
    reset();

    let navigateRef: ((to: string) => void) | null = null;
    function CaptureNavigate() {
      navigateRef = useNavigate();
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <MetaPixelRouteListener />
        <CaptureNavigate />
      </MemoryRouter>
    );

    await act(async () => {
      navigateRef?.("/apply");
    });
    expect(countPageViews(calls)).toBe(1);

    // Re-navigation auf die GLEICHE Route → ROUTE_VIEW de-dupes auf path-Ebene.
    await act(async () => {
      navigateRef?.("/apply");
    });
    expect(countPageViews(calls)).toBe(1);

    // Echte neue Route → 1 weiterer PageView.
    await act(async () => {
      navigateRef?.("/apply/quiz");
    });
    expect(countPageViews(calls)).toBe(2);
  });

  it("Drei Navigationen hintereinander = genau 3 PageViews (kein Drift)", async () => {
    const { calls, reset } = installFbqMock();
    window.fbq?.("track", "PageView");
    reset();

    function Sequence() {
      const navigate = useNavigate();
      useEffect(() => {
        navigate("/apply");
        setTimeout(() => navigate("/apply/quiz"), 0);
        setTimeout(() => navigate("/booking"), 0);
      }, [navigate]);
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <MetaPixelRouteListener />
        <Sequence />
      </MemoryRouter>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(countPageViews(calls)).toBe(3);
  });
});
