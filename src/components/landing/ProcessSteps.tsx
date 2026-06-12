import { motion } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { Link } from "react-router-dom";
import { trackHomeCta } from "@/lib/home-tracking";

const ProcessSteps = () => {
  const { t, tx } = useLanguage();

  const steps = [
    { num: "01", title: tx("Live-Masterclass ansehen", "Watch the Live Masterclass"), desc: tx("32 Minuten — Grundlagen, Modell und Eignung verstehen.", "32 minutes — understand the model and your fit.") },
    { num: "02", title: tx("Eignung prüfen", "Check Your Fit"), desc: tx("Kurzer Fit-Check — wir klären, ob das Modell zu dir passt.", "Quick fit-check — we determine if the model suits you.") },
    { num: "03", title: tx("Strategie-Call", "Strategy Call"), desc: tx("20–30 Minuten persönliches Gespräch zu deiner Situation.", "20–30 minute personal call about your situation.") },
    { num: "04", title: tx("Onboarding & Start", "Onboarding & Start"), desc: tx("Du bekommst Zugang, Materialien und startest mit Modul 1.", "You get access, materials, and start with Module 1.") },
  ];

  
  return (
    <section className="py-20 md:py-28">
      <div className="container mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="mb-14 text-center font-serif text-3xl font-semibold text-foreground md:text-4xl">
            {t('process_headline')}
          </h2>

          <div className="mb-14 space-y-8">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.12 }}
                className="flex gap-6"
              >
                <span className="font-serif text-3xl font-semibold text-accent">{s.num}</span>
                <div>
                  <h3 className="mb-1 font-serif text-xl font-semibold text-foreground">{s.title}</h3>
                  <p className="font-sans text-sm text-muted-foreground">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center">
            <Link
              to="/start/quiz"
              onClick={() => trackHomeCta("primary_quiz", "process_steps", "/start/quiz", { cta_type: "secondary" })}
              className="rounded-sm bg-primary px-8 py-3.5 font-sans text-sm font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90 inline-block"
            >
              {t('process_cta')}
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ProcessSteps;
