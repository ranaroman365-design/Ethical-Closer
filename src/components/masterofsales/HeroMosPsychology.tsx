/**
 * HeroMosPsychology — Phase 9 LP→Quiz Start optimization.
 *
 * STRICTLY ADDITIVE · MOS-gated. Renders only when at least one of the
 * psychology slots resolves to a non-control variant. Theme-driven hero
 * (trust · transparency · control · risk_reduction). Mobile-first: CTA
 * guaranteed above the fold (min-h-[100svh]).
 *
 * NO changes to quiz, booking, CRM, GHL, routing, attribution, or scoring.
 * CTA target + click handler are owned by the parent (`MasterOfSales.tsx`).
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { fireMosCroEvent } from "@/lib/mos-cro-events";
import HeroBackgroundLayer from "./HeroBackgroundLayer";

export interface PsychologyHeroCopy {
  headline: string;
  subline?: string;
  microTrust?: string;
  cta: string;
}

export interface HeroMosPsychologyProps {
  heroHref: string;
  onCtaClick: () => void;
  copy: PsychologyHeroCopy;
  /** Concatenated variant key for tracking, e.g. `hl:trust|cta:risk_reduction`. */
  variantKey: string;
  /** Combined theme tag, e.g. `trust`, `trust+transparency`. */
  themeKey: string;
}

export default function HeroMosPsychology({
  heroHref,
  onCtaClick,
  copy,
  variantKey,
  themeKey,
}: HeroMosPsychologyProps) {
  useEffect(() => {
    fireMosCroEvent("MASTER_LP_PSYCHOLOGY_HERO_VIEW", variantKey, {
      theme: themeKey,
    });
  }, [variantKey, themeKey]);

  const handle = () => {
    fireMosCroEvent("MASTER_LP_PSYCHOLOGY_CTA_CLICK", variantKey, {
      theme: themeKey,
    });
    onCtaClick();
  };

  return (
    <section
      data-mos-section="hero"
      data-hero-variant="mos_psychology"
      data-psychology-variant={variantKey}
      data-psychology-theme={themeKey}
      className="relative isolate overflow-hidden"
    >
      <HeroBackgroundLayer />

      {/* min-h-[100svh] guarantees CTA above the fold on mobile (small-vh aware) */}
      <div className="mx-auto grid min-h-[100svh] max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 md:min-h-[82vh] md:grid-cols-12 md:gap-12 md:py-24 lg:gap-16">
        <div className="md:col-span-8 flex flex-col justify-center">
          <h1 className="font-serif text-[2rem] leading-[1.1] tracking-tight md:text-5xl">
            {copy.headline}
          </h1>

          {copy.subline && (
            <p className="mt-5 text-base text-foreground/80 md:text-lg">
              {copy.subline}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <Link
              to={heroHref}
              onClick={handle}
              className="group inline-flex min-h-[56px] w-full max-w-[420px] items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
            >
              {copy.cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>

            {copy.microTrust && (
              <p className="text-xs text-foreground/65 md:text-sm">
                {copy.microTrust}
              </p>
            )}
          </div>
        </div>
      </div>


    </section>
  );
}
