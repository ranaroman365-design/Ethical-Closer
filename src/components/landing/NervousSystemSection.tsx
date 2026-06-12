import { motion } from "framer-motion";
import { Check } from "lucide-react";

const skills = [
  "Dein Nervensystem vor Calls zu regulieren",
  "Klar und ruhig zu kommunizieren",
  "Sicherheit auszustrahlen",
  "Drucksituationen ohne Stress zu führen",
];

const programParts = [
  "Radiant Nervous System Calibration",
  "Call-Vorbereitungsroutinen",
  "Fokus- & Präsenzübungen",
];

const NervousSystemSection = () => (
  <section className="py-20 md:py-28">
    <div className="container mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-6 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Innere Stabilität als Verkaufsfaktor
        </h2>

        <p className="mx-auto mb-10 max-w-xl text-center font-sans text-base leading-relaxed text-muted-foreground">
          Ethisches Closing beginnt nicht mit Skripten – sondern mit Präsenz.
        </p>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <p className="mb-4 font-sans text-sm font-medium text-foreground">Du lernst:</p>
            <ul className="space-y-3">
              {skills.map((s) => (
                <li key={s} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  <span className="font-sans text-sm text-foreground">{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-4 font-sans text-sm font-medium text-foreground">Teil des Programms:</p>
            <ul className="space-y-3">
              {programParts.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <span className="mt-1 text-accent">—</span>
                  <span className="font-sans text-sm text-muted-foreground">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 rounded-sm border border-accent/30 bg-card p-6 text-center">
          <p className="font-serif text-lg text-foreground">
            94 % der Teilnehmer fühlen sich nach Abschluss deutlich sicherer in Preis- und Abschlussgesprächen.
          </p>
        </div>
      </motion.div>
    </div>
  </section>
);

export default NervousSystemSection;
