import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, Globe2, Users, TrendingUp, Compass, Shield, Zap } from "lucide-react";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import FooterSection from "@/components/landing/FooterSection";
import { trackCloserPath } from "@/lib/track-closerpath";

/**
 * /closerpath — Landing V3 (Gold Standard, Lifestyle Version)
 *
 * Layer order (canonical, locked):
 *   Lifestyle Hook → Desire → Transition → Canonical Narrative
 *   → Lifestyle Section → Community → Path → System (60s)
 *   → Economics → Speed/Security → Identity Shift → End State
 *   → Proof (TestimonialsSection) → Final CTA
 *
 * No Canon drift. No hype. No promises of guaranteed income.
 */
const CloserPath = () => {
  useEffect(() => {
    trackCloserPath("lp_view", { variant: "v3" });
    document.title = "Ethical Top Closer — Career Path to Senior Closer";
  }, []);

  const handleCtaClick = (location: string) => {
    trackCloserPath("lp_view", { metadata: { cta_location: location } });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ════════════════════════════════════════════════════════════
          HERO — Lifestyle Hook + Desire + Canonical Narrative + CTA
         ════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden border-b border-border/40 px-6 py-20 md:py-32">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="space-y-10"
          >
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              Ethical Top Closer
            </p>

            {/* Lifestyle Hook — tension + truth */}
            <h1 className="font-display text-4xl font-semibold leading-[1.08] md:text-6xl">
              Most people stay stuck in a 9–5 they don&rsquo;t want.
              <br />
              <span className="text-muted-foreground">
                Fixed hours. Fixed income. Limited freedom.
              </span>
            </h1>

            {/* Desire expansion */}
            <p className="max-w-2xl font-sans text-lg leading-relaxed text-foreground/80 md:text-xl">
              What they actually want is simple: to work remotely, earn based
              on performance, and build a life on their own terms.
            </p>

            {/* Transition */}
            <p className="font-sans text-base font-medium text-foreground/90">
              That&rsquo;s exactly what this system is built for.
            </p>

            {/* Canonical Narrative (UNCHANGED — Layer 13) */}
            <div className="rounded-lg border border-border bg-card p-6 md:p-8">
              <p className="font-sans text-base leading-relaxed text-foreground md:text-lg">
                <strong className="font-semibold">Ethical Top Closer</strong>{" "}
                is a performance-based system that takes you from zero to
                high-income closer through a structured career path. You enter
                as an applicant, move through defined levels, and get paid
                based on real results — while the system tracks your
                performance and shows you exactly how to improve.
              </p>
              <p className="mt-4 font-sans text-sm text-muted-foreground">
                A structured path to becoming a Senior Closer companies trust
                to generate revenue.
              </p>
            </div>

            {/* CTA */}
            <div className="flex flex-col items-start gap-3">
              <Link
                to="/closerpath/quiz"
                onClick={() => handleCtaClick("hero")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-4 font-sans text-base font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
              >
                Start Your Application
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="font-sans text-xs text-muted-foreground">
                Takes 60 seconds &middot; See if you qualify
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          POSITIONING LOCK
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 bg-card/40 px-6 py-14">
        <div className="container mx-auto max-w-3xl text-center">
          <p className="font-display text-xl font-medium leading-relaxed text-foreground md:text-2xl">
            This is not a course.
            <br />
            This is not theory.
          </p>
          <p className="mt-4 font-sans text-base text-muted-foreground md:text-lg">
            This is a performance-based system with a clear career path.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          LIFESTYLE SECTION — The Real Desire
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="space-y-10"
          >
            <div className="space-y-4">
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                The real desire
              </p>
              <h2 className="font-display text-3xl font-semibold leading-tight md:text-5xl">
                This is not just about learning sales.
                <br />
                <span className="text-muted-foreground">
                  It&rsquo;s about building a completely different life.
                </span>
              </h2>
            </div>

            <ul className="grid gap-4 md:grid-cols-2">
              {[
                "Work remotely — from wherever you actually want to be",
                "Travel without asking for permission",
                "Build income that grows with performance",
                "Choose the partners and projects you work with",
                "Stop trading time for money",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-5"
                >
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="font-sans text-base text-foreground/90">
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-l-2 border-primary/60 pl-6">
              <p className="font-display text-xl font-medium leading-relaxed text-foreground md:text-2xl">
                You are not adapting your life to your work.
                <br />
                Your work adapts to your life.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          COMMUNITY — Hidden Lever
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 bg-card/40 px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div className="flex items-start gap-4">
              <Users className="h-7 w-7 shrink-0 text-primary" />
              <div className="space-y-3">
                <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
                  One of the biggest advantages is the people around you.
                </h2>
                <p className="font-sans text-base leading-relaxed text-foreground/80 md:text-lg">
                  You are surrounded by individuals who are building the same
                  path — ambitious, international, and performance-driven.
                </p>
              </div>
            </div>

            <ul className="grid gap-3 md:grid-cols-2">
              {[
                "Work together",
                "Travel together",
                "Meet at events and live sessions",
                "Grow inside a real network",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 font-sans text-base text-foreground/90"
                >
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="font-sans text-sm font-medium uppercase tracking-wider text-foreground">
              Not just online. In real life.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          PATH — Make System Visible
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-4xl space-y-10">
          <div className="space-y-3 text-center">
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              The path
            </p>
            <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
              Every step is defined. Every step is measurable.
              <br />
              <span className="text-muted-foreground">
                Every step increases your income.
              </span>
            </h2>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
            {["Lead", "Applicant", "Trainee", "Setter", "Closer", "Senior Closer"].map(
              (step, i, arr) => (
                <div key={step} className="flex items-center gap-2 md:gap-3">
                  <div className="rounded-md border border-border bg-card px-3 py-2 font-sans text-sm font-medium text-foreground md:px-4 md:py-2.5 md:text-base">
                    {step}
                  </div>
                  {i < arr.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SYSTEM — 60s Canon (UNCHANGED)
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 bg-card/40 px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-3xl space-y-8">
          <div className="space-y-3">
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              The system
            </p>
            <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
              How the platform works.
            </h2>
          </div>

          <div className="space-y-5 font-sans text-base leading-relaxed text-foreground/85 md:text-lg">
            <p>
              The ETC platform works in two parts. First, there is the
              acquisition system, which brings in applicants, qualifies them,
              and converts them into members. Second, there is the career
              system, where you progress from trainee to setter to closer to
              senior closer.
            </p>
            <p>
              Each level has clear KPIs, clear earnings, and clear
              responsibilities. Your performance is tracked continuously and
              compared to benchmarks, so you always know where you stand and
              what to improve.
            </p>
            <p>
              At the same time, the system guides you through each step with
              structured training and communication. The goal is simple: turn
              you into a high-performing closer — and eventually into someone
              who can operate and lead a sales system.
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          ECONOMICS
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-4xl space-y-10">
          <div className="flex items-start gap-4">
            <TrendingUp className="h-7 w-7 shrink-0 text-primary" />
            <div className="space-y-2">
              <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
                You earn based on real output.
              </h2>
              <p className="font-sans text-base text-muted-foreground md:text-lg">
                Not based on time. Based on performance.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { role: "Setters", earn: "earn per qualified call" },
              { role: "Closers", earn: "earn per deal" },
              {
                role: "Senior Closers",
                earn: "operate and scale their own pipeline",
              },
            ].map((row) => (
              <div
                key={row.role}
                className="rounded-lg border border-border bg-card p-6"
              >
                <p className="font-display text-lg font-semibold text-foreground">
                  {row.role}
                </p>
                <p className="mt-2 font-sans text-sm text-muted-foreground">
                  {row.earn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          SPEED + SECURITY
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 bg-card/40 px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-4xl">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="space-y-4">
              <Zap className="h-6 w-6 text-primary" />
              <h3 className="font-display text-2xl font-semibold leading-tight md:text-3xl">
                You don&rsquo;t spend years preparing.
              </h3>
              <p className="font-sans text-base leading-relaxed text-foreground/80">
                Within weeks, you are inside real calls, real pipelines, and
                real deals.
              </p>
            </div>
            <div className="space-y-4">
              <Shield className="h-6 w-6 text-primary" />
              <h3 className="font-display text-2xl font-semibold leading-tight md:text-3xl">
                Predictable, not random.
              </h3>
              <p className="font-sans text-base leading-relaxed text-foreground/80">
                If you follow the system and hit the KPIs, your progress is
                not random — it&rsquo;s predictable.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          IDENTITY SHIFT
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-3xl space-y-8 text-center">
          <Compass className="mx-auto h-7 w-7 text-primary" />
          <h2 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
            You are not just learning a skill.
          </h2>
          <p className="font-sans text-lg text-muted-foreground">
            You are becoming someone who:
          </p>
          <ul className="mx-auto max-w-md space-y-3 text-left">
            {[
              "generates revenue",
              "is trusted by partners",
              "operates at a high level",
              "builds their life on their own terms",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 font-sans text-base text-foreground"
              >
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          END STATE (LOCKED)
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 bg-foreground px-6 py-20 text-background md:py-28">
        <div className="container mx-auto max-w-3xl space-y-6">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.25em] opacity-60">
            The end state
          </p>
          <p className="font-display text-2xl font-medium leading-relaxed md:text-3xl">
            The end goal is to become a Senior Closer who not only closes
            deals at a high level, but understands the full system, operates
            it effectively, and can guide a team with clarity and consistency.
          </p>
          <p className="font-display text-xl font-medium leading-relaxed opacity-90 md:text-2xl">
            Someone companies trust to build, run, and scale revenue.
          </p>
          <p className="font-display text-xl font-semibold tracking-wide md:text-2xl">
            An Ethical Top Closer.
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════
          PROOF — Reuse existing TestimonialsSection
         ════════════════════════════════════════════════════════════ */}
      <TestimonialsSection />

      {/* ════════════════════════════════════════════════════════════
          FINAL CTA
         ════════════════════════════════════════════════════════════ */}
      <section className="border-b border-border/40 px-6 py-20 md:py-28">
        <div className="container mx-auto max-w-3xl space-y-8 text-center">
          <Globe2 className="mx-auto h-8 w-8 text-primary" />
          <h2 className="font-display text-3xl font-semibold leading-tight md:text-5xl">
            See if this is the path for you.
          </h2>
          <p className="mx-auto max-w-xl font-sans text-base text-muted-foreground md:text-lg">
            A short qualification — then we&rsquo;ll show you exactly where
            you stand and what your next step looks like.
          </p>
          <div className="flex flex-col items-center gap-3">
            <Link
              to="/closerpath/quiz"
              onClick={() => handleCtaClick("final")}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-10 py-4 font-sans text-base font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Start Your Application
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="font-sans text-xs text-muted-foreground">
              See if you qualify in 60 seconds
            </p>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
};

export default CloserPath;
