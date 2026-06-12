/**
 * FirstWinMechanismBlock — kleiner, sofortiger Fortschritt VOR der Entscheidung.
 *
 * Reframet das Quiz als „3-Minuten Potenzial-Analyse" (kein Bewerbungs-Wording).
 *
 * - 2 Angle-Varianten via Prop (A/B vom Parent): "direction" | "strength"
 * - CTA-Label A/B: "Meine Richtung entdecken" | "Potenzial-Analyse starten"
 * - CTA-Routing: NUR über bestehenden MEN_QUIZ_PATH + source=masterofsales-first_win
 *   → aud=men + source=masterofsales bleiben sticky, kein Routing-Override.
 * - Events:
 *    MASTER_FIRST_WIN_VIEW  (1x/Session, bei 50% Viewport)
 *    MASTER_FIRST_WIN_CLICK (1x/Session, beim ersten Klick)
 */
import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Compass, Brain, Target, CheckCircle2 } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";
import { forwardTrackingParams } from "@/lib/forward-tracking-params";

export type FirstWinAngle = "direction" | "strength";

const HEADLINE_COPY: Record<FirstWinAngle, string> = {
  direction: "Finde deinen nächsten Schritt heraus.",
  strength: "Entdecke, welche Stärke du bereits mitbringst.",
};

const SUB_COPY: Record<FirstWinAngle, string> = {
  direction:
    "Bevor du dich entscheidest, mach den ersten kleinen Schritt: erkenne, ob dieser Weg wirklich zu dir passt.",
  strength:
    "Bevor du dich entscheidest, mach den ersten kleinen Schritt: sieh, welche Kommunikations-Stärken du heute schon mitbringst.",
};

const BENEFITS = [
  { Icon: Brain, text: "Welche Kommunikations-Stärken du bereits hast" },
  { Icon: Compass, text: "Welcher Entwicklungstyp du bist" },
  { Icon: Target, text: "Ob dieser Weg zu deinen Zielen passt" },
  { Icon: CheckCircle2, text: "Welcher nächste Schritt für dich sinnvoll ist" },
];

const VIEW_KEY = "mos_first_win_view_fired_v1";
const CLICK_KEY = "mos_first_win_click_fired_v1";

interface Props {
  angle: FirstWinAngle;
  ctaLabel: string;
}

const FirstWinMechanismBlock = ({ angle, ctaLabel }: Props) => {
  const ref = useRef<HTMLElement | null>(null);

  const href = useMemo(
    () =>
      forwardTrackingParams(
        "/apply/quiz?aud=men&source=masterofsales-first_win",
      ),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    try {
      if (sessionStorage.getItem(VIEW_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            try {
              sessionStorage.setItem(VIEW_KEY, "1");
            } catch {
              /* ignore */
            }
            try {
              trackFunnelEvent("MASTER_FIRST_WIN_VIEW", {
                funnel: "masterofsales",
                angle,
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
  }, [angle]);

  const handleClick = () => {
    try {
      if (sessionStorage.getItem(CLICK_KEY) === "1") return;
      sessionStorage.setItem(CLICK_KEY, "1");
    } catch {
      /* ignore */
    }
    try {
      trackFunnelEvent("MASTER_FIRST_WIN_CLICK", {
        funnel: "masterofsales",
        angle,
        ab_slots: getActiveSlotSummary(),
      });
    } catch {
      /* never throw */
    }
  };

  return (
    <section
      ref={ref}
      data-mos-section="first_win"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.06] px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-accent sm:text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            3-Minuten Closer Readiness Check
          </span>
          <h2 className="mt-6 font-serif text-3xl leading-tight md:text-5xl">
            {HEADLINE_COPY[angle]}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-foreground/75 md:text-lg">
            {SUB_COPY[angle]}
          </p>
        </div>

        <ul className="mx-auto mt-10 grid max-w-xl gap-3 sm:grid-cols-2">
          {BENEFITS.map(({ Icon, text }) => (
            <li
              key={text}
              className="flex items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span className="text-sm leading-relaxed text-foreground/80">
                {text}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col items-center">
          <Link
            to={href}
            onClick={handleClick}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-foreground px-8 py-4 text-sm font-medium tracking-wide text-background transition hover:opacity-90 sm:w-auto"
          >
            <Sparkles className="h-4 w-4" />
            {ctaLabel}
          </Link>
          <p className="mt-4 text-[10px] uppercase tracking-[0.22em] text-foreground/55 sm:text-xs sm:tracking-[0.25em]">
            ca. 3 Minuten · keine Bewerbung · keine Verpflichtung
          </p>
        </div>
      </div>
    </section>
  );
};

export default FirstWinMechanismBlock;
