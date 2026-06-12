import { motion } from "framer-motion";
import { ArrowRight, Check, Brain, Eye, Heart, Lightbulb, Compass, ChevronRight } from "lucide-react";
import FooterSection from "@/components/landing/FooterSection";
import StickyCtaBar from "@/components/landing/StickyCtaBar";
import { useState } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" as const },
  }),
};

const CtaButton = ({ label = "Masterclass starten" }: { label?: string }) => {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("analytics", { detail: { event: "cta_primary_click", location: "quality_page" } }));
    window.location.href = "https://buy.stripe.com/test_aFa4gyaxj8k42r21G54ZG06";
  };
  return (
    <button
      onClick={handleClick}
      className="group inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-base font-semibold tracking-wide text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg"
    >
      👉 {label}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </button>
  );
};

/* ─── HERO ─── */
const HeroQuality = () => (
  <section className="relative overflow-hidden bg-foreground py-24 md:py-32">
    <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-primary/20" />
    <div className="container relative z-10 mx-auto max-w-4xl text-center">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="font-serif text-4xl font-bold leading-tight tracking-tight text-background md:text-6xl"
      >
        Lerne, Entscheidungen zu führen –
        <br />
        <span className="text-accent">und werde dafür bezahlt.</span>
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.7 }}
        className="mx-auto mt-6 max-w-2xl font-sans text-lg text-background/70 md:text-xl"
      >
        Baue eine Fähigkeit auf, die Menschen hilft, Klarheit zu gewinnen –
        und dir ein strukturiertes Einkommen ermöglicht.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-10"
      >
        <CtaButton />
      </motion.div>

      <p className="mt-4 font-sans text-sm text-background/40">
        Kein Druck. Keine Manipulation. Sondern Klarheit.
      </p>
    </div>
  </section>
);

/* ─── TRUTH ─── */
const TruthSection = () => (
  <section className="bg-background py-20 md:py-28">
    <div className="container mx-auto max-w-3xl text-center">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="font-serif text-3xl font-bold text-foreground md:text-4xl"
      >
        Warum Menschen nicht entscheiden
      </motion.h2>
      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-muted-foreground"
      >
        Die meisten Menschen wissen, was sie tun sollten.
        <br /><br />
        Und trotzdem tun sie es nicht.
        <br /><br />
        Nicht wegen fehlender Information –
        <span className="font-medium text-foreground"> sondern wegen innerem Widerstand.</span>
      </motion.p>
    </div>
  </section>
);

/* ─── INSIGHT ─── */
const InsightSection = () => (
  <section className="border-y border-border bg-muted/40 py-20 md:py-28">
    <div className="container mx-auto max-w-3xl text-center">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="font-serif text-3xl font-bold text-foreground md:text-4xl"
      >
        Das eigentliche Problem
      </motion.h2>
      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-muted-foreground"
      >
        Entscheidungen sind selten logisch.
        <br /><br />
        <span className="font-medium text-foreground">Sie sind emotional.</span>
        <br /><br />
        Und genau dort scheitern die meisten Gespräche.
      </motion.p>
    </div>
  </section>
);

/* ─── SOLUTION ─── */
const SolutionQuality = () => (
  <section className="bg-background py-20 md:py-28">
    <div className="container mx-auto max-w-3xl text-center">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="font-serif text-3xl font-bold text-foreground md:text-4xl"
      >
        Ein anderer Ansatz
      </motion.h2>
      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-muted-foreground"
      >
        Statt Menschen zu überzeugen,
        <br />
        lernst du, ihnen zu helfen, <span className="font-medium text-foreground">sich selbst zu verstehen.</span>
        <br /><br />
        Und genau dadurch entstehen echte Entscheidungen.
      </motion.p>
    </div>
  </section>
);

/* ─── SYSTEM ─── */
const SystemQuality = () => (
  <section className="border-y border-border bg-foreground py-20 md:py-28">
    <div className="container mx-auto max-w-3xl text-center">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="font-serif text-3xl font-bold text-background md:text-4xl"
      >
        Das System dahinter
      </motion.h2>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-2 text-background/80"
      >
        {["Verstehen", "Anwenden", "Feedback", "Verbesserung", "echte Gespräche"].map((step, i) => (
          <span key={step} className="flex items-center gap-2">
            <span className="rounded-sm bg-primary/20 px-4 py-2 font-sans text-sm font-semibold text-accent">
              {step}
            </span>
            {i < 4 && <ChevronRight className="h-4 w-4 text-background/30" />}
          </span>
        ))}
      </motion.div>

      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={2}
        className="mx-auto mt-8 max-w-xl font-sans text-lg leading-relaxed text-background/70"
      >
        Du entwickelst nicht nur Wissen,
        <br />
        sondern echte Gesprächskompetenz.
      </motion.p>
    </div>
  </section>
);

/* ─── IDENTITY ─── */
const IdentitySection = () => (
  <section className="bg-background py-20 md:py-28">
    <div className="container mx-auto max-w-3xl text-center">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="font-serif text-3xl font-bold text-foreground md:text-4xl"
      >
        Deine Rolle
      </motion.h2>
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-8 max-w-lg rounded-sm border border-accent/20 bg-accent/5 p-8"
      >
        <p className="font-sans text-lg leading-relaxed text-foreground">
          Du wirst kein Verkäufer.
          <br /><br />
          Du wirst jemand, der <span className="font-semibold text-accent">Klarheit schafft.</span>
          <br /><br />
          Und genau dafür wirst du bezahlt.
        </p>
      </motion.div>
    </div>
  </section>
);

/* ─── OUTCOME ─── */
const OutcomeSection = () => (
  <section className="border-y border-border bg-muted/40 py-20 md:py-28">
    <div className="container mx-auto max-w-3xl">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="text-center font-serif text-3xl font-bold text-foreground md:text-4xl"
      >
        Was daraus entsteht
      </motion.h2>
      <div className="mx-auto mt-12 grid max-w-xl gap-6">
        {[
          { icon: Brain, text: "Echte Gesprächskompetenz" },
          { icon: Heart, text: "Verständnis für Menschen" },
          { icon: Compass, text: "Strukturierte Einnahmen" },
          { icon: Lightbulb, text: "Langfristige Entwicklung" },
        ].map((item, i) => (
          <motion.div
            key={item.text}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={i + 1}
            className="flex items-center gap-4 rounded-sm border border-border bg-card p-5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-primary/10">
              <item.icon className="h-5 w-5 text-primary" />
            </div>
            <span className="font-sans text-base font-medium text-foreground">{item.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

/* ─── FINAL CTA ─── */
const FinalCtaQuality = () => {
  const [checked, setChecked] = useState(false);
  return (
    <section className="bg-background py-20 md:py-28">
      <div className="container mx-auto max-w-2xl text-center">
        <motion.h2
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0}
          className="font-serif text-3xl font-bold text-foreground md:text-4xl"
        >
          Finde heraus, ob das zu dir passt
        </motion.h2>
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={1}
          className="mt-10 flex flex-col items-center gap-6"
        >
          <CtaButton />
          <label className="flex cursor-pointer items-center gap-2 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => setChecked(!checked)}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            Ich möchte verstehen, wie echte Entscheidungen entstehen
          </label>
        </motion.div>
      </div>
    </section>
  );
};

/* ─── PAGE ─── */
const Quality = () => (
  <main>
    <HeroQuality />
    <TruthSection />
    <InsightSection />
    <SolutionQuality />
    <SystemQuality />
    <IdentitySection />
    <OutcomeSection />
    <FinalCtaQuality />
    <FooterSection />
    <StickyCtaBar />
  </main>
);

export default Quality;
