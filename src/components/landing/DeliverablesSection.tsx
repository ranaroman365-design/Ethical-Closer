import { motion } from "framer-motion";

const deliverables = [
  "Skript-Bibliothek",
  "Call-Blueprint",
  "Ethics-Checkliste",
  "Einwand-Playbook",
  "Radiant Nervous System Übungen",
  "Real Client Conversations + Feedback",
  "Placement Support",
  "Lifetime Academy Access",
];

const DeliverablesSection = () => (
  <section className="bg-card py-20 md:py-28">
    <div className="container mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-12 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Das Programm beinhaltet
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {deliverables.map((d, i) => (
            <motion.div
              key={d}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              className="rounded-sm border border-border bg-background px-5 py-4 font-sans text-sm font-medium text-foreground"
            >
              {d}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  </section>
);

export default DeliverablesSection;
