import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, TrendingUp, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackFunnelEvent } from "@/lib/track-event";

/**
 * Result-First Gate (P0 Quiz→Booking Fix)
 *
 * Shown AFTER lead capture, BEFORE booking.
 * - Reveals quiz result (score / category / income potential)
 * - Single dominant CTA: book the call
 * - No alternative paths, no competing actions
 *
 * Maps to canon: Execution Loop v2 §7 Priority Engine
 *   "exactly one dominant next action must exist"
 */

interface QuizResultGateProps {
  funnelName: string;
  answers: number[];
  buttonClass?: string;
  /** Called when user clicks the dominant CTA */
  onProceed: () => void;
}

type Tier = {
  key: "high" | "mid" | "low";
  label: string;
  category: string;
  income: string;
  description: string;
  scoreLabel: string;
};

function computeTier(answers: number[]): { tier: Tier; score: number } {
  // Heuristic: lower option index = higher intent (most quizzes ordered that way).
  // Score = average normalized inverted index, mapped to 0–100.
  const n = Math.max(answers.length, 1);
  const total = answers.reduce((sum, a) => sum + a, 0);
  // Assume 4 options per question on average → max raw = 3*n. Invert so smaller = better.
  const maxRaw = 3 * n;
  const inverted = Math.max(0, maxRaw - total);
  const score = Math.min(100, Math.round((inverted / maxRaw) * 100));

  const tier: Tier =
    score >= 70
      ? {
          key: "high",
          label: "A-Player Profil",
          category: "Hohe Umsetzungswahrscheinlichkeit",
          income: "4.000–10.000 € / Monat",
          description:
            "Du zeigst die Merkmale, die wir bei erfolgreichen Closern sehen: Klarheit, Dringlichkeit, Bereitschaft.",
          scoreLabel: "Sehr hohes Potenzial",
        }
      : score >= 45
      ? {
          key: "mid",
          label: "Solides Profil",
          category: "Mittlere Umsetzungswahrscheinlichkeit",
          income: "2.000–5.000 € / Monat",
          description:
            "Du hast die Grundvoraussetzungen. Mit dem richtigen System ist das nächste Level realistisch.",
          scoreLabel: "Hohes Potenzial",
        }
      : {
          key: "low",
          label: "Entwicklungs-Profil",
          category: "Frühphase – braucht Struktur",
          income: "1.000–3.000 € / Monat",
          description:
            "Du bist noch am Anfang. Der Call zeigt dir, ob das System für deine Situation passt.",
          scoreLabel: "Solides Potenzial",
        };

  return { tier, score };
}

export default function QuizResultGate({
  funnelName,
  answers,
  buttonClass,
  onProceed,
}: QuizResultGateProps) {
  const { tier, score } = useMemo(() => computeTier(answers), [answers]);

  useEffect(() => {
    trackFunnelEvent("quiz_result_viewed", {
      funnel: funnelName,
      score,
      tier: tier.key,
    });
  }, [funnelName, score, tier.key]);

  const handleCta = () => {
    trackFunnelEvent("quiz_result_cta_clicked", {
      funnel: funnelName,
      score,
      tier: tier.key,
    });
    onProceed();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-1.5">
        <p className="font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Dein Ergebnis
        </p>
        <h3 className="font-display text-2xl md:text-3xl font-semibold text-foreground leading-tight">
          {tier.label}
        </h3>
      </div>

      {/* Score block */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Score
            </p>
            <p className="font-display text-4xl font-semibold text-foreground tabular-nums">
              {score}
              <span className="text-base text-muted-foreground font-sans font-normal">
                /100
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Bewertung
            </p>
            <p className="font-sans text-sm font-medium text-foreground">
              {tier.scoreLabel}
            </p>
          </div>
        </div>

        {/* Score bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn(
              "h-full rounded-full",
              buttonClass?.includes("bg-")
                ? buttonClass.split(" ").find((c) => c.startsWith("bg-")) ?? "bg-primary"
                : "bg-primary"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          />
        </div>

        <div className="grid grid-cols-1 gap-2.5 pt-1">
          <div className="flex items-start gap-2.5">
            <Target className="h-4 w-4 text-foreground/70 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Kategorie
              </p>
              <p className="font-sans text-sm text-foreground">{tier.category}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <TrendingUp className="h-4 w-4 text-foreground/70 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Realistisches Einkommens-Potenzial
              </p>
              <p className="font-sans text-sm text-foreground font-medium">{tier.income}</p>
              <p className="text-[11px] text-muted-foreground italic mt-0.5">
                Bei strukturierter Umsetzung. Keine Garantie.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Interpretation */}
      <p className="font-sans text-sm text-foreground/80 leading-relaxed text-center max-w-md mx-auto">
        {tier.description}
      </p>

      {/* SINGLE DOMINANT CTA — no alternative paths */}
      <div className="space-y-2.5 pt-1">
        <button
          onClick={handleCta}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 rounded-lg px-6 py-4 font-sans font-semibold text-base transition-all hover:scale-[1.01] active:scale-[0.99]",
            buttonClass || "bg-primary text-primary-foreground"
          )}
        >
          Call buchen — kostenlos &amp; unverbindlich
          <ArrowRight className="h-4 w-4" />
        </button>

        <div className="flex items-center justify-center gap-1.5 pt-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-foreground/50" />
          <p className="text-[11px] text-muted-foreground">
            ~20 Minuten · 1:1 mit einem unserer Berater
          </p>
        </div>
      </div>
    </motion.div>
  );
}
