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
import heroImg from "@/assets/funnel-lifestyle-hero.jpg";
import midImg from "@/assets/funnel-lifestyle-mid.jpg";

const quizQuestions = [
  {
    question: "Was fehlt dir aktuell am meisten?",
    options: ["Freiheit", "Zeit", "Leichtigkeit", "Klarheit"],
  },
  {
    question: "Wie würde dein ideales Leben aussehen?",
    options: ["Ortsunabhängig arbeiten", "Mehr reisen & erleben", "Mehr Zeit für Familie", "Weniger Stress"],
  },
  {
    question: "Was hält dich aktuell zurück?",
    options: ["Mein Job", "Mein Einkommen", "Unsicherheit", "Keine klare Richtung"],
  },
  {
    question: "Würdest du einen strukturierten Weg gehen, wenn er funktioniert?",
    options: ["Ja, sofort", "Vielleicht", "Eher nicht"],
  },
  {
    question: "Wenn sich dein Leben in 3–6 Monaten verbessert – was wäre dir am wichtigsten?",
    options: ["Mehr Freiheit", "Mehr Einkommen", "Mehr Sicherheit", "Mehr Zeit"],
  },
];

const Lifestyle = () => {
  const quizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackFunnelEvent("funnel_view", { funnel: "lifestyle" });
  }, []);

  const scrollToQuiz = () => {
    quizRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen">
      <FunnelHeroFull
        variant="sand"
        headline="Der stille Weg raus aus dem 9–5"
        sub={"Mehr Freiheit. Mehr Reisen. Mehr Leben.\nBasierend auf einem klaren System aus Skill, Struktur und messbaren KPIs."}
        ctaLabel="Jetzt anonym starten"
        onCtaClick={scrollToQuiz}
        imageSrc={heroImg}
      />

      <FunnelMicroCommit
        variant="sand"
        items={[
          "Lerne einen Skill, der dich ortsunabhängig macht — in Wochen, nicht Jahren.",
          "Keine Fixkosten, kein Risiko — nur leistungsbasiertes Einkommen.",
          "Arbeite mit ethischen Partnern, die zu deinem Lebensstil passen.",
        ]}
      />

      <FunnelConversionBoost variant="sand" />

      <div ref={quizRef}>
        <FunnelQuiz questions={quizQuestions} variant="sand" funnelName="lifestyle" />
      </div>

      <FunnelMidImage src={midImg} alt="Freiheit und Lifestyle" />

      <FunnelTransition
        variant="sand"
        headline="Du bist nicht allein."
        body="Hunderte Menschen wie du haben den gleichen Wunsch: Raus aus der Abhängigkeit, rein in ein selbstbestimmtes Leben. Der Unterschied? Ein Skill, der Freiheit ermöglicht."
      />

      <FunnelProofLayer
        variant="sand"
        statements={[
          "Ich wollte flexibler arbeiten — jetzt arbeite ich von überall.",
          "Vom 9-to-5 zur Ortsunabhängigkeit in 10 Wochen.",
          "Endlich ein Einkommen, das nicht an meinen Schreibtisch gebunden ist.",
        ]}
      />

      <FunnelRepeatCTA
        variant="sand"
        headline="Bereit für den ersten Schritt?"
        ctaLabel="Jetzt anonym starten"
        onCtaClick={scrollToQuiz}
      />

      <FunnelFooter />
      <FunnelStickyBar label="Jetzt starten" href="/lifestyle/bewerbung" variant="teal" funnelName="lifestyle" />
    </div>
  );
};

export default Lifestyle;
