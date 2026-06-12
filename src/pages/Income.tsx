import { useEffect, useRef } from "react";
import FunnelHeroFull from "@/components/funnel/FunnelHeroFull";
import FunnelMicroCommit from "@/components/funnel/FunnelMicroCommit";
import FunnelConversionBoost from "@/components/funnel/FunnelConversionBoost";
import FunnelQuiz from "@/components/funnel/FunnelQuiz";
import FunnelMidImage from "@/components/funnel/FunnelMidImage";
import FunnelTransition from "@/components/funnel/FunnelTransition";
import FunnelProofLayer from "@/components/funnel/FunnelProofLayer";
import FunnelRepeatCTA from "@/components/funnel/FunnelRepeatCTA";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import FunnelStickyBar from "@/components/funnel/FunnelStickyBar";
import { trackFunnelEvent } from "@/lib/track-event";
import heroImg from "@/assets/funnel-income-hero.jpg";
import midImg from "@/assets/funnel-income-mid.jpg";

const quizQuestions = [
  {
    question: "Wie sieht deine aktuelle Situation aus?",
    options: ["9–5 ohne Wachstum", "Einkommen instabil", "Ich komme kaum voran", "Ich will mehr, aber weiß nicht wie"],
  },
  {
    question: "Was frustriert dich aktuell am meisten?",
    options: ["Zu wenig Einkommen", "Keine Perspektive", "Abhängigkeit vom Job", "Keine Struktur"],
  },
  {
    question: "Wie dringend willst du etwas ändern?",
    options: ["Sofort", "Bald", "Ich beobachte noch"],
  },
  {
    question: "Bist du bereit, 9–10 Wochen Fokus zu geben?",
    options: ["Ja", "Vielleicht", "Nein"],
  },
  {
    question: "Wenn dein Einkommen stabil wäre – was würde sich verändern?",
    options: ["Mehr Sicherheit", "Mehr Freiheit", "Weniger Stress", "Mehr Optionen"],
  },
];

const Income = () => {
  const quizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackFunnelEvent("funnel_view", { funnel: "income" });
  }, []);

  const scrollToQuiz = () => {
    quizRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen">
      <FunnelHeroFull
        variant="red"
        headline="Von Null zum Einkommen in 10 Wochen"
        sub={"Wenn es so nicht weitergeht — hier ist dein Weg raus.\nBasierend auf einem klaren System aus Skill, Struktur und messbaren KPIs."}
        ctaLabel="Jetzt anonym starten"
        onCtaClick={scrollToQuiz}
        imageSrc={heroImg}
      />

      <FunnelMicroCommit
        variant="red"
        items={[
          "Ein Skill, für den Menschen bezahlen — ab Woche 1 monetarisierbar.",
          "Kein Kurs, sondern Pipeline: KPI-System, Simulator, echte Gespräche.",
          "Placement bei geprüften Partnern nach Abschluss der Ausbildung.",
        ]}
      />

      <FunnelConversionBoost variant="red" />

      <div ref={quizRef}>
        <FunnelQuiz questions={quizQuestions} variant="red" funnelName="income" />
      </div>

      <FunnelMidImage src={midImg} alt="Fokus und Struktur" />

      <FunnelTransition
        variant="red"
        headline="Du bist nicht allein."
        body="Tausende stehen vor dem gleichen Problem: Arbeit ohne Wachstum, Einsatz ohne Ergebnis. Der Unterschied ist kein Geheimnis — es ist ein Skill, den du in 10 Wochen lernst."
      />

      <FunnelProofLayer
        variant="red"
        statements={[
          "Von 0 auf 4.200 € im ersten Monat nach dem Training.",
          "Ich hatte keinen Sales-Background — trotzdem nach 9 Wochen mein erstes Placement.",
          "Endlich ein System, das funktioniert — nicht nur Motivation.",
        ]}
      />

      <FunnelRepeatCTA
        variant="red"
        headline="Sichere dir deinen Platz"
        ctaLabel="Jetzt anonym starten"
        onCtaClick={scrollToQuiz}
      />

      <FunnelFooter />
      <FunnelStickyBar label="Jetzt bewerben" href="/income/bewerbung" variant="red" funnelName="income" />
    </div>
  );
};

export default Income;
