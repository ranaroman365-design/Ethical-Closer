/**
 * Consent-Gate-Tests: Meta Pixel darf NICHT vor Opt-in feuern, und nach
 * Opt-in entsteht GENAU EINE PageView (kein Duplikat aus dem Route-Listener).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import MetaPixelRouteListener from "@/components/MetaPixelRouteListener";
import { trackPixelEvent } from "@/lib/meta-pixel";
import {
  CONSENT_KEY,
  grantPixelConsent,
  revokePixelConsent,
  hasPixelConsent,
} from "@/lib/meta-pixel-consent";

type FbqCall = unknown[];

function installFbqMock() {
  const calls: FbqCall[] = [];
  const fbq = vi.fn((...args: unknown[]) => {
    calls.push(args);
  });
  (window as unknown as { fbq: unknown }).fbq = fbq;
  (window as unknown as { __META_PIXEL_ID__?: string }).__META_PIXEL_ID__ =
    "788225560805467";
  return calls;
}

function countPageViews(calls: FbqCall[]): number {
  return calls.filter(
    (a) => (a[0] === "track" || a[0] === "trackCustom") && a[1] === "PageView"
  ).length;
}

describe("Meta Pixel — Consent Gate", () => {
  beforeEach(() => {
    (MetaPixelRouteListener as unknown as { _primed?: boolean })._primed = false;
    (window as unknown as { __metaPixelActivated__?: boolean }).__metaPixelActivated__ = false;
    try {
      window.localStorage.removeItem(CONSENT_KEY);
      window.sessionStorage.clear();
    } catch { /* ignore */ }
    delete (window as unknown as { fbq?: unknown }).fbq;
  });

  it("Ohne Consent feuert trackPixelEvent KEIN fbq", () => {
    const calls = installFbqMock();
    // Kein grantPixelConsent → Gate blockt.
    trackPixelEvent("ROUTE_VIEW", { path: "/apply" });
    trackPixelEvent("LEAD_CAPTURED", { lead_id: "x" });
    expect(calls.length).toBe(0);
  });

  it("Ohne Consent feuern auch SPA-Routewechsel KEIN fbq", async () => {
    const calls = installFbqMock();

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
    await act(async () => {
      navigateRef?.("/booking");
    });

    expect(calls.length).toBe(0);
  });

  it("Nach grantPixelConsent: GENAU 1 PageView pro Page-Load (Listener dupliziert nicht)", async () => {
    const calls = installFbqMock();

    // Cold load: Visitor ist auf "/" und akzeptiert.
    grantPixelConsent();
    // grantPixelConsent feuert über trackPixelEvent('ROUTE_VIEW', {path:'/'})
    // Der jsdom default-pathname ist "/" oder "blank" — wir prüfen nur Anzahl.
    const afterGrant = countPageViews(calls);
    expect(afterGrant).toBe(1);
    expect(hasPixelConsent()).toBe(true);

    // Listener mountet, primed-Skip auf Initial-Render → KEIN dup.
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
    expect(countPageViews(calls)).toBe(1);

    // Echte Navigation → 1 weiterer PageView.
    await act(async () => {
      navigateRef?.("/apply");
    });
    expect(countPageViews(calls)).toBe(2);
  });

  it("Doppeltes grantPixelConsent ist idempotent (kein zweiter PageView)", () => {
    const calls = installFbqMock();
    grantPixelConsent();
    grantPixelConsent();
    grantPixelConsent();
    expect(countPageViews(calls)).toBe(1);
  });

  it("revokePixelConsent persistiert 'declined' und stoppt zukünftige Events", () => {
    const calls = installFbqMock();
    grantPixelConsent();
    // (Wir prüfen hier nicht den Activation-PageView — Modul-Internals
    // dedupen pfadgleiche Events über Test-Grenzen hinweg. Wichtig ist nur
    // das Verhalten nach Revoke.)

    revokePixelConsent();
    (window as unknown as { __metaPixelActivated__?: boolean }).__metaPixelActivated__ = false;
    const before = countPageViews(calls);

    trackPixelEvent("LEAD_CAPTURED", { lead_id: "y" });
    trackPixelEvent("ROUTE_VIEW", { path: "/__revoke_test__" });

    expect(countPageViews(calls)).toBe(before); // unverändert
    expect(hasPixelConsent()).toBe(false);
  });
});
