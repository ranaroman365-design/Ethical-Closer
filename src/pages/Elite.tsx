import { useEffect } from "react";
import FunnelHero from "@/components/funnel/FunnelHero";
import FunnelTextBlock from "@/components/funnel/FunnelTextBlock";
import FunnelComparisonBlock from "@/components/funnel/FunnelComparisonBlock";
import FunnelHighlightBlock from "@/components/funnel/FunnelHighlightBlock";
import FunnelStackSection from "@/components/funnel/FunnelStackSection";
import FunnelCTASection from "@/components/funnel/FunnelCTASection";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import FunnelStickyBar from "@/components/funnel/FunnelStickyBar";
import { trackFunnelEvent } from "@/lib/track-event";

const Elite = () => {
  useEffect(() => {
    trackFunnelEvent("funnel_view", { funnel: "elite" });
  }, []);

  return (
    <div className="min-h-screen">
      {/* HERO */}
      <FunnelHero
        variant="dark"
        headline="Du wirst für Entscheidungen bezahlt – nicht für Zeit"
        sub={"Die wertvollsten Menschen im Markt\nsind die, die Klarheit schaffen."}
        ctaPrimary={{ label: "Verstehe das System", href: "/danke?f=identity" }}
      />

      {/* PATTERN INTERRUPT */}
      <FunnelTextBlock variant="muted">
        <p className="font-display text-2xl md:text-3xl font-semibold leading-tight">
          Die meisten im Sales verstehen nicht, was sie tun.
        </p>
      </FunnelTextBlock>

      {/* TRUTH */}
      <FunnelStackSection
        variant="dark"
        items={[
          { text: "Sie folgen Skripten" },
          { text: "Sie drücken" },
          { text: "Sie manipulieren" },
        ]}
        arrow="Deshalb bleiben sie mittelmäßig."
      />

      {/* DREIKLANG */}
      <FunnelComparisonBlock
        items={[
          { label: "Normales Closing", result: "Druck", variant: "muted" },
          { label: "Top Closing", result: "Performance", variant: "accent" },
          { label: "Ethical Top Closing", result: "Entscheidung + Integrität", variant: "highlight" },
        ]}
      />

      {/* RADIANT - PURPLE */}
      <FunnelHighlightBlock
        variant="purple"
        headline="Radiant bedeutet:"
        items={[
          "Klare Entscheidungen",
          "Emotionale Stabilität",
          "Echte Führung",
        ]}
      />

      {/* ELITE POSITION - GOLD */}
      <FunnelHighlightBlock
        variant="gold"
        headline="Top Clients arbeiten mit Entscheidern."
        items={[
          "Menschen, die klar sind",
          "Menschen, die Verantwortung übernehmen",
          "Menschen, die Entscheidungen ermöglichen",
        ]}
      />

      {/* PROOF */}
      <FunnelStackSection
        items={[
          { text: "High-Level Kunden" },
          { text: "Bessere Deals" },
          { text: "Langfristige Beziehungen" },
        ]}
      />

      {/* IDENTITY SHIFT */}
      <FunnelTextBlock variant="dark">
        <p className="font-display text-2xl md:text-3xl font-semibold leading-tight">
          Du lernst nicht Sales.
        </p>
        <p className="font-semibold opacity-90">👉 Du wirst jemand, der Entscheidungen versteht.</p>
      </FunnelTextBlock>

      {/* CTA STACK */}
      <FunnelCTASection
        headline="Bereit?"
        variant="gold"
        ctas={[
          { label: "Entscheidungslevel testen", href: "/danke?f=identity" },
          { label: "Zugang sichern", href: "/masterclass" },
          { label: "Teil des Systems werden", href: "/bewerbung" },
        ]}
      />

      <FunnelFooter />
      <FunnelStickyBar label="Entscheidungslevel testen" href="/start/quiz" variant="gold" funnelName="elite" />
    </div>
  );
};

export default Elite;
