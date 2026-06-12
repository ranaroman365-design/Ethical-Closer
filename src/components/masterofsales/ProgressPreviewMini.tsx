/**
 * ProgressPreviewMini — schmaler Pfad: Heute → Analyse → Einordnung → Nächster Schritt.
 * Premium, kein Gaming. Reduziert wahrgenommene Komplexität vor dem CTA.
 * Feuert MASTER_PROGRESS_PREVIEW_VIEW 1x/Session bei 50% Sichtbarkeit.
 */
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

const SS_KEY = "mos_progress_preview_view_v1";

const STEPS = [
  "Heute",
  "Potenzial-Analyse",
  "Persönliche Einordnung",
  "Nächster Schritt",
];

const ProgressPreviewMini = () => {
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
              trackFunnelEvent("MASTER_PROGRESS_PREVIEW_VIEW", {
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
      data-mos-section="progress_preview_mini"
      className="mb-6 flex max-w-2xl flex-wrap items-center gap-x-2 gap-y-2 text-[11px] text-foreground/65 sm:text-xs"
    >
      {STEPS.map((s, i) => (
        <span key={s} className="flex items-center gap-2">
          <span
            className={
              i === 0
                ? "rounded-full border border-foreground/20 bg-foreground/[0.04] px-2.5 py-1"
                : i === 1
                ? "rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-accent"
                : "rounded-full border border-foreground/15 bg-foreground/[0.03] px-2.5 py-1"
            }
          >
            {s}
          </span>
          {i < STEPS.length - 1 && (
            <ArrowRight className="h-3 w-3 text-foreground/35" />
          )}
        </span>
      ))}
    </div>
  );
};

export default ProgressPreviewMini;
