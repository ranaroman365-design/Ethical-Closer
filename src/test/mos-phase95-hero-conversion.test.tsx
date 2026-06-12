/**
 * Phase 9.5 — Conversion-First Hero regression test.
 *
 * Asserts the additive Phase 9.5 hero contract:
 *   • renders the exact Phase 9.5 spec copy (eyebrow, headline, sub, trust)
 *   • secondary social-proof microtext is present
 *   • CTA is a Link pointing to the canonical quiz entry (MEN_QUIZ_PATH)
 *   • HeroBackgroundLayer is mounted (full-bleed background via existing
 *     `mos_hero_human_proof` Thompson Sampling slot — no new logic)
 *   • new CTA copy variants D_eignung / E_karriereweg / F_assessment /
 *     G_passt / H_2min are registered in QUIZ_CTA_ANGLE_COPY
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HeroMosConversion from "@/components/masterofsales/HeroMosConversion";

// HeroBackgroundLayer pulls AB infra + CDN imports; stub it.
vi.mock("@/components/masterofsales/HeroBackgroundLayer", () => ({
  default: () => <div data-testid="hero-background-layer" />,
}));

vi.mock("@/lib/mos-cro-events", () => ({
  fireMosCroEvent: vi.fn(),
}));

describe("Phase 9.5 — HeroMosConversion", () => {
  const renderHero = () =>
    render(
      <MemoryRouter>
        <HeroMosConversion
          heroHref="/apply/quiz?aud=men"
          onCtaClick={() => {}}
          ctaLabel="Closing-Eignung prüfen"
          variantKey="cta:D_eignung"
        />
      </MemoryRouter>,
    );

  it("renders the spec eyebrow", () => {
    renderHero();
    expect(screen.getByText("ETHICAL TOP CLOSER™")).toBeInTheDocument();
  });

  it("renders the full 3-line spec headline", () => {
    renderHero();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("Prüfe in 2 Minuten,");
    expect(h1.textContent).toContain("ob eine Karriere im Closing");
    expect(h1.textContent).toContain("wirklich zu dir passt.");
  });

  it("renders the spec subheadline mentioning Karriereweg / keine Lifestyle-Illusionen", () => {
    renderHero();
    expect(
      screen.getByText(/Keine Lifestyle-Illusionen/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Karriereweg/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders all three micro-trust items", () => {
    renderHero();
    expect(screen.getByText("Kostenlos")).toBeInTheDocument();
    expect(screen.getByText("2 Minuten")).toBeInTheDocument();
    expect(screen.getByText("Sofortiges Ergebnis")).toBeInTheDocument();
  });

  it("renders the secondary social-proof microtext", () => {
    renderHero();
    expect(
      screen.getByText(
        /Über 1\.000 Teilnehmer haben ihren Karriereweg geprüft\./,
      ),
    ).toBeInTheDocument();
  });

  it("renders the CTA as a Link pointing to the canonical quiz href", () => {
    renderHero();
    const cta = screen.getByRole("link", { name: /Closing-Eignung prüfen/i });
    expect(cta).toHaveAttribute("href", "/apply/quiz?aud=men");
  });

  it("mounts HeroBackgroundLayer (drives mos_hero_human_proof unchanged)", () => {
    renderHero();
    expect(screen.getByTestId("hero-background-layer")).toBeInTheDocument();
  });

  it("declares the conversion variant on the section for tracking", () => {
    const { container } = renderHero();
    const section = container.querySelector('[data-mos-section="hero"]');
    expect(section).not.toBeNull();
    expect(section?.getAttribute("data-hero-variant")).toBe("mos_conversion");
    expect(section?.getAttribute("data-conversion-variant")).toBe(
      "cta:D_eignung",
    );
  });
});

describe("Phase 9.5 — new CTA copy variants are registered", () => {
  it("exposes D_eignung / E_karriereweg / F_assessment / G_passt / H_2min in MasterOfSales page module", async () => {
    // Read the source as text to avoid pulling the giant page module into the test sandbox.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/MasterOfSales.tsx", "utf8");
    expect(src).toContain('D_eignung: "Closing-Eignung prüfen"');
    expect(src).toContain('E_karriereweg: "Karriereweg prüfen"');
    expect(src).toContain('F_assessment: "Kostenloses Assessment starten"');
    expect(src).toContain('G_passt: "Passt Closing zu dir?"');
    expect(src).toContain('H_2min: "In 2 Minuten herausfinden"');
  });
});
