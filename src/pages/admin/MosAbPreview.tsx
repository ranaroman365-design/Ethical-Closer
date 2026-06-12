/**
 * MOS A/B Preview — Admin-only staging view for /masterofsales.
 *
 * Renders the V1 (live) hero and the V2 (HeroMosV2) hero side-by-side
 * in isolation. No quiz auto-start, no Pixel events, no allocator hit,
 * no funnel mutation. Deep-links open the live page with the force
 * param (`?mos=v1` / `?mos=v2`) — those sessions are flagged
 * `forced=true` and EXCLUDED from the rollup.
 *
 * STRICTLY ADDITIVE. Not linked from any sidebar/sitemap. Admin-only
 * via <ProtectedRoute requireAdmin> at /preview/mos-ab.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar } from "lucide-react";
import HeroMosV2 from "@/components/masterofsales/HeroMosV2";
import TopImpactExperimentsPanel from "@/components/admin/TopImpactExperimentsPanel";
import LpOptimizationPanel from "@/components/admin/LpOptimizationPanel";
import heroImg from "@/assets/mos-hero-horizon.jpg";

type Viewport = "mobile" | "tablet" | "desktop";

const WIDTHS: Record<Viewport, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
};

/**
 * Inline MOS V1 hero — visually faithful copy of the live hero in
 * MasterOfSales.tsx with all tracking/Links stripped so previews never
 * touch the live funnel.
 */
function MosHeroV1Preview() {
  return (
    <section
      data-hero-variant="mos_v1"
      className="relative isolate overflow-hidden bg-[hsl(0_0%_6%)] text-[hsl(36_18%_92%)]"
    >
      <div className="absolute inset-0 -z-10">
        <img
          src={heroImg}
          alt="Ruhiger, fokussierter junger Mann blickt im goldenen Licht über das Meer."
          className="h-full w-full object-cover opacity-60"
          width={1920}
          height={1080}
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(0_0%_6%)] via-[hsl(0_0%_6%/0.7)] to-[hsl(0_0%_6%/0.3)]" />
      </div>
      <div className="mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-center px-6 pb-20 pt-28 md:min-h-[72vh] md:px-10 md:py-24">
        <p className="mb-3 text-[10px] uppercase tracking-[0.32em] text-foreground/70">
          Ethical Top Closer™
        </p>
        <p className="mb-5 text-[11px] uppercase tracking-[0.3em] text-[hsl(42_50%_56%)]">
          Das Leistungs-Nachweis-System™
        </p>
        <h1 className="font-serif text-[2.4rem] leading-[1.05] tracking-tight md:text-7xl lg:text-[5.5rem] max-w-3xl">
          Werde Ethical Top Closer™
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-relaxed text-foreground/85 md:text-lg">
          Lerne eine der bestbezahlten Fähigkeiten, die Unternehmen weltweit
          händeringend suchen. Arbeite von überall. Bestimme selbst, wann,
          wo und mit wem du arbeitest.
        </p>
        <p className="mt-7 text-sm font-medium uppercase tracking-[0.28em] text-[hsl(42_50%_56%)]">
          Learn → Earn → Top Job Placements™
        </p>
        <div className="mt-10">
          <span className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[hsl(36_18%_92%)] px-8 py-4 text-sm font-medium tracking-wide text-[hsl(0_0%_6%)] opacity-80">
            <Calendar className="h-4 w-4" />
            Closer Readiness Call™ starten
          </span>
        </div>
      </div>
    </section>
  );
}

export default function MosAbPreview() {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [singleView, setSingleView] = useState<"split" | "v1" | "v2">("split");
  const width = WIDTHS[viewport];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="font-serif text-xl font-medium text-foreground">
              MasterOfSales A/B Preview
            </h1>
            <p className="text-xs text-muted-foreground">
              Isolated preview · no tracking · no allocator hit · admin-only
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

            <div className="flex gap-2">
              <Link
                to="/masterofsales?mos=v1"
                target="_blank"
                rel="noreferrer"
                className="rounded-sm border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted"
              >
                Live V1 ↗
              </Link>
              <Link
                to="/masterofsales?mos=v2"
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

      <main className="container mx-auto px-6 py-8 space-y-8">
        <TopImpactExperimentsPanel />
        <LpOptimizationPanel />
        <div
          className={
            singleView === "split" ? "grid gap-6 lg:grid-cols-2" : "flex justify-center"
          }
        >
          {(singleView === "split" || singleView === "v1") && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  MOS V1 · Control
                </h2>
                <span className="text-[10px] text-muted-foreground">{width}px</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <div style={{ width: `${width}px`, maxWidth: "100%" }}>
                  <MosHeroV1Preview />
                </div>
              </div>
            </div>
          )}

          {(singleView === "split" || singleView === "v2") && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  MOS V2 · Treatment (diagnose-first)
                </h2>
                <span className="text-[10px] text-muted-foreground">{width}px</span>
              </div>
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <div
                  style={{ width: `${width}px`, maxWidth: "100%" }}
                  className="bg-[hsl(0_0%_6%)] text-[hsl(36_18%_92%)]"
                >
                  <HeroMosV2
                    heroHref="#preview"
                    onCtaClick={() => {
                      /* no-op: preview never hits the funnel */
                    }}
                    heroQuizCtaText="Closer Readiness Call™ starten"
                    riskCopyText="Keine Zahlung · Keine Verpflichtung · Ehrliche Auswertung"
                    microTrustText="Persönliche Auswahl · Begrenzte Plätze"
                    heroImageSrc={heroImg}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="mt-12 border-t border-border/40 pt-6 text-xs text-muted-foreground">
          <p>
            <strong>Hinweis:</strong> Diese Seite emittiert keine
            Tracking-Events und beeinflusst die Live-Allocation nicht. Für QA
            im echten Kontext die Live-Links oben benutzen (
            <code>?mos=v1</code> / <code>?mos=v2</code>) — diese Sessions
            werden als <code>forced</code> markiert und sind vom Rollup
            ausgeschlossen.
          </p>
        </footer>
      </main>
    </div>
  );
}
