import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

const forYou = [
  "Du willst ein skalierbares Einkommen im High-Ticket-Bereich.",
  "Du suchst eine Ausbildung mit Substanz, Praxis und Feedback.",
  "Integrität und Kundenfit sind dir wichtiger als schnelle Abschlüsse.",
  "Du bist bereit, 5–10 h/Woche zu investieren.",
];

const notForYou = [
  "Du suchst ‚schnell reich werden ohne Arbeit'.",
  "Du willst manipulative Drucktechniken lernen.",
  "Du bist nicht bereit, an dir selbst zu arbeiten.",
  "Du erwartest Ergebnisse ohne Praxis und Wiederholung.",
];

const WhoItsFor = () => (
  <section className="py-20 md:py-28">
    <div className="container mx-auto max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-12 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Für wen es ist (und für wen nicht)
        </h2>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="rounded-sm border border-primary/20 bg-primary/5 p-8">
            <p className="mb-6 font-serif text-xl font-semibold text-primary">Für dich, wenn …</p>
            <ul className="space-y-4">
              {forYou.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} />
                  <span className="font-sans text-sm text-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-sm border border-border bg-card p-8">
            <p className="mb-6 font-serif text-xl font-semibold text-muted-foreground">Nicht für dich, wenn …</p>
            <ul className="space-y-4">
              {notForYou.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.5} />
                  <span className="font-sans text-sm text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

export default WhoItsFor;
