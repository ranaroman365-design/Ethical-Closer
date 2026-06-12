import { motion } from "framer-motion";
import { Check } from "lucide-react";

const principles = [
  "Echtes Interesse am Gegenüber",
  "Klarheit statt Manipulation",
  "Fit-Check statt Hard-Sell",
  "Langfristige Kundenbeziehungen",
];

const results = [
  "Höhere Abschlussqualität",
  "Mehr wiederkehrende Käufe",
  "Höherer Lifetime Customer Value",
  "Nachhaltige Provisionen",
  "Zufriedenere Kunden",
  "Mehr Freude an deiner Arbeit",
  "Tiefere Vertrauensbeziehungen zu Kunden",
];

const EthicsSection = () => (
  <section className="py-20 md:py-28">
    <div className="container mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-6 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Warum Ethik die bessere Strategie ist
        </h2>

        <div className="mx-auto mb-10 max-w-xl space-y-4 text-center font-sans text-base leading-relaxed text-muted-foreground">
          <p>Je höher die Ticketgröße, desto wichtiger wird Vertrauen.</p>
          <p>Menschen treffen hochpreisige Entscheidungen nur dann, wenn sie sich verstanden und sicher fühlen.</p>
          <p>Unethische Drucktechniken funktionieren kurzfristig – zerstören aber Beziehungen.</p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Principles */}
          <div className="rounded-sm border border-border bg-card p-8">
            <p className="mb-6 font-sans text-xs font-medium uppercase tracking-widest text-accent">
              Ethisches Closing bedeutet
            </p>
            <ul className="space-y-3">
              {principles.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  <span className="font-sans text-sm text-foreground">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Results */}
          <div className="rounded-sm border border-accent/30 bg-background p-8">
            <p className="mb-6 font-sans text-xs font-medium uppercase tracking-widest text-accent">
              Das Ergebnis
            </p>
            <ul className="space-y-3">
              {results.map((r) => (
                <li key={r} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />
                  <span className="font-sans text-sm text-foreground">{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 mx-auto max-w-xl text-center space-y-1">
          <p className="font-serif text-lg text-foreground">
            Du verkaufst nicht gegen dein Nervensystem.
          </p>
          <p className="font-serif text-lg italic text-muted-foreground">
            Du arbeitest mit ihm.
          </p>
        </div>

        <div className="mt-12 mx-auto max-w-xl space-y-4 text-center">
          <p className="font-sans text-base leading-relaxed text-foreground">
            Ethical High-Ticket Closing bedeutet, dass du nicht einfach Produkte verkaufst.
          </p>
          <p className="font-sans text-base leading-relaxed text-muted-foreground">
            Du übernimmst die Rolle eines Beraters für wichtige Entscheidungen – Menschen kommen zu dir, weil sie Klarheit wollen, nicht weil sie gedrängt werden.
          </p>
          <p className="font-serif text-base italic text-foreground/80">
            Genau deshalb entstehen Gespräche mit echtem Impact.
          </p>
        </div>
      </motion.div>
    </div>
  </section>
);

export default EthicsSection;
