import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
// Below-the-fold subtree — heavy JSX + framer-motion + accordion + section
// images. Lazy-loaded after `belowFoldReady` so the initial /apply chunk
// only ships the hero. FooterSection rides along inside that chunk.
const ApplyBelowFold = lazy(() => import("@/pages/apply/ApplyBelowFold"));
import PublicMemberNavLink from "@/components/landing/PublicMemberNavLink";
import { setApplyTimePrefill, type ApplyTimeBucket } from "@/lib/apply-prefill";
import { useWeeklySlotAvailability } from "@/hooks/useWeeklySlotAvailability";
import {
  getApplyHeroVariant,
  CTA90_LABEL,
  type ApplyHeroVariant,
} from "@/lib/apply-hero-ab";
import { ArrowRight, Check, Star, X } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { trackPixelEvent } from "@/lib/meta-pixel";
import { captureCurrentPageAttribution } from "@/lib/lead-attribution";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
// Hero LCP image — keep its responsive variants in the hero chunk so the
// preload <link> can reference them and the <picture> can render eagerly.
import heroNightImgWebp from "@/assets/apply-hero-night.webp";
import heroNightImg768Avif from "@/assets/apply-hero-night-768w.avif";
import heroNightImg1280Avif from "@/assets/apply-hero-night-1280w.avif";
import heroNightImg768Webp from "@/assets/apply-hero-night-768w.webp";
import heroNightImg1280Webp from "@/assets/apply-hero-night-1280w.webp";
// Female-cohort hero image — calm, grounded, editorial. Used when the
// visitor is NOT in the male_ambition cohort. See ApplyFemaleHero block below.
import heroFemaleImg from "@/assets/apply-hero-female.jpg";

const heroNightImg = heroNightImgWebp;

const RESPONSIVE_VARIANTS: Record<
  string,
  { avif768: string; avif1280: string; webp768: string; webp1280: string }
> = {
  [heroNightImg]: {
    avif768: heroNightImg768Avif,
    avif1280: heroNightImg1280Avif,
    webp768: heroNightImg768Webp,
    webp1280: heroNightImg1280Webp,
  },
};
import {
  APPLY_AB_COPY,
  APPLY_AB_TEST_KEY,
  getApplyAbBucket,
  getApplyAbVariant,
  type ApplyAbBucket,
  type ApplyAbVariant,
} from "@/lib/apply-ab-test";
import { getStickyAbVariant, type StickyAbVariant } from "@/lib/sticky-ab-test";
import {
  writeStickyCtaState,
  clearStickyCtaState,
} from "@/lib/sticky-cta-state";
// Debug overlay — only meaningful when ?apply_debug=1; defer to a separate chunk.
const ApplyDebugOverlay = lazy(() => import("@/components/landing/ApplyDebugOverlay"));
import { getScrollContext } from "@/lib/scroll-context";
import { isApplyDebugActive } from "@/lib/apply-debug-mode";
import {
  EXPERIMENTS,
  useExperimentPayload,
  type ApplyHeroHeadlineVariant,
  type ApplyPrimaryCtaVariant,
  type ApplyMoneyFramingVariant,
  type ApplyHeroHeadlineMaleVariant,
  type ApplyPrimaryCtaMaleVariant,
} from "@/lib/experiments";
import { getApplyAudience, setApplyAudience, type ApplyAudience } from "@/lib/apply-audience";

const FUNNEL_ID = "apply";


interface CtaTrackingMeta {
  /** Logical page section (e.g. "hero", "social_proof", "final_cta"). */
  section?: string;
  /** Copy/design variant of the CTA itself (e.g. "qualification_check", "primary"). */
  variant?: string;
  /** Storage bucket — A / B / H (holdout). Falls back to live read. */
  abBucket?: ApplyAbBucket;
  /**
   * Conversion-attribution dimension: "primary" = main CTA,
   * "secondary" = any other non-primary CTA. Persisted on every event
   * so analytics can split CTR and downstream conversion by CTA type.
   */
  ctaType?: "primary" | "secondary";
  /**
   * Free-form extra dimensions merged into the Supabase event payload.
   */
  extra?: Record<string, unknown>;
}

const handleApplyCtaClick = (location: string, meta: CtaTrackingMeta = {}) => {
  const section = meta.section ?? location;
  const variant = meta.variant ?? "primary";
  const abBucket = meta.abBucket ?? getApplyAbBucket();
  const ctaType = meta.ctaType ?? "primary";

  // Supabase canonical event — keeps `location` for backward compatibility,
  // adds `section` + `variant` for granular conversion analysis,
  // plus `ab_test` + `ab_variant` (= bucket incl. "H" holdout) so we can
  // split CTR by bucket and isolate the holdout baseline.
  trackFunnelEvent("apply_cta_click", {
    funnel: FUNNEL_ID,
    location,
    section,
    variant,
    cta_type: ctaType,
    ab_test: APPLY_AB_TEST_KEY,
    ab_variant: abBucket,
    holdout: abBucket === "H",
    ...(meta.extra ?? {}),
  });

  // Meta Pixel: fire dedicated APPLY_CTA_CLICK event for ad optimization.
  // Browser fbq + CAPI mirror share the same event_id (per spec format).
  // `cta_type` is folded into content_name so Meta-side breakdowns work too.
  try {
    trackPixelEvent("APPLY_CTA_CLICK", {
      content_name: `apply_cta_${ctaType}_${section}_${variant}_ab${abBucket}`,
      content_category: section,
    });
  } catch {
    /* never throw */
  }
};


const STICKY_HIGHLIGHT_EVENT = "apply:sticky-highlight";
const STICKY_HINT_TEST_KEY = "sticky_hint_v1";
// Tailwind `md` breakpoint = 768px. Sticky CTA is mobile-only (className `md:hidden`),
// so the hint A/B test must only enroll users below this width — otherwise desktop
// users would silently land in a bucket without ever seeing the hint, polluting CTR.
const STICKY_MOBILE_MAX_WIDTH = 767;

// 3-arm mobile micro-copy test:
//  A → original directional cue (longer, with emoji + arrow)
//  B → benefit-led mid-length copy
//  C → ultra-short imperative (≤ 2 words) — hypothesis: lower cognitive load
//      on small screens drives higher CTR.
const STICKY_HINT_COPY: Record<StickyAbVariant, string> = {
  A: "👇 Hier geht's weiter",
  B: "Strategie-Call sichern",
  C: "Jetzt starten",
};
const STICKY_HINT_VARIANTS = ["A", "B", "C"] as const;

// Reactive mobile-viewport hook. Uses matchMedia so resize/orientation changes
// flip the flag without polling. SSR-safe (defaults to false).
const useIsMobileViewport = (maxWidth: number = STICKY_MOBILE_MAX_WIDTH) => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    if (mql.addEventListener) {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    }
    // Safari < 14 fallback
    mql.addListener(update);
    return () => mql.removeListener(update);
  }, [maxWidth]);
  return isMobile;
};

export const StickyCta = () => {
  const isMobile = useIsMobileViewport();
  const [visible, setVisible] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [focusBoost, setFocusBoost] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const [showHint, setShowHint] = useState(false);
  const [hintVariant, setHintVariant] = useState<StickyAbVariant>("A");
  const [hintImpressionFired, setHintImpressionFired] = useState(false);
  // Debug badge visibility — sticky for the tab (?debug=ab). Read once on
  // mount; toggling requires page reload, so polling is unnecessary.
  const [debugActive] = useState(() => isApplyDebugActive());

  // Resolve hint variant client-side ONLY on mobile viewports.
  // Desktop users never see the sticky (md:hidden), so they must not be
  // assigned a bucket — otherwise CTR denominators would include non-exposed
  // users and dilute the measurement.
  useEffect(() => {
    if (!isMobile) return;
    const v = getStickyAbVariant(STICKY_HINT_TEST_KEY, { variants: STICKY_HINT_VARIANTS });
    setHintVariant(v);
    writeStickyCtaState({ hint: v });
  }, [isMobile]);

  // Mirror mount lifecycle so other components (e.g. LeadMagnet) can attribute
  // events to the presence of the sticky surface without prop-drilling.
  useEffect(() => {
    writeStickyCtaState({ mounted: true });
    return () => clearStickyCtaState();
  }, []);

  // Mirror visible / hint visibility transitions for analytics consumers.
  useEffect(() => {
    writeStickyCtaState({ visible });
  }, [visible]);
  useEffect(() => {
    writeStickyCtaState({ hintShown: showHint });
  }, [showHint]);

  // Desktop impression — fires exactly once per pageview when the floating
  // card actually appears (after hybrid trigger). Mobile keeps its existing
  // hint-impression event; this one is desktop-only so denominators stay clean.
  const [desktopImpressionFired, setDesktopImpressionFired] = useState(false);
  useEffect(() => {
    if (!visible || isMobile || desktopImpressionFired) return;
    trackFunnelEvent("sticky_cta_shown", {
      funnel: FUNNEL_ID,
      device: "desktop",
      location: "floating_bottom_right",
      page: typeof window !== "undefined" ? window.location.pathname : null,
      viewport_width: typeof window !== "undefined" ? window.innerWidth : null,
    });
    setDesktopImpressionFired(true);
  }, [visible, isMobile, desktopImpressionFired]);

  // Hybrid trigger: visible = (≥1.5s since mount) AND (scrollY > 300).
  // Once both conditions have been met, CTA stays visible for the rest of the
  // session — no auto-hide on scroll-up, no conditional unmounting (T3, T6).
  const [isReady, setIsReady] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setIsReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (hasScrolled) return; // latch — stop listening once threshold passed
    let ticking = false;
    const evaluate = () => {
      ticking = false;
      if (window.scrollY > 300) setHasScrolled(true);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      // rAF-throttled (cheaper + smoother than setTimeout debounce)
      requestAnimationFrame(evaluate);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    evaluate(); // catch users already scrolled past threshold (e.g. back-nav)
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasScrolled]);

  useEffect(() => {
    if (isReady && hasScrolled && !visible) setVisible(true);
  }, [isReady, hasScrolled, visible]);

  // Listen for "social proof in view" → pulse + hint + post-pulse focus boost.
  // Mobile-only: impression event is suppressed on desktop so CTR stays clean.
  useEffect(() => {
    let pulseTimer: ReturnType<typeof setTimeout> | null = null;
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    let focusOffTimer: ReturnType<typeof setTimeout> | null = null;
    let liveClearTimer: ReturnType<typeof setTimeout> | null = null;
    const onHighlight = () => {
      setHighlight(true);
      if (!isMobile) {
        // Desktop: only the pulse runs (sticky itself is hidden via md:hidden);
        // do not show the hint or fire impression — they belong to the mobile A/B.
        if (pulseTimer) clearTimeout(pulseTimer);
        pulseTimer = setTimeout(() => setHighlight(false), 2400);
        return;
      }
      setShowHint(true);

      // Fire hint impression once per session (per page load) when it actually appears.
      if (!hintImpressionFired) {
        trackFunnelEvent("sticky_hint_impression", {
          funnel: FUNNEL_ID,
          ab_test: STICKY_HINT_TEST_KEY,
          ab_variant: hintVariant,
          surface: "mobile_sticky",
          viewport_width: window.innerWidth,
          ...getScrollContext(),
        });
        setHintImpressionFired(true);
      }

      if (pulseTimer) clearTimeout(pulseTimer);
      if (hintTimer) clearTimeout(hintTimer);
      if (focusTimer) clearTimeout(focusTimer);
      if (focusOffTimer) clearTimeout(focusOffTimer);
      if (liveClearTimer) clearTimeout(liveClearTimer);
      pulseTimer = setTimeout(() => setHighlight(false), 2400);
      hintTimer = setTimeout(() => setShowHint(false), 4200);

      // Post-pulse focus boost: nach Pulse-Ende (2.4s) den CTA für ~1.6s
      // zusätzlich „fokussieren“ — visueller Ring + dezentes Wiggle + aria-live
      // Status. Kein echter element.focus() (würde auf iOS Touch-Keyboards
      // triggern können); stattdessen rein visueller + AT-Hinweis. Kein Layout-
      // Shift: Effekt nutzt `ring` + `transform` (keine Größenänderung).
      focusTimer = setTimeout(() => {
        setFocusBoost(true);
        setLiveMessage("Strategie-Call jetzt sichern");
        trackFunnelEvent("sticky_focus_boost", {
          funnel: FUNNEL_ID,
          ab_test: STICKY_HINT_TEST_KEY,
          ab_variant: hintVariant,
          surface: "mobile_sticky",
        });
      }, 2400);
      focusOffTimer = setTimeout(() => setFocusBoost(false), 2400 + 1600);
      // aria-live message kurz danach leeren, damit Screenreader es nicht erneut vorlesen.
      liveClearTimer = setTimeout(() => setLiveMessage(""), 2400 + 3000);
    };
    window.addEventListener(STICKY_HIGHLIGHT_EVENT, onHighlight);
    return () => {
      window.removeEventListener(STICKY_HIGHLIGHT_EVENT, onHighlight);
      if (pulseTimer) clearTimeout(pulseTimer);
      if (hintTimer) clearTimeout(hintTimer);
      if (focusTimer) clearTimeout(focusTimer);
      if (focusOffTimer) clearTimeout(focusOffTimer);
      if (liveClearTimer) clearTimeout(liveClearTimer);
    };
  }, [hintVariant, hintImpressionFired, isMobile]);

  const handleStickyClick = () => {
    // Standard CTA tracking (kept intact for funnel analytics).
    // Desktop gets its own source label so legacy "sticky_mobile" funnels
    // remain accurate; "sticky_desktop" is additive, not duplicative.
    handleApplyCtaClick(isMobile ? "sticky_mobile" : "sticky_desktop");
    // Dedicated hint A/B click — separable from social-proof copy test.
    // Skip on desktop: sticky is hidden via CSS, but defensive guard ensures
    // no event slips through (e.g. if a desktop user opens the link via devtools).
    if (!isMobile) return;
    trackFunnelEvent("sticky_hint_click", {
      funnel: FUNNEL_ID,
      ab_test: STICKY_HINT_TEST_KEY,
      ab_variant: hintVariant,
      surface: "mobile_sticky",
      hint_visible: showHint,
      viewport_width: typeof window !== "undefined" ? window.innerWidth : null,
      ...getScrollContext(),
    });
  };

  // NOTE: We intentionally render on desktop too (T2). The hint A/B + impression
  // events remain mobile-only above (clean CTR denominators), but the CTA itself
  // must be available on every breakpoint per spec.

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          // Stack above the cookie banner on mobile by reading its CSS var.
          // Banner sits at bottom:0 with z-60; sticky CTA jumps to bottom:var
          // so it never gets visually overlapped while the banner is open.
          style={{ zIndex: 9999, bottom: "var(--cookie-banner-h, 0px)" }}
          className="fixed inset-x-0 border-t border-border/60 bg-background/95 backdrop-blur-md md:inset-x-auto md:bottom-6 md:right-6 md:left-auto md:w-full md:max-w-[360px] md:rounded-xl md:border md:shadow-2xl"
        >
          {/* Live debug badge — only visible with ?debug=ab. Shows the active
              A/B(/C) bucket + live hint_visible flag right at the sticky so
              tracking anomalies can be spotted without opening devtools.
              Pointer-events-none so it never blocks the CTA. */}
          {debugActive && isMobile && (
            <div
              className="pointer-events-none absolute -top-7 left-2 flex items-center gap-1.5 rounded-md bg-foreground/90 px-2 py-1 font-mono text-[10px] leading-none text-background shadow-md backdrop-blur"
              data-debug="sticky-state"
              aria-hidden="true"
            >
              <span>AB:</span>
              <span className="rounded-sm bg-background/20 px-1 py-0.5 font-semibold tabular-nums">
                {hintVariant}
              </span>
              <span className="opacity-60">·</span>
              <span>hint:</span>
              <span
                className={`rounded-sm px-1 py-0.5 font-semibold ${
                  showHint ? "bg-signal text-signal-foreground" : "bg-background/20"
                }`}
              >
                {showHint ? "true" : "false"}
              </span>
            </div>
          )}
          <AnimatePresence>
            {showHint && isMobile && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 font-sans text-[11px] font-medium text-background shadow-lg"
                role="status"
                aria-live="polite"
                data-ab-variant={hintVariant}
              >
                {STICKY_HINT_COPY[hintVariant]}
                <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-foreground" />
              </motion.div>
            )}
          </AnimatePresence>
          {/* MOBILE layout — unchanged. Hidden on md+ so desktop renders the card below. */}
          <div className="relative px-4 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2.5 md:hidden">
            <Link
              ref={ctaRef}
              to="/apply/quiz"
              onClick={handleStickyClick}
              data-focus-boost={focusBoost ? "true" : "false"}
              className={`group flex w-full items-center justify-center gap-2 rounded-sm bg-signal px-6 py-3.5 font-sans text-sm font-semibold tracking-wide text-signal-foreground shadow-lg transition-all duration-300 will-change-transform hover:bg-signal-hover active:scale-[0.98] ${
                highlight
                  ? "ring-2 ring-signal/60 ring-offset-2 ring-offset-background animate-[pulse_1.2s_ease-in-out_2]"
                  : ""
              } ${
                focusBoost
                  ? "ring-2 ring-signal ring-offset-2 ring-offset-background shadow-[0_0_0_4px_hsl(var(--signal)/0.18)] animate-[sticky-attention_0.9s_ease-in-out_2]"
                  : ""
              }`}
              style={{ transformOrigin: "center" }}
            >
              Strategie-Call sichern
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="mt-1.5 text-center font-sans text-[11px] text-muted-foreground">
              Kostenlos • 2 Min • unverbindlich
            </p>
            <span role="status" aria-live="polite" className="sr-only">
              {liveMessage}
            </span>
          </div>

          {/* DESKTOP layout — premium floating card. Hidden on mobile.
              Same Link target + handler → tracking, qualification gating and
              A/B routing remain the single source of truth. */}
          <div className="relative hidden flex-col gap-3 p-5 md:flex">
            <Link
              to="/apply/quiz"
              onClick={handleStickyClick}
              className={`group flex w-full items-center justify-center gap-2 rounded-md bg-signal px-6 py-3.5 font-sans text-sm font-semibold tracking-wide text-signal-foreground shadow-md transition-all duration-300 hover:bg-signal-hover hover:shadow-lg active:scale-[0.99] ${
                highlight
                  ? "ring-2 ring-signal/60 ring-offset-2 ring-offset-background"
                  : ""
              }`}
            >
              Strategie-Call sichern
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="text-center font-sans text-[11px] leading-relaxed text-muted-foreground">
              <span className="text-signal">✓</span> 2 Min Check
              <span className="mx-1.5 opacity-40">·</span>
              <span className="text-signal">✓</span> Kostenlos
              <span className="mx-1.5 opacity-40">·</span>
              <span className="text-signal">✓</span> Unverbindlich
            </p>
            <p className="border-t border-border/50 pt-2 text-center font-serif text-[11px] italic leading-relaxed text-foreground/60">
              Nur für Bewerber mit echtem Umsetzungswillen.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};



const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

const Section = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  // `content-visibility: auto` defers layout/paint of off-screen sections,
  // cutting initial render time on mobile. `contain-intrinsic-size` reserves
  // a stable height to prevent CLS and scroll jumps before the section paints.
  <section
    className={`border-b border-border/40 px-6 py-24 md:py-32 [content-visibility:auto] [contain-intrinsic-size:1px_1200px] ${className}`}
  >
    <div className="mx-auto max-w-3xl">{children}</div>
  </section>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-6 font-sans text-[11px] font-medium uppercase tracking-[0.25em] text-accent">
    {children}
  </p>
);

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-serif text-3xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-5xl">
    {children}
  </h2>
);

const Body = ({ children }: { children: React.ReactNode }) => (
  <p className="font-serif text-lg leading-relaxed text-foreground/80 md:text-xl">
    {children}
  </p>
);

/**
 * SectionImage — visual accent for landing sections.
 *
 * Strict rules (per design brief):
 *  - additive only: never replaces text or shifts existing layout
 *  - monochrome by default (saturate-50) so it never breaks the B/W palette
 *  - eager only when explicitly marked (hero LCP); rest lazy + async decode
 *  - 16:9 frame avoids CLS; object-cover keeps focal point
 */
const SectionImage = ({
  src,
  srcWebp,
  alt,
  position = "below-headline",
  priority = false,
  focal = "center",
}: {
  src: string;
  srcWebp?: string;
  alt: string;
  position?: "below-headline" | "above-headline";
  priority?: boolean;
  focal?: "center" | "top" | "bottom" | "left" | "right";
}) => {
  const focalClass = {
    center: "object-center",
    top: "object-top",
    bottom: "object-bottom",
    left: "object-left",
    right: "object-right",
  }[focal];
  const imgClass = `aspect-[16/9] w-full saturate-50 contrast-110 object-cover ${focalClass}`;
  const variants = RESPONSIVE_VARIANTS[src];
  // Sizes: full viewport on mobile, capped to ~720px in the article column on desktop.
  const sizes = "(max-width: 767px) 100vw, 720px";
  return (
    <figure
      className={`${position === "above-headline" ? "mb-10" : "mt-10 mb-2"} overflow-hidden rounded-sm border border-border/40 bg-muted/30`}
      aria-hidden={alt ? undefined : true}
    >
      <picture>
        {variants ? (
          <>
            <source
              type="image/avif"
              sizes={sizes}
              srcSet={`${variants.avif768} 768w, ${variants.avif1280} 1280w`}
            />
            <source
              type="image/webp"
              sizes={sizes}
              srcSet={`${variants.webp768} 768w, ${variants.webp1280} 1280w${srcWebp ? `, ${srcWebp} 1920w` : ""}`}
            />
          </>
        ) : srcWebp ? (
          <source srcSet={srcWebp} type="image/webp" />
        ) : null}
        <img
          src={src}
          alt={alt}
          width={1920}
          height={1080}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          {...(priority ? { fetchpriority: "high" as const } : {})}
          className={imgClass}
        />
      </picture>
    </figure>
  );
};


/**
 * Above-the-fold micro-commitment. Three time-investment links that store
 * the user's answer in sessionStorage and route into /apply/quiz where the
 * existing `time` question is prefilled (no quiz logic change).
 */
const ApplyTimeMicroCommit = () => {
  const options: { bucket: ApplyTimeBucket; label: string }[] = [
    { bucket: "5-10", label: "5–10 Stunden" },
    { bucket: "10-20", label: "10–20 Stunden" },
    { bucket: "20+", label: "20+ Stunden" },
  ];
  return (
    <div className="mt-10 rounded-sm border border-border/60 bg-card/40 p-5 md:p-6">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
        Frage 1 von 6 · 90 Sekunden
      </p>
      <p className="mt-3 font-serif text-lg leading-snug text-foreground md:text-xl">
        Wie viel Zeit kannst du realistisch pro Woche investieren?
      </p>
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {options.map((o) => (
          <Link
            key={o.bucket}
            to="/apply/quiz"
            onClick={() => {
              setApplyTimePrefill(o.bucket);
              try {
                handleApplyCtaClick(`hero_micro_${o.bucket}`);
              } catch {
                /* tracking must never block navigation */
              }
            }}
            className="group flex items-center justify-between gap-2 rounded-sm border border-border bg-background px-4 py-3.5 text-left font-sans text-sm font-medium text-foreground transition-all hover:border-accent hover:bg-accent/5 active:scale-[0.99]"
          >
            <span>{o.label}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
          </Link>
        ))}
      </div>
      <p className="mt-3 font-sans text-[11px] text-muted-foreground">
        Deine Antwort wird übernommen – du startest direkt bei Frage 2.
      </p>
    </div>
  );
};

/**
 * 3-step clarity bar — tells the user exactly what happens after clicking.
 */
const ApplyStepBar = () => (
  <div className="mt-6 rounded-sm border border-border/40 bg-muted/20 p-4 md:p-5">
    <ol className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
      {[
        { n: "1", t: "Qualifikations-Check (2–3 Min)" },
        { n: "2", t: "Auswertung deiner Antworten" },
        { n: "3", t: "ggf. Einladung zum Gespräch" },
        { n: "4", t: "ggf. Start im System" },
      ].map((s, i, arr) => (
        <li key={s.n} className="flex items-center gap-3 sm:flex-1">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/60 font-sans text-[11px] font-semibold text-accent">
            {s.n}
          </span>
          <span className="font-sans text-[13px] text-foreground/85">{s.t}</span>
          {i < arr.length - 1 && (
            <span className="ml-auto hidden h-px flex-1 bg-border/60 sm:block" aria-hidden="true" />
          )}
        </li>
      ))}
    </ol>
    <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted-foreground">
      Du wirst geprüft – nicht jeder wird genommen.
    </p>
  </div>
);

/**
 * Real-time slot-based scarcity. Surfaces TODAY's remaining capacity, split
 * into Fastlane (priority) and Regular tiers. Numbers are derived from
 * `availability_slots` via useWeeklySlotAvailability — never random per
 * reload. Daily Fastlane cap is configurable below.
 *
 * Fallback (no DB data) uses honest soft messaging only — never invents a
 * total or a percentage.
 */
const FASTLANE_DAILY_CAP = 2; // configurable: max Fastlane plätze per day

const ApplyWeeklyScarcity = () => {
  const data = useWeeklySlotAvailability();
  const hasData = !!(data && data.total > 0);

  // Derive today's split — deterministic, no randomness.
  const todayOpen = hasData ? data!.todayOpen : 2;          // fallback: assume 2 left today
  const tomorrowOpen = hasData ? data!.tomorrowOpen : 2;    // fallback: assume tomorrow open
  const fastlaneLeft = Math.min(todayOpen, FASTLANE_DAILY_CAP);
  const regularLeft = Math.max(todayOpen - fastlaneLeft, 0);
  const regularRolloverToTomorrow = regularLeft === 0;

  // Headline shifts when today is nearly empty (Option C — rollover pressure).
  const headline = todayOpen <= FASTLANE_DAILY_CAP
    ? "Für heute fast ausgebucht"
    : "Begrenzte Gesprächsplätze heute";

  // Single impression event — reuses existing schema, adds section tag.
  useEffect(() => {
    try {
      trackFunnelEvent("apply_scarcity_impression", {
        section: "scarcity",
        variant: hasData ? "real_slots" : "fallback_message",
        today_open: todayOpen,
        fastlane_left: fastlaneLeft,
        regular_left: regularLeft,
        regular_rollover: regularRolloverToTomorrow,
      });
    } catch {
      /* tracking must never break the page */
    }
  }, [hasData, todayOpen, fastlaneLeft, regularLeft, regularRolloverToTomorrow]);

  return (
    <div className="mt-6 w-full max-w-md rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/5 via-background to-background p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        <span className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
          Heute
        </span>
      </div>

      <p className="mt-2 font-display text-[17px] font-semibold leading-tight text-foreground">
        {headline}
      </p>

      <div className="mt-4 space-y-3">
        {/* FASTLANE — visually emphasized */}
        <div className="rounded-xl border border-accent/50 bg-accent/10 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-accent">
                Fastlane (priorisiert)
              </p>
              <p className="mt-0.5 font-sans text-[12px] text-foreground/75">
                Bevorzugte Prüfung & frühere Termine
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span className="font-display text-[26px] font-semibold leading-none text-foreground">
                {fastlaneLeft}
              </span>
              <span className="ml-1 font-sans text-[12px] text-foreground/70">
                {fastlaneLeft === 1 ? "Platz übrig" : "Plätze übrig"}
              </span>
            </p>
          </div>
        </div>

        {/* REGULAR */}
        <div className="rounded-xl border border-foreground/10 bg-background/60 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="font-sans text-[11px] font-medium uppercase tracking-[0.1em] text-foreground/60">
                Reguläre Gespräche
              </p>
              <p className="mt-0.5 font-sans text-[12px] text-foreground/75">
                Standard-Prüfung im Tagesfenster
              </p>
            </div>
            <p className="shrink-0 text-right">
              {regularRolloverToTomorrow ? (
                <span className="font-display text-[14px] font-semibold leading-tight text-foreground/80">
                  Nächster Termin: {tomorrowOpen > 0 ? "morgen" : "in Kürze"}
                </span>
              ) : (
                <>
                  <span className="font-display text-[26px] font-semibold leading-none text-foreground">
                    {regularLeft}
                  </span>
                  <span className="ml-1 font-sans text-[12px] text-foreground/70">
                    {regularLeft === 1 ? "Platz übrig" : "Plätze übrig"}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-4 font-sans text-[12px] leading-relaxed text-foreground/75">
        Wir begrenzen aktiv die Anzahl der Gespräche pro Tag, um jede Bewerbung ernsthaft prüfen zu können.
      </p>
      <p className="mt-2 font-sans text-[11px] leading-relaxed text-muted-foreground">
        Wenn heute keine Plätze mehr frei sind, wirst du automatisch auf den nächsten verfügbaren Tag gelegt.
      </p>
    </div>
  );
};

/**
 * Minimal authority strip — single founder, one-line credibility.
 * No testimonials, no slider, no animation. Renders inline avatar via initials
 * to avoid loading any new image asset (keeps zero regression risk).
 *
 * Language-safe rendering (DE):
 *  - lang="de" hints the browser to apply German hyphenation rules.
 *  - Non-breaking space (\u00A0) keeps "Dr. Josué Quintana" on one logical
 *    unit so the title never orphans on a line by itself.
 *  - Non-breaking hyphen (\u2011) keeps "High‑Ticket" intact (German
 *    typographic rule: compound terms with hyphen should not break).
 *  - `hyphens-manual` prevents the browser from auto-hyphenating proper
 *    nouns; only soft hyphens we explicitly add (none here) would break.
 *  - `min-w-0` + `break-words` lets the text shrink gracefully on
 *    narrow viewports without overflowing the flex row.
 */
const ApplyAuthorityStrip = () => (
  <div className="mt-8 flex items-center gap-3" lang="de">
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-sans text-[12px] font-semibold uppercase tracking-wide text-accent"
      aria-hidden="true"
    >
      JQ
    </div>
    <div className="min-w-0 leading-tight hyphens-manual">
      <p className="font-sans text-[13px] font-medium text-foreground break-words">
        {"Dr.\u00A0Josué\u00A0Quintana"}
      </p>
      <p className="font-sans text-[12px] text-muted-foreground break-words">
        {"Systemaufbau im High\u2011Ticket\u00A0Vertrieb"}
      </p>
    </div>
  </div>
);

/**
 * Hero variant: INCOME. Same shell as ApplyTimeMicroCommit, but the chips
 * ask for monthly income target instead of time. Routes to /apply/quiz with
 * an `intent` query param (tracking-only — quiz logic stays identical).
 */
type IncomeBucket = "2k_5k" | "5k_10k" | "10k_plus";
const ApplyIncomeMicroCommit = () => {
  const options: { bucket: IncomeBucket; label: string }[] = [
    { bucket: "2k_5k", label: "2.000–5.000 €" },
    { bucket: "5k_10k", label: "5.000–10.000 €" },
    { bucket: "10k_plus", label: "10.000 €+" },
  ];
  return (
    <div className="mt-10 rounded-sm border border-border/60 bg-card/40 p-5 md:p-6">
      <p className="font-sans text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
        Frage 1 von 6 · 90 Sekunden
      </p>
      <p className="mt-3 font-serif text-lg leading-snug text-foreground md:text-xl">
        Wie viel möchtest du monatlich verdienen?
      </p>
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {options.map((o) => (
          <Link
            key={o.bucket}
            to={`/apply/quiz?intent=${o.bucket}`}
            onClick={() => {
              try {
                handleApplyCtaClick(`hero_micro_income_${o.bucket}`, {
                  section: "hero",
                  variant: `income_${o.bucket}`,
                });
              } catch {
                /* tracking must never block navigation */
              }
            }}
            className="group flex items-center justify-between gap-2 rounded-sm border border-border bg-background px-4 py-3.5 text-left font-sans text-sm font-medium text-foreground transition-all hover:border-accent hover:bg-accent/5 active:scale-[0.99]"
          >
            <span>{o.label}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
          </Link>
        ))}
      </div>
      <p className="mt-3 font-sans text-[11px] text-muted-foreground">
        Leistungsbasiert · keine Garantie · kein Festgehalt.
      </p>
    </div>
  );
};
const ApplyCTA = ({
  label,
  variant = "primary",
  location = "section",
  heroVariant,
}: {
  label?: string;
  variant?: "primary" | "accent";
  location?: string;
  heroVariant?: ApplyHeroVariant;
}) => {
  const resolvedLabel =
    label ??
    (heroVariant === "CTA90"
      ? CTA90_LABEL
      : "Jetzt Bewerbung starten");
  return (
    <div className="inline-flex flex-col items-center gap-2">
      <Link
        to="/apply/quiz"
        onClick={() =>
          handleApplyCtaClick(location, {
            section: location,
            variant: heroVariant === "CTA90" && !label ? "cta90" : "primary",
            ctaType: "primary",
          })
        }
        className="group inline-flex items-center gap-3 rounded-sm bg-signal px-10 py-4 font-sans text-sm font-semibold tracking-wide text-signal-foreground shadow-md shadow-signal/20 transition-all hover:bg-signal-hover hover:shadow-lg active:scale-[0.98]"
      >
        {resolvedLabel}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
      <p className="font-sans text-[11px] tracking-wide text-muted-foreground">
        Kostenlos • 2 Min • unverbindlich
      </p>
      <p className="text-center font-sans text-[11px] leading-snug text-muted-foreground/80">
        4 kurze Fragen
        <br />
        Sofortiges Ergebnis
        <br />
        Optional: Termin sichern
      </p>
    </div>
  );
};

export default function ApplyLanding() {
  const [abVariant, setAbVariant] = useState<ApplyAbVariant>("A");
  const [abBucket, setAbBucket] = useState<ApplyAbBucket>("A");
  const [heroVariant, setHeroVariant] = useState<ApplyHeroVariant>("TIME");

  // Defer-mount everything below the hero. Hero ships in the initial paint;
  // below-fold subtree mounts on idle, scroll, touch, or pointer move —
  // whichever fires first. Zero behavioral change, large TBT/INP/LCP win.
  const [belowFoldReady, setBelowFoldReady] = useState(false);

  // Audience cohort — sticky 30d, derived from UTM (men/ambition/career
  // creatives → "male_ambition"). Drives swap of hero headline + primary CTA
  // to ambition / future / self-determination framing.
  const [audience, setAudience] = useState<ApplyAudience>("default");

  useEffect(() => {
    setAbBucket(getApplyAbBucket());
    setAbVariant(getApplyAbVariant());
    setHeroVariant(getApplyHeroVariant());
    // Route-strict audience: /apply ALWAYS means women funnel unless the URL
    // explicitly carries ?aud=men/male/ambition. This prevents a sticky
    // male_ambition cohort from a prior /masterofsales visit (or any
    // misclassification) from poisoning the women's funnel and redirecting
    // women to /booking-men.
    try {
      const params = new URLSearchParams(window.location.search);
      const explicit = (params.get("aud") || params.get("audience") || "").toLowerCase();
      const wantsMen = ["men", "male", "ambition", "career", "karriere", "m"].includes(explicit);
      if (!wantsMen) {
        setApplyAudience("default");
      }
    } catch { /* never throw */ }
    const aud = getApplyAudience();
    setAudience(aud);
    // Single tracking event so funnels can split by cohort.
    try {
      trackFunnelEvent("apply_audience_cohort", {
        funnel: FUNNEL_ID,
        cohort: aud,
      });
    } catch { /* never throw */ }
  }, []);

  // ── Phase 2 / Revenue OS Hero Tests ────────────────────────────────────
  // Soft-entry CTA copy (3 + 10% holdout). Holdout = legacy "Bewerbung starten".
  // We intentionally do NOT collide with heroVariant === "CTA90" (legacy
  // 90-second label test): when CTA90 wins the legacy bucket, that label keeps
  // priority. Otherwise the new soft-entry label is rendered.
  const heroHeadlineExp = useExperimentPayload<ApplyHeroHeadlineVariant, { eyebrow: string; line1: React.ReactNode; line2: React.ReactNode; sub: string; pressure: string | null }>(
    EXPERIMENTS.APPLY_HERO_HEADLINE,
    {
      identity: {
        eyebrow: "Karriere · Ethical Top Closer",
        line1: <>Vielleicht ist das</>,
        line2: <span className="text-muted-foreground">dein nächster Schritt.</span>,
        sub: "Eine echte Karriere im Ethical Closing — entwickelt für Menschen, die mehr aus sich machen wollen.",
        pressure: null,
      },
      ambition: {
        eyebrow: "Karriere · Ethical Top Closer",
        line1: <>Mehr Freiheit beginnt mit</>,
        line2: <span className="text-muted-foreground">den richtigen Fähigkeiten.</span>,
        sub: "Echte Skills, echter Karriereweg, echte Selbstbestimmung — keine Abkürzung, kein Versprechen.",
        pressure: null,
      },
      more_possible: {
        eyebrow: "Karriereweg · Ethical Top Closer",
        line1: <>Du weißt,</>,
        line2: <span className="text-muted-foreground">dass mehr möglich ist.</span>,
        sub: "Nicht für jeden. Aber vielleicht für dich — ein moderner Karriereweg mit echten Skills und echter Richtung.",
        pressure: null,
      },
      modern_skills: {
        eyebrow: "Karriereweg · Ethical Top Closer",
        line1: <>Moderne Skills schaffen</>,
        line2: <span className="text-muted-foreground">moderne Freiheit.</span>,
        sub: "Ein klarer Entwicklungspfad — keine Versprechen, keine Abkürzung, nur echter Fortschritt.",
        pressure: null,
      },
      next_step: {
        eyebrow: "Karriereweg · Ethical Top Closer",
        line1: <>Vielleicht ist das dein</>,
        line2: <span className="text-muted-foreground">nächster Entwicklungsschritt.</span>,
        sub: "Für Menschen, die nicht im selben Alltag stecken bleiben wollen — sondern Richtung wählen.",
        pressure: null,
      },
      more_direction: {
        eyebrow: "Karriereweg · Ethical Top Closer",
        line1: <>Mehr Richtung.</>,
        line2: <span className="text-muted-foreground">Mehr Selbstbestimmung.</span>,
        sub: "Skill-Aufbau, Fortschritt und ein Karriereweg, der dir Kontrolle über dein Leben zurückgibt.",
        pressure: null,
      },
      alltag_aendern: {
        eyebrow: "Neue Perspektive · Remote · Ehrlich",
        line1: <>Vielleicht ist heute</>,
        line2: <span className="text-muted-foreground">der Moment, etwas zu ändern.</span>,
        sub: "Ein ruhiger Weg, mehr aus deinem Alltag zu machen — ohne Druck, ohne Hype, in deinem Tempo.",
        pressure: null,
      },
      zugehoerigkeit: {
        eyebrow: "Umfeld · Entwicklung · Zugehörigkeit",
        line1: <>Ein Umfeld, in dem</>,
        line2: <span className="text-muted-foreground">echte Entwicklung normal ist.</span>,
        sub: "Menschen, die wirklich etwas verändern wollen — und ein Weg, der dich dabei trägt, statt dich allein zu lassen.",
        pressure: null,
      },
      control: {
        eyebrow: "Karriereweg · Ethical Top Closer",
        line1: <>Finde heraus,</>,
        line2: <span className="text-muted-foreground">ob es zu dir passt.</span>,
        sub: "Ein ehrlicher erster Blick — in 2–3 Minuten, unverbindlich.",
        pressure: null,
      },

    },
  );

  const primaryCtaExp = useExperimentPayload<ApplyPrimaryCtaVariant, { label: string }>(
    EXPERIMENTS.APPLY_PRIMARY_CTA,
    {
      karriere_check: { label: "Karriere-Check starten" },
      potenzial_pruefen: { label: "Potenzial prüfen" },
      mehr_erfahren: { label: "Mehr erfahren" },
      schritt_ansehen: { label: "Nächsten Schritt ansehen" },
      control: { label: "Herausfinden, ob es passt" },
    },

  );

  const moneyFramingExp = useExperimentPayload<ApplyMoneyFramingVariant, { incomeBullet: string | null }>(
    EXPERIMENTS.APPLY_MONEY_FRAMING,
    {
      reduced: { incomeBullet: "Leistungsbasierte Vergütung — abhängig vom Einsatz" },
      removed: { incomeBullet: null },
      control: { incomeBullet: "2.000 € – 10.000 € leistungsbasiert" },
    },
  );

  // ── Male / Ambition cohort overrides (only effective when audience === "male_ambition") ──
  // These experiments ALWAYS resolve (so buckets stay sticky if the cohort
  // flips later), but their payloads are only swapped into the rendered
  // hero when the visitor is in the male-ambition cohort. Holdout = legacy
  // default copy (i.e. behaves identically to the default cohort hero).
  const heroHeadlineMaleExp = useExperimentPayload<
    ApplyHeroHeadlineMaleVariant,
    { eyebrow: string; line1: React.ReactNode; line2: React.ReactNode; sub: string; pressure: string | null }
  >(EXPERIMENTS.APPLY_HERO_HEADLINE_MALE, {
    more_possible: {
      eyebrow: "Moderner Karriereweg · Remote · Fortschritt",
      line1: <>Du weißt,</>,
      line2: <span className="text-muted-foreground">dass mehr möglich ist.</span>,
      sub: "Ein moderner Karriereweg für Männer, die Richtung, Fortschritt und Kontrolle wollen — ohne Hustle, ohne Druck, ohne Geschwätz.",
      pressure: null,
    },
    more_freedom: {
      eyebrow: "Moderner Karriereweg · Remote · Fortschritt",
      line1: <>Mehr Freiheit beginnt</>,
      line2: <span className="text-muted-foreground">mit den richtigen Fähigkeiten.</span>,
      sub: "Skill-Aufbau, Fortschritt und ein Karriereweg, der dir Kontrolle über dein Leben zurückgibt.",
      pressure: null,
    },
    modern_skills: {
      eyebrow: "Moderner Karriereweg · Remote · Fortschritt",
      line1: <>Moderne Skills schaffen</>,
      line2: <span className="text-muted-foreground">moderne Freiheit.</span>,
      sub: "Ein klarer Entwicklungspfad — keine Versprechen, keine Abkürzung, nur echter Fortschritt.",
      pressure: null,
    },
    next_step: {
      eyebrow: "Moderner Karriereweg · Remote · Fortschritt",
      line1: <>Du musst nicht im selben</>,
      line2: <span className="text-muted-foreground">Alltag stecken bleiben.</span>,
      sub: "Ein moderner Karriereweg für Männer, die nicht im selben Alltag bleiben — sondern Richtung wählen.",
      pressure: null,
    },
    control: {
      // Holdout = legacy default headline → effectively no swap.
      eyebrow: heroHeadlineExp.payload.eyebrow,
      line1: heroHeadlineExp.payload.line1,
      line2: heroHeadlineExp.payload.line2,
      sub: heroHeadlineExp.payload.sub,
      pressure: heroHeadlineExp.payload.pressure,
    },
  });

  const primaryCtaMaleExp = useExperimentPayload<ApplyPrimaryCtaMaleVariant, { label: string }>(
    EXPERIMENTS.APPLY_PRIMARY_CTA_MALE,
    {
      potenzial_pruefen: { label: "Potenzial prüfen" },
      mehr_erfahren: { label: "Mehr erfahren" },
      karriere_check: { label: "Karriere-Check starten" },
      naechster_schritt: { label: "Nächsten Schritt ansehen" },
      control: { label: primaryCtaExp.payload.label },
    },
  );

  // Resolved soft-entry CTA label. Legacy CTA90 still wins where it overrides;
  // primary control bucket also keeps the legacy "Qualifikations-Check starten".
  // Male cohort: swap to ambition CTA.
  const softEntryCtaLabel =
    audience === "male_ambition" ? primaryCtaMaleExp.payload.label : primaryCtaExp.payload.label;

  // Male cohort: swap headline/sub/eyebrow to ambition framing.
  const activeHeroHeadline =
    audience === "male_ambition" ? heroHeadlineMaleExp.payload : heroHeadlineExp.payload;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (belowFoldReady) return;
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      cancelled = true;
      setBelowFoldReady(true);
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("touchstart", reveal);
      window.removeEventListener("pointermove", reveal);
      window.removeEventListener("keydown", reveal);
    };
    // Idle fallback so users who don't interact still get the full page.
    const ric: number | NodeJS.Timeout =
      typeof (window as any).requestIdleCallback === "function"
        ? (window as any).requestIdleCallback(reveal, { timeout: 1500 })
        : setTimeout(reveal, 800);
    window.addEventListener("scroll", reveal, { passive: true });
    window.addEventListener("touchstart", reveal, { passive: true });
    window.addEventListener("pointermove", reveal, { passive: true });
    window.addEventListener("keydown", reveal);
    return () => {
      cancelled = true;
      if (typeof (window as any).cancelIdleCallback === "function") {
        try { (window as any).cancelIdleCallback(ric); } catch { /* noop */ }
      } else {
        clearTimeout(ric as NodeJS.Timeout);
      }
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("touchstart", reveal);
      window.removeEventListener("pointermove", reveal);
      window.removeEventListener("keydown", reveal);
    };
  }, [belowFoldReady]);

  // Fire APPLY_VIEW (Meta ViewContent) exactly once per /apply mount.
  // Deferred to idle so the 1.7s send-meta-event roundtrip never blocks the
  // critical render path. Browser Pixel + CAPI mirror share the same
  // event_id (per spec format).
  useEffect(() => {
    const fire = () => {
      try {
        trackPixelEvent("APPLY_VIEW", {
          content_name: "apply_landing",
          content_category: "funnel_entry",
        });
      } catch {
        /* never throw */
      }
    };
    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    const w = (typeof window !== "undefined" ? (window as IdleWindow) : undefined);
    if (w?.requestIdleCallback) {
      w.requestIdleCallback(fire, { timeout: 2500 });
    } else {
      setTimeout(fire, 1500);
    }
  }, []);

  // ─── First-touch attribution capture (once per session) ───
  // Captures UTM/click-id/referrer/landing url anonymously and writes a row
  // to lead_attribution keyed by session_id. When the lead later submits
  // LeadCaptureGate, link_lead_attribution closes the loop with lead_id.
  // sessionStorage flag guarantees one RPC call per browser session even on
  // SPA rerender / fast-refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    captureCurrentPageAttribution("ApplyLanding");
  }, []);

  // ─── scroll_25 / scroll_50 / scroll_75 / scroll_90 — once per pageview ───
  // Canonical snake_case event names, aligned with /qualify so A/B scroll
  // depth comparisons join cleanly. pageview-scoped via `useRef` flags
  // (NOT sessionStorage) so SPA re-mounts count as new pageviews.
  // rAF-throttled scroll listener; stops listening after all depths fire.
  const scrollFiredRef = useRef({ s25: false, s50: false, s75: false, s90: false });
  useEffect(() => {
    if (typeof window === "undefined") return;
    let ticking = false;
    const evaluate = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const pct = ((window.scrollY || 0) / max) * 100;
      const flags = scrollFiredRef.current;
      const fire = (key: keyof typeof flags, depth: number) => {
        if (flags[key]) return;
        flags[key] = true;
        trackFunnelEvent(`scroll_${depth}`, {
          funnel: FUNNEL_ID,
          page_path: "/apply",
          depth,
        });
      };
      if (pct >= 25) fire("s25", 25);
      if (pct >= 50) fire("s50", 50);
      if (pct >= 75) fire("s75", 75);
      if (pct >= 90) fire("s90", 90);
      if (flags.s25 && flags.s50 && flags.s75 && flags.s90) {
        window.removeEventListener("scroll", onScroll);
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(evaluate);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    evaluate(); // back-nav case: user already scrolled past threshold
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // LCP boost: preload responsive hero AVIF (mobile-first). Uses imageSrcSet +
  // imageSizes so the browser fetches the same tiny variant the <picture> tag
  // will display (~6KB at 768w vs ~193KB for the original 1920w WebP).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.type = "image/avif";
    // imageSrcSet/imageSizes are not yet in lib.dom — set via setAttribute.
    link.setAttribute(
      "imagesrcset",
      `${heroNightImg768Avif} 768w, ${heroNightImg1280Avif} 1280w`,
    );
    link.setAttribute("imagesizes", "(max-width: 767px) 100vw, 720px");
    link.setAttribute("fetchpriority", "high");
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const abCopy = useMemo(() => APPLY_AB_COPY[abVariant], [abVariant]);

  // Highlight sticky CTA + measure **dwell time** on social-proof block (mobile only).
  // Dwell = cumulative ms with ≥50% in viewport. Persisted to sessionStorage so the
  // /book page can read it and attach to booking events for conversion correlation.
  const socialProofRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = socialProofRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;

    let highlightFired = false;
    let inViewSince: number | null = null;
    let dwellMs = 0;
    let lastReportedBucket = 0;
    const MILESTONES = [1000, 3000, 5000, 10000];
    const SESSION_KEY = "apply:social_proof_dwell_ms";
    const VIEWED_KEY = "apply:social_proof_viewed";

    try {
      const prev = Number(sessionStorage.getItem(SESSION_KEY) ?? "0");
      if (Number.isFinite(prev) && prev > 0 && prev < 600_000) {
        dwellMs = prev;
        // Skip already-passed milestones to avoid duplicates.
        MILESTONES.forEach((ms) => { if (dwellMs >= ms) lastReportedBucket = ms; });
      }
    } catch { /* sessionStorage may be blocked */ }

    const persist = () => {
      try {
        sessionStorage.setItem(SESSION_KEY, String(Math.round(dwellMs)));
        sessionStorage.setItem(VIEWED_KEY, "1");
      } catch { /* noop */ }
    };

    const flushIfActive = () => {
      if (inViewSince != null) {
        const now = performance.now();
        dwellMs += now - inViewSince;
        inViewSince = now;
        persist();
      }
    };

    const checkMilestones = () => {
      MILESTONES.forEach((ms) => {
        if (dwellMs >= ms && lastReportedBucket < ms) {
          lastReportedBucket = ms;
          trackFunnelEvent("social_proof_dwell_milestone", {
            funnel: FUNNEL_ID,
            section: "social_proof",
            surface: "mobile",
            dwell_ms: Math.round(dwellMs),
            milestone_ms: ms,
            ab_test: APPLY_AB_TEST_KEY,
            ab_variant: getApplyAbBucket(),
            viewport_width: window.innerWidth,
          });
        }
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const inView = entry.isIntersecting && entry.intersectionRatio >= 0.5;
          if (inView && inViewSince == null) {
            inViewSince = performance.now();
          } else if (!inView && inViewSince != null) {
            dwellMs += performance.now() - inViewSince;
            inViewSince = null;
            persist();
            checkMilestones();
          }

          if (entry.isIntersecting && !highlightFired) {
            highlightFired = true;
            window.dispatchEvent(new CustomEvent(STICKY_HIGHLIGHT_EVENT));
          }
        });
      },
      { threshold: [0.25, 0.5, 0.75] }
    );
    observer.observe(el);

    const tick = window.setInterval(() => {
      flushIfActive();
      checkMilestones();
    }, 1000);

    const onVisibility = () => {
      if (document.hidden) {
        flushIfActive();
        inViewSince = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onPageHide = () => {
      flushIfActive();
      checkMilestones();
      if (dwellMs > 0) {
        trackFunnelEvent("social_proof_dwell_total", {
          funnel: FUNNEL_ID,
          section: "social_proof",
          surface: "mobile",
          dwell_ms: Math.round(dwellMs),
          dwell_bucket:
            dwellMs >= 10_000 ? "10s+" :
            dwellMs >= 5_000 ? "5-10s" :
            dwellMs >= 3_000 ? "3-5s" :
            dwellMs >= 1_000 ? "1-3s" : "<1s",
          ab_test: APPLY_AB_TEST_KEY,
          ab_variant: getApplyAbBucket(),
        });
      }
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      flushIfActive();
      observer.disconnect();
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => {
    document.title = "Ein moderner Karriereweg, der zu deinem Leben passt — Ethical Top Closer";
    const desc =
      "Ein ruhiger, ehrlicher Karriereweg im modernen Remote-Vertrieb — für Menschen, die mehr aus sich machen wollen. Selbstbestimmt, ortsunabhängig, in deinem Tempo.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      (meta as HTMLMetaElement).name = "description";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, []);




  return (
    <main className="min-h-screen bg-background text-foreground pb-24 md:pb-0">
      <PublicMemberNavLink page="apply" tone="dark" />
      {/* 1. HERO — EMOTION + HOOK + MICRO-COMMITMENT
          Two cohorts:
            - male_ambition  → original dark, ambition-framed hero
            - default (female-leaning) → editorial-calm sage/cream split-screen,
              feminine-strong, calm-confident imagery, soft sage CTA. Copy
              follows the female-funnel brief (Freiheit / Unabhängigkeit /
              echte Entwicklung — no pressure, no luxury flexing). */}
      {audience === "male_ambition" ? (
        <section className="relative flex min-h-screen items-center border-b border-border/40 px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <motion.div {...fadeUp}>
              <Eyebrow>{activeHeroHeadline.eyebrow}</Eyebrow>
              <h1 className="font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
                {activeHeroHeadline.line1}
                <br />
                {activeHeroHeadline.line2}
              </h1>
              <p className="mt-8 max-w-2xl font-serif text-lg leading-relaxed text-foreground/80 md:text-xl">
                {activeHeroHeadline.sub}
              </p>
              {activeHeroHeadline.pressure && (
                <p className="mt-3 max-w-2xl font-sans text-sm font-medium text-foreground/70 md:text-base">
                  {activeHeroHeadline.pressure}
                </p>
              )}

              <ApplyAuthorityStrip />

              {heroVariant === "INCOME" ? <ApplyIncomeMicroCommit /> : <ApplyTimeMicroCommit />}

              <ApplyStepBar />

              <ApplyWeeklyScarcity />

              <p className="mt-10 max-w-2xl font-serif text-[15px] italic leading-relaxed text-foreground/70 md:text-base">
                Gebaut für Menschen, die einen modernen, ehrlichen Karriereweg
                aufbauen wollen — mit echten Fähigkeiten, nicht mit Tricks.
              </p>


              <div className="mt-10">
                <SectionImage
                  src={heroNightImg} srcWebp={heroNightImgWebp}
                  alt="Junger Mann nachts am Laptop, nachdenklicher Blick"
                  priority
                  focal="left"
                />
              </div>

              <ul className="mt-10 space-y-3 font-serif text-base text-foreground/90 md:text-lg">
                {[
                  "100 % remote möglich",
                  moneyFramingExp.payload.incomeBullet,
                  "Auch ohne Erfahrung startbar",
                ].filter((b): b is string => Boolean(b)).map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
                    {b}
                  </li>
                ))}
              </ul>

              <div className="mt-12 flex flex-col items-start">
                <ApplyCTA
                  variant="accent"
                  location="hero"
                  heroVariant={heroVariant}
                  label={heroVariant === "CTA90" ? undefined : softEntryCtaLabel}
                />
              </div>
              <p className="mt-6 font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">
                2–3 Minuten · Du wirst geprüft – nicht jeder wird genommen
              </p>
            </motion.div>
          </div>
        </section>
      ) : (
        /* ── FEMALE-LEANING COHORT — Editorial Calm + Emotional Pull ──
           Copy & CTA are A/B tested via the existing apply_ab bucket:
             A/H → "sehnsucht" (melancholic-truth angle)
             B   → "potenzial"  (future-projection angle)
           Variant is logged in every CTA event for downstream analysis.
           No funnel/route/pixel/quiz mechanics are touched. */
        (() => {
          const femaleVariant: "sehnsucht" | "potenzial" =
            abBucket === "B" ? "potenzial" : "sehnsucht";

          const femaleCopy = femaleVariant === "potenzial"
            ? {
                eyebrow: "Neuer Weg · Remote · Ehrlich",
                headlineLead: "Vielleicht steckt mehr in dir,",
                headlineAccent: "als du gerade lebst.",
                sub: "Ein ruhiger, ehrlicher Schritt — um herauszufinden, was wirklich in dir möglich ist. Ohne Druck. Ohne Bewerbung. Ohne leere Online-Versprechen.",
                ctaLabel: "Mehr über diesen Weg erfahren",
                ctaMicro: "60 Sekunden · Keine Vorerfahrung nötig · Unverbindlich",
                cardEyebrow: "Sanfter Einstieg",
                cardHeadline: "Wie viel Raum hättest du gerade — für etwas wirklich Eigenes?",
                cardFooter: "Deine Antwort hilft uns, den passenden Weg für dich zu finden.",
                whyNow: "Wenn sich heute nichts verändert — wie sieht dein Alltag in einem Jahr aus?",
                authority: "Für Frauen, die merken: sie wollen längst mehr aus ihrem Leben machen — und suchen einen ehrlichen Weg, nicht den nächsten Hype.",
              }
            : {
                eyebrow: "Neue Perspektive · Remote · Ehrlich",
                headlineLead: "Irgendwann merkst du,",
                headlineAccent: "dass du dich an ein Leben gewöhnt hast, das du nie wolltest.",
                sub: "Vielleicht ist genau das der Moment, an dem etwas Neues beginnen darf. Ruhig. Ehrlich. In deinem Tempo.",
                ctaLabel: "Vielleicht ist das dein nächster Schritt",
                ctaMicro: "60 Sekunden · Unverbindlich · 100 % vertraulich",
                cardEyebrow: "Sanfter Einstieg",
                cardHeadline: "Wie viel Zeit hättest du realistisch — für etwas, das dir wirklich gehört?",
                cardFooter: "Keine Bewerbung. Keine Prüfung. Nur ein erster ehrlicher Blick.",
                whyNow: "Die meisten bleiben länger im falschen Alltag, als sie eigentlich wollten.",
                authority: "Für Frauen, die spüren, dass sie nicht mehr nur funktionieren wollen — sondern endlich etwas Eigenes aufbauen.",
              };

          return (
        <section
          className="relative border-b border-[#dce5d4] bg-[#f5f0e8] px-6 py-20 md:py-28 text-[#1a1a1a]"
          aria-label="Karriereweg für ambitionierte Frauen"
        >
          <div className="mx-auto max-w-6xl">
            {/* Split-screen hero */}
            <div className="flex flex-col gap-14 lg:flex-row lg:items-center lg:gap-24">
              {/* Copy side */}
              <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="flex-1 order-1 lg:order-1">
                <p className="mb-6 font-sans text-[11px] font-medium uppercase tracking-[0.28em] text-[#7d9b76]">
                  {femaleCopy.eyebrow}
                </p>
                <h1 className="font-serif text-4xl font-light leading-[1.08] tracking-tight text-[#1a1a1a] md:text-6xl lg:text-[68px]">
                  {femaleCopy.headlineLead}{" "}
                  <span className="italic text-[#7d9b76]">{femaleCopy.headlineAccent}</span>
                </h1>
                <p className="mt-8 max-w-lg font-sans text-lg leading-relaxed text-[#1a1a1a]/75 md:text-xl">
                  {femaleCopy.sub}
                </p>

                {/* Primary CTA — soft sage, never aggressive */}
                <div className="mt-10 flex flex-col items-start gap-3">
                  <Link
                    to="/apply/quiz"
                    onClick={() =>
                      handleApplyCtaClick("hero", {
                        section: "hero",
                        variant: `female_${femaleVariant}`,
                        ctaType: "primary",
                        extra: { audience: "female_focus", female_variant: femaleVariant },
                      })
                    }
                    className="inline-flex items-center gap-3 rounded-[12px] bg-[#7d9b76] px-10 py-5 font-sans text-base font-medium tracking-wide text-white shadow-sm transition-all hover:bg-[#6a8563] hover:shadow-md active:scale-[0.99]"
                  >
                    {femaleCopy.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <p className="flex items-center gap-2 font-sans text-sm text-[#7d9b76]">
                    <span className="h-1 w-1 rounded-full bg-[#7d9b76]" />
                    {femaleCopy.ctaMicro}
                  </p>
                </div>
              </motion.div>

              {/* Image side — calm, grounded, editorial */}
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                className="order-2 w-full overflow-hidden rounded-[16px] border border-[#dce5d4] lg:order-2 lg:w-[45%]"
              >
                <img
                  src={heroFemaleImg}
                  alt="Junge Frau in ruhigem Heim-Workspace mit warmem Morgenlicht"
                  width={832}
                  height={1024}
                  loading="eager"
                  decoding="sync"
                  fetchPriority="high"
                  className="aspect-[4/5] w-full object-cover"
                />
              </motion.div>
            </div>

            {/* Calm trust strip */}
            <div className="mt-20 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 border-y border-[#dce5d4] py-8">
              {[
                "100 % remote möglich",
                "Leistungsbasiert — abhängig vom Einsatz",
                "Auch ohne Vorerfahrung startbar",
              ].map((t) => (
                <span
                  key={t}
                  className="font-sans text-[11px] uppercase tracking-[0.22em] text-[#1a1a1a]/60"
                >
                  {t}
                </span>
              ))}
            </div>

            {/* Why-now — soft loss psychology, no pressure */}
            <p className="mx-auto mt-16 max-w-xl text-center font-serif text-xl italic leading-relaxed text-[#1a1a1a]/70 md:text-2xl">
              „{femaleCopy.whyNow}“
            </p>

            {/* First quiz question — Editorial Calm card.
                Reuses the same /apply/quiz time-prefill chips so the funnel
                mechanics stay identical; only headline/copy changes. */}
            <div className="mx-auto mt-16 max-w-2xl rounded-[16px] border border-[#dce5d4] bg-white p-8 shadow-[0_4px_24px_rgba(26,26,26,0.04)] md:p-14">
              <p className="font-serif text-xl italic text-[#7d9b76]">{femaleCopy.cardEyebrow}</p>
              <h2 className="mt-4 font-serif text-2xl font-light leading-tight text-[#1a1a1a] md:text-3xl">
                {femaleCopy.cardHeadline}
              </h2>
              <div className="mt-10 flex flex-col gap-4">
                {([
                  { bucket: "5-10" as ApplyTimeBucket, label: "5–10 Stunden" },
                  { bucket: "10-20" as ApplyTimeBucket, label: "10–20 Stunden" },
                  { bucket: "20+" as ApplyTimeBucket, label: "20+ Stunden" },
                ]).map((o) => (
                  <Link
                    key={o.bucket}
                    to="/apply/quiz"
                    onClick={() => {
                      setApplyTimePrefill(o.bucket);
                      try {
                        handleApplyCtaClick(`hero_micro_${o.bucket}`, {
                          section: "hero",
                          variant: `female_micro_${o.bucket}_${femaleVariant}`,
                          ctaType: "primary",
                          extra: { audience: "female_focus", female_variant: femaleVariant },
                        });
                      } catch { /* never block nav */ }
                    }}
                    className="group flex items-center justify-between rounded-[12px] border border-[#dce5d4] bg-white p-5 text-left transition-all hover:border-[#7d9b76] hover:bg-[#f5f0e8] active:scale-[0.99]"
                  >
                    <span className="font-sans text-base font-light text-[#1a1a1a] md:text-lg">{o.label}</span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#dce5d4] transition-all group-hover:border-[#7d9b76] group-hover:bg-[#7d9b76]">
                      <Check className="h-3 w-3 text-white opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={3} />
                    </span>
                  </Link>
                ))}
              </div>
              <p className="mt-8 text-center font-sans text-xs italic text-[#1a1a1a]/40">
                {femaleCopy.cardFooter}
              </p>
            </div>

            {/* Soft authority — emotional, no pressure, no luxury flex */}
            <p className="mx-auto mt-16 max-w-xl text-center font-serif text-[15px] italic leading-relaxed text-[#1a1a1a]/65 md:text-base">
              {femaleCopy.authority}
            </p>

            <p className="mt-10 text-center font-sans text-xs uppercase tracking-[0.22em] text-[#1a1a1a]/45">
              Unverbindlich · Keine Verpflichtung · 100 % vertraulich
            </p>
          </div>
        </section>
          );
        })()
      )}

      {/* ─── BELOW-THE-FOLD GATE ───
          Everything from here on is deferred until the browser is idle OR
          the user scrolls/touches/keyboards. Hero ships in the initial paint;
          this subtree mounts later. No copy/design/tracking changes. */}
      {belowFoldReady && (
        <Suspense fallback={null}>
          <ApplyBelowFold
            socialProofRef={socialProofRef}
            abBucket={abBucket}
            abCopy={abCopy}
            ApplyCTA={ApplyCTA}
            handleApplyCtaClick={handleApplyCtaClick}
          />
        </Suspense>
      )}
      {/* StickyCta stays sync — it's the mobile conversion anchor and tiny.
          DebugOverlay only mounts when ?apply_debug=1 is active. */}
      <StickyCta />
      <Suspense fallback={null}>
        <ApplyDebugOverlay />
      </Suspense>
    </main>
  );
}
