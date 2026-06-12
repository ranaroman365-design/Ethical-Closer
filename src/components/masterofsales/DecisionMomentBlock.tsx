/**
 * DecisionMomentBlock — "Du musst heute keine Entscheidung treffen."
 * Senkt Widerstand vor dem ersten Haupt-CTA. Statisch, ruhig.
 * Feuert MASTER_DECISION_BLOCK_VIEW 1x/Session bei 50% Sichtbarkeit.
 */
import { useEffect, useRef } from "react";
import { trackFunnelEvent } from "@/lib/track-event";

const SS_KEY = "mos_decision_block_view_v1";

const DecisionMomentBlock = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.5) continue;
          try {
            if (sessionStorage.getItem(SS_KEY) !== "1") {
              sessionStorage.setItem(SS_KEY, "1");
              trackFunnelEvent("MASTER_DECISION_BLOCK_VIEW", {
                funnel: "masterofsales",
              });
            }
          } catch { /* noop */ }
          obs.disconnect();
          break;
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-mos-section="decision_moment"
      className="mb-6 max-w-2xl rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-5 md:p-6"
    >
      <p className="font-serif text-lg leading-snug text-foreground md:text-xl">
        Du musst heute keine Entscheidung treffen.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-foreground/75 md:text-base">
        Die Analyse dient nicht dazu, dich zu überzeugen.
        <br />
        Sie dient dazu, dir Klarheit zu geben.
      </p>
    </div>
  );
};

export default DecisionMomentBlock;
