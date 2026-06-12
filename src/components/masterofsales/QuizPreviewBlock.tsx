/**
 * QuizPreviewBlock — additiv direkt vor dem Hero-CTA.
 *
 * Reduziert die mentale Einstiegshürde durch:
 *  - Mini-Preview "Was passiert in den nächsten 3 Minuten?" (3 Bullets)
 *  - Friction-Reduzierung via Dauer-Chip (A/B: "3 Minuten" | "7 kurze Fragen")
 *  - First-Win Mini-Progress (Schritt 1→2→3)
 *
 * Events (1x/Session, kein Duplikat-Risiko):
 *  - MASTER_QUIZ_PREVIEW_VIEW
 *  - MASTER_FIRST_WIN_VIEW
 *
 * Keine Änderung an Quiz, Routing, CRM, Pixel oder Attribution.
 */
import { useEffect, useRef } from "react";
import { Sparkles, Compass, Target, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

interface Props {
  /** A/B variant for friction chip: "3min" => "3 Minuten" | "7questions" => "7 kurze Fragen" */
  durationVariant: "3min" | "7questions";
}

const PREVIEW_VIEW_KEY = "mos_quiz_preview_view_v1";
const FIRST_WIN_VIEW_KEY = "mos_first_win_view_fired_v1";

const QuizPreviewBlock = ({ durationVariant }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.5) continue;
          try {
            if (sessionStorage.getItem(PREVIEW_VIEW_KEY) !== "1") {
              sessionStorage.setItem(PREVIEW_VIEW_KEY, "1");
              trackFunnelEvent("MASTER_QUIZ_PREVIEW_VIEW", {
                funnel: "masterofsales",
                duration_variant: durationVariant,
              });
            }
          } catch { /* never throw */ }
          try {
            if (sessionStorage.getItem(FIRST_WIN_VIEW_KEY) !== "1") {
              sessionStorage.setItem(FIRST_WIN_VIEW_KEY, "1");
              trackFunnelEvent("MASTER_FIRST_WIN_VIEW", {
                funnel: "masterofsales",
                source: "quiz_preview_block",
              });
            }
          } catch { /* never throw */ }
          obs.disconnect();
          break;
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [durationVariant]);

  const durationText =
    durationVariant === "7questions" ? "7 kurze Fragen" : "ca. 3 Minuten";

  return (
    <div
      ref={ref}
      data-mos-section="quiz_preview"
      className="mb-6 max-w-2xl rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-5 md:p-6"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <p className="text-[10px] uppercase tracking-[0.24em] text-accent sm:text-xs">
          Was passiert in den nächsten 3 Minuten
        </p>
      </div>

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {[
          { Icon: Compass, text: "Kurze Potenzial-Analyse" },
          { Icon: Target, text: "Persönliche Einordnung" },
          { Icon: CheckCircle2, text: "Klarheit über deinen nächsten Schritt" },
        ].map(({ Icon, text }) => (
          <li
            key={text}
            className="flex items-start gap-2.5 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span className="text-[13px] leading-relaxed text-foreground/80">
              {text}
            </span>
          </li>
        ))}
      </ul>

      {/* First-Win Mini Progress — Schritt 1 → 2 → 3 (premium, nicht gamifiziert) */}
      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-[11px] text-foreground/65 sm:text-xs">
        <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-accent">
          Schritt 1 · Potenzial
        </span>
        <ArrowRight className="h-3 w-3 text-foreground/35" />
        <span className="rounded-full border border-foreground/15 bg-foreground/[0.04] px-2.5 py-1">
          Schritt 2 · Einordnung
        </span>
        <ArrowRight className="h-3 w-3 text-foreground/35" />
        <span className="rounded-full border border-foreground/15 bg-foreground/[0.04] px-2.5 py-1">
          Schritt 3 · Nächster Schritt
        </span>
      </div>

      {/* Friction-Reducer Chip */}
      <div className="mt-5 inline-flex items-center gap-1.5 text-[11px] text-foreground/60 sm:text-xs">
        <Clock className="h-3.5 w-3.5 text-foreground/55" />
        Dauer: {durationText} · keine Bewerbung · keine Verpflichtung
      </div>
    </div>
  );
};

export default QuizPreviewBlock;
