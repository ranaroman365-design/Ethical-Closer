/**
 * ValueStackBlock — Master of Sales Asset Stack.
 *
 * 9 Assets, die das komplette Leistungs-Nachweis-System abbilden.
 * Keine Euro-Gesamtwert-Kalkulation. Statt Preis-Anker drei Wert-Fragen.
 *
 * Reihenfolge wird via Parent (A/B-Slot `mos_value_stack_order`) gesteuert.
 * Keine Garantien, keine Einkommensversprechen.
 */
import { useEffect, useRef } from "react";
import {
  BookOpen,
  Bot,
  BarChart3,
  Briefcase,
  Calendar,
  ClipboardCheck,
  Crown,
  GraduationCap,
  Headphones,
  Library,
  MessageCircle,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";
import revenueFlowImg from "@/assets/platform/revenue-flow.png";
import talentFlowImg from "@/assets/platform/talent-flow.png";
import intelligenceImg from "@/assets/platform/intelligence-control.png";
import kpiDashboardImg from "@/assets/platform/kpi-dashboard.png";

const TILE_SHOTS: Record<string, { src: string; alt: string }> = {
  performance_intel: { src: intelligenceImg, alt: "Intelligence Control Dashboard" },
  placement_system: { src: kpiDashboardImg, alt: "KPI Dashboard" },
  top_performer: { src: talentFlowImg, alt: "Talent Flow Dashboard" },
  daily_os: { src: revenueFlowImg, alt: "Revenue Flow Map" },
};

export type ValueStackOrder = "methode_first" | "community_first";

interface Asset {
  id: string;
  Icon: typeof BookOpen;
  title: string;
  body: string;
}

const ASSETS: Asset[] = [
  {
    id: "academy",
    Icon: GraduationCap,
    title: "9 Phasen Academy",
    body: "Einstieg ab der 9. Woche in High Ticket Closer Jobs aus unserem Partnernetzwerk.",
  },
  {
    id: "head_trainer",
    Icon: Headphones,
    title: "Live Head Trainer Feedback",
    body: "Echtes Feedback auf echte Gespräche.",
  },
  {
    id: "ai_assistant",
    Icon: Bot,
    title: "AI Closing Assistant™ + Live Copilot",
    body: "Trainiert auf Decision Mastery Prinzipien — im Gespräch live an deiner Seite.",
  },
  {
    id: "simulators",
    Icon: Target,
    title: "3 Simulator-Modi",
    body: "Übe Einwände, Discovery und Closing in realitätsnahen Szenarien.",
  },
  {
    id: "performance_intel",
    Icon: BarChart3,
    title: "Performance Intelligence Layer",
    body: "Deine KPIs, Stärken und Schwächen — datenbasiert sichtbar.",
  },
  {
    id: "placement_system",
    Icon: ClipboardCheck,
    title: "Top Job Placements System™",
    body: "Auftraggeber sehen deine Leistungsnachweise, nicht deinen Lebenslauf.",
  },
  {
    id: "close_partners",
    Icon: Briefcase,
    title: "The Close Partner Directory",
    body: "Geprüfte Auftraggeber, die ausschließlich mit qualifizierten Closern arbeiten.",
  },
  {
    id: "community_feed",
    Icon: Users,
    title: "Community & Job Feed",
    body: "Progressive Zonen, aktive Möglichkeiten.",
  },
  {
    id: "inner_circle",
    Icon: Crown,
    title: "Inner Circle",
    body: "Hochstufiger Zugang für die Top-Performer — kuratiert, nicht beworben.",
  },
  {
    id: "call_library",
    Icon: Library,
    title: "Call Review Library™",
    body: "Echte Gespräche. Echte Analyse.",
  },
  {
    id: "top_performer",
    Icon: Trophy,
    title: "Top Performer Breakdown Vault™",
    body: "Was die Besten anders machen — Call für Call zerlegt.",
  },
  {
    id: "daily_os",
    Icon: Calendar,
    title: "Daily Execution OS",
    body: "Die täglichen Schritte, die aus Training Ergebnisse machen.",
  },
  {
    id: "readiness",
    Icon: MessageCircle,
    title: "Closer Readiness Assessment™",
    body: "Bevor du platziert wirst, weißt du, dass du bereit bist.",
  },
  {
    id: "decision_book",
    Icon: BookOpen,
    title: "Decision Mastery Buch",
    body: "Kein Motivationsbuch. Ein Handbuch.",
  },
];

const FIRED_KEY = "mos_value_stack_view_fired_v1";

interface Props {
  order?: ValueStackOrder;
}

const ValueStackBlock = ({ order = "methode_first" }: Props) => {
  const sectionRef = useRef<HTMLElement | null>(null);

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
              trackFunnelEvent("MASTER_VALUE_STACK_VIEW", {
                funnel: "masterofsales",
                order,
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
  }, [order]);

  return (
    <section
      ref={sectionRef}
      data-mos-section="value_stack"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Master of Sales Karriere-System
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Ein kompletter Weg —<br />
            nicht nur ein weiterer Kurs.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-foreground/70 md:text-lg">
            Dreizehn Assets, ein zusammenhängendes System — Methode, Praxis,
            Feedback, Community und echter Einstieg in Möglichkeiten.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ASSETS.map(({ id, Icon, title, body }) => {
            const shot = TILE_SHOTS[id];
            return (
              <article
                key={id}
                className="flex h-full flex-col gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 md:p-7"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/[0.06] text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="font-serif text-xl leading-tight md:text-2xl">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-foreground/75 md:text-base">
                  {body}
                </p>
                {shot && (
                  <div className="mt-auto overflow-hidden rounded-lg border border-foreground/10 bg-background/40">
                    <img
                      src={shot.src}
                      alt={shot.alt}
                      loading="lazy"
                      className="aspect-[16/10] w-full object-cover object-top"
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="mx-auto mt-16 max-w-3xl space-y-5 text-center font-serif text-lg italic leading-relaxed text-foreground/80 md:text-xl">
          <p>Was ist eine Fähigkeit wert, die dir niemand mehr nehmen kann?</p>
          <p>Was ist echte Platzierung wert — nicht Hoffnung auf Platzierung?</p>
          <p>
            Was ist es wert, wenn Auftraggeber deine Leistungsnachweise sehen —
            und nicht deinen Lebenslauf?
          </p>
        </div>
      </div>
    </section>
  );
};

export default ValueStackBlock;
