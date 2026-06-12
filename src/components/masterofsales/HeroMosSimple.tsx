/**
 * HeroMosSimple — radikal vereinfachter Hero (Above-the-fold).
 *
 * STRICTLY ADDITIVE. Rendered only when the MOS-gated slot `mos_simple_hero`
 * resolves to a non-control variant. CTA target + click handler are owned
 * by the parent (same `heroHref` + `onCtaClick` as V1/V2), so tracking,
 * attribution, Pixel/CAPI, master-funnel-id, and quiz routing stay 1:1.
 *
 * Hero rule:
 *   1 Eyebrow · 1 Headline · 1 Subline · 1 CTA · 1 Micro-Trust-Zeile.
 *   Keine Bullets, keine zweite Sektion vor dem CTA.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { fireMosCroEvent } from "@/lib/mos-cro-events";
import HeroBackgroundLayer from "./HeroBackgroundLayer";

export interface HeroMosSimpleProps {
  heroHref: string;
  onCtaClick: () => void;
  headline: string;
  subline: string;
  cta: string;
  microTrust: string;
  variantId: string;
}

export default function HeroMosSimple({
  heroHref,
  onCtaClick,
  headline,
  subline,
  cta,
  microTrust,
  variantId,
}: HeroMosSimpleProps) {
  useEffect(() => {
    fireMosCroEvent("MASTER_SIMPLE_HERO_VIEW", variantId, {
      headline: headline.slice(0, 80),
    });
  }, [variantId, headline]);

  return (
    <section
      data-mos-section="hero"
      data-hero-variant="mos_simple"
      data-simple-hero-variant={variantId}
      className="relative isolate overflow-hidden"
    >
      <HeroBackgroundLayer />

      <div className="mx-auto grid min-h-[88vh] max-w-6xl grid-cols-1 items-center gap-10 px-6 pb-20 pt-24 md:min-h-[82vh] md:grid-cols-12 md:gap-12 md:py-24 lg:gap-16">
        <div className="md:col-span-8 flex flex-col justify-center">
          <p className="mb-4 text-[10px] uppercase tracking-[0.32em] text-foreground/70 sm:text-xs">
            Ethical Top Closer™
          </p>

          <h1 className="font-serif text-[2.2rem] leading-[1.08] tracking-tight md:text-6xl">
            {headline}
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/85 md:text-lg">
            {subline}
          </p>

          <div className="mt-9">
            <Link
              to={heroHref}
              onClick={onCtaClick}
              className="group inline-flex min-h-[52px] w-full max-w-[420px] items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
            >
              {cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-foreground/60 sm:text-xs">
              {microTrust}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
