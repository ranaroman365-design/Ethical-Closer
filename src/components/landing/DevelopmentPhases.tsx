import { motion } from "framer-motion";

const phases = [
  {
    label: "Phase 1 – Einstieg",
    time: "0–8 Wochen",
    title: "Erste High-Ticket-Abschlüsse",
    result: "2.000–4.000 € zusätzliche Monatsumsätze bei aktiver Umsetzung",
  },
  {
    label: "Phase 2 – Konsolidierung",
    time: "2–6 Monate",
    title: "Konstante Deal-Zyklen",
    result: "5.000–10.000 € leistungsbasiert möglich",
  },
  {
    label: "Phase 3 – Etablierung",
    time: "ab 6 Monate",
    title: "Positionierung als High-Ticket-Professional",
    result: "10.000 €+ abhängig von Markt, Einsatz und Umfeld",
  },
];

const DevelopmentPhases = () => (
  <section className="bg-card py-20 md:py-28">
    <div className="container mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-14 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Realistische Entwicklung im Ethical Top Closing
        </h2>

        <div className="space-y-8">
          {phases.map((p, i) => (
            <motion.div
              key={p.label}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.12 }}
              className="rounded-sm border border-border bg-background p-6 md:p-8"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-3">
                <span className="font-sans text-xs font-medium uppercase tracking-widest text-accent">{p.label}</span>
                <span className="font-sans text-xs text-muted-foreground">({p.time})</span>
              </div>
              <h3 className="mb-2 font-serif text-xl font-semibold text-foreground">{p.title}</h3>
              <p className="font-sans text-sm text-muted-foreground">{p.result}</p>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center font-sans text-xs text-muted-foreground">
          Ergebnisse variieren je nach Einsatz, Marktumfeld und Vorerfahrung.
        </p>
      </motion.div>
    </div>
  </section>
);

export default DevelopmentPhases;
