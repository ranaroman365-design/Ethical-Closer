import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Compass, Clock, ShieldCheck, Sparkles, HeartHandshake } from "lucide-react";
import { getStickyAbVariant } from "@/lib/sticky-ab-test";
import { trackFunnelEvent } from "@/lib/track-event";

/**
 * BookingSoftFrame
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure presentational layer rendered ABOVE the existing /booking flow.
 * It does NOT touch routing, slot logic, contact form, calendar selection,
 * Stripe flow, tracking events, or any state in Booking.tsx.
 *
 * Goal (per spec):
 *   - Reframe the call from "Sales / Bewerbung / Qualifikation" → "Orientierung,
 *     Gespräch, nächster Schritt".
 *   - Keep emotional momentum from /apply (Zukunft, Freiheit, Entwicklung).
 *   - Add a soft micro-commitment / "was passiert im Gespräch?" cushion BEFORE
 *     the user hits the booking CTA — so the commitment jump feels organic.
 *   - Mobile-first, calm, high-trust, gender-friendly (works on female cold
 *     traffic without high-pressure energy).
 *
 * A/B test (lean, auto):
 *   key: booking_soft_frame_v1
 *   A = "Zukunfts-Angle"  → headline emphasises next chapter / Entwicklung
 *   B = "Sicherheits-Angle" → headline emphasises Orientierung / Klarheit
 *
 * Assignment uses the existing sticky-ab-test layer (deterministic, 30d TTL,
 * fires `booking_soft_frame_v1_assigned` for the AbTestDashboard).
 *
 * Surfaces ONE impression event per session and ONE CTA-scroll signal.
 */

const STORAGE_IMPRESSION = "booking_soft_frame_impression_v1";
const STORAGE_SCROLL = "booking_soft_frame_scroll_v1";

type Variant = "A" | "B";

interface Copy {
  eyebrow: string;
  headline: string;
  sub: string;
  reassurance: string;
}

const COPY: Record<Variant, Copy> = {
  A: {
    eyebrow: "Dein nächster Schritt",
    headline: "Ein ruhiges Gespräch — kein Verkaufsgespräch.",
    sub:
      "Wir schauen gemeinsam, wo du gerade stehst und wie ein moderner, ehrlicher Weg für dich aussehen kann.",
    reassurance:
      "Du bekommst Klarheit über deine Möglichkeiten — auch wenn am Ende kein gemeinsamer Weg entsteht.",
  },
  B: {
    eyebrow: "Orientierung statt Druck",
    headline: "Ein offenes Gespräch über deine nächste Richtung.",
    sub:
      "Kein Pitch, keine Selektion, keine Härte. Wir hören zu, sortieren mit dir und zeigen dir ehrlich, was passt.",
    reassurance:
      "Du gehst aus dem Gespräch mit mehr Klarheit raus — ganz unabhängig davon, wie es weitergeht.",
  },
};

const WHAT_HAPPENS = [
  {
    icon: Compass,
    title: "Wir hören zu",
    body: "Wo stehst du gerade, was suchst du wirklich, was hält dich aktuell auf.",
  },
  {
    icon: Sparkles,
    title: "Wir sortieren mit dir",
    body: "Welche moderne Richtung zu deiner Situation, deinem Tempo und deinem Leben passt.",
  },
  {
    icon: HeartHandshake,
    title: "Du entscheidest",
    body: "Kein Druck, kein Pitch. Du gehst mit Klarheit raus — der nächste Schritt ist deine Wahl.",
  },
];

const TRUST_CHIPS = [
  { icon: Clock, label: "20–30 Min." },
  { icon: ShieldCheck, label: "Vertraulich" },
  { icon: HeartHandshake, label: "Kein Verkaufsgespräch" },
];

export default function BookingSoftFrame({ step }: { step: "contact" | "slots" }) {
  // Suppress when wrapped by /booking-men (male-targeted layer renders its own
  // hero/momentum/reassurance above the canonical Booking flow). Defense in
  // depth: pathname check + sessionStorage flag set by BookingMen.
  const suppressed =
    (typeof window !== "undefined" &&
      (window.location.pathname.startsWith("/booking-men") ||
        window.location.pathname.startsWith("/booking-women") ||
        (typeof sessionStorage !== "undefined" &&
          (sessionStorage.getItem("booking_men_active") === "1" ||
            sessionStorage.getItem("booking_women_active") === "1")))) || false;

  const variant = useMemo<Variant>(
    () =>
      (getStickyAbVariant("booking_soft_frame_v1", {
        assignedEventName: "booking_soft_frame_v1_assigned",
      }) as Variant) ?? "A",
    [],
  );
  const copy = COPY[variant];
  const firedScroll = useRef(false);

  // Impression — once per session, with variant attached so the dashboard
  // can attribute booking-rate lift back to the variant.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_IMPRESSION) === "1") return;
      sessionStorage.setItem(STORAGE_IMPRESSION, "1");
    } catch {
      /* ignore */
    }
    trackFunnelEvent("booking_soft_frame_view", {
      funnel: "apply",
      step,
      ab_test: "booking_soft_frame_v1",
      ab_variant: variant,
    });
  }, [step, variant]);

  if (suppressed) return null;


  // Soft "scroll to action" — pure UX nudge, no logic change.
  const handleScrollDown = () => {
    if (!firedScroll.current) {
      firedScroll.current = true;
      try {
        sessionStorage.setItem(STORAGE_SCROLL, "1");
      } catch { /* ignore */ }
      trackFunnelEvent("booking_soft_frame_cta_scroll", {
        funnel: "apply",
        step,
        ab_test: "booking_soft_frame_v1",
        ab_variant: variant,
      });
    }
    // Scroll to the next section (existing contact / slots block).
    const el = document.getElementById("booking-flow-anchor");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollBy({ top: window.innerHeight * 0.75, behavior: "smooth" });
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="mb-10 md:mb-14"
      aria-label="Was dich im Gespräch erwartet"
    >
      {/* Eyebrow */}
      <p className="mb-3 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--funnel-grey))]">
        {copy.eyebrow}
      </p>

      {/* Headline */}
      <h2 className="mx-auto max-w-xl text-center font-display text-[26px] md:text-[34px] font-semibold leading-[1.18] text-[hsl(30,10%,12%)]">
        {copy.headline}
      </h2>

      {/* Sub */}
      <p className="mx-auto mt-4 max-w-lg text-center font-sans text-[15px] md:text-base leading-relaxed text-[hsl(var(--funnel-grey))]">
        {copy.sub}
      </p>

      {/* Trust chips — calm, low-contrast */}
      <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
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

      {/* What happens in the call — micro-commitment cushion */}
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {WHAT_HAPPENS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="rounded-md border border-[hsl(var(--funnel-sand))] bg-white/70 p-4 backdrop-blur-[1px]"
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--funnel-teal))]/12">
              <Icon className="h-4 w-4 text-[hsl(var(--funnel-teal))]" aria-hidden />
            </div>
            <p className="font-display text-[15px] font-semibold text-[hsl(30,10%,12%)]">
              {title}
            </p>
            <p className="mt-1 font-sans text-[13px] leading-relaxed text-[hsl(var(--funnel-grey))]">
              {body}
            </p>
          </div>
        ))}
      </div>

      {/* Soft reassurance line */}
      <p className="mx-auto mt-6 max-w-xl border-l-2 border-[hsl(var(--funnel-teal))]/50 pl-4 font-sans text-[14px] italic leading-relaxed text-[hsl(30,10%,28%)]">
        {copy.reassurance}
      </p>

      {/* Gentle nudge to flow below — never replaces the real CTA */}
      <div className="mt-7 flex justify-center">
        <button
          type="button"
          onClick={handleScrollDown}
          className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-[hsl(var(--funnel-grey))] underline-offset-4 transition-colors hover:text-[hsl(30,10%,12%)] hover:underline"
        >
          {step === "contact" ? "Weiter zum nächsten Schritt" : "Termin wählen"}
        </button>
      </div>

      {/* Divider */}
      <div className="mx-auto mt-10 h-px w-16 bg-[hsl(var(--funnel-sand))]" />
    </motion.section>
  );
}
