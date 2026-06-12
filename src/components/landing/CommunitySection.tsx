import { motion } from "framer-motion";

const CommunitySection = () => (
  <section className="bg-card py-20 md:py-28">
    <div className="container mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        <p className="mb-4 text-center font-sans text-xs font-medium uppercase tracking-[0.2em] text-accent">
          Das Programm beinhaltet
        </p>
        <h2 className="mb-14 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Dein Netzwerk nach dem Training
        </h2>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Closer Circle */}
          <div className="rounded-sm border border-border bg-background p-8">
            <h3 className="mb-4 font-serif text-xl font-semibold text-foreground">The Closer Circle</h3>
            <p className="mb-4 font-sans text-sm leading-relaxed text-muted-foreground">
              Eine kuratierte, qualitätsgesicherte Community von Professionals,
              die gemeinsam nachhaltiges, ortsunabhängiges Einkommen im High-Ticket-Bereich aufbauen.
            </p>
            <div className="space-y-1 font-sans text-sm text-foreground/80">
              <p>Kein Hype.</p>
              <p>Kein Lärm.</p>
              <p className="italic text-muted-foreground">Sondern echtes Handwerk und gegenseitige Verantwortung.</p>
            </div>
          </div>

          {/* Quarterly Crossings */}
          <div className="rounded-sm border border-border bg-background p-8">
            <h3 className="mb-4 font-serif text-xl font-semibold text-foreground">Quarterly Crossings</h3>
            <p className="mb-4 font-sans text-sm leading-relaxed text-muted-foreground">
              Private Zusammenkünfte für Alumni, etablierte Closers und High-Ticket-Professionals.
            </p>
            <p className="mb-4 font-sans text-sm leading-relaxed text-muted-foreground">
              Ein Umfeld auf Augenhöhe, um dein Closing zu verfeinern,
              dein Netzwerk zu erweitern und dich gezielt für dein nächstes Level zu qualifizieren.
            </p>
            <div className="space-y-1 font-sans text-sm text-foreground/80">
              <p>In deinem Tempo.</p>
              <p className="italic text-muted-foreground">Mit deinem Anspruch.</p>
            </div>
          </div>
        </div>

        <div className="mt-10 mx-auto max-w-xl text-center space-y-3">
          <p className="font-sans text-base leading-relaxed text-foreground/85">
            Du arbeitest mit Menschen zusammen, die Wert auf Leistung, Integrität und gegenseitige Unterstützung legen.
          </p>
          <p className="font-sans text-sm leading-relaxed text-muted-foreground">
            So entsteht ein Umfeld, das eher an ein starkes Netzwerk erinnert als an ein klassisches Verkaufsumfeld.
          </p>
        </div>
      </motion.div>
    </div>
  </section>
);

export default CommunitySection;
