/**
 * ProgressControlBlock — additiv, in EthicalCloser Progress System™ integriert.
 *
 * Positionierung: "Dein Fortschritt hängt nicht von Bauchgefühl ab."
 * - 2 Message-Varianten (control | ownership)
 * - 3-Step Visualisierung: Aufgabe → Fortschritt sichtbar → nächster Schritt
 * - Coach-Rolle bleibt positiv ("Unterstützung auf deinem Weg")
 * - Keine Garantien, keine Gaming-Optik, dark/gold Premium-Stil
 *
 * Tracking (additiv, max 1x pro Session):
 *   MASTER_PROGRESS_CONTROL_VIEW          — bei >=50% Sichtbarkeit
 *   MASTER_PROGRESS_CONTROL_INTERACTION   — bei Hover/Tap auf einen Step
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Activity, ArrowRightCircle, Compass } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";

export type ProgressControlMessage = "control" | "ownership";

const COPY: Record<
  ProgressControlMessage,
  { eyebrow: string; headline: string; sub: string; body: string }
> = {
  control: {
    eyebrow: "Transparenz statt Bauchgefühl",
    headline: "Dein Fortschritt hängt nicht von Bauchgefühl ab.",
    sub: "Bei EthicalCloser entscheidet kein subjektives Gefühl darüber, wo du stehst.",
    body: "Du folgst einer klaren Roadmap, absolvierst echte Aufgaben und siehst jederzeit transparent deinen nächsten Schritt.",
  },
  ownership: {
    eyebrow: "Deine Umsetzung zählt",
    headline: "Deine Umsetzung zeigt deinen Fortschritt.",
    sub: "Du gestaltest deinen Weg durch das, was du tust — nicht durch eine Bewertung von außen.",
    body: "Jeder abgeschlossene Schritt bringt dich weiter durch deine persönliche Entwicklungsroadmap.",
  },
};

const STEPS = [
  {
    Icon: CheckCircle2,
    title: "Aufgabe abschließen",
    body: "Du absolvierst konkrete, messbare Schritte. Keine Theorie ohne Anwendung.",
  },
  {
    Icon: Activity,
    title: "Fortschritt sichtbar machen",
    body: "Dein abgeschlossener Schritt wird in deiner Roadmap sichtbar — für dich, jederzeit.",
  },
  {
    Icon: ArrowRightCircle,
    title: "Nächsten Schritt freischalten",
    body: "Du weißt sofort, was als nächstes kommt. Kein Rätselraten, keine Wartezeit.",
  },
];

const VIEW_FIRED_KEY = "mos_progress_control_view_fired_v1";
const INTERACT_FIRED_KEY = "mos_progress_control_interaction_fired_v1";

interface Props {
  message?: ProgressControlMessage;
  /** Visuelle Variante: "embedded" (innerhalb ProgressSystemSection) vs "standalone" (eigener Section-Container). */
  variant?: "embedded" | "standalone";
}

const ProgressControlBlock = ({
  message = "control",
  variant = "embedded",
}: Props) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [interactionFired, setInteractionFired] = useState(false);
  const copy = COPY[message] ?? COPY.control;

  useEffect(() => {
    if (typeof window === "undefined" || !rootRef.current) return;
    try {
      if (sessionStorage.getItem(VIEW_FIRED_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            try {
              sessionStorage.setItem(VIEW_FIRED_KEY, "1");
            } catch {
              /* ignore */
            }
            try {
              trackFunnelEvent("MASTER_PROGRESS_CONTROL_VIEW", {
                funnel: "masterofsales",
                message,
                placement: variant,
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
    obs.observe(rootRef.current);
    return () => obs.disconnect();
  }, [message, variant]);

  const handleInteraction = (stepIndex: number, stepTitle: string) => {
    if (interactionFired) return;
    try {
      if (sessionStorage.getItem(INTERACT_FIRED_KEY) === "1") {
        setInteractionFired(true);
        return;
      }
      sessionStorage.setItem(INTERACT_FIRED_KEY, "1");
    } catch {
      /* ignore */
    }
    setInteractionFired(true);
    try {
      trackFunnelEvent("MASTER_PROGRESS_CONTROL_INTERACTION", {
        funnel: "masterofsales",
        message,
        placement: variant,
        step_index: stepIndex,
        step: stepTitle,
        ab_slots: getActiveSlotSummary(),
      });
    } catch {
      /* never throw */
    }
  };

  const inner = (
    <div ref={rootRef} className="mx-auto max-w-5xl">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
          {copy.eyebrow}
        </p>
        <h3 className="mt-5 font-serif text-2xl leading-tight md:text-4xl">
          {copy.headline}
        </h3>
        <p className="mt-5 text-base leading-relaxed text-foreground/75 md:text-lg">
          {copy.sub}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-foreground/65 md:text-base">
          {copy.body}
        </p>
      </div>

      <ol className="mt-10 grid gap-4 md:grid-cols-3 md:gap-5">
        {STEPS.map(({ Icon, title, body }, i) => (
          <li
            key={title}
            onMouseEnter={() => handleInteraction(i, title)}
            onTouchStart={() => handleInteraction(i, title)}
            onFocus={() => handleInteraction(i, title)}
            tabIndex={0}
            className="group relative flex h-full flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-5 outline-none transition-colors hover:border-accent/40 focus-visible:border-accent/60 md:p-6"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/[0.06] text-accent">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                Schritt {i + 1}
              </span>
            </div>
            <h4 className="font-serif text-lg leading-snug md:text-xl">{title}</h4>
            <p className="text-sm leading-relaxed text-foreground/70">{body}</p>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-3 top-1/2 hidden h-px w-6 -translate-y-1/2 bg-accent/40 md:block"
              />
            )}
          </li>
        ))}
      </ol>

      <div className="mx-auto mt-8 flex max-w-2xl items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] p-4 text-left md:mt-10 md:p-5">
        <Compass className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-xs leading-relaxed text-foreground/70 md:text-sm">
          <span className="text-foreground/90">System + Unterstützung.</span>{" "}
          Dein Coach ist Unterstützung auf deinem Weg — die Roadmap gibt dir
          jederzeit Orientierung, was als nächstes sinnvoll ist.
        </p>
      </div>
    </div>
  );

  if (variant === "standalone") {
    return (
      <section
        data-mos-section="progress_control"
        className="border-t border-foreground/10 bg-background"
      >
        <div className="mx-auto max-w-6xl px-6 py-16 md:px-10 md:py-20">
          {inner}
        </div>
      </section>
    );
  }

  return (
    <div
      data-mos-section="progress_control_embedded"
      className="mt-14 border-t border-foreground/10 pt-12 md:mt-16 md:pt-14"
    >
      {inner}
    </div>
  );
};

export default ProgressControlBlock;
