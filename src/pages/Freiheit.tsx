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
import heroImg from "@/assets/funnel-freiheit-hero.jpg";
import midImg from "@/assets/funnel-freiheit-mid.jpg";

const quizQuestions = [
  {
    question: "Was reizt dich wirklich?",
    options: ["High-Level Skill", "Bessere Entscheidungen", "Starkes Umfeld", "Skalierung"],
  },
  {
    question: "Wo stehst du aktuell?",
    options: ["Anfänger", "Fortgeschritten", "Ambitioniert"],
  },
  {
    question: "Was ist dein Anspruch?",
    options: ["Stabilität", "Wachstum", "Exzellenz"],
  },
  {
    question: "Bist du bereit, Verantwortung zu übernehmen?",
    options: ["Ja", "Teilweise", "Unsicher"],
  },
  {
    question: "Welche Version von dir willst du werden?",
    options: ["Frei", "Erfolgreich", "Einflussreich", "Klar & souverän"],
  },
];

const Freiheit = () => {
  const quizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackFunnelEvent("funnel_view", { funnel: "freiheit" });
  }, []);

  const scrollToQuiz = () => {
    quizRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen">
      <FunnelHeroFull
        variant="gold"
        headline="Der Königsweg-Skill"
        sub={"Ethical Closing auf höchstem Niveau.\nBasierend auf einem klaren System aus Skill, Struktur und messbaren KPIs."}
        ctaLabel="Jetzt anonym starten"
        onCtaClick={scrollToQuiz}
        imageSrc={heroImg}
      />

      <FunnelMicroCommit
        variant="gold"
        items={[
          "Lerne die Kunst der ethischen Gesprächsführung — auf höchstem Niveau.",
          "Werde Teil eines selektiven Netzwerks aus Top-Performern.",
          "Zertifizierung, KPI-System und Placement bei Premium-Partnern.",
        ]}
      />

      <FunnelConversionBoost variant="gold" />

      <div ref={quizRef}>
        <FunnelQuiz questions={quizQuestions} variant="gold" funnelName="freiheit" />
      </div>

      <FunnelMidImage src={midImg} alt="Exzellenz und Struktur" />

      <FunnelTransition
        variant="gold"
        headline="Du bist nicht allein."
        body="Die besten Closer der DACH-Region haben hier angefangen. Der Unterschied zwischen gut und exzellent? Ein System, das dich auf das nächste Level bringt."
      />

      <FunnelProofLayer
        variant="gold"
        statements={[
          "Von ambitioniert zu zertifiziert — in einem strukturierten Prozess.",
          "Das Umfeld hat alles verändert. Hier werde ich täglich besser.",
          "Exzellenz ist kein Zufall — sie ist das Ergebnis eines Systems.",
        ]}
      />

      <FunnelRepeatCTA
        variant="gold"
        headline="Bereit für den Königsweg?"
        ctaLabel="Jetzt anonym starten"
        onCtaClick={scrollToQuiz}
      />

      <FunnelFooter />
      <FunnelStickyBar label="Zugang sichern" href="/freiheit/bewerbung" variant="gold" funnelName="freiheit" />
    </div>
  );
};

export default Freiheit;
