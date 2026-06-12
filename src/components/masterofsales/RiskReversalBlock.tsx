/**
 * RiskReversalBlock — beruhigt Unsicherheit vor dem CTA.
 *
 * Kein Geld-zurück-Versprechen, kein Verkaufsdruck. Reine Erwartungs-
 * klarheit: Orientierung zuerst, ehrlicher Fit-Check, keine Verpflichtung.
 */
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";

const POINTS = [
  "Du musst nicht perfekt vorbereitet sein.",
  "Es geht zuerst um Orientierung — nicht um eine Entscheidung.",
  "Kein Druck. Keine Verpflichtung. Kein Verkaufsskript.",
  "Ehrlicher Fit-Check — auch wenn es nicht passt, bekommst du Klarheit.",
];

const FIRED_KEY = "mos_risk_reversal_view_fired_v1";

const RiskReversalBlock = () => {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    try {
      if (sessionStorage.getItem(FIRED_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            try {
              sessionStorage.setItem(FIRED_KEY, "1");
            } catch {
              /* ignore */
            }
            try {
              trackFunnelEvent("MASTER_RISK_REVERSAL_VIEW", {
                funnel: "masterofsales",
                ab_slots: getActiveSlotSummary(),
              });
            } catch {
              /* never throw */
            }
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
      data-mos-section="risk_reversal"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
        <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
          Was, wenn ich mir unsicher bin?
        </p>
        <h2 className="mt-5 font-serif text-3xl leading-tight md:text-4xl">
          Unsicherheit ist kein Ausschlusskriterium —<br />
          sondern der ehrlichste Ausgangspunkt.
        </h2>

        <blockquote className="mt-8 border-l-2 border-accent/60 pl-5 font-serif text-lg italic leading-relaxed text-foreground/80 md:text-xl">
          „Das erste Ziel ist nicht, dich zu überreden. Das Ziel ist
          herauszufinden, ob dieser Weg wirklich zu dir passt."
        </blockquote>

        <ul className="mt-10 grid gap-4 text-sm leading-relaxed text-foreground/80 md:text-base">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default RiskReversalBlock;
