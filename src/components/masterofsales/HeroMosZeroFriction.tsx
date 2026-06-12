/**
 * HeroMosZeroFriction — ultra-reduzierter Hero zur LP→Quiz Conversion Optimierung.
 *
 * STRICTLY ADDITIVE. Rendered only when MOS-gated slot `mos_lp_zero_friction_hero`
 * resolves to a non-control variant. `heroHref` + `onCtaClick` werden vom Parent
 * verwaltet — gleiches Quiz-Routing, gleiches Tracking, gleiche Attribution.
 *
 * Variants:
 *   A — Headline + 3 Bullets + CTA
 *   B — Längere Headline (zwei Zeilen) + 3 Bullets + CTA
 *   C — Aufmerksamkeitsstarke Headline (zwei Zeilen) + 3 Bullets + CTA
 *   D — MAXIMAL REDUZIERT: Headline + 2 Mini-Lines + CTA, keine Bullets, keine Subline.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { fireMosCroEvent } from "@/lib/mos-cro-events";
import HeroBackgroundLayer from "./HeroBackgroundLayer";

export interface ZeroFrictionVariantCopy {
  headline: string | string[]; // string[] = multi-line
  bullets: string[]; // empty for variant D (uses miniLines)
  miniLines?: string[]; // variant D only
  cta: string;
  ultraMinimal?: boolean;
}

export interface HeroMosZeroFrictionProps {
  heroHref: string;
  onCtaClick: () => void;
  variantId: string;
  copy: ZeroFrictionVariantCopy;
}

export default function HeroMosZeroFriction({
  heroHref,
  onCtaClick,
  variantId,
  copy,
}: HeroMosZeroFrictionProps) {
  useEffect(() => {
    fireMosCroEvent("MASTER_ZERO_FRICTION_HERO_VIEW", variantId, {
      ultra_minimal: !!copy.ultraMinimal,
    });
  }, [variantId, copy.ultraMinimal]);

  const handleCta = () => {
    fireMosCroEvent("MASTER_ZERO_FRICTION_HERO_CTA_CLICK", variantId);
    onCtaClick();
  };

  const headlineLines = Array.isArray(copy.headline)
    ? copy.headline
    : [copy.headline];

  // Variant D: maximal reduziert, oben angeschlagen, ohne Scroll-CTA.
  if (copy.ultraMinimal) {
    return (
      <section
        data-mos-section="hero"
        data-hero-variant="mos_zero_friction"
        data-zero-friction-variant={variantId}
        className="relative isolate overflow-hidden"
      >
        <HeroBackgroundLayer />
        <div className="mx-auto grid min-h-[88vh] max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 md:min-h-[82vh] md:grid-cols-12 md:gap-12 md:py-24 lg:gap-16">
          <div className="md:col-span-8 flex flex-col items-center text-center md:items-start md:text-left">
            <h1 className="font-serif text-[1.9rem] leading-[1.1] tracking-tight md:text-5xl">
              {headlineLines.map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </h1>

            {(copy.miniLines ?? []).length > 0 && (
              <div className="mt-6 space-y-1.5 text-sm text-foreground/75 md:text-base">
                {copy.miniLines!.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}

            <Link
              to={heroHref}
              onClick={handleCta}
              className="group mt-8 inline-flex min-h-[56px] w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-base font-medium tracking-wide text-background transition hover:opacity-90"
            >
              {copy.cta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Variants A/B/C — Headline + 3 Bullets + CTA, kompakt above the fold.
  return (
    <section
      data-mos-section="hero"
      data-hero-variant="mos_zero_friction"
      data-zero-friction-variant={variantId}
      className="relative isolate overflow-hidden"
    >
      <HeroBackgroundLayer />
      <div className="mx-auto flex min-h-[88vh] max-w-3xl flex-col justify-center px-6 pb-20 pt-24 md:min-h-[82vh] md:py-24">
        <h1 className="font-serif text-[2rem] leading-[1.1] tracking-tight md:text-5xl">
          {headlineLines.map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </h1>




        <ul className="mt-7 space-y-2.5">
          {copy.bullets.map((b) => (
            <li
              key={b}
              className="flex items-center gap-3 text-base text-foreground/85 md:text-lg"
            >
              <Check className="h-4 w-4 flex-shrink-0 text-accent" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="mt-9">
          <Link
            to={heroHref}
            onClick={handleCta}
            className="group inline-flex min-h-[52px] w-full max-w-[420px] items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
          >
            {copy.cta}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
