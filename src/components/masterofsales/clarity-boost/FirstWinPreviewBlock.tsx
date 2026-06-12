/**
 * FirstWinPreviewBlock — "Was du nach 90 Sekunden weißt"
 * 3 Karten als Orientierung, kein Ergebnisversprechen.
 * Feuert MASTER_FIRST_WIN_PREVIEW_VIEW 1x/Session bei 50% Sichtbarkeit.
 */
import { useEffect, useRef } from "react";
import { Compass, Sparkles, ArrowRight } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

const SS_KEY = "mos_first_win_preview_view_v1";

const CARDS = [
  { Icon: Compass, text: "Wo du aktuell stehst" },
  { Icon: Sparkles, text: "Welche Stärken sichtbar werden" },
  { Icon: ArrowRight, text: "Welcher nächste Schritt sinnvoll sein könnte" },
];

const FirstWinPreviewBlock = () => {
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
              trackFunnelEvent("MASTER_FIRST_WIN_PREVIEW_VIEW", {
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
      data-mos-section="first_win_preview"
      className="mb-6 max-w-2xl rounded-2xl border border-accent/20 bg-foreground/[0.025] p-5 md:p-6"
    >
      <p className="text-[10px] uppercase tracking-[0.26em] text-accent sm:text-xs">
        Was du nach 90 Sekunden weißt
      </p>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {CARDS.map(({ Icon, text }) => (
          <li
            key={text}
            className="flex items-start gap-2.5 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span className="text-[13px] leading-relaxed text-foreground/85">
              {text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FirstWinPreviewBlock;
