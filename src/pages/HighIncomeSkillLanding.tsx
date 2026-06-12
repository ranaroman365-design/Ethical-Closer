import { useEffect } from "react";
import { motion, useScroll } from "framer-motion";
import { ArrowRight, Check, ShieldCheck, TrendingUp, Users, Zap, Target, Award } from "lucide-react";
import { Link } from "react-router-dom";
import FooterSection from "@/components/landing/FooterSection";
import { trackFunnelEvent } from "@/lib/track-event";

const QUIZ_PATH = "/high-income-skill/quiz";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: "easeOut" as const },
  }),
};

/* ─── CTA BUTTON (single, consistent) ─── */
const CtaButton = ({ label = "Jetzt Qualifikation starten", className = "" }: { label?: string; className?: string }) => (
  <Link
    to={QUIZ_PATH}
    onClick={() => trackFunnelEvent("CTA_CLICKED", { page: "high-income-skill" })}
    className={`group inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-4 text-base font-semibold tracking-wide text-primary-foreground transition-all hover:opacity-90 hover:shadow-lg ${className}`}
  >
    {label}
    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
  </Link>
);

/* ─── 1. HERO ─── */
const Hero = () => (
  <section className="relative overflow-hidden bg-foreground py-24 md:py-32">
    <div className="absolute inset-0 bg-gradient-to-br from-foreground via-foreground to-primary/30" />
    <div className="container relative z-10 mx-auto max-w-3xl text-center">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-4 text-sm uppercase tracking-[0.2em] text-accent"
      >
        High-Income Skill
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="font-serif text-4xl font-bold leading-tight tracking-tight text-background md:text-6xl"
      >
        Lerne den Skill, der dir{" "}
        <span className="text-accent">echte finanzielle Freiheit</span> gibt
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-background/70"
      >
        Ethisches Closing ist die gefragteste Fähigkeit im digitalen Vertrieb.
        Kein Studium. Kein Kapital. Nur deine Fähigkeit, Gespräche zu führen.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="mt-10"
      >
        <CtaButton />
      </motion.div>
    </div>
  </section>
);

/* ─── 2. PAIN MIRROR ─── */
const PainMirror = () => {
  const pains = [
    "Du arbeitest viel — aber das Einkommen bleibt gleich",
    "Du hast keine Kontrolle über dein Wachstum",
    "Du bist abhängig von einem Arbeitgeber oder System",
    "Du weißt, du kannst mehr — aber dir fehlt der Weg",
  ];
  return (
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
          Kommt dir das bekannt vor?
        </motion.h2>
        <div className="mt-10 space-y-4">
          {pains.map((p, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i + 1}
              className="rounded-sm border border-border bg-card px-6 py-4 text-left text-foreground/80"
            >
              <span className="mr-3 text-accent">✗</span>
              {p}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── 3. OPPORTUNITY SHIFT ─── */
const OpportunityShift = () => (
  <section className="bg-muted py-20 md:py-28">
    <div className="container mx-auto max-w-3xl text-center">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="font-serif text-3xl font-bold text-foreground md:text-4xl"
      >
        Es gibt einen besseren Weg
      </motion.h2>
      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground"
      >
        Unternehmen suchen Closer, die Gespräche professionell führen können.
        Nicht mit Druck — sondern mit echtem Verständnis und Struktur.
        Wer das kann, wird gebraucht. Und gut bezahlt.
      </motion.p>
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={2}
        className="mx-auto mt-10 grid max-w-lg gap-4 text-left"
      >
        {[
          "Ortsunabhängig arbeiten",
          "Leistungsbasiertes Einkommen",
          "Kein Startkapital nötig",
          "Ergebnisse ab den ersten Wochen",
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 text-foreground/80">
            <Check className="h-5 w-5 shrink-0 text-primary" />
            <span>{item}</span>
          </div>
        ))}
      </motion.div>
    </div>
  </section>
);

/* ─── 4. WHAT YOU LEARN ─── */
const WhatYouLearn = () => {
  const modules = [
    { icon: Target, title: "Gesprächsführung", desc: "Struktur, Einwandbehandlung, Abschluss" },
    { icon: Zap, title: "Psychologie", desc: "Entscheidungsdynamik und Vertrauen" },
    { icon: ShieldCheck, title: "Ethische Prinzipien", desc: "Kein Druck, keine Manipulation" },
    { icon: TrendingUp, title: "Performance", desc: "KPIs, Analyse, konstantes Wachstum" },
  ];
  return (
    <section className="bg-background py-20 md:py-28">
      <div className="container mx-auto max-w-4xl">
        <motion.h2
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0}
          className="text-center font-serif text-3xl font-bold text-foreground md:text-4xl"
        >
          Was du lernst
        </motion.h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {modules.map((m, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i + 1}
              className="rounded-sm border border-border bg-card p-6"
            >
              <m.icon className="mb-3 h-6 w-6 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">{m.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{m.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── 5. SOCIAL PROOF ─── */
const SocialProof = () => {
  const stats = [
    { value: "500+", label: "Teilnehmer ausgebildet" },
    { value: "89%", label: "empfehlen das Programm" },
    { value: "< 8 Wo.", label: "bis zur ersten Platzierung" },
  ];
  return (
    <section className="bg-foreground py-20 md:py-28">
      <div className="container mx-auto max-w-4xl text-center">
        <motion.h2
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          custom={0}
          className="font-serif text-3xl font-bold text-background md:text-4xl"
        >
          Ergebnisse sprechen für sich
        </motion.h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {stats.map((s, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i + 1}
            >
              <p className="font-serif text-4xl font-bold text-accent">{s.value}</p>
              <p className="mt-2 text-sm text-background/60">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── 6. DIFFERENTIATION ─── */
const Differentiation = () => (
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
        Was uns unterscheidet
      </motion.h2>
      <div className="mt-12 space-y-6">
        {[
          { label: "Ethik first", desc: "Kein Hardselling. Wir bauen Vertrauen, nicht Druck." },
          { label: "Echtes Placement", desc: "Wir verbinden dich mit Unternehmen, die Closer suchen." },
          { label: "System statt Zufall", desc: "Strukturierte Ausbildung mit klarem Karrierepfad." },
          { label: "Community", desc: "Du lernst nicht allein. Ein Team, das dich trägt." },
        ].map((d, i) => (
          <motion.div
            key={i}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={i + 1}
            className="flex gap-4"
          >
            <Award className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">{d.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

/* ─── 7. CAREER PATH TEASER ─── */
const CareerPathTeaser = () => (
  <section className="bg-muted py-20 md:py-28">
    <div className="container mx-auto max-w-3xl text-center">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="font-serif text-3xl font-bold text-foreground md:text-4xl"
      >
        Dein Weg — Schritt für Schritt
      </motion.h2>
      <div className="mt-12 space-y-6 text-left">
        {[
          { step: "01", title: "Qualifikation", desc: "Quiz + Bewerbungsgespräch" },
          { step: "02", title: "Ausbildung", desc: "Theorie, Simulation, Praxis" },
          { step: "03", title: "Erste Gespräche", desc: "Unter Anleitung echte Calls führen" },
          { step: "04", title: "Platzierung", desc: "Vermittlung an Partnerunternehmen" },
          { step: "05", title: "Wachstum", desc: "Eigenes Team aufbauen" },
        ].map((s, i) => (
          <motion.div
            key={i}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={i + 1}
            className="flex items-start gap-4 rounded-sm border border-border bg-card p-5"
          >
            <span className="font-serif text-2xl font-bold text-primary/30">{s.step}</span>
            <div>
              <h3 className="font-semibold text-foreground">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

/* ─── 8. CTA CLOSE ─── */
const CtaClose = () => (
  <section className="bg-foreground py-24 md:py-32">
    <div className="container mx-auto max-w-2xl text-center">
      <motion.h2
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={0}
        className="font-serif text-3xl font-bold text-background md:text-4xl"
      >
        Bereit für den nächsten Schritt?
      </motion.h2>
      <motion.p
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={1}
        className="mx-auto mt-4 max-w-lg text-background/60"
      >
        Finde in 2 Minuten heraus, ob Closing der richtige Weg für dich ist.
      </motion.p>
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        custom={2}
        className="mt-8"
      >
        <CtaButton label="Qualifikation starten" />
      </motion.div>
    </div>
  </section>
);

/* ─── SCROLL TRACKING ─── */
const ScrollTracker = () => {
  const { scrollYProgress } = useScroll();
  useEffect(() => {
    let fired50 = false;
    let fired90 = false;
    const unsub = scrollYProgress.on("change", (v) => {
      if (v >= 0.5 && !fired50) {
        fired50 = true;
        trackFunnelEvent("SCROLL_50", { page: "high-income-skill" });
      }
      if (v >= 0.9 && !fired90) {
        fired90 = true;
        trackFunnelEvent("SCROLL_90", { page: "high-income-skill" });
      }
    });
    return unsub;
  }, [scrollYProgress]);
  return null;
};

/* ─── STICKY CTA BAR ─── */
const StickyBar = () => (
  <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm md:hidden">
    <Link
      to={QUIZ_PATH}
      onClick={() => trackFunnelEvent("CTA_CLICKED", { page: "high-income-skill", location: "sticky" })}
      className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
    >
      Jetzt Qualifikation starten
      <ArrowRight className="h-4 w-4" />
    </Link>
  </div>
);

/* ─── PAGE ─── */
const HighIncomeSkillLanding = () => {
  useEffect(() => {
    trackFunnelEvent("LP_VIEW", { page: "high-income-skill" });
  }, []);

  return (
    <main>
      <ScrollTracker />
      <Hero />
      <PainMirror />
      <OpportunityShift />
      <WhatYouLearn />
      <SocialProof />
      <Differentiation />
      <CareerPathTeaser />
      <CtaClose />
      <FooterSection />
      <StickyBar />
    </main>
  );
};

export default HighIncomeSkillLanding;
