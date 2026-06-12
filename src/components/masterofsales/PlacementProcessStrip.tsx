import { useProofViewOnce } from "./PlatformProofSlot";

/**
 * HOW PLACEMENT WORKS™ — 4-step strip.
 * Process visualization only — does NOT invent a matching dashboard.
 */
const PlacementProcessStrip = () => {
  const ref = useProofViewOnce("MASTER_PLACEMENT_PREVIEW_VIEW", {
    section: "how_placement_works",
  });

  const steps = [
    {
      n: "01",
      title: "Build Performance Proofs™",
      caption: "Verifizierte KPIs statt Lebenslauf.",
    },
    {
      n: "02",
      title: "Become Placement Ready™",
      caption: "Interner Standard erfüllt — du bist freigegeben.",
    },
    {
      n: "03",
      title: "Get Matched",
      caption: "Wir bringen dich mit passenden Operators zusammen.",
    },
    {
      n: "04",
      title: "Placed High-Ticket Closer™",
      caption: "Aktives Mandat. Performance läuft.",
    },
  ];

  return (
    <section
      ref={ref}
      data-mos-section="how_placement_works"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-accent">
            How placement works™
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Vom Standard zum Mandat — in vier Schritten.
          </h2>
        </div>

        <ol className="mt-14 grid gap-6 md:grid-cols-4">
          {steps.map((s, idx) => (
            <li
              key={s.n}
              className="relative flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6"
            >
              <span className="font-mono text-xs tracking-widest text-accent">
                {s.n}
              </span>
              <h3 className="font-serif text-xl leading-snug text-foreground">
                {s.title}
              </h3>
              <p className="text-sm leading-relaxed text-foreground/65">
                {s.caption}
              </p>
              {idx < steps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute right-3 top-1/2 hidden h-px w-6 -translate-y-1/2 bg-foreground/15 md:block"
                />
              ) : null}
            </li>
          ))}
        </ol>

        <p className="mt-10 text-center text-xs text-foreground/45">
          Placement passiert intern — keine externen Job-Boards, keine
          Versprechen über Marktentwicklung.
        </p>
      </div>
    </section>
  );
};

export default PlacementProcessStrip;
