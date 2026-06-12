/**
 * LP A/B Preview — Admin-only staging view.
 *
 * Renders LP V1 and LP V2 hero variants side-by-side in isolation.
 * - No quiz auto-start, no Pixel events, no allocator hit.
 * - Viewport toggle (Mobile / Tablet / Desktop) for responsive QA.
 * - Direct deep-links to live `?lp=v1` / `?lp=v2` for in-context QA.
 *
 * STRICTLY ADDITIVE. Not linked from sidebar/sitemap. Admin-only via
 * <ProtectedRoute requireAdmin>.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import HeroLpV2 from "@/components/landing/HeroLpV2";
import MiniCareerFlow from "@/components/landing/MiniCareerFlow";
import { useLanguage } from "@/i18n/LanguageContext";

type Viewport = "mobile" | "tablet" | "desktop";

const WIDTHS: Record<Viewport, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
};

/**
 * Inline LP V1 hero — copy of the V1 markup in RootRouterV3 with
 * tracking + Links stripped out so previews don't hit the funnel.
 */
function HeroLpV1Preview() {
  const { tx } = useLanguage();
  return (
    <section data-hero-variant="lp_v1" className="border-b border-border/40 bg-background">
      <div className="container mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
          <div className="text-left">
            <p className="mb-5 font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Ethical Top Closer · Performance-System
            </p>
            <h1 className="font-serif text-4xl font-medium leading-[1.1] text-foreground md:text-5xl lg:text-6xl">
              {tx("Werde High-Ticket Closer —", "Become a high-ticket closer —")}
              <br />
              <span className="text-muted-foreground">
                {tx("über einen strukturierten, bezahlten Karriereweg.", "through a structured, paid progression.")}
              </span>
            </h1>
            <p className="mt-6 font-sans text-lg leading-relaxed text-foreground/80 md:text-xl">
              {tx("Lernen. Anwenden. Verdienen.", "Learn. Apply. Earn.")}
            </p>
            <p className="mt-2 font-sans text-base leading-relaxed text-muted-foreground md:text-lg">
              {tx(
                "Schritt für Schritt vom Bewerber zum platzierten Closer — innerhalb eines echten Systems.",
                "Move step by step from applicant to placed closer — inside a real system.",
              )}
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm text-foreground/80">
              <li className="flex items-center gap-2"><span className="text-[hsl(var(--accent))]">✓</span> Structured path</li>
              <li className="flex items-center gap-2"><span className="text-[hsl(var(--accent))]">✓</span> Real client calls</li>
              <li className="flex items-center gap-2"><span className="text-[hsl(var(--accent))]">✓</span> Performance-based income</li>
            </ul>
          </div>
          <div className="md:pl-4">
            <MiniCareerFlow />
          </div>
        </div>
        <div className="mt-12 flex flex-col items-center justify-center gap-3 md:mt-16">
          <p className="mb-2 max-w-xl text-center font-serif text-base italic leading-snug text-foreground/80 md:text-lg">
            {tx(
              "Die wenigsten erreichen dieses Level. Nicht weil sie es nicht könnten — sondern weil sie nie ein System wie dieses betreten.",
              "Most people never reach this level. Not because they can't — but because they never enter a system like this.",
            )}
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <span className="inline-flex items-center justify-center rounded-sm bg-primary px-8 py-4 text-base font-medium tracking-wide text-primary-foreground opacity-80">
              {tx("Eignung prüfen", "Check eligibility")}
            </span>
            <span className="inline-flex items-center justify-center rounded-sm border border-border bg-transparent px-6 py-3 text-sm font-medium text-foreground/80">
              {tx("Erst verstehen → Masterclass", "Understand first → Masterclass")}
            </span>
          </div>
          <p className="font-sans text-xs text-muted-foreground">
            {tx("Unter 2 Minuten · Keine Verpflichtung", "Takes less than 2 minutes · No commitment")}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function LpAbPreview() {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [singleView, setSingleView] = useState<"split" | "v1" | "v2">("split");
  const width = WIDTHS[viewport];

  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="font-serif text-xl font-medium text-foreground">LP A/B Preview</h1>
            <p className="text-xs text-muted-foreground">
              Isolated preview · no tracking · no allocator hit · admin-only
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View selector */}
            <div className="flex overflow-hidden rounded-sm border border-border">
              {(["split", "v1", "v2"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSingleView(v)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    singleView === v
                      ? "bg-foreground text-background"
                      : "bg-transparent text-foreground/70 hover:bg-muted"
                  }`}
                >
                  {v === "split" ? "Split" : v.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Viewport selector */}
            <div className="flex overflow-hidden rounded-sm border border-border">
              {(["mobile", "tablet", "desktop"] as const).map((vp) => (
                <button
                  key={vp}
                  onClick={() => setViewport(vp)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewport === vp
                      ? "bg-foreground text-background"
                      : "bg-transparent text-foreground/70 hover:bg-muted"
                  }`}
                >
                  {vp} · {WIDTHS[vp]}px
                </button>
              ))}
            </div>

            {/* Live deep-links */}
            <div className="flex gap-2">
              <Link
                to="/?lp=v1"
                target="_blank"
                rel="noreferrer"
                className="rounded-sm border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted"
              >
                Live V1 ↗
              </Link>
              <Link
                to="/?lp=v2"
                target="_blank"
                rel="noreferrer"
                className="rounded-sm border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted"
              >
                Live V2 ↗
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Preview area */}
      <main className="container mx-auto px-6 py-8">
        <div
          className={
            singleView === "split"
              ? "grid gap-6 lg:grid-cols-2"
              : "flex justify-center"
          }
        >
          {(singleView === "split" || singleView === "v1") && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  LP V1 · Control
                </h2>
                <span className="text-[10px] text-muted-foreground">{width}px</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <div style={{ width: `${width}px`, maxWidth: "100%" }}>
                  <HeroLpV1Preview />
                </div>
              </div>
            </div>
          )}

          {(singleView === "split" || singleView === "v2") && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  LP V2 · Treatment
                </h2>
                <span className="text-[10px] text-muted-foreground">{width}px</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <div style={{ width: `${width}px`, maxWidth: "100%" }}>
                  <HeroLpV2 />
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="mt-12 border-t border-border/40 pt-6 text-xs text-muted-foreground">
          <p>
            <strong>Hinweis:</strong> Diese Seite emittiert keine Tracking-Events
            und beeinflusst die Live-Allocation nicht. Für QA in echtem Kontext
            die Live-Links oben benutzen (<code>?lp=v1</code> /{" "}
            <code>?lp=v2</code>) — diese Sessions werden im Rollup mit{" "}
            <code>forced=true</code> markiert und kontaminieren keine KPIs.
          </p>
        </footer>
      </main>
    </div>
  );
}
