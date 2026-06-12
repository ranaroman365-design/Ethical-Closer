import { motion } from "framer-motion";
import { Brain, Target, Shield } from "lucide-react";

const pillars = [
  {
    icon: Brain,
    title: "Psychologie & Gesprächsführung",
    items: ["Bedarf klären", "Framing & Fragen", "Gesprächsstruktur"],
  },
  {
    icon: Target,
    title: "Closing-Skills (Handwerk)",
    items: ["Einwandbehandlung", "Preisgespräche", "Next Steps & Follow-up"],
  },
  {
    icon: Shield,
    title: "Ethik-Standard & Selbstführung",
    items: ["Fit-Check & No-Sale", "Integrität", "Langfristige Reputation"],
  },
];

const ValueProposition = () => (
  <section className="py-20 md:py-28">
    <div className="container">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <h2 className="mb-4 font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Was du hier wirklich lernst
        </h2>
        <p className="mx-auto mb-14 max-w-xl font-sans text-base text-muted-foreground">
          Du bekommst Skripte, Checklisten, Rollenspiele &amp; Feedback.
        </p>
      </motion.div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
        {pillars.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="rounded-sm border border-border bg-card p-8"
          >
            <p.icon className="mb-5 h-7 w-7 text-accent" strokeWidth={1.5} />
            <h3 className="mb-4 font-serif text-xl font-semibold text-foreground">{p.title}</h3>
            <ul className="space-y-2">
              {p.items.map((item) => (
                <li key={item} className="font-sans text-sm text-muted-foreground">
                  — {item}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default ValueProposition;
