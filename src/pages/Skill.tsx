import { motion } from "framer-motion";
import { ArrowRight, Check, Zap, Target, TrendingUp, Users, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
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
    window.dispatchEvent(new CustomEvent("analytics", { detail: { event: "cta_primary_click", location: "skill_page" } }));
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
const HeroSkill = () => (
  <section className="relative overflow-hidden bg-foreground py-24 md:py-32">
    <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-primary/30" />
    <div className="container relative z-10 mx-auto max-w-4xl text-center">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="font-serif text-4xl font-bold leading-tight tracking-tight text-background md:text-6xl"
      >
        Verdiene 5.000€–20.000€
        <br />
        <span className="text-accent">pro Monat</span> als High-Ticket Closer
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.7 }}
        className="mx-auto mt-6 max-w-2xl font-sans text-lg text-background/70 md:text-xl"
      >
        Arbeite remote, führe Verkaufsgespräche für Unternehmen
        und werde für Ergebnisse bezahlt – nicht für Zeit.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mx-auto mt-8 flex flex-col items-center gap-3 text-left sm:max-w-md"
      >
        {[
          "Keine Kaltakquise notwendig",
          "Einstieg auch ohne Erfahrung möglich",
          "Klare Struktur statt Chaos",
        ].map((t) => (
          <div key={t} className="flex items-center gap-3 text-background/80">
            <Check className="h-5 w-5 shrink-0 text-accent" />
            <span className="font-sans text-base">{t}</span>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="mt-10"
      >
        <CtaButton />
      </motion.div>

      <p className="mt-4 font-sans text-xs text-background/40">
        Basierend auf einem strukturierten System aus Praxis & Training
      </p>
    </div>
  </section>
);

/* ─── PROBLEM ─── */
const ProblemSkill = () => (
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
        Warum die meisten nie gut verdienen
      </motion.h2>
      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-muted-foreground"
      >
        Die meisten Menschen tauschen Zeit gegen Geld.
        <br /><br />
        Selbst wenn sie mehr arbeiten, bleibt ihr Einkommen begrenzt.
        <br /><br />
        Nicht weil sie nicht gut genug sind –
        <span className="font-medium text-foreground"> sondern weil sie die falsche Fähigkeit nutzen.</span>
      </motion.p>
    </div>
  </section>
);

/* ─── OPPORTUNITY ─── */
const OpportunitySkill = () => (
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
        Eine Fähigkeit, für die Unternehmen sofort zahlen
      </motion.h2>
      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-muted-foreground"
      >
        Unternehmen haben ein Problem:
        <br />
        <span className="font-medium text-foreground">Sie haben Leads – aber keine Abschlüsse.</span>
        <br /><br />
        Deshalb zahlen sie hohe Provisionen für Menschen,
        die Gespräche führen und Entscheidungen herbeiführen können.
      </motion.p>
    </div>
  </section>
);

/* ─── SOLUTION ─── */
const SolutionSkill = () => (
  <section className="bg-background py-20 md:py-28">
    <div className="container mx-auto max-w-3xl">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="text-center font-serif text-3xl font-bold text-foreground md:text-4xl"
      >
        Was du hier lernst
      </motion.h2>
      <div className="mx-auto mt-12 grid max-w-xl gap-6">
        {[
          { icon: Target, text: "Wie du Gespräche strukturiert führst" },
          { icon: Zap, text: "Wie du Einwände verstehst und auflöst" },
          { icon: TrendingUp, text: "Wie du Abschlüsse erzielst" },
          { icon: Users, text: "Wie du direkt mit Unternehmen arbeitest" },
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

/* ─── SYSTEM ─── */
const SystemSkill = () => (
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
        Der klare Weg
      </motion.h2>

      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-2 text-background/80"
      >
        {["Training", "Praxis", "echte Calls", "Einkommen"].map((step, i) => (
          <span key={step} className="flex items-center gap-2">
            <span className="rounded-sm bg-accent/20 px-4 py-2 font-sans text-sm font-semibold text-accent">
              {step}
            </span>
            {i < 3 && <ChevronRight className="h-4 w-4 text-background/30" />}
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
        Du lernst nicht nur Theorie.
        <br />
        Du gehst Schritt für Schritt in echte Gespräche
        und entwickelst eine Fähigkeit, die sofort bezahlt wird.
      </motion.p>
    </div>
  </section>
);

/* ─── PROOF ─── */
const ProofSkill = () => (
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
        Was möglich ist
      </motion.h2>
      <div className="mx-auto mt-10 grid gap-6 sm:grid-cols-3">
        {[
          { metric: "2.000€–8.000€", label: "1–2 Deals pro Woche" },
          { metric: "Höhere Deals", label: "Mehr Erfahrung" },
          { metric: "Mehr Einkommen", label: "Mehr Calls" },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={i + 1}
            className="rounded-sm border border-border bg-card p-6"
          >
            <p className="font-serif text-2xl font-bold text-accent">{item.metric}</p>
            <p className="mt-2 font-sans text-sm text-muted-foreground">{item.label}</p>
          </motion.div>
        ))}
      </div>
      <p className="mt-6 font-sans text-xs text-muted-foreground">
        Ergebnisse variieren je nach Einsatz und Entwicklung.
      </p>
    </div>
  </section>
);

/* ─── OBJECTION ─── */
const ObjectionSkill = () => (
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
        Ist das etwas für dich?
      </motion.h2>
      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-6 max-w-xl font-sans text-lg leading-relaxed text-muted-foreground"
      >
        Du brauchst keine Vorerfahrung.
        <br /><br />
        Was du brauchst, ist:
      </motion.p>
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={2}
        className="mx-auto mt-6 flex flex-col items-center gap-3"
      >
        {["Lernbereitschaft", "Verbindlichkeit", "Offenheit für neue Fähigkeiten"].map((t) => (
          <div key={t} className="flex items-center gap-3 text-foreground">
            <span className="text-accent">–</span>
            <span className="font-sans text-base">{t}</span>
          </div>
        ))}
      </motion.div>
    </div>
  </section>
);

/* ─── FINAL CTA ─── */
const FinalCtaSkill = () => {
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
            Ich bin bereit, eine neue Fähigkeit zu lernen
          </label>
        </motion.div>
      </div>
    </section>
  );
};

/* ─── PAGE ─── */
const Skill = () => (
  <main>
    <HeroSkill />
    <ProblemSkill />
    <OpportunitySkill />
    <SolutionSkill />
    <SystemSkill />
    <ProofSkill />
    <ObjectionSkill />
    <FinalCtaSkill />
    <FooterSection />
    <StickyCtaBar />
  </main>
);

export default Skill;
