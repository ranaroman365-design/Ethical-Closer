/**
 * HeroMosV2 — Above-the-fold variant B for /masterofsales.
 *
 * STRICTLY ADDITIVE. Used only when the sticky multivariant slot
 * `mos_hero_lp` resolves to `mos_v2`. V1 (the inline hero in
 * MasterOfSales.tsx) is rendered for every other case.
 *
 * Scope:
 *   • Hero copy/aesthetic only (diagnose-first · klartext · keine Hype)
 *   • IDENTICAL CTA target (heroHref) and IDENTICAL tracking handler
 *     (onCtaClick) supplied by the parent → Quiz, Booking, Funnel-Source,
 *     Tracking, Attribution, Pixel/CAPI, Master-Funnel-ID, Section-View-
 *     Tracker, Auto-Allocator and ALL downstream events stay unchanged.
 *
 * Visual scope:
 *   Inherits the cinematic dark/gold scope from `#mos-scope` in the parent.
 *   Uses `data-mos-section="hero"` so the existing SectionViewTracker
 *   fires the canonical `mos_section_view` event automatically.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Calendar } from "lucide-react";
import { fireMosCroEvent } from "@/lib/mos-cro-events";
import HeroBackgroundLayer from "./HeroBackgroundLayer";



export interface HeroMosV2Props {
  /** Already URL-param-forwarded /apply/quiz?aud=men href (parent computes). */
  heroHref: string;
  /** Parent-owned click handler (idempotency + tracking + attribution). */
  onCtaClick: () => void;
  /** CTA label (parent-resolved A/B copy variant). */
  heroQuizCtaText: string;
  /** Risk-reversal copy (parent-resolved A/B variant). */
  riskCopyText: string;
  /** Micro-trust copy (parent-resolved A/B variant). */
  microTrustText: string;
  /** Hero background image src (parent-resolved A/B variant). */
  heroImageSrc: string;
}

export default function HeroMosV2({
  heroHref,
  onCtaClick,
  heroQuizCtaText,
  riskCopyText,
  microTrustText,
  heroImageSrc,
}: HeroMosV2Props) {
  // Additive MOS-gated CRO events (self-deduped, only fire on MOS sessions).
  useEffect(() => {
    fireMosCroEvent("MASTER_LP_FIRST_WIN_VIEW", heroQuizCtaText.slice(0, 40));
    fireMosCroEvent("MASTER_LP_RISK_REDUCER_VIEW", riskCopyText.slice(0, 40));
    fireMosCroEvent("MASTER_LP_MICRO_TRUST_VIEW", microTrustText.slice(0, 40));
  }, [heroQuizCtaText, riskCopyText, microTrustText]);

  return (
    <section
      data-mos-section="hero"
      data-hero-variant="mos_v2"
      className="relative isolate overflow-hidden"
    >
      <HeroBackgroundLayer fallbackSrc={heroImageSrc} />

      <div className="mx-auto grid min-h-[88vh] max-w-6xl grid-cols-1 items-center gap-10 px-6 pb-20 pt-24 md:min-h-[82vh] md:grid-cols-12 md:gap-12 md:px-10 md:py-24 lg:gap-16">
        <div className="md:col-span-8 flex flex-col justify-center">
        {/* Brand mark */}
        <p className="mb-3 text-[10px] uppercase tracking-[0.32em] text-foreground/70 sm:text-xs sm:tracking-[0.34em]">
          Ethical Top Closer™
        </p>

        {/* Eyebrow — Diagnose statt Verkauf */}
        <p className="mb-5 text-[11px] uppercase tracking-[0.3em] text-accent sm:text-xs sm:tracking-[0.32em]">
          Eignungsprüfung · Karriereweg Closing
        </p>

        {/* Diagnose-first Headline */}
        <h1 className="font-serif text-[2.4rem] leading-[1.05] tracking-tight md:text-7xl lg:text-[5.5rem] max-w-3xl">
          Du willst mehr —
          <br />
          <span className="text-foreground/70">aber dir fehlt der nächste klare Schritt.</span>
        </h1>

        <div className="mt-7 max-w-2xl space-y-5 text-base leading-relaxed text-foreground/85 md:text-lg">
          <p>
            In 2 Minuten siehst du, ob Closing wirklich zu dir passt —
            und welcher Karriereweg realistisch ist.
          </p>
          <p className="text-foreground/75">
            Keine Motivation. Keine Versprechen. Eine ehrliche
            Standortbestimmung.
          </p>
        </div>






        {/* Diagnose-Strip — drei ruhige Selbsterkennungs-Linien */}
        <ul className="mt-8 max-w-2xl space-y-3 text-sm leading-relaxed text-foreground/80 md:text-base">
          <li className="flex items-start gap-3">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
            Du arbeitest viel — aber das Einkommen wächst nicht in dem
            Tempo, das du willst.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
            Du hast Potenzial — aber kein System, das es in Ergebnisse übersetzt.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
            Du willst Klartext — keine Coaches, die dir Träume verkaufen.
          </li>
        </ul>

        {/* Identity Ladder — gleicher Inhalt wie V1, schlankere Form */}
        <div className="mt-8 max-w-2xl border-l-2 border-accent/40 pl-5">
          <p className="text-base leading-relaxed text-foreground/85 md:text-lg">
            Du startest als angehender{" "}
            <span className="text-foreground">Ethical Top Closer</span>.
          </p>
          <p className="mt-2 text-base leading-relaxed text-foreground/75 md:text-lg">
            Mit wachsender Leistung entwickelst du dich zum{" "}
            <span className="text-accent">Entscheidungsarchitekten</span>.
          </p>
        </div>

        <div className="mt-10 md:mt-12">
          {/* Ruhiger Reframe — Prüfung statt Sales-Pitch */}
          <p className="mb-5 max-w-2xl font-serif text-base italic leading-snug text-foreground/80 md:text-lg">
            Die meisten verlieren keine Zeit an mangelnder Fähigkeit —
            sondern an fehlender Klarheit darüber, wo sie stehen.
          </p>

          {/* IDENTICAL CTA target + handler as V1 → Quiz/Booking/Tracking intact. */}
          <Link
            to={heroHref}
            onClick={onCtaClick}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
          >
            <Calendar className="h-4 w-4" />
            {heroQuizCtaText}
          </Link>
          <p className="mt-3 text-[11px] leading-relaxed text-foreground/65 sm:text-xs">
            {riskCopyText}
          </p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-foreground/55 sm:text-xs sm:tracking-[0.25em]">
            {microTrustText}
          </p>

          {/* Kapazitäts-Hinweis bleibt identisch zur V1 — keine neuen Claims. */}
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-foreground/70 md:text-base">
            Die Plätze pro Quartal sind begrenzt.
            <br />
            Wenn sie belegt sind, gibt es eine Warteliste.
          </p>
        </div>
        </div>
      </div>
    </section>
  );
}
