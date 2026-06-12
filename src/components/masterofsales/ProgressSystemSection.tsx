/**
 * ProgressSystemSection — EthicalCloser Progress System™
 *
 * 3-Level Roadmap (Skill Foundation · Practice & Confidence · Opportunity Readiness).
 * Additiv. Premium-Stil (schwarz/gold), keine Gaming-Optik.
 * Keine Garantien, kein Placement-Versprechen.
 *
 * Headline + Reihenfolge werden vom Parent via Props (A/B-Slots) gesteuert.
 * Feuert `MASTER_PROGRESS_VIEW` einmal pro Session bei 50% Sichtbarkeit.
 */
import { useEffect, useRef } from "react";
import { Compass, Users, KeyRound, Lock } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";

export type ProgressMessage = "clear_path" | "unlock_levels";

const HEADLINE_COPY: Record<ProgressMessage, { eyebrow: string; title: string; sub: string }> = {
  clear_path: {
    eyebrow: "EthicalCloser Progress System™",
    title: "Kein Rätselraten. Ein klarer Weg.",
    sub: "Du siehst jederzeit, wo du stehst — und was als nächstes kommt. Fortschritt durch Umsetzung, nicht durch Zufall.",
  },
  unlock_levels: {
    eyebrow: "EthicalCloser Progress System™",
    title: "Dein Fortschritt entscheidet über deinen nächsten Schritt.",
    sub: "Jede Phase baut auf der vorigen auf. Du weißt immer, wo du stehst — und was die nächste Stufe von dir verlangt.",
  },
};

const LEVELS = [
  {
    id: "level_0_potential",
    badge: "Level 0",
    Icon: Compass,
    title: "Potenzial",
    learn: ["Standortbestimmung", "Eignung & Richtung", "Klarheit über den Weg"],
    via: ["Closer Readiness Call™", "Selbstcheck", "Erstgespräch"],
    unlock: "Einstieg ins System",
  },
  {
    id: "training_practice",
    badge: "Level 1 – 3",
    Icon: Users,
    title: "Training & Praxis",
    learn: ["Closing-Grundlagen", "EEG-Framework", "Echte Gesprächspraxis"],
    via: ["Module", "Simulationen", "Live Feedback"],
    unlock: "Placement Ready™",
  },
  {
    id: "level_4_placement_ready",
    badge: "Level 4",
    Icon: KeyRound,
    title: "Placement Ready™",
    learn: [
      "Grundsolide Gesprächsführung",
      "Erste nachgewiesene Calls",
      "Bewertbare Leistungsnachweise",
    ],
    via: ["Coaching", "Call Reviews", "Erste reale Übungs-Calls"],
    unlock: "Placement Qualified™",
  },
  {
    id: "level_5_placement_qualified",
    badge: "Level 5",
    Icon: KeyRound,
    title: "Placement Qualified™",
    learn: [
      "Konsistente Closing-Rate",
      "Stabile Kennzahlen",
      "Bestätigte Eignung für Auftraggeber",
    ],
    via: ["Nachgewiesene KPIs", "Mentor-Review", "Readiness Assessment™"],
    unlock: "Reales Placement",
  },
  {
    id: "level_6_placed_closer",
    badge: "Level 6",
    Icon: KeyRound,
    title: "Placed High-Ticket Closer™",
    learn: [
      "Arbeit mit echten Auftraggebern",
      "Verantwortung für Pipeline",
      "Profit-Center-Denken",
    ],
    via: ["Job Matching", "Direkte Kunden-Calls", "Echtes Revenue"],
    unlock: "Senior-Status",
  },
  {
    id: "level_7_senior_closer",
    badge: "Level 7",
    Icon: KeyRound,
    title: "Senior High-Ticket Closer™",
    learn: [
      "Führende Closing-Performance",
      "Mentoring jüngerer Closer",
      "Multi-Auftraggeber-Mandate",
    ],
    via: ["Senior Coaching", "Team-Verantwortung", "Erweitertes Mandat"],
    unlock: "Top Performer™",
  },
  {
    id: "level_8_top_performer",
    badge: "Level 8",
    Icon: KeyRound,
    title: "Top Performer™",
    learn: [
      "Outlier-Performance",
      "Sichtbarkeit als Branchen-Referenz",
      "Premium-Mandate & Override",
    ],
    via: ["Inner Circle", "Top-Tier Auftraggeber", "Eigene Skalierung"],
    unlock: "Höchste Stufe",
  },
];


const FIRED_KEY = "mos_progress_view_fired_v1";

interface Props {
  message?: ProgressMessage;
  /** Optional additiver Slot, der nach der 3-Level-Darstellung gerendert wird (z.B. ProgressControlBlock). */
  children?: React.ReactNode;
}

const ProgressSystemSection = ({ message = "clear_path", children }: Props) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const copy = HEADLINE_COPY[message] ?? HEADLINE_COPY.clear_path;

  useEffect(() => {
    if (typeof window === "undefined" || !sectionRef.current) return;
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
              trackFunnelEvent("MASTER_PROGRESS_VIEW", {
                funnel: "masterofsales",
                message,
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
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [message]);

  return (
    <section
      ref={sectionRef}
      data-mos-section="progress_system"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            {copy.eyebrow}
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            {copy.title}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-foreground/70 md:text-lg">
            {copy.sub}
          </p>
          <p className="mt-7 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-accent/30 bg-accent/[0.06] px-5 py-2 text-xs uppercase tracking-[0.24em] text-accent sm:text-sm">
            9 Phasen · 33 Module · Level 0 bis Level 8
          </p>
        </div>

        <ol className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">

          {LEVELS.map(({ id, badge, Icon, title, learn, via, unlock }, i) => (
            <li
              key={id}
              className="flex h-full flex-col gap-5 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 md:p-7"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/[0.06] text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.24em] text-foreground/50">
                  {badge}
                </span>
              </div>

              <h3 className="font-serif text-xl leading-tight md:text-2xl">
                {title}
              </h3>

              <div className="space-y-3 text-sm leading-relaxed text-foreground/75">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/50">
                    Du entwickelst
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {learn.map((l) => (
                      <li key={l} className="flex items-start gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/50">
                    Durch
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {via.map((v) => (
                      <li key={v} className="flex items-start gap-2">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-auto flex items-center gap-2 border-t border-foreground/10 pt-4 text-xs text-foreground/65">
                <Lock className="h-3.5 w-3.5 text-accent" />
                <span>
                  Unlock: <span className="text-foreground/85">{unlock}</span>
                </span>
              </div>
            </li>
          ))}
        </ol>

        {/* Philosophie-Reprise: lebt jetzt im Final-CTA-Block. Hier bewusst leer. */}


        {children}
      </div>
    </section>
  );
};

export default ProgressSystemSection;
