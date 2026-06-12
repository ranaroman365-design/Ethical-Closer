/**
 * OutcomePreviewBlock — "Was du nach der Analyse weißt".
 * Reduziert wahrgenommenes Risiko vor jedem Haupt-CTA.
 * A/B (mos_outcome_preview): "control" | "alt" — leichte Copy-Variation.
 * Feuert MASTER_OUTCOME_PREVIEW_VIEW 1x/Session bei 50% Sichtbarkeit.
 */
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

const SS_KEY = "mos_outcome_preview_view_v1";

const HEADLINE: Record<string, string> = {
  control: "Was du nach der Analyse weißt",
  alt: "Was du nach 3 Minuten ehrlich über dich weißt",
};

const BULLETS: Record<string, string[]> = {
  control: [
    "Wo du aktuell stehst",
    "Welche Fähigkeiten bereits in dir vorhanden sind",
    "Welche nächsten Schritte sinnvoll sein könnten",
    "Ob dieser Weg überhaupt zu dir passt",
  ],
  alt: [
    "Deine aktuelle Standortbestimmung",
    "Deine Stärken — schwarz auf weiß",
    "Welcher nächste Schritt für dich realistisch ist",
    "Ob dieser Weg deiner Richtung entspricht — oder eben nicht",
  ],
};

const OutcomePreviewBlock = ({ variant }: { variant: "control" | "alt" }) => {
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
              trackFunnelEvent("MASTER_OUTCOME_PREVIEW_VIEW", {
                funnel: "masterofsales",
                outcome_variant: variant,
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

  const bullets = BULLETS[variant] ?? BULLETS.control;
  return (
    <div
      ref={ref}
      data-mos-section="outcome_preview"
      className="mb-6 max-w-2xl rounded-2xl border border-accent/25 bg-accent/[0.04] p-5 md:p-6"
    >
      <p className="text-[10px] uppercase tracking-[0.24em] text-accent sm:text-xs">
        {HEADLINE[variant] ?? HEADLINE.control}
      </p>
      <ul className="mt-4 grid gap-2.5">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span className="text-[13px] leading-relaxed text-foreground/85 md:text-sm">
              {b}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-foreground/55 sm:text-xs">
        Keine Versprechen. Keine Garantien. Nur Klarheit.
      </p>
    </div>
  );
};

export default OutcomePreviewBlock;
