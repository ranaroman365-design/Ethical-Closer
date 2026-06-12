/**
 * FiveQuestionsPreviewBlock — "Die 5 Fragen"
 * Zeigt die 5 Themen — Besucher erkennt: das ist leicht.
 * Feuert MASTER_QUIZ_PREVIEW_VIEW 1x/Session (kanonischer Name, gemeinsam mit
 * QuizPreviewBlock geguarded über separaten Key, damit Doppel-View nicht
 * unterdrückt wird — Brief-Spec sagt: 1x/Session).
 */
import { useEffect, useRef } from "react";
import { Target, Zap, MessageCircle, Flame, Compass } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

const SS_KEY = "mos_five_questions_preview_view_v1";

const THEMES = [
  { Icon: Target, label: "Ziele" },
  { Icon: Zap, label: "Stärken" },
  { Icon: MessageCircle, label: "Kommunikation" },
  { Icon: Flame, label: "Motivation" },
  { Icon: Compass, label: "Richtung" },
];

const FiveQuestionsPreviewBlock = () => {
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
              trackFunnelEvent("MASTER_QUIZ_PREVIEW_VIEW", {
                funnel: "masterofsales",
                source: "five_questions_block",
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
      data-mos-section="five_questions_preview"
      className="mb-6 max-w-2xl rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-5 md:p-6"
    >
      <p className="text-[10px] uppercase tracking-[0.26em] text-accent sm:text-xs">
        Die 5 Fragen
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {THEMES.map(({ Icon, label }) => (
          <li
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/[0.04] px-3 py-1.5 text-[12px] text-foreground/80 sm:text-[13px]"
          >
            <Icon className="h-3.5 w-3.5 text-accent" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FiveQuestionsPreviewBlock;
