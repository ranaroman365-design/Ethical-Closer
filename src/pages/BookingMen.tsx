import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Compass, Sparkles, HeartHandshake, Clock, ShieldCheck, Target, TrendingUp, Eye, ArrowDown } from "lucide-react";

import { getStickyAbVariant, type StickyAbVariant } from "@/lib/sticky-ab-test";
import { trackFunnelEvent } from "@/lib/track-event";
import { useAbSlot } from "@/hooks/useAbSlot";
import BookingPrepBlock from "@/components/booking-additive/BookingPrepBlock";
import MicroCommitmentBlock from "@/components/booking-additive/MicroCommitmentBlock";
import CalendarTrustBlock from "@/components/booking-additive/CalendarTrustBlock";

const BOOKING_TRUST_SLOT = {
  slot: "mos_booking_trust",
  variants: [
    { id: "in_ruhe", baseWeight: 1 },
    { id: "klarheit_zuerst", baseWeight: 1 },
  ],
} as const;

const Booking = lazy(() => import("@/pages/Booking"));

/**
 * /booking-men — male-targeted presentation layer above the existing /booking flow.
 *
 * IMPORTANT: This page does NOT reimplement booking, lead-capture, slot logic,
 * Stripe, Pixel, CAPI, attribution, calendar links, qualification guard, or
 * any state machine. It renders the canonical <Booking /> component below a
 * male-oriented hero / momentum / micro-commitment layer. Zero breaking changes.
 *
 * Active A/B tests (sticky 30d, deterministic, surfaced in AbTestDashboard):
 *   - booking_men_headline_v1  (A/B/C) — headline angle
 *   - booking_men_angle_v1     (A/B)   — Fortschritt vs. Freiheit framing
 *   - booking_men_cta_v1       (A/B/C) — soft CTA copy
 *
 * Suppression of the generic BookingSoftFrame on this route is handled inside
 * BookingSoftFrame.tsx via a pathname check, so we never double-frame.
 */

const STORAGE_VIEW = "booking_men_view_v1";
const STORAGE_SCROLL = "booking_men_scroll_v1";

interface HeadlineCopy {
  eyebrow: string;
  headline: string;
  sub: string;
}

const HEADLINES: Record<StickyAbVariant, HeadlineCopy> = {
  A: {
    eyebrow: "Dein nächster Schritt",
    headline: "Vielleicht ist das genau die Richtung, die dir bisher gefehlt hat.",
    sub: "Ein ruhiges Gespräch über deinen nächsten Schritt — ohne Druck, ohne Pitch, ohne Bewertung.",
  },
  B: {
    eyebrow: "Klarheit über deinen Weg",
    headline: "Der nächste Schritt beginnt mit Klarheit.",
    sub: "Wir sortieren mit dir, wo du stehst und welche moderne Richtung wirklich zu dir passt.",
  },
  C: {
    eyebrow: "Moderne Freiheit",
    headline: "Moderne Fähigkeiten schaffen moderne Freiheit.",
    sub: "Ein offenes Gespräch über deine Möglichkeiten — ehrlich, konkret, ohne Verkaufsenergie.",
  },
};

const ANGLES: Record<StickyAbVariant, { label: string; lead: string }> = {
  A: {
    label: "Fortschritt",
    lead: "Du musst nicht im selben Alltag stecken bleiben. Es gibt einen modernen Weg nach vorne.",
  },
  B: {
    label: "Freiheit",
    lead: "Mehr Freiheit beginnt fast immer mit einer ehrlichen Entscheidung — nicht mit mehr Information.",
  },
  C: { label: "Fortschritt", lead: "" },
};

const CTAS: Record<StickyAbVariant, string> = {
  A: "Gespräch starten",
  B: "Nächsten Schritt ansehen",
  C: "Richtung finden",
};

const WHY_TALK = [
  {
    icon: Eye,
    title: "Ehrlicher Einblick",
    body: "Du siehst, wie moderne Karrierewege heute wirklich aussehen — ungefiltert, ohne Marketing-Energie.",
  },
  {
    icon: Compass,
    title: "Klare Richtung",
    body: "Wir sortieren mit dir, was zu deiner Situation, deinem Tempo und deinem Leben passt.",
  },
  {
    icon: TrendingUp,
    title: "Konkreter Schritt",
    body: "Du gehst mit einer klaren nächsten Aktion raus — auch wenn am Ende kein gemeinsamer Weg entsteht.",
  },
];

const WHAT_HAPPENS = [
  { n: "01", title: "Wir hören zu", body: "Wo stehst du gerade, was suchst du, was hält dich auf." },
  { n: "02", title: "Wir sortieren", body: "Welche Richtung wirklich zu dir passt — und welche nicht." },
  { n: "03", title: "Du entscheidest", body: "Kein Druck, kein Pitch. Der nächste Schritt ist deine Wahl." },
];

const TRUST_CHIPS = [
  { icon: Clock, label: "20–30 Min." },
  { icon: ShieldCheck, label: "Vertraulich" },
  { icon: HeartHandshake, label: "Kein Verkaufsgespräch" },
  { icon: Target, label: "Konkrete Klarheit" },
];

export default function BookingMen() {
  const headlineVariant = useMemo<StickyAbVariant>(
    () =>
      getStickyAbVariant("booking_men_headline_v1", {
        variants: ["A", "B", "C"],
        assignedEventName: "booking_men_headline_v1_assigned",
      }),
    [],
  );
  const angleVariant = useMemo<StickyAbVariant>(
    () =>
      getStickyAbVariant("booking_men_angle_v1", {
        variants: ["A", "B"],
        assignedEventName: "booking_men_angle_v1_assigned",
      }),
    [],
  );
  const ctaVariant = useMemo<StickyAbVariant>(
    () =>
      getStickyAbVariant("booking_men_cta_v1", {
        variants: ["A", "B", "C"],
        assignedEventName: "booking_men_cta_v1_assigned",
      }),
    [],
  );

  const copy = HEADLINES[headlineVariant];
  const angle = ANGLES[angleVariant];
  const cta = CTAS[ctaVariant];
  const firedScroll = useRef(false);
  const bookingTrust = useAbSlot(BOOKING_TRUST_SLOT);

  // Mark active so BookingSoftFrame can suppress itself (defense-in-depth
  // alongside the pathname check inside BookingSoftFrame).
  useEffect(() => {
    try { sessionStorage.setItem("booking_men_active", "1"); } catch { /* ignore */ }
    return () => {
      try { sessionStorage.removeItem("booking_men_active"); } catch { /* ignore */ }
    };
  }, []);

  // Single impression event (per session) with all three variant tags so
  // AbTestDashboard / event_logs can attribute booking-rate lift cleanly.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_VIEW) === "1") return;
      sessionStorage.setItem(STORAGE_VIEW, "1");
    } catch { /* ignore */ }
    trackFunnelEvent("booking_men_view", {
      funnel: "masterofsales",
      surface: "booking-men",
      ab_test: "booking_men_v1",
      ab_headline: headlineVariant,
      ab_angle: angleVariant,
      ab_cta: ctaVariant,
    });
  }, [headlineVariant, angleVariant, ctaVariant]);

  const handleScrollToBooking = () => {
    if (!firedScroll.current) {
      firedScroll.current = true;
      try { sessionStorage.setItem(STORAGE_SCROLL, "1"); } catch { /* ignore */ }
      trackFunnelEvent("booking_men_cta_scroll", {
        funnel: "masterofsales",
        ab_headline: headlineVariant,
        ab_angle: angleVariant,
        ab_cta: ctaVariant,
      });
    }
    const el = document.getElementById("booking-flow-anchor");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollBy({ top: window.innerHeight * 0.85, behavior: "smooth" });
  };
  useEffect(() => {
    const prev = document.title;
    document.title = "Dein nächster Schritt — Orientierungsgespräch";
    return () => { document.title = prev; };
  }, []);

  return (
    <>

      <main className="min-h-screen bg-[hsl(var(--funnel-warm-bg))] text-[hsl(30,10%,12%)]">
        {/* ── Hero — male-oriented, calm, premium ───────────────────────── */}
        <section className="px-6 pt-14 pb-10 md:pt-24 md:pb-14">
          <div className="mx-auto max-w-2xl">
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

            {/* Angle line (Fortschritt vs Freiheit) */}
            {angle.lead && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="mx-auto mt-6 max-w-lg border-l-2 border-[hsl(var(--funnel-teal))]/55 pl-4 font-sans text-[14.5px] italic leading-relaxed text-[hsl(30,10%,26%)]"
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

            {/* Soft CTA — scrolls down, never replaces the booking action */}
            <div className="mt-9 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleScrollToBooking}
                className="inline-flex items-center gap-2 rounded-md bg-[hsl(30,10%,12%)] px-7 py-3.5 font-sans text-sm font-medium tracking-wide text-white transition-all hover:bg-[hsl(30,10%,18%)] active:scale-[0.99]"
              >
                {cta}
                <ArrowDown className="h-4 w-4" aria-hidden />
              </button>
              <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--funnel-grey))]">
                Kein Verkaufsgespräch · 20–30 Min.
              </p>
            </div>
          </div>
        </section>

        {/* ── Warum dieses Gespräch? ─────────────────────────────────────── */}
        <section className="px-6 py-8 md:py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-1 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--funnel-grey))]">
              Warum dieses Gespräch
            </h2>
            <p className="mx-auto mb-8 max-w-lg text-center font-display text-[22px] md:text-[26px] font-semibold leading-snug text-[hsl(30,10%,12%)]">
              Du gehst mit Klarheit raus — nicht mit einem Pitch.
            </p>

            <div className="grid gap-3 md:grid-cols-3">
              {WHY_TALK.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-md border border-[hsl(var(--funnel-sand))] bg-white/70 p-5 backdrop-blur-[1px]"
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
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Was passiert im Gespräch (Micro-Commitment) ────────────────── */}
        <section className="px-6 py-8 md:py-12">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-6 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--funnel-grey))]">
              Was dich erwartet
            </h2>
            <ol className="space-y-3">
              {WHAT_HAPPENS.map(({ n, title, body }) => (
                <li
                  key={n}
                  className="flex items-start gap-4 rounded-md border border-[hsl(var(--funnel-sand))] bg-white/60 p-4"
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
              Egal wie es weitergeht — du nimmst mehr Klarheit mit raus als du reinkommst.
            </p>

            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={handleScrollToBooking}
                className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-[hsl(var(--funnel-grey))] underline-offset-4 transition-colors hover:text-[hsl(30,10%,12%)] hover:underline"
              >
                Termin wählen
              </button>
            </div>

            <div className="mx-auto mt-10 h-px w-16 bg-[hsl(var(--funnel-sand))]" />
          </div>
        </section>

        {/* CRO Gap Closure — Booking-Prep direkt vor Booking */}
        <BookingPrepBlock />

        {/* CRO Gap Closure — Micro-Commitment (lokal, nicht persistiert) */}
        <MicroCommitmentBlock />

        {/* ── Canonical booking flow — UNCHANGED, just embedded ──────────── */}
        <Suspense
          fallback={
            <div className="flex justify-center py-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[hsl(var(--funnel-grey))] border-t-transparent" />
            </div>
          }
        >
          <Booking />
        </Suspense>

        {/* CRO Gap Closure — Calendar Trust + Show-Up Hint direkt unter Booking */}
        <CalendarTrustBlock
          variant={
            (bookingTrust.variant === "klarheit_zuerst"
              ? "klarheit_zuerst"
              : "in_ruhe") as "in_ruhe" | "klarheit_zuerst"
          }
        />
      </main>
    </>
  );
}
