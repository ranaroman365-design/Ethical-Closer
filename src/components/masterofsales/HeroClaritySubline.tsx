/**
 * HeroClaritySubline — additive Subline direkt unter der Hero-H1.
 * Reframt das Quiz von "Bewerbung" zu "Klarheit/Diagnose".
 * A/B (mos_hero_clarity) wird im Parent ausgewählt; hier nur Render + 1x-Session-Event.
 */
import { useEffect, useRef } from "react";
import { trackFunnelEvent } from "@/lib/track-event";

const SS_KEY = "mos_hero_variant_view_v1";

const COPY: Record<string, string> = {
  A: "Finde heraus, welches Potenzial bereits in dir steckt – und welcher nächste Schritt wirklich Sinn ergibt.",
  B: "Bevor du Zeit investierst: finde heraus, ob dieser Weg überhaupt zu dir passt.",
};

const HeroClaritySubline = ({ variant }: { variant: "A" | "B" }) => {
  const ref = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.5) continue;
          try {
            if (sessionStorage.getItem(SS_KEY) !== "1") {
              sessionStorage.setItem(SS_KEY, "1");
              trackFunnelEvent("MASTER_HERO_VARIANT_VIEW", {
                funnel: "masterofsales",
                hero_clarity_variant: variant,
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
  }, [variant]);

  return (
    <p
      ref={ref}
      data-mos-section="hero_clarity_subline"
      className="mt-5 max-w-2xl text-base leading-relaxed text-foreground/85 md:text-lg"
    >
      {COPY[variant] ?? COPY.A}
    </p>
  );
};

export default HeroClaritySubline;
