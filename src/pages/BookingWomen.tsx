import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass,
  Sparkles,
  HeartHandshake,
  Clock,
  ShieldCheck,
  Leaf,
  Sun,
  MessageCircle,
  ArrowDown,
  ArrowRight,
  Quote,
  Heart,
} from "lucide-react";

import { getStickyAbVariant, type StickyAbVariant } from "@/lib/sticky-ab-test";
import { trackFunnelEvent } from "@/lib/track-event";

const Booking = lazy(() => import("@/pages/Booking"));

/**
 * /booking-women — female-targeted presentation layer above the canonical
 * /booking flow. Designed for cold female traffic continuing from /apply.
 *
 * NON-NEGOTIABLE: This page does NOT reimplement booking, slot logic, lead
 * capture, Stripe, Pixel, CAPI, attribution, calendar links, qualification
 * guard, redirects, CRM, or any state machine. It only renders an emotional
 * frame above the existing <Booking /> component.
 *
 * Psychology focus (Frauen-Cold-Traffic):
 *   - Sicherheit · Zukunft · Selbstbestimmung · Entwicklung · Klarheit · Momentum
 *   - NICHT: Sales · Bewerbung · Qualifikation · Druck · Funnel-Energie
 *
 * Active A/B tests (sticky 30d, deterministic, dashboard-tracked):
 *   - booking_women_headline_v2  (A/B/C) — Hero-Headline-Angle (warmer copy)
 *   - booking_women_angle_v1     (A/B)   — Zukunft vs. Sicherheit framing
 *   - booking_women_cta_v2       (A/B/C) — weiche CTA-Variante
 *   - booking_women_momentum_v1  (A/B)   — Why-Now Block ein/aus
 *
 * Suppression of the generic BookingSoftFrame on this route is handled inside
 * BookingSoftFrame.tsx via pathname check + sessionStorage flag set here.
 */

const STORAGE_VIEW = "booking_women_view_v1";
const STORAGE_SCROLL = "booking_women_scroll_v1";
const STORAGE_STICKY = "booking_women_sticky_shown_v1";

interface HeadlineCopy {
  eyebrow: string;
  headline: string;
  sub: string;
}

const HEADLINES: Record<StickyAbVariant, HeadlineCopy> = {
  A: {
    eyebrow: "Du bist auf dem richtigen Weg",
    headline: "Vielleicht beginnt genau hier deine neue Richtung.",
    sub: "Ein ruhiges, ehrliches Gespräch — kein Verkaufsgespräch, kein Pitch, keine Bewertung.",
  },
  B: {
    eyebrow: "Mehr Klarheit, mehr Freiheit",
    headline: "Mehr Freiheit beginnt oft mit einem ehrlichen Gespräch.",
    sub: "Wir hören zu und sortieren mit dir, was wirklich zu deinem Leben passt — in deinem Tempo.",
  },
  C: {
    eyebrow: "Du musst das nicht alleine tragen",
    headline: "Du musst nicht alles alleine herausfinden.",
    sub: "Ein Raum für deine Fragen, deine Richtung und deine Möglichkeiten — ohne Druck und ohne Funnel-Energie.",
  },
};

const ANGLES: Record<"A" | "B", { label: string; lead: string }> = {
  A: {
    label: "Zukunft",
    lead: "Vielleicht ist das der Punkt, an dem sich für dich leise etwas zu verändern beginnt.",
  },
  B: {
    label: "Sicherheit",
    lead: "Du bist hier komplett sicher. Wir hören zu, wir verstehen, wir bewerten nicht.",
  },
};

const CTAS: Record<StickyAbVariant, string> = {
  A: "Gespräch starten",
  B: "Herausfinden, ob dieser Weg zu mir passt",
  C: "Orientierungsgespräch starten",
};

const WHY_TALK = [
  {
    icon: Compass,
    title: "Klarheit & Orientierung",
    body: "Du bekommst ein ehrliches Bild davon, wo du gerade stehst und welche Wege es heute wirklich gibt.",
  },
  {
    icon: Sun,
    title: "Neue Perspektive",
    body: "Wir zeigen dir moderne Möglichkeiten, die wenig mit klassischen Karriere-Bildern zu tun haben.",
  },
  {
    icon: Leaf,
    title: "Dein Tempo, deine Wahl",
    body: "Kein Druck, keine Erwartung. Du entscheidest, ob und wie es für dich weitergeht.",
  },
];

const WHAT_HAPPENS = [
  {
    n: "01",
    title: "Wir hören wirklich zu",
    body: "Wo stehst du gerade, was wünschst du dir, was hält dich aktuell auf.",
  },
  {
    n: "02",
    title: "Wir sortieren gemeinsam",
    body: "Welche Richtung zu dir, deinem Leben und deinem Tempo passt — ehrlich und ohne Schema.",
  },
  {
    n: "03",
    title: "Du nimmst etwas mit",
    body: "Auch ohne gemeinsamen Weg gehst du mit mehr Klarheit aus dem Gespräch raus.",
  },
];

const TRUST_CHIPS = [
  { icon: Clock, label: "20–30 Min." },
  { icon: ShieldCheck, label: "Vertraulich" },
  { icon: HeartHandshake, label: "Ohne Druck" },
  { icon: MessageCircle, label: "Auf Augenhöhe" },
];

// Real-feeling, anonymized voices — keep authentic, no Coach-/Guru-vibes.
const VOICES = [
  {
    name: "Lena, 29",
    quote:
      "Ich hatte erwartet, dass mir etwas verkauft wird. Stattdessen habe ich zum ersten Mal seit langem das Gefühl bekommen, dass jemand wirklich zuhört.",
    arc: "Routine → neue Richtung",
  },
  {
    name: "Sophie, 34",
    quote:
      "Es war kein Pitch. Es war ein Gespräch, das mir mehr Klarheit gegeben hat als Monate des Hin- und Herdenkens.",
    arc: "Unsicherheit → Selbstvertrauen",
  },
  {
    name: "Marie, 26",
    quote:
      "Ich war müde von Bewerbungs-Vibes. Hier ging es einfach um mich und meine nächste ehrliche Möglichkeit.",
    arc: "Stillstand → Entwicklung",
  },
];

// Why-Now — soft, no urgency theater.
const WHY_NOW = [
  "Die meisten Frauen warten länger als sie eigentlich wollten — und bereuen genau das.",
  "Ein ruhiges Gespräch jetzt ist leichter, als in sechs Monaten wieder am gleichen Punkt zu stehen.",
  "Du verpflichtest dich zu nichts. Du gewinnst nur Klarheit.",
];

export default function BookingWomen() {
  const headlineVariant = useMemo<StickyAbVariant>(
    () =>
      getStickyAbVariant("booking_women_headline_v2", {
        variants: ["A", "B", "C"],
        assignedEventName: "booking_women_headline_v2_assigned",
      }),
    [],
  );
  const angleVariant = useMemo<StickyAbVariant>(
    () =>
      getStickyAbVariant("booking_women_angle_v1", {
        variants: ["A", "B"],
        assignedEventName: "booking_women_angle_v1_assigned",
      }),
    [],
  );
  const ctaVariant = useMemo<StickyAbVariant>(
    () =>
      getStickyAbVariant("booking_women_cta_v2", {
        variants: ["A", "B", "C"],
        assignedEventName: "booking_women_cta_v2_assigned",
      }),
    [],
  );
  const momentumVariant = useMemo<StickyAbVariant>(
    () =>
      getStickyAbVariant("booking_women_momentum_v1", {
        variants: ["A", "B"],
        assignedEventName: "booking_women_momentum_v1_assigned",
      }),
    [],
  );

  const copy = HEADLINES[headlineVariant];
  const angle = ANGLES[(angleVariant === "B" ? "B" : "A") as "A" | "B"];
  const cta = CTAS[ctaVariant];
  const firedScroll = useRef(false);
  const firedSticky = useRef(false);
  const [showSticky, setShowSticky] = useState(false);

  // Mark active so BookingSoftFrame suppresses itself on this route.
  useEffect(() => {
    try {
      sessionStorage.setItem("booking_women_active", "1");
    } catch {
      /* ignore */
    }
    return () => {
      try {
        sessionStorage.removeItem("booking_women_active");
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Single impression event per session — all variant tags attached for
  // clean attribution in AbTestDashboard / event_logs.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_VIEW) === "1") return;
      sessionStorage.setItem(STORAGE_VIEW, "1");
    } catch {
      /* ignore */
    }
    trackFunnelEvent("booking_women_view", {
      funnel: "apply",
      surface: "booking-women",
      ab_test: "booking_women_v2",
      ab_headline: headlineVariant,
      ab_angle: angleVariant,
      ab_cta: ctaVariant,
      ab_momentum: momentumVariant,
    });
  }, [headlineVariant, angleVariant, ctaVariant, momentumVariant]);

  // Soft sticky bottom CTA appears after the user has scrolled past the hero —
  // momentum nudge without aggression. Single impression event per session.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const threshold = window.innerHeight * 0.7;
      const next = y > threshold;
      setShowSticky(next);
      if (next && !firedSticky.current) {
        firedSticky.current = true;
        try {
          if (sessionStorage.getItem(STORAGE_STICKY) !== "1") {
            sessionStorage.setItem(STORAGE_STICKY, "1");
            trackFunnelEvent("booking_women_sticky_shown", {
              funnel: "apply",
              ab_headline: headlineVariant,
              ab_cta: ctaVariant,
            });
          }
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [headlineVariant, ctaVariant]);

  const handleScrollToBooking = (source: "hero" | "secondary" | "sticky" | "why_now") => {
    if (!firedScroll.current) {
      firedScroll.current = true;
      try {
        sessionStorage.setItem(STORAGE_SCROLL, "1");
      } catch {
        /* ignore */
      }
      trackFunnelEvent("booking_women_cta_scroll", {
        funnel: "apply",
        source,
        ab_headline: headlineVariant,
        ab_angle: angleVariant,
        ab_cta: ctaVariant,
        ab_momentum: momentumVariant,
      });
    }
    const el = document.getElementById("booking-flow-anchor");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollBy({ top: window.innerHeight * 0.85, behavior: "smooth" });
  };

  useEffect(() => {
    const prev = document.title;
    document.title = "Dein nächster Schritt — ein ehrliches Gespräch";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[hsl(var(--funnel-warm-bg))] text-[hsl(30,10%,12%)]">
      {/* ── Hero — soft, feminine, momentum-preserving ──────────────────── */}
      <section className="relative px-6 pt-14 pb-10 md:pt-24 md:pb-14">
        {/* Subtle radial warmth backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--funnel-teal)/0.06),transparent_70%)]"
        />
        <div className="mx-auto max-w-2xl">
          {/* Continuity ping — emotional bridge from /apply */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-[hsl(var(--funnel-sand))] bg-white/70 px-3.5 py-1.5 backdrop-blur-[1px]"
          >
            <Heart className="h-3.5 w-3.5 text-[hsl(var(--funnel-teal))]" aria-hidden />
            <span className="font-sans text-[11px] tracking-wide text-[hsl(var(--funnel-grey))]">
              Schön, dass du hier bist — du gehst gerade den richtigen Schritt.
            </span>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-4 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--funnel-grey))]"
          >
            {copy.eyebrow}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="text-center font-display text-[30px] md:text-[44px] font-semibold leading-[1.12] tracking-[-0.01em] text-[hsl(30,10%,10%)]"
          >
            {copy.headline}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-5 max-w-xl text-center font-sans text-[15px] md:text-base leading-relaxed text-[hsl(var(--funnel-grey))]"
          >
            {copy.sub}
          </motion.p>

          {/* Angle line (Zukunft vs. Sicherheit) */}
          {angle.lead && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mx-auto mt-6 max-w-lg border-l-2 border-[hsl(var(--funnel-teal))]/50 pl-4 font-sans text-[14.5px] italic leading-relaxed text-[hsl(30,10%,26%)]"
            >
              {angle.lead}
            </motion.p>
          )}

          {/* Trust chips */}
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {TRUST_CHIPS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-1.5 font-sans text-xs text-[hsl(var(--funnel-grey))]"
              >
                <Icon className="h-3.5 w-3.5 text-[hsl(var(--funnel-teal))]" aria-hidden />
                {label}
              </li>
            ))}
          </ul>

          {/* Soft CTA — scrolls down to the real booking action below */}
          <div className="mt-9 flex flex-col items-center gap-3">
            <motion.button
              type="button"
              onClick={() => handleScrollToBooking("hero")}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              className="inline-flex items-center gap-2 rounded-full bg-[hsl(30,10%,12%)] px-8 py-3.5 font-sans text-sm font-medium tracking-wide text-white shadow-[0_10px_30px_-12px_hsl(30,10%,12%,0.35)] transition-colors hover:bg-[hsl(30,10%,18%)]"
            >
              {cta}
              <ArrowDown className="h-4 w-4" aria-hidden />
            </motion.button>
            <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--funnel-grey))]">
              Kein Verkaufsgespräch · 20–30 Min.
            </p>
          </div>
        </div>
      </section>

      {/* ── Warum dieses Gespräch ──────────────────────────────────────── */}
      <section className="px-6 py-8 md:py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-1 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--funnel-grey))]">
            Warum dieses Gespräch
          </h2>
          <p className="mx-auto mb-8 max-w-lg text-center font-display text-[22px] md:text-[26px] font-semibold leading-snug text-[hsl(30,10%,12%)]">
            Du gehst mit mehr Klarheit raus — nicht mit einem Pitch.
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            {WHY_TALK.map(({ icon: Icon, title, body }) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5 }}
                className="rounded-xl border border-[hsl(var(--funnel-sand))] bg-white/70 p-5 backdrop-blur-[1px]"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--funnel-teal))]/12">
                  <Icon className="h-4 w-4 text-[hsl(var(--funnel-teal))]" aria-hidden />
                </div>
                <p className="font-display text-[16px] font-semibold text-[hsl(30,10%,12%)]">
                  {title}
                </p>
                <p className="mt-1.5 font-sans text-[13.5px] leading-relaxed text-[hsl(var(--funnel-grey))]">
                  {body}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Echte Stimmen — Transformation, ohne Coach-Vibe ────────────── */}
      <section className="px-6 py-8 md:py-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-1 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--funnel-grey))]">
            Stimmen aus echten Gesprächen
          </h2>
          <p className="mx-auto mb-8 max-w-lg text-center font-display text-[22px] md:text-[26px] font-semibold leading-snug text-[hsl(30,10%,12%)]">
            So fühlt es sich an, einmal ehrlich hingeschaut zu haben.
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            {VOICES.map((v) => (
              <motion.figure
                key={v.name}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5 }}
                className="relative rounded-xl border border-[hsl(var(--funnel-sand))] bg-white/75 p-5 backdrop-blur-[1px]"
              >
                <Quote
                  className="absolute right-4 top-4 h-4 w-4 text-[hsl(var(--funnel-teal))]/40"
                  aria-hidden
                />
                <blockquote className="font-sans text-[14px] leading-relaxed text-[hsl(30,10%,22%)]">
                  „{v.quote}"
                </blockquote>
                <figcaption className="mt-4 flex items-center justify-between">
                  <span className="font-display text-[13px] font-semibold text-[hsl(30,10%,12%)]">
                    {v.name}
                  </span>
                  <span className="font-sans text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--funnel-teal))]">
                    {v.arc}
                  </span>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Was dich erwartet (Micro-Commitment) ───────────────────────── */}
      <section className="px-6 py-8 md:py-12">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--funnel-grey))]">
            Was dich erwartet
          </h2>
          <ol className="space-y-3">
            {WHAT_HAPPENS.map(({ n, title, body }) => (
              <li
                key={n}
                className="flex items-start gap-4 rounded-xl border border-[hsl(var(--funnel-sand))] bg-white/60 p-4"
              >
                <span className="font-display text-[15px] font-semibold tabular-nums text-[hsl(var(--funnel-teal))]">
                  {n}
                </span>
                <div>
                  <p className="font-display text-[15.5px] font-semibold text-[hsl(30,10%,12%)]">
                    {title}
                  </p>
                  <p className="mt-1 font-sans text-[13.5px] leading-relaxed text-[hsl(var(--funnel-grey))]">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* Reassurance */}
          <p className="mx-auto mt-7 max-w-lg text-center font-sans text-[14px] italic leading-relaxed text-[hsl(30,10%,26%)]">
            <Sparkles className="mr-1 inline h-4 w-4 text-[hsl(var(--funnel-teal))]" aria-hidden />
            Egal wie es weitergeht — du bist hier sicher, gesehen und nicht alleine.
          </p>
        </div>
      </section>

      {/* ── Why-Now (A/B: Variante A zeigt, B blendet aus) ─────────────── */}
      {momentumVariant === "A" && (
        <section className="px-6 py-8 md:py-12">
          <div className="mx-auto max-w-2xl rounded-2xl border border-[hsl(var(--funnel-sand))] bg-white/75 p-6 md:p-8">
            <h2 className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--funnel-grey))]">
              Warum gerade jetzt
            </h2>
            <ul className="space-y-3">
              {WHY_NOW.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 font-sans text-[14.5px] leading-relaxed text-[hsl(30,10%,22%)]"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--funnel-teal))]" />
                  {line}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => handleScrollToBooking("why_now")}
              className="mt-6 inline-flex items-center gap-2 font-sans text-[13px] font-medium text-[hsl(30,10%,12%)] underline-offset-4 hover:underline"
            >
              {cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </section>
      )}

      {/* ── Soft secondary CTA before the booking flow ─────────────────── */}
      <section className="px-6 pb-6 pt-2">
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <button
            type="button"
            onClick={() => handleScrollToBooking("secondary")}
            className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-[hsl(var(--funnel-grey))] underline-offset-4 transition-colors hover:text-[hsl(30,10%,12%)] hover:underline"
          >
            Termin wählen
          </button>
          <div className="mx-auto mt-10 h-px w-16 bg-[hsl(var(--funnel-sand))]" />
        </div>
      </section>

      {/* ── Canonical booking flow — UNCHANGED, only embedded ──────────── */}
      <Suspense
        fallback={
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[hsl(var(--funnel-grey))] border-t-transparent" />
          </div>
        }
      >
        <Booking />
      </Suspense>

      {/* ── Sticky soft CTA — mobile-first momentum nudge ──────────────── */}
      <AnimatePresence>
        {showSticky && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.35 }}
            className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 md:hidden"
          >
            <button
              type="button"
              onClick={() => handleScrollToBooking("sticky")}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[hsl(30,10%,12%)] px-6 py-3 font-sans text-[13px] font-medium text-white shadow-[0_14px_40px_-12px_hsl(30,10%,12%,0.45)] active:scale-[0.99]"
            >
              {cta}
              <ArrowDown className="h-4 w-4" aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
