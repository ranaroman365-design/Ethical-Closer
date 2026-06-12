/**
 * BookingPrepBlock — additiv direkt vor dem Booking-Embed (/booking-men).
 *
 * Reduziert Booking-Friction (Calendly Open → Booking) durch:
 *  - Erwartungsklarheit ("Was passiert im Gespräch?")
 *  - Angst-Reduzierung ("Kein klassischer Sales Call.")
 *
 * Events (1x/Session):
 *  - MASTER_BOOKING_PREP_VIEW
 *
 * Keine Änderung an Booking, Calendly, Lead-Capture, Pixel oder CRM.
 */
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

const VIEW_KEY = "mos_booking_prep_view_v1";

const POINTS = [
  "Wo du aktuell stehst",
  "Welche Möglichkeiten zu dir passen",
  "Welche nächsten Schritte sinnvoll sind",
  "Ob dieser Weg überhaupt zu dir passt",
];

const BookingPrepBlock = () => {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    try {
      if (sessionStorage.getItem(VIEW_KEY) === "1") return;
    } catch { /* ignore */ }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            try {
              sessionStorage.setItem(VIEW_KEY, "1");
              trackFunnelEvent("MASTER_BOOKING_PREP_VIEW", {
                funnel: "masterofsales",
                page: "booking-men",
              });
            } catch { /* never throw */ }
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      data-mos-section="booking_prep"
      className="border-t border-[hsl(var(--funnel-sand))] bg-white/60 px-6 py-12 md:py-16"
    >
      <div className="mx-auto max-w-2xl">
        <p className="text-center font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--funnel-grey))]">
          Was passiert im Gespräch
        </p>
        <h2 className="mx-auto mt-4 max-w-xl text-center font-display text-[24px] md:text-[30px] font-semibold leading-snug text-[hsl(30,10%,12%)]">
          Kein klassischer Sales Call.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-center font-sans text-[14.5px] leading-relaxed text-[hsl(var(--funnel-grey))]">
          Kein Druck. Keine Verpflichtung. Keine Entscheidung vor Ort. Ein
          ehrliches Gespräch über deine Situation.
        </p>

        <ul className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-2">
          {POINTS.map((p) => (
            <li
              key={p}
              className="flex items-start gap-3 rounded-md border border-[hsl(var(--funnel-sand))] bg-white/70 p-4 font-sans text-[14px] leading-relaxed text-[hsl(30,10%,20%)]"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--funnel-teal))]" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default BookingPrepBlock;
