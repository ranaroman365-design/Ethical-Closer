import PlatformProofSlot, { useProofViewOnce } from "./PlatformProofSlot";

/**
 * AI DIFFERENTIATION — dedicated proof block.
 * Simulator · Ethical Simulator · AI Copilot. Real screens only.
 */
const AiDifferentiationProof = () => {
  const ref = useProofViewOnce("MASTER_AI_PREVIEW_VIEW", {
    section: "ai_differentiation",
  });

  const screens = [
    {
      label: "Simulator",
      route: "/members/simulator",
      caption: "Verkaufsgespräche trainieren — bevor du mit echten Leads sprichst.",
    },
    {
      label: "Ethical Simulator",
      route: "/members/simulator/ethical",
      caption: "Einwände & Drucksituationen — sauber, ohne Manipulation.",
    },
    {
      label: "AI Copilot",
      route: "/members/ai-copilot",
      caption: "Echtzeit-Guidance während des Calls.",
    },
  ];

  return (
    <section
      ref={ref}
      data-mos-section="ai_differentiation"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent">
            AI Differentiation
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Train before real calls.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-foreground/65 md:text-lg">
            Practice conversations, objections and sales situations before
            speaking with real prospects.
          </p>
        </div>

        <div className="mt-12 hidden gap-6 md:grid md:grid-cols-3">
          {screens.map((s) => (
            <PlatformProofSlot key={s.route} {...s} />
          ))}
        </div>
        <div className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 md:hidden">
          {screens.map((s) => (
            <div key={s.route} className="min-w-[82%] snap-center">
              <PlatformProofSlot {...s} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AiDifferentiationProof;
