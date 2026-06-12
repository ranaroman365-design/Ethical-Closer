import { useEffect, useMemo, useState } from "react";
import { PRODUCT } from '@/config/product';
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useFunnel } from "@/hooks/useFunnel";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import { cn } from "@/lib/utils";
import { trackFunnelEvent } from "@/lib/track-event";
import { supabase } from "@/integrations/supabase/client";

type QuizResult = "lifestyle" | "income" | "identity";

const resultData: Record<QuizResult, {
  levelLabel: string;
  tagColor: string;
  heroLine: string;
  heroBold: string;
  interpretation: string;
  truthTitle: string;
  truth: string;
  differentiation: { normal: string; top: string; ethical: string };
  opportunities: string[];
  futureItems: string[];
  ctaLabel: string;
}> = {
  lifestyle: {
    levelLabel: "Lifestyle",
    tagColor: "bg-funnel-teal/15 text-funnel-teal",
    heroLine: "Du bist geeignet –",
    heroBold: "wenn du es ernst meinst.",
    interpretation: "Dein Profil zeigt: Du suchst Freiheit, nicht nur Einkommen. Genau deshalb brauchst du einen Skill, der dich unabhängig macht – keinen weiteren Kurs.",
    truthTitle: "Viele bleiben hier stehen.",
    truth: "Sie konsumieren, aber handeln nicht. Das ist der Unterschied zwischen Wunsch und Ergebnis.",
    differentiation: {
      normal: "Normale Closer → Stress und Druck",
      top: "Top Closer → Struktur und Routine",
      ethical: `${PRODUCT.name} → Freiheit durch echte Entscheidungen`,
    },
    opportunities: [
      "Ein klarer Einstieg ohne Druck",
      "Ein Skill, der von überall funktioniert",
      "Echte Gespräche statt Theorie",
    ],
    futureItems: [
      "Ortsunabhängig arbeiten",
      "Eigene Zeiteinteilung",
      "Echte Unabhängigkeit",
    ],
    ctaLabel: "Bewirb dich für ein Klarheitsgespräch",
  },
  income: {
    levelLabel: "Income",
    tagColor: "bg-funnel-red/15 text-funnel-red",
    heroLine: "Du hast Potenzial.",
    heroBold: "Aber nur, wenn du umsetzt.",
    interpretation: "Dein Profil zeigt: Du hast kein Motivationsproblem. Dir fehlt ein Skill, der bezahlt wird. Das System kann das liefern – wenn du bereit bist.",
    truthTitle: "Die meisten probieren. Wenige handeln.",
    truth: "Wenn du jetzt nicht den nächsten Schritt gehst, ändert sich nichts an deiner Situation.",
    differentiation: {
      normal: "Normale Closer → unsicher und planlos",
      top: "Top Closer → besser, aber limitiert",
      ethical: `${PRODUCT.name} → bezahlt für Entscheidungen`,
    },
    opportunities: [
      "KPI-basiertes Trainingssystem",
      "Simulator für echte Gesprächssituationen",
      "Placement bei echten Kunden",
    ],
    futureItems: [
      "Erste Einnahmen in 9–10 Wochen",
      "Echte Deals, echte Kunden",
      "Finanzielle Klarheit",
    ],
    ctaLabel: "Bewirb dich jetzt",
  },
  identity: {
    levelLabel: "Identity",
    tagColor: "bg-funnel-purple/20 text-funnel-purple",
    heroLine: "Du verstehst den Unterschied.",
    heroBold: "Jetzt zeigt sich, ob du handelst.",
    interpretation: `Dein Profil zeigt: Du bist nicht auf der Suche nach einem Job. Du willst auf einem Level arbeiten, das den meisten verschlossen bleibt. ${PRODUCT.name} ist genau das.`,
    truthTitle: "Erkenntnis ohne Handlung ist wertlos.",
    truth: "Du weißt bereits, was du brauchst. Die Frage ist nur: Handelst du?",
    differentiation: {
      normal: "Normale Closer → folgen Systemen",
      top: "Top Closer → optimieren Systeme",
      ethical: `${PRODUCT.name} → führen durch Entscheidungen`,
    },
    opportunities: [
      "Ethical Closing auf höchstem Niveau",
      "Radiant-Prinzipien für Klarheit & Führung",
      "Zugang zu High-Level Kunden & Partnern",
    ],
    futureItems: [
      "Höhere Tickets, bessere Kunden",
      "Langfristige Beziehungen statt Einmal-Deals",
      "Echte Autorität im Markt",
    ],
    ctaLabel: "Bewirb dich für Zugang",
  },
};

const fade = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 } };

const Ergebnis = () => {
  const navigate = useNavigate();
  const { path: funnelPath } = useFunnel();
  const [result, setResult] = useState<QuizResult>(
    (localStorage.getItem("quiz_result") || "income") as QuizResult
  );
  const [commitmentLevel, setCommitmentLevel] = useState<string | null>(null);
  const data = useMemo(() => resultData[result], [result]);

  useEffect(() => {
    if (!localStorage.getItem("quiz_result")) {
      navigate(funnelPath("quiz"));
      return;
    }

    // Try to load richer data from Supabase
    const submissionId = localStorage.getItem("quiz_submission_id");
    if (submissionId) {
      supabase
        .from("quiz_submissions")
        .select("final_segment, commitment_level, quiz_score")
        .eq("id", submissionId)
        .maybeSingle()
        .then(({ data: sub }) => {
          if (sub) {
            setResult(sub.final_segment as QuizResult);
            setCommitmentLevel(sub.commitment_level);
          }
        });
    }

    trackFunnelEvent("result_view", { result });
  }, []);

  return (
    <div className="min-h-screen bg-funnel-warm-bg text-funnel-dark">
      <div className="mx-auto max-w-2xl px-6 py-20 md:py-28">

        {/* HEADLINE */}
        <motion.div {...fade} transition={{ duration: 0.7 }} className="text-center mb-16">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-funnel-grey mb-4">
            Dein Ergebnis
          </p>
          <span className={cn("inline-block rounded-sm px-5 py-1.5 font-sans text-sm font-semibold mb-6", data.tagColor)}>
            Profil: {data.levelLabel}
          </span>
          <h1 className="font-display text-3xl md:text-4xl font-semibold leading-[1.15]">
            {data.heroLine}<br />
            <span className="opacity-70">{data.heroBold}</span>
          </h1>
        </motion.div>

        {/* INTERPRETATION */}
        <motion.div {...fade} transition={{ delay: 0.1 }} className="mb-12">
          <p className="font-sans text-lg leading-relaxed opacity-80">
            {data.interpretation}
          </p>
        </motion.div>

        {/* DIFFERENTIATION */}
        <motion.div {...fade} transition={{ delay: 0.18 }} className="mb-12">
          <div className="space-y-3">
            <div className="rounded-sm bg-funnel-dark/5 border border-funnel-dark/10 p-4">
              <p className="font-sans text-sm text-funnel-grey">{data.differentiation.normal}</p>
            </div>
            <div className="rounded-sm bg-funnel-dark/5 border border-funnel-dark/10 p-4">
              <p className="font-sans text-sm text-funnel-grey">{data.differentiation.top}</p>
            </div>
            <div className="rounded-sm bg-funnel-gold/10 border border-funnel-gold/30 p-4">
              <p className="font-sans text-sm font-semibold text-funnel-dark">
                👉 {data.differentiation.ethical}
              </p>
            </div>
          </div>
        </motion.div>

        {/* TRUTH */}
        <motion.div {...fade} transition={{ delay: 0.25 }} className="mb-12">
          <div className="rounded-sm bg-funnel-dark text-white p-8 md:p-10">
            <h2 className="font-display text-xl font-semibold mb-3">{data.truthTitle}</h2>
            <p className="font-sans text-base opacity-75">{data.truth}</p>
          </div>
        </motion.div>

        {/* OPPORTUNITY */}
        <motion.div {...fade} transition={{ delay: 0.3 }} className="mb-12">
          <h2 className="font-display text-xl font-semibold mb-6">Was das System dir bietet:</h2>
          <ul className="space-y-3">
            {data.opportunities.map((item) => (
              <li key={item} className="flex items-start gap-3 font-sans text-base">
                <Check className="mt-1 h-5 w-5 shrink-0 text-funnel-teal" strokeWidth={2} />
                <span className="opacity-85">{item}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* FUTURE SELF */}
        <motion.div {...fade} transition={{ delay: 0.4 }} className="mb-16">
          <div className="rounded-sm border border-funnel-gold/30 bg-funnel-gold/5 p-8 md:p-10">
            <h2 className="font-display text-xl font-semibold mb-6">In 3–6 Monaten:</h2>
            <ul className="space-y-3">
              {data.futureItems.map((item) => (
                <li key={item} className="flex items-start gap-3 font-sans text-base">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-funnel-gold" strokeWidth={2} />
                  <span className="opacity-85">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* PRIMARY CTA */}
        <motion.div {...fade} transition={{ delay: 0.5 }} className="text-center space-y-4 mb-16">
          <Link
            to={funnelPath("bewerbung")}
            onClick={() => trackFunnelEvent("result_cta_click", { target: "termin", result })}
            className="inline-flex items-center gap-2 px-10 py-4 rounded-sm bg-funnel-gold text-funnel-dark font-sans font-semibold text-base transition-all hover:bg-funnel-gold/90 hover:shadow-lg hover:shadow-funnel-gold/20"
          >
            {data.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="font-sans text-sm opacity-50">
            Kein Verkaufsgespräch. Ein Klarheitsgespräch.
          </p>
        </motion.div>

        {/* MEMBERSHIP CTA */}
        <motion.div {...fade} transition={{ delay: 0.6 }}>
          <div className="rounded-sm border border-funnel-gold/20 bg-funnel-dark text-white p-8 md:p-12 text-center">
            <h2 className="font-display text-2xl md:text-3xl font-semibold mb-3">
              Das ist kein Mitgliederbereich.
            </h2>
            <p className="font-sans text-lg font-semibold text-funnel-gold mb-8">
              👉 Das ist ein System.
            </p>
            <div className="space-y-2 font-sans text-base opacity-70 mb-8">
              <p>Menschen, die handeln.</p>
              <p>Menschen, die wachsen.</p>
              <p>Menschen, die Ergebnisse erzielen.</p>
            </div>
            <p className="font-sans text-sm opacity-40 mb-8 italic">
              Die meisten bleiben draußen. Einige gehen rein.
            </p>
            <Link
              to={funnelPath("bewerbung")}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-sm bg-funnel-gold text-funnel-dark font-sans font-semibold text-base transition-all hover:bg-funnel-gold/90 hover:shadow-lg hover:shadow-funnel-gold/20"
            >
              Zugang zum System
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>

      </div>
      <FunnelFooter />
    </div>
  );
};

export default Ergebnis;
