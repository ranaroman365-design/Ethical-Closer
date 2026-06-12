/**
 * CalendarTrustBlock — additiv direkt UNTER dem Booking-Embed.
 *
 *  - A/B-Slot (mos_booking_trust): "in_ruhe" | "klarheit_zuerst"
 *  - Show-Up Psychology Hinweis (kein Druck, keine Knappheit)
 *
 * Events (1x/Session):
 *  - MASTER_BOOKING_TRUST_VIEW
 */
import { useEffect, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

const VIEW_KEY = "mos_booking_trust_view_v1";

const COPY: Record<string, string> = {
  in_ruhe: "Du entscheidest danach in Ruhe, ob dieser Weg passt.",
  klarheit_zuerst:
    "Das Gespräch dient zuerst der Klarheit — nicht einer Entscheidung.",
};

interface Props {
  variant: "in_ruhe" | "klarheit_zuerst";
}

const CalendarTrustBlock = ({ variant }: Props) => {
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
              trackFunnelEvent("MASTER_BOOKING_TRUST_VIEW", {
                funnel: "masterofsales",
                trust_variant: variant,
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
  }, [variant]);

  return (
    <section
      ref={ref}
      data-mos-section="calendar_trust"
      className="border-t border-[hsl(var(--funnel-sand))] bg-white/70 px-6 py-10"
    >
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--funnel-sand))] bg-white/80 px-3.5 py-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--funnel-teal))]" />
          <span className="font-sans text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--funnel-grey))]">
            Beidseitig ehrlich
          </span>
        </div>
        <p className="mx-auto mt-5 max-w-lg font-display text-[18px] md:text-[20px] font-semibold leading-snug text-[hsl(30,10%,14%)]">
          {COPY[variant]}
        </p>
        <p className="mx-auto mt-4 max-w-md font-sans text-[13px] italic leading-relaxed text-[hsl(var(--funnel-grey))]">
          Menschen erscheinen häufiger zu Gesprächen, wenn sie sich bewusst
          vorbereitet haben.
        </p>
      </div>
    </section>
  );
};

export default CalendarTrustBlock;
