/**
 * Ruhiger Karriereweg-Visualisierer L1 → L6.
 * Bewusst OHNE Geldbeträge, OHNE "10k/Monat", OHNE Hustle-Sprache.
 * Stattdessen: Lernen → Liefern → Führen → Skalieren als emotionale Stufen.
 */

const stages = [
  {
    code: "L1–L2",
    title: "Lernen",
    body:
      "Du lernst Kommunikation als echtes Handwerk. Klar, ehrlich, präzise — fern von jedem Sales-Skript.",
  },
  {
    code: "L3–L4",
    title: "Liefern",
    body:
      "Du führst eigene Gespräche, übernimmst Verantwortung und siehst, wie deine Arbeit messbar wirkt.",
  },
  {
    code: "L5",
    title: "Führen",
    body:
      "Du gibst weiter, was du gelernt hast. Andere wachsen an deiner Klarheit — und du an ihrer Entwicklung.",
  },
  {
    code: "L6",
    title: "Skalieren",
    body:
      "Du baust ein eigenes Team auf, formst die Kultur mit und gestaltest deinen Bereich nach deinen Werten.",
  },
];

const CareerPathLadder = () => {
  return (
    <section
      id="career-path"
      className="border-b border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-6xl px-6 py-24 md:px-10">
        <div className="mb-14 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">
            Karriereweg statt Funnel
          </p>
          <h2 className="mt-4 font-serif text-3xl leading-tight md:text-5xl">
            Eine Richtung, die mitwächst.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-foreground/70 md:text-lg">
            Vier ruhige Stufen. Klar definiert, transparent, messbar. Kein
            künstliches Levelsystem — sondern echte Verantwortung, die du dir
            mit der Zeit erarbeitest.
          </p>
        </div>

        <ol className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
          {stages.map((s, i) => (
            <li
              key={s.code}
              className="relative flex h-full flex-col rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 transition hover:border-accent/40"
            >
              <span className="text-[10px] uppercase tracking-[0.3em] text-accent">
                {s.code}
              </span>
              <h3 className="mt-3 font-serif text-2xl leading-tight">
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-foreground/70">
                {s.body}
              </p>
              <span
                aria-hidden
                className="mt-6 inline-block h-px w-10 bg-accent/40"
              />
              <span
                aria-hidden
                className="mt-3 text-[10px] uppercase tracking-[0.3em] text-foreground/40"
              >
                Stufe {String(i + 1).padStart(2, "0")}
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-xs uppercase tracking-[0.3em] text-foreground/45">
          Keine Stufe wird übersprungen · Niemand wird gepusht
        </p>
      </div>
    </section>
  );
};

export default CareerPathLadder;
