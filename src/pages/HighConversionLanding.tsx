import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, XCircle, BarChart3, Target, TrendingUp, Award, LogIn, MessageCircle, Users, Sparkles, Plane, Wallet, Sunrise } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { LanguageToggle } from "@/i18n/LanguageContext";
import FooterSection from "@/components/landing/FooterSection";

import heroImg from "@/assets/hero-closing-calm.jpg";
import compNegImg from "@/assets/comparison-negative.jpg";
import compPosImg from "@/assets/comparison-positive.jpg";
import ethicalImg from "@/assets/ethical-conversation.jpg";
import communityImg from "@/assets/community-workshop.jpg";

const QUIZ_ROUTE = "/quiz/high-income-skill";

/* ── Scroll tracking ── */
function useScrollTracking() {
  const fired = useRef({ s50: false, s90: false });
  useEffect(() => {
    trackFunnelEvent("LP_VIEW");
    const onScroll = () => {
      const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      if (!fired.current.s50 && pct >= 0.5) { fired.current.s50 = true; trackFunnelEvent("SCROLL_50"); }
      if (!fired.current.s90 && pct >= 0.9) { fired.current.s90 = true; trackFunnelEvent("SCROLL_90"); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
}

const ctaClick = () => trackFunnelEvent("CTA_CLICK");

/* ── Shared CTA button ── */
const CtaButton = ({ className = "", label = "Finde heraus, ob das für dich passt" }: { className?: string; label?: string }) => (
  <Link
    to={QUIZ_ROUTE}
    onClick={ctaClick}
    className={`group inline-flex items-center gap-2 rounded-xl bg-accent px-8 py-4 font-sans text-sm font-semibold tracking-wide text-accent-foreground transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-accent/20 active:scale-[0.98] ${className}`}
  >
    {label}
    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
  </Link>
);

/* ── Fade-in wrapper ── */
const FadeIn = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-40px" }}
    transition={{ duration: 0.5, delay }}
    className={className}
  >
    {children}
  </motion.div>
);

/* ── Section tracking helper ── */
const SectionTracker = ({ event }: { event: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const firedRef = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !firedRef.current) {
        firedRef.current = true;
        trackFunnelEvent(event);
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [event]);
  return <div ref={ref} className="absolute inset-0 pointer-events-none" />;
};

/* ════════════════════════════════════════════════════════════
   SECTION 1 — HERO
   ════════════════════════════════════════════════════════════ */
const HeroSection = () => (
  <section className="relative min-h-[92vh] flex items-end overflow-hidden">
    <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" width={1920} height={1080} />
    <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.85))' }} />

    {/* Top bar */}
    <div className="absolute right-3 top-3 z-20 flex items-center gap-2 md:right-6 md:top-5">
      <LanguageToggle />
      <Link to="/members/login" className="flex items-center gap-1.5 rounded-lg border border-primary-foreground/15 bg-primary-foreground/5 px-3 py-1.5 text-[11px] font-medium text-primary-foreground/60 backdrop-blur-sm transition-all hover:bg-primary-foreground/15 hover:text-primary-foreground/80">
        <LogIn className="h-3 w-3" /> Login
      </Link>
    </div>

    <div className="container relative z-10 pb-14 pt-32 md:pb-20">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-2xl space-y-5">
        <p className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-primary-foreground/70 backdrop-blur-sm">
          <Sparkles className="h-3 w-3" /> High Income Skill
        </p>
        <h1 className="font-serif text-[1.75rem] font-bold leading-[1.15] text-primary-foreground md:text-5xl">
          High Income Skill: <span className="text-accent">Closing.</span>
        </h1>
        <p className="font-sans text-[16px] font-semibold text-primary-foreground/85 md:text-xl">
          Verdiene 5.000 € – 15.000 € / Monat mit einer einzigen Fähigkeit.
        </p>
        <p className="max-w-lg font-sans text-[14px] leading-relaxed text-primary-foreground/65 md:text-[15px]">
          Kein Studium. Kein Startkapital. Kein Team. Nur ein Skill, der dir erlaubt, ortsunabhängig, leistungsbasiert und ohne Decke zu verdienen.
        </p>

        <div className="pt-1">
          <CtaButton />
        </div>

        <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-primary-foreground/55 md:text-xs">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-accent" /> Ortsunabhängig</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-accent" /> Performance-basiert</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-accent" /> Echte Provisionen</span>
        </div>
      </motion.div>
    </div>
  </section>
);

/* ════════════════════════════════════════════════════════════
   SECTION 1b — POSSIBILITY (income tiers + lifestyle)
   ════════════════════════════════════════════════════════════ */
const PossibilitySection = () => {
  const tiers = [
    { range: "2.000 – 5.000 €", label: "Trainee → erste Closes", note: "Monat 1 – 3" },
    { range: "5.000 – 10.000 €", label: "Performer", note: "Monat 4 – 9", highlight: true },
    { range: "10.000 – 15.000 €+", label: "Top-Closer", note: "ab Monat 12" },
  ];
  const lifestyle = [
    { icon: Plane, text: "Arbeite von Lissabon, Bali oder Berlin — Calls von überall." },
    { icon: Sunrise, text: "Setze deine eigenen Stunden. Keine 9–17. Keine Pendelei." },
    { icon: Wallet, text: "Dein Einkommen ist nicht gedeckelt. Mehr Skill = mehr Geld." },
  ];
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="container max-w-4xl">
        <FadeIn>
          <h2 className="mb-3 text-center font-serif text-2xl font-bold text-foreground md:text-4xl">
            Was möglich ist, wenn du es ernst meinst.
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-center font-sans text-[14px] text-muted-foreground">
            Reale Einkommens-Spannen unserer aktiven Closer. Kein Versprechen — eine Verteilung. Wo du landest, hängt von dir ab.
          </p>
        </FadeIn>

        <div className="grid gap-4 sm:grid-cols-3">
          {tiers.map((t, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className={`rounded-xl border p-6 text-center ${t.highlight ? "border-accent/50 bg-accent/[0.06] shadow-lg shadow-accent/10" : "border-border bg-card"}`}>
                <p className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.note}</p>
                <p className={`mt-2 font-serif text-2xl font-bold md:text-3xl ${t.highlight ? "text-accent" : "text-foreground"}`}>{t.range}</p>
                <p className="mt-2 font-sans text-[13px] font-medium text-foreground/75">{t.label}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.35}>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {lifestyle.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <p className="font-sans text-[13px] leading-relaxed text-foreground/80">{text}</p>
              </div>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={0.5}>
          <p className="mt-6 text-center font-sans text-[11px] text-muted-foreground/70">
            Daten basierend auf Provisions-Auszahlungen aktiver Closer 2024. Keine Erfolgsgarantie — Verteilung dokumentiert prüfbar.
          </p>
        </FadeIn>
      </div>
    </section>
  );
};

/* ════════════════════════════════════════════════════════════
   SECTION — IDENTITY SHIFT
   ════════════════════════════════════════════════════════════ */
const IdentitySection = () => (
  <section className="relative overflow-hidden bg-foreground py-20 md:py-28">
    <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent" />
    <div className="container relative z-10 max-w-3xl text-center">
      <FadeIn>
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-background/20 bg-background/5 px-3 py-1 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-background/70">
          Identity Shift
        </p>
        <h2 className="font-serif text-3xl font-bold leading-tight text-background md:text-5xl">
          Du bist nicht angestellt.
          <br />
          <span className="text-accent">Du bist ein Performer.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl font-sans text-[15px] leading-relaxed text-background/70 md:text-base">
          Angestellte tauschen Zeit gegen Geld. Performer werden für Ergebnisse bezahlt — und liefern, weil sie wollen, nicht weil sie müssen.
        </p>
      </FadeIn>
      <FadeIn delay={0.2}>
        <div className="mx-auto mt-10 grid max-w-xl gap-3 sm:grid-cols-2">
          {[
            "Du wirst nach Resultaten bezahlt.",
            "Du entscheidest, wie weit du gehst.",
            "Dein Skill ist deine Sicherheit.",
            "Dein Einkommen wächst mit dir.",
          ].map((t, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-background/15 bg-background/5 p-4 text-left backdrop-blur-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
              <span className="font-sans text-[13px] text-background/85">{t}</span>
            </div>
          ))}
        </div>
      </FadeIn>
    </div>
  </section>
);

/* ════════════════════════════════════════════════════════════
   SECTION 2 — RELATABILITY / PAIN MIRROR
   ════════════════════════════════════════════════════════════ */
const RelatabilitySection = () => {
  const pains = [
    "Du arbeitest viel — aber dein Einkommen bleibt gleich",
    "Du hast keine Kontrolle über dein Wachstum",
    "Du bist abhängig von einem System",
    "Du weißt, du kannst mehr — aber dir fehlt der Weg",
  ];
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="container max-w-2xl text-center">
        <FadeIn>
          <h2 className="mb-8 font-serif text-2xl font-bold text-foreground md:text-4xl">Kommt dir das bekannt vor?</h2>
        </FadeIn>
        <div className="space-y-3 text-left">
          {pains.map((p, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <span className="mt-0.5 text-base text-accent">✦</span>
                <p className="font-sans text-[14px] text-foreground/80">{p}</p>
              </div>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={0.35}>
          <p className="mt-6 font-sans text-sm font-medium text-accent">↓ Dann lies weiter</p>
        </FadeIn>
      </div>
    </section>
  );
};

/* ════════════════════════════════════════════════════════════
   SECTION 3 — SHIFT (EARN WHILE YOU LEARN)
   ════════════════════════════════════════════════════════════ */
const ShiftSection = () => (
  <section className="bg-muted py-16 md:py-24">
    <div className="container max-w-2xl text-center">
      <FadeIn>
        <h2 className="mb-5 font-serif text-2xl font-bold text-foreground md:text-4xl">Es gibt einen anderen Weg.</h2>
      </FadeIn>
      <FadeIn delay={0.1}>
        <p className="mx-auto mb-8 max-w-lg font-sans text-[14px] leading-relaxed text-muted-foreground md:text-[15px]">
          Unternehmen haben bereits Nachfrage. Was ihnen fehlt, sind Menschen, die Gespräche professionell führen und Entscheidungen sauber begleiten können. Genau dafür wirst du bezahlt.
        </p>
      </FadeIn>
      <FadeIn delay={0.25}>
        <div className="mx-auto max-w-md rounded-xl border-2 border-accent/40 bg-gradient-to-br from-accent/[0.08] to-accent/[0.02] p-6 shadow-sm">
          <p className="font-serif text-lg font-semibold text-foreground md:text-xl">
            Du lernst nicht erst — und verdienst dann.
          </p>
          <p className="mt-1.5 font-serif text-lg font-semibold text-accent md:text-xl">
            Du verdienst, während du besser wirst.
          </p>
        </div>
      </FadeIn>
    </div>
  </section>
);

/* ════════════════════════════════════════════════════════════
   SECTION 4 — REALITY / CORE DIFFERENTIATION
   ════════════════════════════════════════════════════════════ */
const RealitySection = () => {
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="container max-w-2xl">
        <FadeIn>
          <h2 className="mb-10 text-center font-serif text-2xl font-bold text-foreground md:text-4xl">Die meisten arbeiten falsch.</h2>
        </FadeIn>

        {/* Negative card */}
        <FadeIn delay={0.1}>
          <div className="mb-4 overflow-hidden rounded-xl border border-border">
            <img src={compNegImg} alt="Stress und Überforderung" className="h-48 w-full object-cover md:h-64" loading="lazy" width={1280} height={960} />
            <div className="bg-card p-5">
              <p className="mb-3 font-serif text-lg font-semibold text-foreground">So arbeiten die meisten</p>
              <div className="space-y-1.5 font-sans text-[13px] text-muted-foreground">
                <p>→ Viel Arbeit, wenig Kontrolle</p>
                <p>→ Keine klaren Ergebnisse</p>
                <p>→ Abhängig vom System</p>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Bridge line */}
        <FadeIn delay={0.2}>
          <p className="my-5 text-center font-serif text-sm font-semibold text-accent md:text-base">
            Der Unterschied ist kein Talent. Es ist ein System.
          </p>
        </FadeIn>

        {/* Positive card */}
        <FadeIn delay={0.3}>
          <div className="overflow-hidden rounded-xl border-2 border-accent/30">
            <img src={compPosImg} alt="Ruhe und Kontrolle" className="h-48 w-full object-cover md:h-64" loading="lazy" width={1280} height={960} />
            <div className="bg-card p-5">
              <p className="mb-3 font-serif text-lg font-semibold text-foreground">So arbeiten die, die es verstanden haben</p>
              <div className="space-y-1.5 font-sans text-[13px] text-foreground/80">
                <p>→ Klare Gespräche statt Druck</p>
                <p>→ Messbare Entwicklung</p>
                <p>→ Bezahlt für echte Ergebnisse</p>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};

/* ════════════════════════════════════════════════════════════
   SECTION 5 — SYSTEM (MOAT)
   ════════════════════════════════════════════════════════════ */
const SystemSection = () => {
  const items = [
    { icon: BarChart3, text: "Performance-Tracking für jedes Gespräch" },
    { icon: Target, text: "Klare Skill-Level" },
    { icon: Award, text: "Zertifizierung mit Marktwert" },
    { icon: TrendingUp, text: "Sichtbarer Fortschritt" },
  ];
  return (
    <section className="bg-muted py-16 md:py-24">
      <div className="container max-w-3xl text-center">
        <FadeIn>
          <h2 className="mb-3 font-serif text-2xl font-bold text-foreground md:text-4xl">Ein System, das Leistung messbar macht.</h2>
          <p className="mx-auto mb-8 max-w-lg font-sans text-[14px] text-muted-foreground">
            Während andere Programme auf Gefühl basieren, wird hier jede Entwicklung messbar.
          </p>
        </FadeIn>
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map(({ icon: Icon, text }, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left">
                <Icon className="h-5 w-5 shrink-0 text-accent" />
                <span className="font-sans text-[13px] font-medium text-foreground">{text}</span>
              </div>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={0.4}>
          <p className="mt-6 font-sans text-[13px] text-muted-foreground/80">
            Ethical Closing ist nicht nur ein Gefühl. Es ist eine Fähigkeit, die trainiert und gemessen werden kann.
          </p>
        </FadeIn>
      </div>
    </section>
  );
};

/* ════════════════════════════════════════════════════════════
   SECTION 6 — RESULTS / SOCIAL PROOF + TESTIMONIALS
   ════════════════════════════════════════════════════════════ */
const ResultsSection = () => {
  const kpis = [
    { value: "500+", label: "Teilnehmer ausgebildet" },
    { value: "89%", label: "empfehlen das Programm" },
    { value: "< 8 Wo.", label: "bis zur ersten Platzierung" },
  ];
  const testimonials = [
    { quote: "Ohne relevante Vertriebserfahrung gestartet. Nach wenigen Wochen erste echte Gespräche geführt.", sub: "Vorher: Angestellt" },
    { quote: "Zum ersten Mal ein System, bei dem ich wirklich sehen konnte, wie ich besser werde.", sub: "Vorher: Selbstständig / unstrukturiert" },
    { quote: "Kein Hype, keine leeren Versprechen — sondern Praxis, Feedback und echte Entwicklung.", sub: "Vorher: Anderes Sales-Coaching ausprobiert" },
  ];
  return (
    <section className="relative bg-background py-16 md:py-24">
      <SectionTracker event="SECTION_VIEW_RESULTS" />
      <div className="container max-w-3xl text-center">
        <FadeIn>
          <h2 className="mb-10 font-serif text-2xl font-bold text-foreground md:text-4xl">Echte Entwicklung. Echte Ergebnisse.</h2>
        </FadeIn>
        <div className="grid gap-4 sm:grid-cols-3">
          {kpis.map((k, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="font-serif text-3xl font-bold text-accent md:text-4xl">{k.value}</p>
                <p className="mt-1 font-sans text-xs text-muted-foreground">{k.label}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Testimonials */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {testimonials.map((t, i) => (
            <FadeIn key={i} delay={0.3 + i * 0.1}>
              <div className="rounded-xl border border-border bg-card p-5 text-left">
                <p className="mb-3 font-sans text-[13px] italic leading-relaxed text-foreground/75">„{t.quote}"</p>
                <p className="font-sans text-[11px] font-medium text-muted-foreground">{t.sub}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ════════════════════════════════════════════════════════════
   SECTION 7 — PROGRAM STRUCTURE (with sub-lines)
   ════════════════════════════════════════════════════════════ */
const ProgramSection = () => {
  const steps = [
    { title: "Ausbildung", desc: "Du lernst, wie Closing wirklich funktioniert." },
    { title: "Erste echte Gespräche", desc: "Du sammelst Praxis statt nur Theorie." },
    { title: "Performance Tracking", desc: "Du siehst genau, wo du besser wirst." },
    { title: "Platzierung", desc: "Du bekommst reale Chancen auf bezahlte Positionen." },
    { title: "Wachstum", desc: "Du entwickelst dich vom Einsteiger zum Performer." },
  ];
  return (
    <section className="bg-muted py-16 md:py-24">
      <div className="container max-w-2xl">
        <FadeIn>
          <h2 className="mb-8 text-center font-serif text-2xl font-bold text-foreground md:text-4xl">Kein Kurs. Ein System.</h2>
        </FadeIn>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <FadeIn key={i} delay={i * 0.08}>
              <div className="flex items-start gap-4 rounded-xl border border-border bg-card p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 font-sans text-sm font-bold text-accent">
                  {i + 1}
                </span>
                <div>
                  <p className="font-sans text-[14px] font-semibold text-foreground">{s.title}</p>
                  <p className="mt-0.5 font-sans text-[12px] text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ════════════════════════════════════════════════════════════
   SECTION 8 — ETHICAL ADVANTAGE (rebuilt)
   ════════════════════════════════════════════════════════════ */
const EthicalSection = () => (
  <section className="relative bg-background py-16 md:py-24">
    <SectionTracker event="SECTION_VIEW_ETHICAL" />
    <div className="container">
      <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-2">
        <FadeIn>
          <div className="max-w-lg">
            <h2 className="mb-4 font-serif text-2xl font-bold text-foreground md:text-4xl">Du musst niemanden überzeugen.</h2>
            <p className="mb-5 font-sans text-[13px] text-muted-foreground">Die meisten haben ein falsches Bild von Verkauf.</p>

            <div className="mb-5 space-y-1.5 font-sans text-[14px] text-foreground/80">
              <p>Du musst niemanden überreden.</p>
              <p>Du musst keinen Druck ausüben.</p>
              <p>Du musst niemanden manipulieren.</p>
            </div>

            <p className="mb-4 font-sans text-[13px] font-medium text-muted-foreground">Was wirklich funktioniert:</p>
            <div className="mb-5 space-y-2">
              {["Gespräche, die Vertrauen schaffen", "Klarheit statt Überzeugung", "Entscheidungen, die sich für beide Seiten richtig anfühlen"].map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="font-sans text-[13px] text-foreground/80">{t}</span>
                </div>
              ))}
            </div>

            <p className="mb-4 font-serif text-base font-semibold text-accent">Und genau dafür wirst du bezahlt.</p>

            <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-1">
              <p className="font-sans text-[12px] text-muted-foreground">Der Unterschied: Hier bleibt es nicht bei einem Gefühl.</p>
              <p className="font-sans text-[12px] text-muted-foreground">Jede Fähigkeit wird trainiert. Jede Entwicklung wird gemessen. Jede Verbesserung ist sichtbar.</p>
            </div>

            <p className="mt-4 font-serif text-sm italic text-foreground/70">Ethisches Closing ist keine Meinung. Es ist eine messbare Fähigkeit.</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.15}>
          <img src={ethicalImg} alt="Echtes Gespräch auf Augenhöhe" className="w-full rounded-xl" loading="lazy" width={1280} height={800} />
        </FadeIn>
      </div>
    </div>
  </section>
);

/* ════════════════════════════════════════════════════════════
   SECTION 9 — COMMUNITY (new)
   ════════════════════════════════════════════════════════════ */
const CommunitySection = () => (
  <section className="relative bg-muted py-16 md:py-24">
    <SectionTracker event="SECTION_VIEW_COMMUNITY" />
    <div className="container">
      <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-2">
        <FadeIn>
          <div>
            <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-widest text-accent">Nicht irgendeine Community. Das richtige Umfeld.</p>
            <h2 className="mb-4 font-serif text-2xl font-bold text-foreground md:text-4xl">Du lernst hier nicht allein. Du wächst im richtigen Umfeld.</h2>
            <p className="mb-6 font-sans text-[14px] leading-relaxed text-muted-foreground">
              Während andere alleine kämpfen, bist du hier Teil eines Umfelds aus Menschen, die dasselbe Ziel haben: besser werden, Ergebnisse liefern und bezahlt werden.
            </p>
            <div className="space-y-3">
              {[
                { icon: MessageCircle, text: "Feedback von echten Menschen, nicht nur Videos" },
                { icon: Users, text: "Austausch auf Augenhöhe" },
                { icon: Sparkles, text: "Zugang zu Chancen durch Netzwerk und Community" },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="font-sans text-[13px] text-foreground/80">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
        <FadeIn delay={0.15}>
          <img src={communityImg} alt="Fokussierte Gruppe im Workshop" className="w-full rounded-xl" loading="lazy" width={1280} height={800} />
        </FadeIn>
      </div>
    </div>
  </section>
);

/* ════════════════════════════════════════════════════════════
   SECTION 10 — ELITE FILTER (softened)
   ════════════════════════════════════════════════════════════ */
const EliteFilterSection = () => (
  <section className="bg-background py-16 md:py-24">
    <div className="container max-w-xl text-center">
      <FadeIn>
        <h2 className="mb-4 font-serif text-2xl font-bold text-foreground md:text-4xl">Nicht für jeden.</h2>
        <p className="mb-6 font-sans text-[14px] text-muted-foreground">
          Dieses System funktioniert — aber nur für Menschen, die bereit sind:
        </p>
      </FadeIn>
      <FadeIn delay={0.15}>
        <div className="space-y-2 text-left">
          {[
            "Täglich zu arbeiten",
            "Feedback anzunehmen",
            "Langfristig zu denken",
            "Besser zu werden statt Ausreden zu suchen",
          ].map((t, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
              <span className="font-sans text-[13px] text-foreground/80">{t}</span>
            </div>
          ))}
        </div>
      </FadeIn>
    </div>
  </section>
);

/* ════════════════════════════════════════════════════════════
   SECTION 11 — FINAL CLOSE
   ════════════════════════════════════════════════════════════ */
const FinalCloseSection = () => (
  <section className="bg-muted py-20 md:py-28">
    <div className="container max-w-xl text-center">
      <FadeIn>
        <h2 className="mb-3 font-serif text-2xl font-bold text-foreground md:text-4xl">Bereit für den nächsten Schritt?</h2>
        <p className="mb-8 font-sans text-[14px] text-muted-foreground">
          Finde in 2 Minuten heraus, ob Closing der richtige Weg für dich ist — und ob du das Potenzial für echte Entwicklung und bezahlte Positionen mitbringst.
        </p>
        <CtaButton />
        <div className="mt-5 flex items-center justify-center gap-3 text-[11px] text-muted-foreground/60">
          <span>⏱ Dauert 2 Minuten</span>
          <span>·</span>
          <span>🔒 Begrenzte Plätze</span>
          <span>·</span>
          <span>✓ Unverbindlich</span>
        </div>
      </FadeIn>
    </div>
  </section>
);

/* ════════════════════════════════════════════════════════════
   STICKY MOBILE CTA
   ════════════════════════════════════════════════════════════ */
const StickyMobileCta = () => {
  const visible = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const show = window.scrollY > 550;
      if (show !== visible.current) {
        visible.current = show;
        if (ref.current) ref.current.style.transform = show ? "translateY(0)" : "translateY(100%)";
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={ref}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md transition-transform duration-300"
      style={{ transform: "translateY(100%)" }}
    >
      <div className="container flex items-center justify-between py-2.5">
        <p className="hidden font-sans text-xs font-medium text-muted-foreground sm:block">High Income Skill: Closing</p>
        <Link
          to={QUIZ_ROUTE}
          onClick={ctaClick}
          className="ml-auto rounded-lg bg-accent px-5 py-2 text-[13px] font-semibold tracking-wide text-accent-foreground transition-opacity hover:opacity-90"
        >
          Passt das zu mir?
        </Link>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════
   PAGE
   ════════════════════════════════════════════════════════════ */
const HighConversionLanding = () => {
  useScrollTracking();

  return (
    <main>
      <HeroSection />
      <PossibilitySection />
      <RelatabilitySection />
      <ShiftSection />
      <RealitySection />
      <SystemSection />
      <ResultsSection />
      <IdentitySection />
      <ProgramSection />
      <EthicalSection />
      <CommunitySection />
      <EliteFilterSection />
      <FinalCloseSection />
      <StickyMobileCta />
      <FooterSection />
    </main>
  );
};

export default HighConversionLanding;
