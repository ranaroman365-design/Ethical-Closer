/**
 * MOS Avatar Filter — qualification cluster + indirect development questions.
 *
 * Active ONLY when the user reached the quiz with `source=masterofsales*`.
 * Sits between the last regular quiz question and the LeadCaptureGate.
 *
 * Two phases:
 *   1) Cluster question (always shown for MOS sessions).
 *   2) If cluster ∈ {job_seeker, client_seeker} → 3 indirect dev questions.
 *      Otherwise we skip straight to onContinue("stay", ...).
 *
 * Submits a single `onComplete({cluster, indirect, decision, devScore})`
 * call; the parent owns navigation (redirect vs. continue to lead capture).
 */
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackFunnelEvent } from "@/lib/track-event";
import { getAttributionSource } from "@/lib/attribution-source";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";
import { fireMosCroEvent } from "@/lib/mos-cro-events";
import {
  CLUSTER_LABELS,
  computeDevelopmentScore,
  decideMosRouting,
  type IndirectAnswerId,
  type IndirectAnswers,
  type QualificationCluster,
  type RoutingDecision,
} from "@/lib/mos-development-score";

const CLUSTER_OPTIONS: Array<{ id: QualificationCluster; label: string }> = [
  { id: "new_starter", label: CLUSTER_LABELS.new_starter },
  { id: "experienced_growth", label: CLUSTER_LABELS.experienced_growth },
  { id: "trained_underperformer", label: CLUSTER_LABELS.trained_underperformer },
  { id: "job_seeker", label: CLUSTER_LABELS.job_seeker },
  { id: "client_seeker", label: CLUSTER_LABELS.client_seeker },
];

const Q_A: Array<{ id: IndirectAnswerId; label: string }> = [
  { id: "A_quick_action", label: "Ich suche vor allem eine Möglichkeit, möglichst schnell ins Tun zu kommen" },
  { id: "A_find_gaps", label: "Ich möchte zunächst herausfinden, welche Fähigkeiten mir noch fehlen" },
  { id: "A_ready_with_plan", label: "Ich bin bereit, an meinen Ergebnissen zu arbeiten, wenn ich dafür einen klaren Plan bekomme" },
  { id: "A_direct_placement", label: "Ich suche hauptsächlich eine direkte Stelle oder Auftraggeber" },
];
const Q_B: Array<{ id: IndirectAnswerId; label: string }> = [
  { id: "B_quick_experience", label: "Schnell praktische Erfahrung sammeln" },
  { id: "B_improve_skills", label: "Meine Fähigkeiten gezielt verbessern" },
  { id: "B_long_term_results", label: "Langfristig bessere Ergebnisse erzielen" },
  { id: "B_direct_placement", label: "Möglichst schnell einen Auftraggeber oder eine Stelle finden" },
];
const Q_C: Array<{ id: IndirectAnswerId; label: string }> = [
  { id: "C_seek_placement", label: "Ich würde zuerst versuchen, direkt eine Stelle oder Leads zu bekommen" },
  { id: "C_work_on_gaps", label: "Ich würde gezielt an den fehlenden Fähigkeiten arbeiten" },
  { id: "C_use_support", label: "Ich würde Unterstützung nutzen, um schneller voranzukommen" },
  { id: "C_unsure", label: "Ich bin mir unsicher" },
];

type Phase = "cluster" | "indirect_A" | "indirect_B" | "indirect_C";

export interface AvatarFilterResult {
  cluster: QualificationCluster;
  indirect: IndirectAnswers;
  decision: RoutingDecision;
  devScore: number;
}

export function AvatarFilterQuestions({
  onComplete,
}: {
  onComplete: (r: AvatarFilterResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>("cluster");
  const [cluster, setCluster] = useState<QualificationCluster | null>(null);
  const [indirect, setIndirect] = useState<IndirectAnswers>({});
  const [active, setActive] = useState<string | null>(null);

  // Fire view event once per session, variant = current phase.
  useEffect(() => {
    fireMosCroEvent("MASTER_AVATAR_FILTER_VIEW", phase);
  }, [phase]);

  const finish = (
    finalCluster: QualificationCluster,
    finalIndirect: IndirectAnswers,
  ) => {
    const decision = decideMosRouting(finalCluster, finalIndirect);
    const devScore = computeDevelopmentScore(finalIndirect);
    try {
      trackFunnelEvent("MASTER_DEVELOPMENT_SCORE_CALCULATED", {
        funnel: "masterofsales",
        attribution_source: getAttributionSource(),
        ab_slots: getActiveSlotSummary(),
        development_score: devScore,
        routing_reason: decision.reason,
        qualification_cluster: finalCluster,
      });
    } catch {
      /* never throw */
    }
    onComplete({ cluster: finalCluster, indirect: finalIndirect, decision, devScore });
  };

  const pickCluster = (id: QualificationCluster) => {
    setActive(id);
    setCluster(id);
    window.setTimeout(() => {
      setActive(null);
      // job/client seekers go through indirect questions; others skip.
      if (id === "job_seeker" || id === "client_seeker") {
        setPhase("indirect_A");
      } else {
        finish(id, {});
      }
    }, 200);
  };

  const pickIndirect = (key: "A" | "B" | "C", id: IndirectAnswerId) => {
    setActive(id);
    const next: IndirectAnswers = { ...indirect, [key]: id };
    setIndirect(next);
    window.setTimeout(() => {
      setActive(null);
      if (key === "A") setPhase("indirect_B");
      else if (key === "B") setPhase("indirect_C");
      else if (key === "C" && cluster) finish(cluster, next);
    }, 200);
  };

  if (phase === "cluster") {
    return (
      <QuestionShell
        title="Welche Aussage beschreibt dich aktuell am besten?"
        subtitle="Wähle, was dir am ehesten entspricht — es geht um deine aktuelle Situation, nicht um den Idealfall."
        options={CLUSTER_OPTIONS}
        active={active}
        onPick={(id) => pickCluster(id as QualificationCluster)}
      />
    );
  }

  if (phase === "indirect_A") {
    return (
      <QuestionShell
        title="Welcher Ansatz beschreibt am ehesten deine aktuelle Denkweise?"
        options={Q_A}
        active={active}
        onPick={(id) => pickIndirect("A", id as IndirectAnswerId)}
      />
    );
  }
  if (phase === "indirect_B") {
    return (
      <QuestionShell
        title="Was ist aktuell dein wichtigstes Ziel?"
        options={Q_B}
        active={active}
        onPick={(id) => pickIndirect("B", id as IndirectAnswerId)}
      />
    );
  }
  return (
    <QuestionShell
      title="Wenn du merkst, dass dir für bessere Ergebnisse noch Wissen oder Struktur fehlen — was trifft am ehesten auf dich zu?"
      options={Q_C}
      active={active}
      onPick={(id) => pickIndirect("C", id as IndirectAnswerId)}
    />
  );
}

function QuestionShell({
  title,
  subtitle,
  options,
  active,
  onPick,
}: {
  title: string;
  subtitle?: string;
  options: Array<{ id: string; label: string }>;
  active: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h2 className="font-serif text-2xl font-semibold leading-tight tracking-tight md:text-4xl">
          {title}
        </h2>
        {subtitle && (
          <p className="font-serif text-base leading-relaxed text-muted-foreground md:text-lg">
            {subtitle}
          </p>
        )}
      </div>
      <div className="space-y-3">
        {options.map((opt) => {
          const isActive = active === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => onPick(opt.id)}
              className={cn(
                "group flex w-full items-center justify-between gap-4 rounded-sm border px-5 py-5 text-left font-serif text-base transition-all md:text-lg",
                "active:scale-[0.99]",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/60 bg-background hover:border-foreground hover:bg-muted/40",
              )}
            >
              <span>{opt.label}</span>
              <ArrowRight
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  isActive
                    ? "translate-x-1"
                    : "opacity-40 group-hover:translate-x-1 group-hover:opacity-100",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
