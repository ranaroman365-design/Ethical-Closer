import { motion } from "framer-motion";
import { Check } from "lucide-react";

const benefits = [
  "Leistungsbasierte Vergütung statt Fixgehalt",
  "Ortsunabhängige Arbeit",
  "Keine interne Karrierepolitik",
  "Eigenes Tempo ohne Fremddruck",
];

const ProblemSection = () => (
  <section className="bg-card py-20 md:py-28">
    <div className="container mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-6 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Raus aus der Gehalts-Deckelung.<br />Rein in Selbstbestimmung.
        </h2>

        <p className="mx-auto mb-10 max-w-xl text-center font-sans text-base leading-relaxed text-muted-foreground">
          Im klassischen 9–5-Modell ist dein Einkommen begrenzt – unabhängig davon, wie viel Wert du tatsächlich schaffst.
        </p>

        <p className="mb-6 text-center font-sans text-sm font-medium uppercase tracking-widest text-accent">
          High-Ticket Closing ermöglicht:
        </p>

        <ul className="mb-10 space-y-4">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-3">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} />
              <span className="font-sans text-base leading-relaxed text-foreground">{b}</span>
            </li>
          ))}
        </ul>

        <div className="mx-auto max-w-xl text-center space-y-4">
          <p className="font-sans text-base text-muted-foreground">
            Du bestimmst Intensität, Fokus und Entwicklung selbst.
          </p>
          <p className="font-serif text-base text-foreground/85 leading-relaxed">
            Du führst keine Verkaufsgespräche unter Druck –<br />
            du führst Beratungsgespräche, die echten Fortschritt ermöglichen.
          </p>
        </div>
      </motion.div>
    </div>
  </section>
);

export default ProblemSection;
