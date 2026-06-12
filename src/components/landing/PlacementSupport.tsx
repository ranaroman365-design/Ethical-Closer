import { motion } from "framer-motion";

const PlacementSupport = () => (
  <section className="py-20 md:py-28">
    <div className="container mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <p className="mb-4 font-sans text-xs font-medium uppercase tracking-[0.2em] text-accent">
          Placement Support
        </p>
        <h2 className="mb-6 font-serif text-3xl font-semibold text-foreground md:text-4xl">
          Begleitung bis zur ersten Closing-Position
        </h2>
        <p className="mx-auto max-w-xl font-sans text-base leading-relaxed text-muted-foreground">
          Wir begleiten dich bis zur Sicherung deiner ersten Closing-Position —
          vorausgesetzt, du setzt das Training konsequent um und erfüllst die Qualitätsstandards.
        </p>
      </motion.div>
    </div>
  </section>
);

export default PlacementSupport;
