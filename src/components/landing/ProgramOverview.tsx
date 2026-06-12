import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const modules = [
  { id: "m1", title: "Modul 1: Ethical Sales Foundations", desc: "Standards, Fit-Check, No-Sale Kompetenz – das Fundament für integres Closing." },
  { id: "m2", title: "Modul 2: Discovery & Client Diagnosis", desc: "Fragen stellen, Bedürfnisse erkennen, Value Mapping – verstehen statt überreden." },
  { id: "m3", title: "Modul 3: Offer Framing & Value Positioning", desc: "Value kommunizieren, Preislogik aufbauen, Sicherheit geben." },
  { id: "m4", title: "Modul 4: Objection Navigation", desc: "Frameworks, Reframes, Praxisübungen – souverän mit Einwänden umgehen." },
  { id: "m5", title: "Modul 5: Decision & Commitment to Next Steps", desc: "Commitment, Follow-up, saubere Übergänge – Abschlüsse mit gutem Gefühl." },
  { id: "m6", title: "Modul 6: Real Client Conversations + Feedback", desc: "Rollenspiele, echte Call-Reviews, individuelles Coaching." },
];

const deliverables = ["Skript-Bibliothek", "Call-Blueprint", "Ethics Checklist", "Einwand-Playbook"];

const ProgramOverview = () => (
  <section className="bg-card py-20 md:py-28">
    <div className="container mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        <h2 className="mb-4 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Das Programm
        </h2>
        <div className="mx-auto mb-12 max-w-xl text-center space-y-3">
          <p className="font-sans text-base text-muted-foreground">
            6–12 Wochen, modular aufgebaut. Hybrid oder 100 % remote möglich.
          </p>
          <p className="font-sans text-sm leading-relaxed text-muted-foreground">
            Nach diesen 6–12 Wochen kannst du strukturierte High-Ticket Gespräche führen und bist bereit, erste Mandate oder Closing-Partnerschaften zu übernehmen. Du bestimmst das Tempo.
          </p>
        </div>

        <Accordion type="single" collapsible className="mb-12">
          {modules.map((m) => (
            <AccordionItem key={m.id} value={m.id} className="border-border">
              <AccordionTrigger className="font-serif text-lg font-medium text-foreground hover:no-underline">
                {m.title}
              </AccordionTrigger>
              <AccordionContent className="font-sans text-sm leading-relaxed text-muted-foreground">
                {m.desc}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="rounded-sm border border-border bg-background p-6">
          <p className="mb-3 font-sans text-xs font-medium uppercase tracking-widest text-accent">
            Deliverables
          </p>
          <div className="flex flex-wrap gap-3">
            {deliverables.map((d) => (
              <span
                key={d}
                className="rounded-full border border-border px-4 py-1.5 font-sans text-xs font-medium text-foreground"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

export default ProgramOverview;
