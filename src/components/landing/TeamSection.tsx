import { motion } from "framer-motion";
import josuePortrait from "@/assets/josue-portrait.jpeg";
import josueCasual from "@/assets/josue-casual.png";
import teamCollage from "@/assets/team-collage.png";
import teamCommunity from "@/assets/team-community.png";

const TeamSection = () => (
  <section className="py-20 md:py-28">
    <div className="container mx-auto max-w-5xl">
      {/* Hero Image – Social Proof */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="mb-16"
      >
        <div className="overflow-hidden rounded-sm">
          <img
            src={teamCollage}
            alt="Ethical Top Closer – Team-Workshop und Community"
            className="aspect-[16/9] w-full object-cover"
            loading="lazy"
          />
        </div>
      </motion.div>

      {/* Founder Intro */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="mb-20"
      >
        <p className="mb-4 text-center font-sans text-xs font-medium uppercase tracking-[0.2em] text-accent">
          Der Gründer
        </p>
        <h2 className="mb-12 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Wer hinter dem Programm steht
        </h2>

        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          {/* Portrait */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="overflow-hidden rounded-sm">
              <img
                src={josuePortrait}
                alt="Josué Manuel Quintana Díaz – Gründer von Ethical Top Closer"
                className="aspect-[4/5] w-full object-cover object-top"
                loading="lazy"
              />
            </div>
            <div className="mt-4 text-center">
              <p className="font-serif text-lg font-semibold text-foreground">
                Josué Manuel Quintana Díaz
              </p>
              <p className="font-sans text-sm text-muted-foreground">
                Gründer & Methodik, Ethical Top Closer™
              </p>
            </div>
          </div>

          {/* Story */}
          <div className="space-y-5 font-sans text-base leading-relaxed text-muted-foreground">
            <p className="font-serif text-lg text-foreground">
              Mein Team und ich haben über 26 Jahre Vertriebserfahrung in dieses Programm auf den Punkt gebracht — damit du sofort loslegen kannst.
            </p>
            <p>
              Nicht Hype. Sondern klare Prozesse und saubere Gesprächsführung, die wirklich Mehrwert stiftet.
            </p>
            <p>
              Ethical Top Closer ist aus der Überzeugung entstanden, dass hochpreisiger Vertrieb nur dann nachhaltig funktioniert, wenn er auf Klarheit, Integrität und echter Präsenz basiert.
            </p>
            <p>
              Zu oft wird Closing mit Druck, Manipulation oder künstlicher Verknappung verwechselt. Kurzfristig mag das funktionieren. Langfristig zerstört es Vertrauen — und Menschen.
            </p>
            <p className="font-serif text-foreground italic">
              Ich habe mich bewusst für einen anderen Weg entschieden.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Casual / Lifestyle Image */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="mb-20"
      >
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <div className="order-2 space-y-5 font-sans text-base leading-relaxed text-muted-foreground md:order-1">
            <p>
              Ethical Top Closer steht für strukturierte Gesprächsführung, saubere Prozesse und Leistungsorientierung — ohne Nervensystem-Überlastung.
            </p>
            <p>
              Ich verantworte die Methodik und strategische Ausrichtung. Das Team sorgt für Systemstabilität, Automatisierung und operative Umsetzung.
            </p>
            <div className="space-y-1 font-serif text-foreground">
              <p>Keine Theorie.</p>
              <p>Keine Motivationsparolen.</p>
              <p className="italic text-muted-foreground">
                Sondern ein belastbares System, das erwiesenermaßen funktioniert.
              </p>
            </div>
            <p className="border-l-2 border-accent pl-4 font-serif text-foreground">
              Wenn du leistungsbasiert und verfahrenssicher arbeiten willst — ohne dich zu verbiegen — bist du hier richtig.
            </p>
          </div>
          <div className="order-1 mx-auto w-full max-w-sm overflow-hidden rounded-sm md:order-2">
            <img
              src={josueCasual}
              alt="Josué – Ethical Top Closer Gründer"
              className="aspect-[4/5] w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </motion.div>

      {/* Team & Community */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, delay: 0.15 }}
      >
        <div className="mb-10 text-center">
          <p className="mb-4 font-sans text-xs font-medium uppercase tracking-[0.2em] text-accent">
            Das Team
          </p>
          <h3 className="mb-4 font-serif text-2xl font-semibold text-foreground md:text-3xl">
            Ein spezialisiertes Kernteam
          </h3>
          <p className="mx-auto max-w-xl font-sans text-base text-muted-foreground">
            Gemeinsam vereinen wir über 26 Jahre operative Vertriebserfahrung — vom klassischen Vertriebsaufbau bis zur Optimierung komplexer High-Ticket-Strukturen.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="overflow-hidden rounded-sm">
            <img
              src={teamCollage}
              alt="Ethical Top Closer Team bei der Arbeit"
              className="aspect-[4/5] w-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="overflow-hidden rounded-sm">
            <img
              src={teamCommunity}
              alt="Ethical Top Closer Community"
              className="aspect-[4/5] w-full object-cover"
              loading="lazy"
            />
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="font-sans text-sm text-muted-foreground">
            Von Vertriebs-Setting über Closing bis Performance-Improvement.
          </p>
        </div>
      </motion.div>
    </div>
  </section>
);

export default TeamSection;
