/**
 * HeroMosConversion — Phase 9.5 conversion-first hero.
 *
 * STRICTLY ADDITIVE · presentation-only. Replaces all other hero
 * renderers when CONVERSION_HERO_ENABLED is true in MasterOfSales.tsx.
 *
 * Spec (Phase 9.5):
 *   Eyebrow:    ETHICAL TOP CLOSER™
 *   Headline:   Prüfe in 2 Minuten, ob eine Karriere im Closing
 *               wirklich zu dir passt.
 *   Subhead:    Für Menschen, die eine echte Fähigkeit lernen, …
 *   MicroTrust: ✓ Kostenlos · ✓ 2 Minuten · ✓ Sofortiges Ergebnis
 *   Primary CTA: (caller-provided, A/B via mos_quiz_cta_angle)
 *   Secondary:  Über 1.000 Teilnehmer haben ihren Karriereweg geprüft.
 *
 * Visual: full-bleed `HeroBackgroundLayer` (drives the existing
 * `mos_hero_human_proof` Thompson Sampling slot — no new logic).
 * Editorial dark overlay for masterclass-grade legibility.
 *
 * NO changes to quiz / booking / CRM / GHL / routing / tracking /
 * attribution / scoring. CTA target + click handler are owned by
 * the parent.
 */
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { fireMosCroEvent } from "@/lib/mos-cro-events";
import HeroBackgroundLayer from "./HeroBackgroundLayer";
import { useAbSlot } from "@/hooks/useAbSlot";
import {
  MOS_CONVERSION_HERO_HEADLINE,
  MOS_HERO_MICROTRUST_V2,
  CONVERSION_HERO_HEADLINE_COPY,
  HERO_MICROTRUST_V2_COPY,
} from "@/lib/mos-cro-slots";
import {
  MOS_LP_ACTION_MODE,
  MOS_LP_VISUAL_FOCUS,
  MOS_LP_ZERO_TEXT,
  MOS_LP_INSTANT_START,
  MOS_LP_MESSAGE_MATCH,
  LP_ACTION_MODE_COPY,
  MESSAGE_MATCH_COPY,
  resolveMessageMatchFromUtm,
} from "@/lib/mos-phase11-slots";
import { fireMosPhase11Event } from "@/lib/mos-phase11-events";
import { getAttributionSource } from "@/lib/attribution-source";

export interface HeroMosConversionProps {
  heroHref: string;
  onCtaClick: () => void;
  /** CTA label — wired to existing mos_quiz_cta_angle A/B slot from parent. */
  ctaLabel: string;
  /** Variant key for tracking (e.g. "cta:D_eignung"). */
  variantKey: string;
}

const EYEBROW = "ETHICAL TOP CLOSER™";
const DEFAULT_HEADLINE: [string, string, string] = [
  "Prüfe in 2 Minuten,",
  "ob eine Karriere im Closing",
  "wirklich zu dir passt.",
];
const SUBHEAD =
  "Für Menschen, die eine echte Fähigkeit lernen, remote arbeiten und leistungsabhängig verdienen möchten. Keine Motivationsversprechen. Keine Lifestyle-Illusionen. Nur ein klarer Karriereweg.";
const TRUST_ITEMS = ["Kostenlos", "2 Minuten", "Sofortiges Ergebnis"];
const DEFAULT_SOCIAL_PROOF =
  "Über 1.000 Teilnehmer haben ihren Karriereweg geprüft.";

export default function HeroMosConversion({
  heroHref,
  onCtaClick,
  ctaLabel,
  variantKey,
}: HeroMosConversionProps) {
  // Phase 9.6 — additive A/B slots. `control` keeps prior copy unchanged.
  const headlineSlot = useAbSlot(MOS_CONVERSION_HERO_HEADLINE);
  const microTrustSlot = useAbSlot(MOS_HERO_MICROTRUST_V2);

  // Phase 11 — LP→Quiz Maximizer slots (additive, MOS-gated).
  const actionModeSlot = useAbSlot(MOS_LP_ACTION_MODE);
  const visualFocusSlot = useAbSlot(MOS_LP_VISUAL_FOCUS);
  const zeroTextSlot = useAbSlot(MOS_LP_ZERO_TEXT);
  const instantStartSlot = useAbSlot(MOS_LP_INSTANT_START);
  const messageMatchSlot = useAbSlot(MOS_LP_MESSAGE_MATCH);

  const isMos = useMemo(() => {
    const s = getAttributionSource();
    return !!s && s.startsWith("masterofsales");
  }, []);

  // UTM-driven message match takes precedence over Winner-Engine pick.
  const utmMatch = useMemo(() => resolveMessageMatchFromUtm(), []);
  const messageMatchVariant = utmMatch ?? messageMatchSlot.variant;
  const messageMatchCopy = isMos ? MESSAGE_MATCH_COPY[messageMatchVariant] : null;
  const actionModeCopy = isMos ? LP_ACTION_MODE_COPY[actionModeSlot.variant] : null;

  // Resolution priority (MOS only): message-match > action-mode > existing copy.
  const headlineCopy =
    messageMatchCopy?.headline ??
    actionModeCopy?.headline ??
    CONVERSION_HERO_HEADLINE_COPY[headlineSlot.variant]?.lines ??
    DEFAULT_HEADLINE;
  const socialProof =
    HERO_MICROTRUST_V2_COPY[microTrustSlot.variant] ?? DEFAULT_SOCIAL_PROOF;
  const effectiveCta = actionModeCopy?.cta ?? ctaLabel;
  const effectiveSubhead = messageMatchCopy?.subline ?? SUBHEAD;

  // Zero-text level governs subhead/trust visibility.
  const hideSubhead =
    isMos &&
    (zeroTextSlot.variant === "C_minimal_three_lines" ||
      zeroTextSlot.variant === "D_cta_centric");
  const hideTrust = isMos && zeroTextSlot.variant === "D_cta_centric";

  const composedVariantKey =
    `${variantKey}|hl:${headlineSlot.variant}|mt:${microTrustSlot.variant}` +
    `|am:${actionModeSlot.variant}|vf:${visualFocusSlot.variant}` +
    `|zt:${zeroTextSlot.variant}|is:${instantStartSlot.variant}` +
    `|mm:${messageMatchVariant}`;

  useEffect(() => {
    try {
      fireMosCroEvent("MASTER_LP_CONVERSION_HERO_VIEW", composedVariantKey);
    } catch { /* never throw */ }
    // Phase 11 view events — session-deduped per variant.
    fireMosPhase11Event("MASTER_LP_ACTION_MODE_VIEW", actionModeSlot.variant);
    fireMosPhase11Event("MASTER_LP_VISUAL_FOCUS_VIEW", visualFocusSlot.variant);
    fireMosPhase11Event("MASTER_LP_ZERO_TEXT_VIEW", zeroTextSlot.variant);
    fireMosPhase11Event("MASTER_LP_INSTANT_START_VIEW", instantStartSlot.variant);
    fireMosPhase11Event("MASTER_LP_MESSAGE_MATCH_VIEW", messageMatchVariant, {
      utm_resolved: !!utmMatch,
    });
  }, [
    composedVariantKey,
    actionModeSlot.variant,
    visualFocusSlot.variant,
    zeroTextSlot.variant,
    instantStartSlot.variant,
    messageMatchVariant,
    utmMatch,
  ]);

  const handle = () => {
    try {
      fireMosCroEvent(
        "MASTER_LP_CONVERSION_HERO_CTA_CLICK",
        composedVariantKey,
      );
    } catch {
      /* never throw */
    }
    onCtaClick();
  };


  return (
    <section
      data-mos-section="hero"
      data-hero-variant="mos_conversion"
      data-conversion-variant={variantKey}
      className="relative isolate overflow-hidden"
    >
      {/* Full-bleed background image — drives existing mos_hero_human_proof
          A/B (Thompson Sampling). Only the image swaps per variant. */}
      <HeroBackgroundLayer overlay="editorial" />

      {/* Cinematic dark scrim layered on top of HeroBackgroundLayer for
          masterclass-grade headline legibility. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-[5] bg-gradient-to-r from-background/95 via-background/75 to-background/35 md:from-background/90 md:via-background/60 md:to-background/15"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-[5] bg-gradient-to-t from-background via-background/45 to-transparent"
      />

      {/* min-h-[100svh] guarantees CTA above the fold on mobile. */}
      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-6 py-20 md:min-h-[88vh] md:py-28">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.06] px-3.5 py-1.5 font-sans text-[10px] font-semibold uppercase leading-snug tracking-[0.18em] text-accent md:text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            {EYEBROW}
          </p>

          {/* Headline — serif, masterclass weight */}
          <h1 className="font-serif text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.01em] text-foreground sm:text-[2.6rem] md:text-5xl lg:text-[3.5rem]">
            {headlineCopy[0]}
            <br />
            {headlineCopy[1]}
            <br />
            <span className="text-accent">{headlineCopy[2]}</span>
          </h1>

          {/* Subheadline */}
          {!hideSubhead && (
            <p className="mt-6 max-w-2xl font-sans text-base leading-[1.6] text-foreground/80 md:mt-7 md:text-lg md:leading-[1.65]">
              {effectiveSubhead}
            </p>
          )}

          {/* Micro-Trust */}
          {!hideTrust && (
            <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 md:gap-x-6">
              {TRUST_ITEMS.map((label) => (
                <li
                  key={label}
                  className="flex items-center gap-2 font-sans text-[13px] font-medium text-foreground/85 md:text-sm"
                >
                  <Check className="h-4 w-4 text-accent" strokeWidth={2.5} />
                  {label}
                </li>
              ))}
            </ul>
          )}

          {/* Primary CTA */}
          <div className="mt-9 flex flex-col gap-3 md:mt-10">
            <Link
              to={heroHref}
              onClick={handle}
              className="group inline-flex min-h-[58px] w-full max-w-[440px] items-center justify-center gap-2 rounded-xl bg-accent px-8 py-4 font-sans text-[15px] font-semibold tracking-wide text-accent-foreground shadow-[0_10px_40px_-12px_hsl(var(--accent)/0.5)] transition hover:shadow-[0_14px_50px_-12px_hsl(var(--accent)/0.7)] hover:scale-[1.01] active:scale-[0.99] sm:w-auto"
            >
              {effectiveCta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>

            {/* Secondary social-proof microtext */}
            <p className="mt-1 font-sans text-xs text-foreground/60 md:text-[13px]">
              {socialProof}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
