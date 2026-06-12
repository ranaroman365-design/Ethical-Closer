import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { LogIn, ArrowRight, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { LanguageToggle } from "@/i18n/LanguageContext";
import { trackHomeCta } from "@/lib/home-tracking";

const HeroSection = () => {
  const { t, tx } = useLanguage();

  const bullets = [
    tx('Lerne High-Ticket Closing in Wochen, nicht Jahren', 'Learn high-ticket closing in weeks, not years'),
    tx('Verdiene Provisionen ab Level 1 — ohne Fixkosten', 'Earn commissions from Level 1 — no fixed costs'),
    tx('Arbeite ortsunabhängig mit ethischen Partnern', 'Work remotely with ethical partners'),
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-background" />
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--foreground)) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Top-right controls */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-3 md:right-8 md:top-6">
        <LanguageToggle />
        <Link
          to="/members/login"
          onClick={() => trackHomeCta("member_login", "hero_topbar", "/members/login")}
          className="flex items-center gap-2 rounded-sm border border-border/50 bg-card/80 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-all hover:border-border hover:text-foreground"
        >
          <LogIn className="h-3.5 w-3.5" />
          Member Login
        </Link>
      </div>

      <div className="container relative z-10 py-20 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mx-auto max-w-3xl text-center"
        >
          {/* Kicker */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-6 inline-block max-w-[92vw] rounded-full border border-accent/30 bg-accent/[0.06] px-3 py-1.5 font-sans text-[10px] font-semibold uppercase leading-snug tracking-[0.12em] text-accent sm:px-4 sm:text-[11px] sm:tracking-[0.15em]"
          >
            {tx('Das #1 Ethical Closing System im DACH-Raum', 'The #1 Ethical Closing System in DACH')}
          </motion.p>

          {/* Headline */}
          <h1 className="text-balance mb-5 font-serif text-[2rem] font-bold leading-[1.1] tracking-[-0.01em] text-foreground sm:text-4xl sm:leading-[1.15] md:mb-6 md:text-5xl lg:text-6xl">
            {t('hero_headline')}
          </h1>

          {/* Subheadline */}
          <p className="text-balance mx-auto mb-8 max-w-[34ch] font-serif text-base leading-[1.55] text-foreground/85 sm:max-w-2xl sm:text-lg sm:leading-relaxed md:text-xl">
            {t('hero_subheadline')}
          </p>

          {/* Bullet points */}
          <div className="mx-auto mb-10 max-w-md space-y-2.5 text-left sm:space-y-3">
            {bullets.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.15 }}
                className="flex items-start gap-3"
              >
                <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent sm:h-5 sm:w-5" />
                <span className="font-sans text-[14px] leading-[1.5] text-foreground/80 sm:text-[15px]">{b}</span>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            <Link
              to="/start/quiz"
              onClick={() => trackHomeCta("primary_quiz", "hero_primary", "/start/quiz", { cta_type: "primary" })}
              className="group mb-4 inline-flex items-center gap-2 rounded-sm bg-accent px-10 py-4 font-sans text-sm font-semibold tracking-wide text-accent-foreground transition-all hover:shadow-lg hover:shadow-accent/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              {t('hero_cta')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>

          {/* Scarcity */}
          <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            {t('hero_scarcity')}
          </p>

          {/* Trust bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2 font-sans text-[11px] leading-snug text-muted-foreground/60 sm:gap-6 sm:text-[12px]"
          >
            <span className="whitespace-nowrap">✓ {tx('Kein Risiko', 'No risk')}</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span className="whitespace-nowrap">✓ {tx('Sofortiger Zugang', 'Instant access')}</span>
            <span className="hidden sm:inline" aria-hidden="true">·</span>
            <span className="whitespace-nowrap">✓ {tx('Ethisch & nachhaltig', 'Ethical & sustainable')}</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
