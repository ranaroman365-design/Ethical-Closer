/**
 * HeroTrustBlock — Social Proof #1 (direkt unter Hero).
 *
 * Bewusst KEINE Zahlen, KEIN "High Ticket", KEIN Luxus.
 * Stattdessen 3 ruhige, persönliche Entwicklungs-Statements.
 * Mobile-first, glaubwürdig, emotional.
 *
 * Tracking läuft via SectionViewTracker (data-mos-section).
 */
const STATEMENTS = [
  "Zum ersten Mal das Gefühl, wirklich meinen eigenen Weg zu gehen.",
  "Ich wollte nicht einfach nur Geld — ich wollte mehr Perspektive.",
  "Heute arbeite ich ortsunabhängig und entwickle mich endlich weiter.",
];

const HeroTrustBlock = () => (
  <section
    data-mos-section="hero_trust"
    className="border-y border-foreground/10 bg-background"
  >
    <div className="mx-auto max-w-5xl px-6 py-12 md:px-10 md:py-14">
      <p className="text-center text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
        Stimmen aus dem Weg
      </p>
      <div className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
        {STATEMENTS.map((line) => (
          <blockquote
            key={line}
            className="text-center font-serif text-base leading-relaxed text-foreground/80 md:text-left md:text-lg"
          >
            <span className="text-accent">„</span>
            {line}
            <span className="text-accent">"</span>
          </blockquote>
        ))}
      </div>
    </div>
  </section>
);

export default HeroTrustBlock;
