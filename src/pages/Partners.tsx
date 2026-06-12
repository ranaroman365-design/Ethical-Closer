import { useEffect, useRef, useState, FormEvent } from "react";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight, CheckCircle2, AlertTriangle, Workflow, Gauge,
  Route, RefreshCw, LayoutDashboard, Cpu, Plus, Minus, Loader2,
} from "lucide-react";
import { z } from "zod";
import PartnerFooter from "@/components/partners/PartnerFooter";
import { trackFunnelEvent } from "@/lib/track-event";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getPartnersAbVariants, type PartnersAbAssignment } from "@/lib/partners-ab";
import { useLanguage } from "@/i18n/LanguageContext";

/* ── motion helper ── */
const FadeIn = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/* ── header ── */
const Header = () => {
  const { tx } = useLanguage();
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/85 border-b border-border/40">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between px-5 md:px-6 h-14">
        <span className="font-display text-base tracking-tight text-foreground font-semibold">
          Revenue OS<sup className="text-[0.55em] align-super">™</sup>
        </span>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <button onClick={() => scrollTo("autobahn")} className="hover:text-foreground transition-colors">Lead Autobahn™</button>
          <button onClick={() => scrollTo("modules")} className="hover:text-foreground transition-colors">{tx("Was wir tun", "What we do")}</button>
          <button onClick={() => scrollTo("process")} className="hover:text-foreground transition-colors">{tx("Prozess", "Process")}</button>
          <button onClick={() => scrollTo("offers")} className="hover:text-foreground transition-colors">{tx("Angebote", "Offers")}</button>
          <button onClick={() => scrollTo("faq")} className="hover:text-foreground transition-colors">FAQ</button>
        </nav>
        <button
          onClick={() => { trackFunnelEvent("snapshot_cta_click", { source: "header" }); scrollTo("apply"); }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
        >
          {tx("Revenue Snapshot buchen", "Book Revenue Snapshot")}
        </button>
      </div>
    </header>
  );
};

/* ── hero flow visual ── */
const FlowVisual = () => {
  const { tx } = useLanguage();
  const stages = [
    tx("Lead-Pool", "Lead Pool"),
    tx("Buchung", "Booking"),
    tx("Show-Up", "Show-Up"),
    tx("Close", "Close"),
    tx("Recovery", "Recovery"),
    "Revenue OS",
  ];
  return (
    <div className="relative w-full rounded-md border border-border/60 bg-card/50 p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2">
        {stages.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-medium border ${i === stages.length - 1 ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border"}`}>
                {i + 1}
              </div>
              <span className="mt-2 text-[10px] md:text-xs text-muted-foreground tracking-wide">{s}</span>
            </div>
            {i < stages.length - 1 && (
              <div className="hidden md:block w-6 h-px bg-border" />
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3 text-[10px] text-muted-foreground/70">
        <div className="border-l border-border/60 pl-2">{tx("Nachfrage existiert", "Demand exists")}</div>
        <div className="border-l border-border/60 pl-2">{tx("Drag ist verborgen", "Drag is hidden")}</div>
        <div className="border-l border-border/60 pl-2">{tx("Umsatz wird geroutet", "Revenue is routed")}</div>
      </div>
    </div>
  );
};

/* ── hero (A/B tested headline + CTA) ── */
const Hero = ({ ab }: { ab: PartnersAbAssignment }) => {
  const { lang, tx } = useLanguage();
  const handlePrimary = () => {
    trackFunnelEvent("snapshot_cta_click", {
      source: "hero_primary",
      ab_hero: ab.heroId,
      ab_cta: ab.ctaId,
      ab_combo: ab.combo,
    });
    scrollTo("apply");
  };
  const handleSecondary = () => {
    trackFunnelEvent("hero_secondary_click", {
      source: "hero_secondary",
      ab_hero: ab.heroId,
      ab_cta: ab.ctaId,
      ab_combo: ab.combo,
    });
    scrollTo("autobahn");
  };

  return (
    <section className="pt-28 md:pt-36 pb-16 md:pb-20 px-5 md:px-6">
      <div className="max-w-[1100px] mx-auto grid md:grid-cols-12 gap-10 items-center">
        <FadeIn className="md:col-span-7 space-y-6">
          <span
            data-ab-hero={ab.heroId}
            className="inline-block text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
          >
            {ab.hero.eyebrow[lang]}
          </span>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
            {ab.hero.headline[lang]}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-2xl">
            {ab.hero.subheadline[lang]}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              data-ab-cta={ab.ctaId}
              onClick={handlePrimary}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-sm bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
            >
              {ab.cta.primary[lang]} <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleSecondary}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-sm border border-border text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              {ab.cta.secondary[lang]}
            </button>
          </div>
          <p className="text-xs text-muted-foreground/70 pt-2">
            {tx(
              "Gebaut für High-Ticket Coaches, Consultants und Expert-Businesses.",
              "Built for high-ticket coaches, consultants and expert businesses."
            )}
          </p>
        </FadeIn>
        <FadeIn className="md:col-span-5" delay={0.1}>
          <FlowVisual />
        </FadeIn>
      </div>
    </section>
  );
};

/* ── problem ── */
const Problem = () => {
  const { tx } = useLanguage();
  const leaks = [
    tx("Keine Buchung", "No Booking"),
    tx("No-Show", "No Show"),
    tx("Kein Close", "No Close"),
    tx("Kein Follow-up", "No Follow-up"),
    tx("Keine Ownership", "No Ownership"),
    tx("Keine KPI-Sicht", "No KPI visibility"),
  ];
  return (
    <section className="py-16 md:py-24 px-5 md:px-6 bg-muted/30">
      <div className="max-w-[1000px] mx-auto">
        <FadeIn className="space-y-5 max-w-2xl">
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx(
              "Mehr Leads beheben kein kaputtes Umsatzsystem.",
              "More leads will not fix a broken revenue system."
            )}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {tx(
              "Viele High-Ticket-Unternehmen investieren stark in Traffic, Content, Ads und Lead-Generierung. Der eigentliche Verlust passiert aber, nachdem der Lead ins System kommt.",
              "Many high-ticket businesses spend heavily on traffic, content, ads and lead generation. But the real loss happens after the lead enters the system."
            )}
          </p>
        </FadeIn>
        <FadeIn className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-3" delay={0.1}>
          {leaks.map((l) => (
            <div key={l} className="flex items-center gap-2 border border-border/60 rounded-md px-4 py-3 bg-background">
              <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">{l}</span>
            </div>
          ))}
        </FadeIn>
        <FadeIn className="mt-8 max-w-2xl" delay={0.2}>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {tx(
              "Wenn dein Lead-Pool nicht geroutet, priorisiert und mit Disziplin nachgefasst wird, bleibt Umsatz im Unternehmen gefangen.",
              "If your lead pool is not routed, prioritized and followed up with discipline, revenue stays trapped inside your business."
            )}
          </p>
        </FadeIn>
      </div>
    </section>
  );
};

/* ── lead autobahn ── */
const Autobahn = () => {
  const { tx } = useLanguage();
  const cards = [
    { icon: Gauge, title: tx("Lead-Pool Audit", "Lead Pool Audit"), desc: tx("Wir analysieren deine bestehenden Leads, dein CRM, die Buchungshistorie und Conversion-Lücken.", "We analyze your existing leads, CRM, booking history and conversion gaps.") },
    { icon: AlertTriangle, title: tx("Revenue-Drag-Diagnose", "Revenue Drag Diagnosis"), desc: tx("Wir identifizieren, wo Umsatz verlangsamt wird: keine Buchung, No-Show, kein Close oder verlorenes Follow-up.", "We identify where revenue slows down: no booking, no-show, no-close or lost follow-up.") },
    { icon: Route, title: tx("Priority Routing", "Priority Routing"), desc: tx("Wir segmentieren Leads nach Dringlichkeit, Qualität, Intent und Recovery-Potenzial.", "We segment leads by urgency, quality, intent and recovery potential.") },
    { icon: RefreshCw, title: tx("Recovery Execution", "Recovery Execution"), desc: tx("Wir reaktivieren den Lead-Pool und arbeiten ihn mit strukturiertem Outreach durch.", "We reactivate and work through the lead pool with structured outreach.") },
    { icon: LayoutDashboard, title: tx("Sales-Infrastruktur", "Sales Infrastructure"), desc: tx("Wir bauen den Operating-Rhythmus, KPIs, Ownership und Dashboards.", "We build the operating rhythm, KPIs, ownership and dashboards.") },
    { icon: Cpu, title: tx("Automation & AI Layer", "Automation & AI Layer"), desc: tx("Sobald das System manuell funktioniert, automatisieren wir, was sicher automatisiert werden kann.", "Once the system works manually, we automate what can safely be automated.") },
  ];
  return (
    <section id="autobahn" className="py-16 md:py-24 px-5 md:px-6">
      <div className="max-w-[1100px] mx-auto">
        <FadeIn className="space-y-3 max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{tx("Das Framework", "The Framework")}</span>
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx("Die Lead Autobahn™", "The Lead Autobahn™")}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {tx(
              "Ein strukturiertes Revenue-Routing-System für jede Lead-Stage. Die Lead Autobahn™ verwandelt verstreute Leads in einen kontrollierten Umsatzfluss.",
              "A structured revenue-routing system for every lead stage. The Lead Autobahn™ turns scattered leads into a controlled revenue flow."
            )}
          </p>
        </FadeIn>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <FadeIn key={c.title} delay={i * 0.05}>
              <div className="h-full border border-border rounded-md p-5 bg-card space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground tracking-wider">0{i + 1}</span>
                  <c.icon className="w-4 h-4 text-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{c.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── who it's for ── */
const Fit = () => {
  const { tx } = useLanguage();
  const fit = [
    tx("High-Ticket Coaches", "High-ticket coaches"),
    tx("Consulting-Firmen", "Consulting firms"),
    tx("Mentorship-Businesses", "Mentorship businesses"),
    tx("Education-Anbieter", "Education providers"),
    tx("Transformations-Angebote", "Transformation offers"),
    tx("Sales-Teams mit bestehenden Lead-Pools", "Sales teams with existing lead pools"),
    tx("Unternehmen mit gebuchten Calls, aber schwacher Conversion", "Businesses with booked calls but weak conversion"),
    tx("No-Show-Probleme", "No-show problems"),
    tx("Starker Content, aber schwaches Sales-Follow-up", "Strong content but weak sales follow-up"),
  ];
  const notFit = [
    tx("Unternehmen ohne Angebot", "Businesses with no offer"),
    tx("Unternehmen ohne Leads", "Businesses with no leads"),
    tx("Suche nach billigen Appointment-Settern", "Looking for cheap appointment setters"),
    tx("Nicht bereit, Zahlen zu tracken", "Unwilling to track numbers"),
    tx("Wollen Magie statt Operations", "Wanting magic instead of operations"),
  ];
  return (
    <section id="fit" className="py-16 md:py-24 px-5 md:px-6 bg-muted/30">
      <div className="max-w-[1000px] mx-auto">
        <FadeIn className="max-w-2xl space-y-3">
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx(
              "Gebaut für Unternehmen mit Nachfrage — nicht mit Chaos.",
              "Built for businesses with demand — not chaos."
            )}
          </h2>
        </FadeIn>
        <div className="mt-10 grid md:grid-cols-2 gap-8">
          <FadeIn className="space-y-3" delay={0.05}>
            <h3 className="text-xs uppercase tracking-[0.2em] text-foreground font-semibold">{tx("Passt, wenn", "A fit if")}</h3>
            {fit.map((t) => (
              <div key={t} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{t}</p>
              </div>
            ))}
          </FadeIn>
          <FadeIn className="space-y-3" delay={0.1}>
            <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">{tx("Passt nicht, wenn", "Not a fit if")}</h3>
            {notFit.map((t) => (
              <p key={t} className="text-sm text-muted-foreground py-1">— {t}</p>
            ))}
          </FadeIn>
        </div>
      </div>
    </section>
  );
};

/* ── modules ── */
const Modules = () => {
  const { tx } = useLanguage();
  const modules = [
    { id: 1, name: "Revenue Snapshot™", purpose: tx("Den aktuellen Stand verstehen.", "Understand the current state."), items: [tx("Lead-Pool Review", "lead pool review"), tx("CRM Review", "CRM review"), tx("Conversion-Stages", "conversion stages"), tx("Booking- / Show- / Close-Raten", "booking / show / close rates"), tx("Follow-up Lücken", "follow-up gaps"), tx("Revenue-Drag-Schätzung", "revenue drag estimate")], output: tx("Revenue Snapshot Report", "Revenue Snapshot Report") },
    { id: 2, name: "Lead Autobahn Blueprint™", purpose: tx("Das Zielsystem entwerfen.", "Design the target system."), items: [tx("Lead-Routing-Logik", "lead routing logic"), tx("Pipeline-Stages", "pipeline stages"), tx("Ownership-Modell", "ownership model"), tx("SLA-Regeln", "SLA rules"), tx("Follow-up-Architektur", "follow-up architecture"), tx("Priority-Segmente", "priority segments"), tx("KPI-Dashboard-Struktur", "KPI dashboard structure")], output: tx("Lead Autobahn Blueprint", "Lead Autobahn Blueprint") },
    { id: 3, name: "Revenue Recovery™", purpose: tx("Den bestehenden Lead-Pool bearbeiten.", "Work the existing lead pool."), items: [tx("No-Booking Recovery", "no-booking recovery"), tx("No-Show Recovery", "no-show recovery"), tx("No-Close Recovery", "no-close recovery"), tx("Lost-Lead Reaktivierung", "lost-lead reactivation"), tx("Strukturierter Outreach", "structured outreach"), tx("Setter/Closer Execution", "setter/closer execution"), tx("Wöchentliches Reporting", "weekly reporting")], output: tx("Zurückgewonnene Opportunities und messbare Pipeline-Bewegung", "Recovered opportunities and measurable pipeline movement") },
    { id: 4, name: "Revenue OS™", purpose: tx("Recovery in Infrastruktur verwandeln.", "Turn recovery into infrastructure."), items: [tx("CRM-Struktur", "CRM structure"), tx("Automation Layer", "automation layer"), tx("KI-gestütztes Follow-up", "AI-supported follow-up"), tx("Dashboard", "dashboard"), tx("Sales-Operating-Rhythmus", "sales operating rhythm"), tx("Team-Verantwortlichkeiten", "team responsibilities"), tx("Kontinuierliche Optimierung", "continuous optimization")], output: tx("Ein Revenue Operating System, das die Autobahn am Laufen hält.", "A revenue operating system that keeps the Autobahn running.") },
  ];
  return (
    <section id="modules" className="py-16 md:py-24 px-5 md:px-6">
      <div className="max-w-[1100px] mx-auto">
        <FadeIn className="max-w-2xl space-y-3">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{tx("Was wir konkret tun", "What we actually do")}</span>
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx("Von Diagnose zu Revenue-Execution.", "From diagnosis to revenue execution.")}
          </h2>
        </FadeIn>
        <div className="mt-10 grid md:grid-cols-2 gap-5">
          {modules.map((m, i) => (
            <FadeIn key={m.id} delay={i * 0.05}>
              <div className="h-full border border-border rounded-md bg-card p-6 space-y-4">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-2xl text-muted-foreground/50">0{m.id}</span>
                  <h3 className="font-display text-lg font-semibold text-foreground">{m.name}</h3>
                </div>
                <p className="text-sm text-foreground/80">{m.purpose}</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {m.items.map((it) => (
                    <li key={it} className="flex items-start gap-2">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/40 mt-2 shrink-0" />
                      {it}
                    </li>
                  ))}
                </ul>
                <div className="pt-3 border-t border-border/50">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">{tx("Ergebnis", "Output")}</p>
                  <p className="text-sm text-foreground mt-1">{m.output}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ── managed sales ops ── */
const ManagedOps = () => {
  const { tx } = useLanguage();
  const options = [
    { title: tx("Mit dir bauen", "Build with you"), desc: tx("Wir designen das System, dein Team betreibt es.", "We design the system and your team operates it.") },
    { title: tx("Mit dir operieren", "Operate with you"), desc: tx("Wir unterstützen Recovery, Follow-up und Sales-Execution.", "We support recovery, follow-up and sales execution.") },
    { title: tx("Mit dir skalieren", "Scale with you"), desc: tx("Wir integrieren Automation, KI und ausgebildetes Sales-Talent.", "We integrate automation, AI and trained sales talent.") },
  ];
  return (
    <section className="py-16 md:py-24 px-5 md:px-6 bg-muted/30">
      <div className="max-w-[1000px] mx-auto">
        <FadeIn className="max-w-2xl space-y-4">
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx(
              "Wenn nötig, betreiben wir das System mit dir.",
              "When needed, we can operate the system with you."
            )}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {tx(
              "Revenue OS™ ist nicht nur Consulting. Wenn nötig, unterstützen wir die operative Execution durch ausgebildete Setter, Closer und Sales-Operators, die innerhalb des Systems arbeiten. Das Ziel ist nicht, Menschen zu verkaufen — das Ziel ist, eine Revenue-Maschine zu bauen.",
              "Revenue OS™ is not only consulting. If required, we support operational execution through trained setters, closers and sales operators working inside the system. The goal is not to sell people — the goal is to build a revenue machine."
            )}
          </p>
        </FadeIn>
        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {options.map((o, i) => (
            <FadeIn key={o.title} delay={i * 0.05}>
              <div className="h-full border border-border rounded-md p-5 bg-background space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{o.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{o.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
        <FadeIn className="mt-8" delay={0.2}>
          <p className="text-sm text-foreground/80">
            {tx("Talent ist optional.", "Talent is optional.")} <span className="text-muted-foreground">{tx("Infrastruktur ist zentral.", "Infrastructure is central.")}</span>
          </p>
        </FadeIn>
      </div>
    </section>
  );
};

/* ── outcomes ── */
const Outcomes = () => {
  const { tx } = useLanguage();
  const items = [
    tx("Mehr gebuchte Calls aus bestehenden Leads", "More booked calls from existing leads"),
    tx("Höhere Show-Up-Rate", "Higher show-up rate"),
    tx("Höhere Close-Rate", "Higher close rate"),
    tx("Zurückgewonnener verlorener Umsatz", "Recovered lost revenue"),
    tx("Klarere Pipeline-Ownership", "Cleaner pipeline ownership"),
    tx("Bessere Sales-Sichtbarkeit", "Better sales visibility"),
    tx("Weniger manuelles Chaos", "Less manual chaos"),
    tx("Klarere KPIs", "Clearer KPIs"),
    tx("Schnelleres Follow-up", "Faster follow-up"),
    tx("Niedrigerer Revenue Drag", "Lower revenue drag"),
    tx("Fundament für Automation und KI", "Foundation for automation and AI"),
  ];
  return (
    <section className="py-16 md:py-24 px-5 md:px-6">
      <div className="max-w-[1000px] mx-auto">
        <FadeIn className="max-w-2xl space-y-3">
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx("Was sich nach Revenue OS™ ändert", "What changes after Revenue OS™")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tx(
              "Messbare Recovery. Klarere Pipeline. Höheres Conversion-Potenzial. Operative Kontrolle.",
              "Measurable recovery. Clearer pipeline. Higher conversion potential. Operational control."
            )}
          </p>
        </FadeIn>
        <FadeIn className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-3" delay={0.1}>
          {items.map((it) => (
            <div key={it} className="flex items-start gap-2 border border-border/60 rounded-md px-4 py-3 bg-card">
              <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
              <span className="text-sm text-foreground">{it}</span>
            </div>
          ))}
        </FadeIn>
      </div>
    </section>
  );
};

/* ── revenue drag ── */
const RevenueDrag = () => {
  const { tx } = useLanguage();
  const examples = [
    tx("Ein qualifizierter Lead wartet 6 Tage auf ein Follow-up.", "A qualified lead waits 6 days for follow-up."),
    tx("Ein gebuchter Call bekommt keine Erinnerung.", "A booked call receives no reminder."),
    tx("Ein No-Show wird nie zurückgeholt.", "A no-show is never recovered."),
    tx("Ein warmer Lead wird wie ein kalter Lead behandelt.", "A warm lead is treated like a cold lead."),
    tx("Ein Closer hat keine Ownership.", "A closer has no ownership."),
    tx("Eine CRM-Stage bedeutet nichts.", "A CRM stage means nothing."),
    tx("Ein verlorener Deal landet nie wieder in einer Recovery-Schleife.", "A lost deal never re-enters a recovery loop."),
  ];
  return (
    <section className="py-16 md:py-24 px-5 md:px-6 bg-muted/30">
      <div className="max-w-[1000px] mx-auto">
        <FadeIn className="space-y-4 max-w-2xl">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{tx("Die versteckten Kosten", "The hidden cost")}</span>
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx("Revenue Drag™ ist der versteckte Preis schlechter Routings.", "Revenue Drag™ is the hidden cost of poor routing.")}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {tx(
              "Revenue Drag™ ist die operative Reibung, die Umsatzbewegung verlangsamt, nachdem Nachfrage bereits erzeugt wurde.",
              "Revenue Drag™ is the operational friction that slows down revenue movement after demand has already been created."
            )}
          </p>
        </FadeIn>
        <FadeIn className="mt-10 space-y-2" delay={0.1}>
          {examples.map((e) => (
            <div key={e} className="text-sm text-foreground border-l-2 border-border pl-4 py-1.5">{e}</div>
          ))}
        </FadeIn>
        <FadeIn className="mt-8" delay={0.2}>
          <button
            onClick={() => { trackFunnelEvent("snapshot_cta_click", { source: "revenue_drag" }); scrollTo("apply"); }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-sm bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            {tx("Finde deinen Revenue Drag", "Find your Revenue Drag")} <ArrowRight className="w-4 h-4" />
          </button>
        </FadeIn>
      </div>
    </section>
  );
};

/* ── process ── */
const Process = () => {
  const { tx } = useLanguage();
  const phases = [
    {
      n: 1,
      phase: tx("Diagnose", "Diagnose"),
      t: tx("Revenue Snapshot", "Revenue Snapshot"),
      duration: tx("Woche 1–2", "Week 1–2"),
      d: tx(
        "Wir mappen dein Angebot, deinen Lead-Pool, CRM und Sales-Prozess. Du bekommst einen schriftlichen Report mit den größten Revenue Leaks und einer impact-gerankten Prioritätenliste.",
        "We map your offer, lead pool, CRM and sales process. You receive a written report with the biggest revenue leaks and an impact-ranked priority list."
      ),
      deliverables: [tx("Snapshot Report", "Snapshot Report"), tx("Conversion-KPI-Baseline", "Conversion KPI baseline"), tx("Priorisierte Fix-Liste", "Priority fix list")],
      anchor: "autobahn",
      anchorLabel: tx("Sieh, wonach wir suchen", "See what we look for"),
    },
    {
      n: 2,
      phase: tx("Blueprint", "Blueprint"),
      t: tx("Lead Autobahn Plan", "Lead Autobahn Plan"),
      duration: tx("Woche 3", "Week 3"),
      d: tx(
        "Wir designen das Zielsystem: Lead-Routing, Follow-up-Kadenz, Recovery-Sequenzen, Team-Workflows und die KPI-Kadenz, die alles zusammenhält.",
        "We design the target system: lead routing, follow-up cadence, recovery sequences, team workflows and the KPI cadence that holds it together."
      ),
      deliverables: [tx("Lead Autobahn Blueprint", "Lead Autobahn blueprint"), tx("Workflow- + Skript-Map", "Workflow + script map"), tx("30/60/90-Tage-Plan", "30/60/90-day plan")],
      anchor: "fit",
      anchorLabel: tx("Passt das?", "Is this a fit?"),
    },
    {
      n: 3,
      phase: tx("Execute", "Execute"),
      t: tx("Recovery Sprint", "Recovery Sprint"),
      duration: tx("Woche 4–10", "Week 4–10"),
      d: tx(
        "Wir aktivieren den Plan auf deinen bestehenden Leads — Reaktivierung, No-Show-Recovery, Pipeline-Cleanup — zusammen mit deinem Team. Wöchentlicher Review zu Booking-, Show- und Close-Raten.",
        "We activate the plan on your existing leads — reactivation, no-show recovery, pipeline cleanup — alongside your team. Weekly review on booking, show and close rates."
      ),
      deliverables: [tx("Live-Recovery-Kampagnen", "Live recovery campaigns"), tx("Wöchentlicher KPI-Review", "Weekly KPI review"), tx("Sprint-Handover-Dokument", "Sprint handover doc")],
      anchor: "offers",
      anchorLabel: tx("Engagements vergleichen", "Compare engagements"),
    },
    {
      n: 4,
      phase: tx("Operate", "Operate"),
      t: tx("Revenue OS Partnerschaft", "Revenue OS Partnership"),
      duration: tx("Monat 3+ (optional)", "Month 3+ (optional)"),
      d: tx(
        "Erst wenn das System performt, gehen wir in den laufenden Betrieb: Dashboards, Ownership-Modell, Talent-Pipeline und kontinuierliche Optimierung. Umsatz wird Infrastruktur.",
        "Only after the system performs, we move into ongoing operations: dashboards, ownership model, talent pipeline and continuous optimisation. Revenue becomes infrastructure."
      ),
      deliverables: [tx("Live-KPI-Dashboard", "Live KPI dashboard"), tx("Managed Sales Ops", "Managed sales ops"), tx("Quartalsweises Strategie-Council", "Quarterly strategy council")],
      anchor: "apply",
      anchorLabel: tx("Partnerschaft besprechen", "Discuss partnership"),
    },
  ];
  return (
    <section id="process" className="py-16 md:py-24 px-5 md:px-6">
      <div className="max-w-[1100px] mx-auto">
        <FadeIn className="max-w-2xl space-y-3">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{tx("Prozess", "Process")}</span>
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx("Vier Phasen. Eine Richtung.", "Four phases. One direction.")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {tx(
              "Diagnose → Blueprint → Execute → Operate. Jede Phase hat einen definierten Output, eine Dauer und ein Decision Gate — du weißt immer, was als Nächstes kommt und was es kostet.",
              "Diagnose → Blueprint → Execute → Operate. Every phase has a defined output, a duration and a decision gate — so you always know what comes next and what it costs."
            )}
          </p>
        </FadeIn>

        <div className="mt-12 relative">
          <div className="absolute left-[18px] md:left-[22px] top-2 bottom-2 w-px bg-border hidden sm:block" aria-hidden="true" />

          <div className="space-y-6">
            {phases.map((p, i) => (
              <FadeIn key={p.n} delay={i * 0.05}>
                <div className="relative flex gap-5 sm:gap-7">
                  <div className="shrink-0 relative z-10">
                    <div className="w-9 h-9 md:w-11 md:h-11 rounded-full border border-border bg-background flex items-center justify-center font-display text-sm md:text-base font-semibold text-foreground">
                      0{p.n}
                    </div>
                  </div>

                  <div className="flex-1 border border-border rounded-md bg-card p-5 md:p-6 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        {tx("Phase", "Phase")} {p.n} · {p.phase}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{p.duration}</span>
                    </div>

                    <h3 className="font-display text-lg md:text-xl font-semibold text-foreground">{p.t}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.d}</p>

                    <div className="pt-2 flex flex-wrap gap-2">
                      {p.deliverables.map((d) => (
                        <span key={d} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-background text-foreground">
                          {d}
                        </span>
                      ))}
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => { trackFunnelEvent("process_phase_jump", { phase: p.n, anchor: p.anchor }); scrollTo(p.anchor); }}
                        className="text-xs font-medium text-foreground inline-flex items-center gap-1.5 hover:gap-2 transition-all border-b border-foreground/30 hover:border-foreground pb-0.5"
                      >
                        {p.anchorLabel} <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>

        <FadeIn delay={0.3}>
          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-border pt-6">
            <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
              {tx(
                "Du kannst nach jeder Phase aufhören. Die meisten Partner starten mit Phase 1 und entscheiden von dort.",
                "You can stop after any phase. Most partners start with Phase 1, decide from there."
              )}
            </p>
            <button
              onClick={() => { trackFunnelEvent("process_cta_click", { source: "process_section" }); scrollTo("apply"); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
            >
              {tx("Mit Phase 1 starten", "Start with Phase 1")} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};

/* ── offers ── */
const Offers = () => {
  const { tx } = useLanguage();
  const offers = [
    {
      name: "Revenue Snapshot™",
      tagline: tx("Diagnostik. Klarheit in 10 Werktagen.", "Diagnostic. Clarity in 10 working days."),
      best: tx(
        "Du vermutest, dass Umsatz verloren geht, weißt aber nicht wo. Du willst einen externen Blick, bevor du Kapital bindest.",
        "You suspect revenue is leaking but don't know where. You want an outside read before committing capital."
      ),
      price: tx("Ab €1.600 netto", "From €1,600 net"),
      duration: tx("10 Werktage · einmalig", "10 working days · one-off"),
      scope: [
        tx("Vollständiges Audit von Lead-Pool, CRM, Pipeline und Follow-up", "Full audit of lead pool, CRM, pipeline and follow-up"),
        tx("Stage-by-Stage Conversion-Analyse (Booking · Show · Close)", "Stage-by-stage conversion analysis (booking · show · close)"),
        tx("Revenue-Drag-Schätzung in € pro Monat", "Revenue drag estimate in € per month"),
        tx("Priorisierte Liste von Fixes (Impact × Aufwand)", "Prioritised list of fixes (impact × effort)"),
        tx("90-Tage-Roadmap, die dein Team oder unseres umsetzen kann", "90-day roadmap your team or ours can execute"),
      ],
      deliverables: [
        tx("Revenue Snapshot Report (PDF)", "Revenue Snapshot Report (PDF)"),
        tx("Conversion-KPI-Baseline-Sheet", "Conversion KPI baseline sheet"),
        tx("60-minütiger Strategie-Debrief-Call", "60-min strategy debrief call"),
      ],
      outcome: tx(
        "Du gehst mit einem klaren Bild, wo Umsatz verloren geht und was als Erstes zu fixen ist.",
        "You leave with a clear picture of where revenue is being lost and what to fix first."
      ),
      notFor: tx(
        "Teams, die bereits eine Diagnose haben und nur noch Execution brauchen.",
        "Teams that already have a diagnosis and just need execution."
      ),
      cta: tx("Revenue Snapshot buchen", "Book Revenue Snapshot"),
      event: "snapshot_cta_click",
      featured: false,
    },
    {
      name: "Lead Autobahn Sprint™",
      tagline: tx("Execution. Umsatz aus bestehenden Leads zurückholen.", "Execution. Recover revenue from existing leads."),
      best: tx(
        "Du hast einen echten Lead-Pool, ein bestehendes Angebot und sichtbare Conversion-Lecks, die du — schnell — schließen willst.",
        "You have a real lead pool, an existing offer, and visible conversion leaks you want closed — fast."
      ),
      price: tx("Custom · typischerweise €15k–€45k", "Custom · typically €15k–€45k"),
      duration: tx("6–10 Wochen · gescoptes Engagement", "6–10 weeks · scoped engagement"),
      scope: [
        tx("Lead Autobahn™ Routing in dein CRM eingebaut", "Lead Autobahn™ routing built into your CRM"),
        tx("Reaktivierung und Recovery-Kampagnen auf kalte / No-Show / No-Decision Segmente", "Reactivation and recovery campaigns on cold / no-show / no-decision segments"),
        tx("Setter- und Closer-Workflows verschärft (Skripte, SLAs, Handoffs)", "Setter and closer workflows tightened (scripts, SLAs, handoffs)"),
        tx("Wöchentliche KPI-Kadenz: Booking · Show · Close · Cash Collected", "Weekly KPI cadence: booking · show · close · cash collected"),
        tx("Optionale Platzierung ausgebildeter Setter / Closer aus unserem Netzwerk", "Optional placement of trained setters / closers from our network"),
      ],
      deliverables: [
        tx("Operative Lead Autobahn™ in deinem Stack", "Operational Lead Autobahn™ in your stack"),
        tx("Recovery-Playbooks + Message Library", "Recovery playbooks + message library"),
        tx("Wöchentlicher Performance-Review mit unserem Operator", "Weekly performance review with our operator"),
        tx("Sprint-End Handover-Dokument", "Sprint-end handover document"),
      ],
      outcome: tx(
        "Messbarer Lift bei gebuchten Calls, Show-Rate und geschlossenem Umsatz aus Leads, die du bereits hast.",
        "Measurable lift in booked calls, show rate and closed revenue from leads you already have."
      ),
      notFor: tx(
        "Unternehmen ohne Offer-Market-Fit oder mit weniger als ~200 Leads in der Pipeline.",
        "Businesses with no offer-market fit or fewer than ~200 leads in pipeline."
      ),
      cta: tx("Für Sprint bewerben", "Apply for Sprint"),
      event: "sprint_cta_click",
      featured: true,
    },
    {
      name: "Revenue OS Partnership™",
      tagline: tx("Infrastruktur. Wir betreiben Umsatz mit dir.", "Infrastructure. We operate revenue with you."),
      best: tx(
        "Du willst einen langfristigen Operating-Partner, der Sales-Infrastruktur betreibt — keine weitere Agentur, keinen Coach.",
        "You want a long-term operating partner running sales infrastructure, not another agency or coach."
      ),
      price: tx("Custom Monatsretainer + Performance", "Custom monthly retainer + performance"),
      duration: tx("6–12 Monate · verlängerbare Partnerschaft", "6–12 months · renewable partnership"),
      scope: [
        tx("End-to-End Revenue OS™ Aufbau (Lead, Sales, Ops, Reporting)", "End-to-end Revenue OS™ buildout (lead, sales, ops, reporting)"),
        tx("Managed Sales Operations: Setter- / Closer-Team, QA, Coaching", "Managed sales operations: setter / closer team, QA, coaching"),
        tx("Automation und CRM-Architektur von unserem Team gepflegt", "Automation and CRM architecture maintained by our team"),
        tx("Monatliches KPI-Council mit der Führung", "Monthly KPI council with leadership"),
        tx("Kontinuierliche Optimierung über Funnel, Offer und Team", "Continuous optimisation across funnel, offer and team"),
      ],
      deliverables: [
        tx("Dedizierter Operator + Ops-Team", "Dedicated operator + ops team"),
        tx("Live KPI-Dashboard (Revenue, Capacity, Drag)", "Live KPI dashboard (revenue, capacity, drag)"),
        tx("Quartalsweise Strategie + Capacity Planning", "Quarterly strategy + capacity planning"),
        tx("Talent-Pipeline aus unserem ausgebildeten Netzwerk", "Talent pipeline from our trained network"),
      ],
      outcome: tx(
        "Umsatz wird zu einem System, das du skalieren kannst — keine Funktion, die von dir abhängt.",
        "Revenue becomes a system you can scale — not a function that depends on you."
      ),
      notFor: tx(
        "Kurzfristige taktische Bedürfnisse oder Teams, die keine KPI-Daten teilen wollen.",
        "Short-term tactical needs or teams unwilling to share KPI data."
      ),
      cta: tx("Partnerschaft besprechen", "Discuss Partnership"),
      event: "partnership_cta_click",
      featured: false,
    },
  ];
  return (
    <section id="offers" className="py-16 md:py-24 px-5 md:px-6 bg-muted/30">
      <div className="max-w-[1200px] mx-auto">
        <FadeIn className="max-w-2xl space-y-3">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{tx("Angebote", "Offers")}</span>
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx("Starte mit Klarheit. Skaliere mit Infrastruktur.", "Start with clarity. Scale with infrastructure.")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {tx(
              "Drei Engagements, eine Progression: diagnostizieren, zurückholen, betreiben. Wähle das, was zu deinem aktuellen Stand passt — nicht zu deinem Wunschstand.",
              "Three engagements, one progression: diagnose, recover, operate. Pick the one that matches where you are — not where you wish you were."
            )}
          </p>
        </FadeIn>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {offers.map((o, i) => {
            const muted = o.featured ? "text-background/70" : "text-muted-foreground";
            const subtle = o.featured ? "text-background/80" : "text-muted-foreground";
            const dot = o.featured ? "bg-background/60" : "bg-muted-foreground/40";
            const divider = o.featured ? "border-background/15" : "border-border";
            const label = o.featured ? "text-background/50" : "text-muted-foreground/70";
            return (
              <FadeIn key={o.name} delay={i * 0.05}>
                <div className={`relative h-full rounded-md p-6 space-y-5 flex flex-col ${o.featured ? "bg-foreground text-background border border-foreground shadow-lg" : "bg-background border border-border"}`}>
                  {o.featured && (
                    <span className="absolute -top-2.5 left-6 text-[10px] uppercase tracking-[0.22em] bg-background text-foreground px-2 py-0.5 rounded-sm border border-border">
                      {tx("Am häufigsten", "Most common")}
                    </span>
                  )}
                  <div className="space-y-2">
                    <h3 className="font-display text-lg font-semibold">{o.name}</h3>
                    <p className={`text-xs font-medium ${o.featured ? "text-background" : "text-foreground"}`}>{o.tagline}</p>
                    <p className={`text-xs leading-relaxed ${muted}`}>{o.best}</p>
                  </div>

                  <div className={`flex items-baseline justify-between border-t border-b ${divider} py-3`}>
                    <span className={`text-sm font-medium ${o.featured ? "text-background" : "text-foreground"}`}>{o.price}</span>
                    <span className={`text-[11px] ${muted}`}>{o.duration}</span>
                  </div>

                  <div className="space-y-2">
                    <p className={`text-[10px] uppercase tracking-[0.18em] ${label}`}>{tx("Was enthalten ist", "What's inside")}</p>
                    <ul className={`space-y-1.5 text-sm ${subtle}`}>
                      {o.scope.map((it) => (
                        <li key={it} className="flex items-start gap-2">
                          <span className={`w-1 h-1 rounded-full mt-2 shrink-0 ${dot}`} />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <p className={`text-[10px] uppercase tracking-[0.18em] ${label}`}>{tx("Du bekommst", "You receive")}</p>
                    <ul className={`space-y-1.5 text-sm ${subtle}`}>
                      {o.deliverables.map((it) => (
                        <li key={it} className="flex items-start gap-2">
                          <span className={`w-1 h-1 rounded-full mt-2 shrink-0 ${dot}`} />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={`text-xs leading-relaxed border-l-2 ${o.featured ? "border-background/40 text-background/90" : "border-foreground/30 text-foreground"} pl-3`}>
                    {o.outcome}
                  </div>

                  <div className={`text-[11px] leading-relaxed ${muted}`}>
                    <span className={`uppercase tracking-[0.18em] ${label}`}>{tx("Nicht für:", "Not for:")}</span> {o.notFor}
                  </div>

                  <button
                    onClick={() => { trackFunnelEvent(o.event, { offer: o.name }); scrollTo("apply"); }}
                    className={`mt-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-sm text-sm font-medium transition-colors ${o.featured ? "bg-background text-foreground hover:bg-background/90" : "bg-foreground text-background hover:bg-foreground/90"}`}
                  >
                    {o.cta} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </FadeIn>
            );
          })}
        </div>

        <FadeIn delay={0.2}>
          <p className="text-xs text-muted-foreground text-center mt-8 max-w-xl mx-auto leading-relaxed">
            {tx(
              "Unsicher, welche Stufe passt? Die meisten Partner starten mit einem Snapshot und wechseln in einen Sprint oder eine Partnerschaft, sobald die Diagnose klar ist.",
              "Not sure which tier fits? Most partners start with a Snapshot and graduate into a Sprint or Partnership once the diagnosis is clear."
            )}
          </p>
        </FadeIn>
      </div>
    </section>
  );
};

/* ── ecosystem ── */
const Ecosystem = () => {
  const { tx } = useLanguage();
  const pillars = [
    { t: "ETC", d: tx("Talent ausbilden.", "Train talent.") },
    { t: "GCN", d: tx("Talent und Opportunities verbinden.", "Connect talent and opportunities.") },
    { t: "Revenue OS™", d: tx("Revenue-Infrastruktur bauen und betreiben.", "Build and operate revenue infrastructure.") },
  ];
  return (
    <section className="py-16 md:py-24 px-5 md:px-6">
      <div className="max-w-[1000px] mx-auto">
        <FadeIn className="max-w-2xl space-y-3">
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx("Teil des Ethical Closer Ökosystems.", "Part of the Ethical Closer ecosystem.")}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {tx(
              "Revenue OS™ ist der B2B-Infrastruktur-Layer. Zusammen mit Ethical Top Closer und dem Global Closer Network schließt es die Schleife von Talent → Opportunity → Revenue-Execution.",
              "Revenue OS™ is the B2B infrastructure layer. Together with Ethical Top Closer and the Global Closer Network, it closes the loop from talent → opportunity → revenue execution."
            )}
          </p>
        </FadeIn>
        <FadeIn className="mt-10 grid md:grid-cols-3 gap-4" delay={0.1}>
          {pillars.map((p) => (
            <div key={p.t} className="border border-border rounded-md p-5 bg-card">
              <p className="font-display text-base font-semibold text-foreground">{p.t}</p>
              <p className="text-sm text-muted-foreground mt-1">{p.d}</p>
            </div>
          ))}
        </FadeIn>
      </div>
    </section>
  );
};

/* ── trust ── */
const Trust = () => {
  const { tx } = useLanguage();
  const proofs = [
    tx("30+ Jahre kumulierte Sales-/Operator-Erfahrung", "30+ years cumulative sales / operator experience"),
    tx("High-Ticket Sales-Kontext", "High-ticket sales context"),
    tx("CRM- und Pipeline-Expertise", "CRM and pipeline expertise"),
    tx("Setter- / Closer-Execution-Erfahrung", "Setter / closer execution experience"),
    tx("Revenue-Recovery-Logik", "Revenue recovery logic"),
    tx("Automation- und KI-Readiness", "Automation and AI-readiness"),
  ];
  return (
    <section className="py-16 md:py-24 px-5 md:px-6 bg-muted/30">
      <div className="max-w-[1000px] mx-auto">
        <FadeIn className="max-w-2xl space-y-3">
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx("Aus echten Sales-Operations gebaut.", "Built from real sales operations.")}
          </h2>
          <p className="text-sm text-muted-foreground">{tx("Beweis der Methode.", "Proof of method.")}</p>
        </FadeIn>
        <FadeIn className="mt-8 grid sm:grid-cols-2 gap-3" delay={0.1}>
          {proofs.map((p) => (
            <div key={p} className="flex items-start gap-2 text-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" /> {p}
            </div>
          ))}
        </FadeIn>
      </div>
    </section>
  );
};

/* ── FAQ — objection handling ── */
type FaqCategory = "leads" | "drag" | "ops" | "data" | "scope";

interface FaqItem {
  cat: FaqCategory;
  q: { de: string; en: string };
  a: { de: string; en: string };
  cta?: { label: { de: string; en: string }; anchor: string; source: string };
}

const FAQ_CATEGORIES_DATA: { id: FaqCategory; label: { de: string; en: string } }[] = [
  { id: "leads", label: { de: "Leads", en: "Leads" } },
  { id: "drag", label: { de: "Revenue Drag", en: "Revenue Drag" } },
  { id: "ops", label: { de: "Managed Ops", en: "Managed Ops" } },
  { id: "data", label: { de: "Daten & CRM", en: "Data & CRM" } },
  { id: "scope", label: { de: "Scope & Fit", en: "Scope & Fit" } },
];

const FAQ_ITEMS_DATA: FaqItem[] = [
  {
    cat: "leads",
    q: { de: "Wir haben kein Lead-Problem. Wozu brauchen wir das?", en: "We don't have a lead problem. Why would we need this?" },
    a: { de: "Die meisten unserer Partner haben auch kein Lead-Problem — sie haben ein Conversion-Problem. Revenue OS™ generiert keine zusätzlichen Leads. Es holt Umsatz aus den Leads, Buchungen und Pipelines zurück, die du bereits hast. Wenn deine Booking-to-Show- oder Show-to-Close-Rate unter Benchmark ist, liegt das Leck downstream der Lead-Generierung.", en: "Most of our partners don't have a lead problem either — they have a conversion problem. Revenue OS™ doesn't generate more leads. It recovers revenue from the leads, bookings and pipelines you already have. If your booking-to-show or show-to-close rate is below benchmark, the leak is downstream of lead gen." },
    cta: { label: { de: "Sieh die Revenue-Drag-Map", en: "See the Revenue Drag map" }, anchor: "autobahn", source: "faq_leads_drag" },
  },
  {
    cat: "leads",
    q: { de: "Generiert ihr Leads oder kauft ihr Ad-Spend?", en: "Do you generate leads or buy ad spend?" },
    a: { de: "Nein. Wir schalten bewusst keine Ads und generieren keine Leads. Unser Job ist es, bestehende Nachfrage zu konvertieren. Sobald die Conversion-Infrastruktur funktioniert, zahlt sich zusätzliches Lead-Volumen aus — vorher skaliert es nur den Drag.", en: "No. We deliberately don't run ads or generate leads. Our job is to make existing demand convert. Once the conversion infrastructure works, additional lead volume actually pays back — before that, it just scales drag." },
  },
  {
    cat: "leads",
    q: { de: "Was, wenn unser Lead-Volumen klein ist?", en: "What if our lead volume is small?" },
    a: { de: "Weniger als ~200 Leads in der Pipeline ist meistens zu früh für einen Sprint. Ein Revenue Snapshot hilft trotzdem — wir können zeigen, ob der Engpass Volumen, Qualität oder Conversion ist.", en: "Fewer than ~200 leads in pipeline is usually too early for a Sprint. A Revenue Snapshot still helps — we can show whether the bottleneck is volume, quality, or conversion." },
    cta: { label: { de: "Revenue Snapshot buchen", en: "Book Revenue Snapshot" }, anchor: "apply", source: "faq_leads_snapshot" },
  },
  {
    cat: "drag",
    q: { de: "Was genau ist „Revenue Drag“?", en: "What exactly is 'Revenue Drag'?" },
    a: { de: "Revenue Drag ist die Lücke zwischen dem Umsatz, den deine Pipeline produzieren könnte, und dem, was sie tatsächlich abschließt. Er versteckt sich in No-Shows, No-Decisions, langsamem Follow-up, verlorenen Einwänden, nicht zugewiesenen Leads und kaputten Handoffs. Wir quantifizieren ihn in € pro Monat, nicht in Vibes.", en: "Revenue Drag is the gap between the revenue your pipeline could produce and what it actually closes. It hides in no-shows, no-decisions, slow follow-up, lost objections, unassigned leads and broken handoffs. We quantify it in € per month, not in vibes." },
    cta: { label: { de: "Drag quantifizieren", en: "Quantify your drag" }, anchor: "apply", source: "faq_drag_estimate" },
  },
  {
    cat: "drag",
    q: { de: "Wie messt ihr das?", en: "How do you measure it?" },
    a: { de: "Wir baseline 6 KPIs entlang deines Funnels: Lead → gebucht → erschienen → gepitcht → abgeschlossen → Cash Collected. Drag ist das Delta zwischen jeder Stage-Rate und einem realistischen Benchmark für deine Offer-Größe. Der Snapshot Report zeigt den €-Wert hinter jedem Leak.", en: "We baseline 6 KPIs across your funnel: lead → booked → showed → pitched → closed → cash collected. Drag is the delta between each stage's actual rate and a realistic benchmark for your offer size. The Snapshot Report shows the € value behind each leak." },
  },
  {
    cat: "drag",
    q: { de: "Wie schnell kann Drag tatsächlich zurückgeholt werden?", en: "How fast can drag actually be recovered?" },
    a: { de: "Reaktivierung und No-Show-Recovery bewegen sich meistens zuerst — innerhalb von 2–4 Wochen nach Execution. Strukturelle Fixes (Routing, Ownership, KPI-Kadenz) wirken kumulativ über 6–10 Wochen während des Sprints.", en: "Reactivation and no-show recovery usually move first — within 2–4 weeks of execution. Structural fixes (routing, ownership, KPI cadence) compound over 6–10 weeks during the Sprint." },
  },
  {
    cat: "ops",
    q: { de: "Ersetzt ihr unser Sales-Team?", en: "Do you replace our sales team?" },
    a: { de: "Nein. Der Default ist, das Team, das du hast, zu stärken — Skripte, Handoffs, KPI-Kadenz, Coaching. Wir platzieren Setter oder Closer aus unserem Netzwerk nur, wenn du ausdrücklich Kapazität brauchst, und sie integrieren sich in dein Team, nicht daneben.", en: "No. The default is to strengthen the team you have — scripts, handoffs, KPI cadence, coaching. We only place setters or closers from our network when you explicitly need capacity, and they integrate into your team, not around it." },
  },
  {
    cat: "ops",
    q: { de: "Was beinhaltet „Managed Sales Operations“ konkret?", en: "What does 'managed sales operations' actually include?" },
    a: { de: "Einen Operator, der die Kadenz besitzt, einen wöchentlichen KPI-Review mit der Führung, QA auf Calls und Follow-up, Recovery-Kampagnen, Lead-Routing-Wartung und optionale Talent-Platzierung. Du behältst Ownership von Brand und Offer; wir besitzen den operativen Layer.", en: "An operator who owns the cadence, a weekly KPI review with leadership, QA on calls and follow-up, recovery campaigns, lead routing maintenance, and optional talent placement. You keep ownership of the brand and offer; we own the operational layer." },
    cta: { label: { de: "Engagements vergleichen", en: "Compare engagements" }, anchor: "offers", source: "faq_ops_offers" },
  },
  {
    cat: "ops",
    q: { de: "Übernehmt ihr unser CRM?", en: "Do you take over our CRM?" },
    a: { de: "Wir arbeiten innerhalb deines CRMs, wir ersetzen es nicht. Unser Team bekommt scoped Access, hinterlässt einen Audit-Trail und übergibt das System am Ende des Engagements sauber zurück.", en: "We operate inside your CRM, we don't replace it. Our team gets scoped access, leaves an audit trail and hands the system back clean at the end of the engagement." },
  },
  {
    cat: "data",
    q: { de: "Mit welchen CRMs und Tools arbeitet ihr?", en: "Which CRMs and tools do you work with?" },
    a: { de: "HubSpot, Pipedrive, Close, GoHighLevel, Salesforce und die meisten Custom-Stacks auf Basis von Airtable/Notion. Wenn dein Stack ungewöhnlich ist, sagt dir der Snapshot in Woche 1, ob er vor dem Sprint umstrukturiert werden muss.", en: "HubSpot, Pipedrive, Close, GoHighLevel, Salesforce and most custom stacks built on Airtable/Notion. If your stack is unusual, the Snapshot tells us in week one whether it needs reshaping before the Sprint." },
  },
  {
    cat: "data",
    q: { de: "Was, wenn unsere Daten chaotisch sind?", en: "What if our data is messy?" },
    a: { de: "Das ist die Norm, nicht die Ausnahme. Pipeline-Cleanup ist Teil jedes Sprints: Deduping, Stage-Normalisierung, Owner-Reassignment, Lost-Reason-Hygiene. Ohne saubere Daten ist kein KPI vertrauenswürdig und keine Recovery-Kampagne präzise.", en: "That's the norm, not the exception. Pipeline cleanup is part of every Sprint: deduping, stage normalization, owner reassignment, lost-reason hygiene. Without clean data, no KPI is trustworthy and no recovery campaign is precise." },
  },
  {
    cat: "data",
    q: { de: "Wie werden unsere Daten behandelt und geschützt?", en: "How is our data handled and protected?" },
    a: { de: "Wir arbeiten unter NDA, nur mit namentlich benannten Operators, mit scoped CRM-Access, ohne Drittweitergabe und mit DSGVO-konformer Verarbeitung. Alle Recovery-Messages respektieren Opt-Out und Kanal-Einwilligung.", en: "We work under NDA, with named operators only, scoped CRM access, no third-party data sharing and GDPR-compliant processing. All recovery messaging respects opt-out and channel consent." },
  },
  {
    cat: "scope",
    q: { de: "Ist das für Early-Stage-Unternehmen?", en: "Is this for early-stage businesses?" },
    a: { de: "Nur, wenn bereits Nachfrage existiert. Kein Angebot, keine Leads, kein Sales-Prozess = zu früh. Revenue OS™ ist für Unternehmen, die das Angebot bewiesen haben und Umsatz nun zu einem System machen wollen.", en: "Only if there is already demand. No offer, no leads, no sales process = too early. Revenue OS™ is built for businesses that have proven the offer and now want to make revenue a system." },
  },
  {
    cat: "scope",
    q: { de: "Wie lange läuft ein Engagement?", en: "How long does an engagement run?" },
    a: { de: "Snapshot: 10 Werktage. Sprint: 6–10 Wochen. Partnership: 6–12 Monate, verlängerbar. Du kannst nach jeder Phase aufhören — die meisten Partner starten mit einem Snapshot und entscheiden von dort.", en: "Snapshot: 10 working days. Sprint: 6–10 weeks. Partnership: 6–12 months, renewable. You can stop after any phase — most partners start with a Snapshot and decide from there." },
    cta: { label: { de: "Sieh den 4-Phasen-Prozess", en: "See the 4-phase process" }, anchor: "process", source: "faq_scope_process" },
  },
  {
    cat: "scope",
    q: { de: "Was kostet es?", en: "What does it cost?" },
    a: { de: "Snapshot ab €1.600 netto. Sprint typischerweise €15k–€45k je nach Scope. Partnership ist ein Monatsretainer plus Performance-Komponente. Wir dimensionieren das Engagement gegen geschätzten rückgewinnbaren Umsatz — nicht gegen Stunden.", en: "Snapshot from €1,600 net. Sprint typically €15k–€45k depending on scope. Partnership is a monthly retainer plus performance component. We size the engagement against estimated recoverable revenue — not against hours." },
    cta: { label: { de: "Scope besprechen", en: "Discuss scope" }, anchor: "apply", source: "faq_scope_pricing" },
  },
];

const FAQ = () => {
  const { lang, tx } = useLanguage();
  const [active, setActive] = useState<FaqCategory | "all">("all");
  const [open, setOpen] = useState<string | null>(FAQ_ITEMS_DATA[0]?.q.en ?? null);

  const visible = active === "all" ? FAQ_ITEMS_DATA : FAQ_ITEMS_DATA.filter((f) => f.cat === active);

  const toggle = (item: FaqItem, index: number) => {
    const key = item.q.en;
    const next = open === key ? null : key;
    setOpen(next);
    if (next !== null) {
      trackFunnelEvent("faq_expand", {
        question: item.q.en,
        category: item.cat,
        position: index,
        filter: active,
      });
    } else {
      trackFunnelEvent("faq_collapse", {
        question: item.q.en,
        category: item.cat,
        position: index,
      });
    }
  };

  const handleFilter = (id: FaqCategory | "all") => {
    setActive(id);
    trackFunnelEvent("faq_filter", { category: id });
  };

  const handleInlineCta = (item: FaqItem) => {
    if (!item.cta) return;
    trackFunnelEvent("faq_cta_click", {
      question: item.q.en,
      category: item.cat,
      source: item.cta.source,
      anchor: item.cta.anchor,
    });
    scrollTo(item.cta.anchor);
  };

  return (
    <section id="faq" className="py-16 md:py-24 px-5 md:px-6">
      <div className="max-w-[900px] mx-auto">
        <FadeIn className="space-y-3 mb-8">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">FAQ</span>
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">
            {tx("Direkte Antworten auf die Fragen, die wir tatsächlich bekommen.", "Direct answers to the questions we actually get.")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            {tx(
              "Gruppiert nach dem, worauf die meisten Partner zuerst pushen. Wähle ein Thema — oder browse alle.",
              "Grouped by what most partners push back on first. Pick a topic — or browse all."
            )}
          </p>
        </FadeIn>

        <FadeIn className="flex flex-wrap gap-2 mb-6" delay={0.05}>
          {[{ id: "all" as const, label: { de: "Alle", en: "All" } }, ...FAQ_CATEGORIES_DATA].map((c) => (
            <button
              key={c.id}
              onClick={() => handleFilter(c.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                active === c.id
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
              }`}
            >
              {c.label[lang]}
            </button>
          ))}
        </FadeIn>

        <div className="space-y-2">
          {visible.map((f, i) => {
            const isOpen = open === f.q.en;
            return (
              <div key={f.q.en} className="border border-border rounded-md bg-card overflow-hidden">
                <button
                  onClick={() => toggle(f, i)}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mt-1 shrink-0 hidden sm:inline">
                      {FAQ_CATEGORIES_DATA.find((c) => c.id === f.cat)?.label[lang]}
                    </span>
                    <span className="text-sm font-medium text-foreground">{f.q[lang]}</span>
                  </div>
                  {isOpen ? (
                    <Minus className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 space-y-3">
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.a[lang]}</p>
                    {f.cta && (
                      <button
                        onClick={() => handleInlineCta(f)}
                        className="text-xs font-medium text-foreground inline-flex items-center gap-1.5 hover:gap-2 transition-all border-b border-foreground/30 hover:border-foreground pb-0.5"
                      >
                        {f.cta.label[lang]} <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">{tx("Noch keine Fragen in diesem Thema.", "No questions in this topic yet.")}</p>
          )}
        </div>

        <FadeIn delay={0.2}>
          <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-border pt-6">
            <p className="text-xs text-muted-foreground">{tx("Unsicher, ob das für dich ist?", "Still unsure if this is for you?")}</p>
            <button
              onClick={() => { trackFunnelEvent("faq_cta_click", { source: "faq_footer", anchor: "apply" }); scrollTo("apply"); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
            >
              {tx("Direkt fragen", "Ask us directly")} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};

/* ── apply form ── */
const applicationSchema = z.object({
  name: z.string().trim().min(2, "Name required").max(100),
  email: z.string().trim().email("Valid email required").max(255),
  company: z.string().trim().min(1, "Company required").max(150),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  revenue: z.string().min(1, "Please select"),
  lead_volume: z.string().min(1, "Please select"),
  main_issue: z.string().min(1, "Please select"),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

const ApplyForm = () => {
  const { tx } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries());
    const parsed = applicationSchema.safeParse(raw);
    if (!parsed.success) {
      toast({
        title: tx("Bitte prüfe das Formular", "Please review the form"),
        description: parsed.error.issues[0]?.message ?? tx("Ungültige Eingabe", "Invalid input"),
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const ab = getPartnersAbVariants();
      await supabase.from("event_logs").insert({
        event_name: "revenue_snapshot_application",
        email: parsed.data.email,
        payload: {
          category: "lead_ops",
          page_path: "/partners",
          funnel: "revenue_os",
          ab_hero: ab.heroId,
          ab_cta: ab.ctaId,
          ab_combo: ab.combo,
          ...parsed.data,
        },
        status: "received",
      });
      await trackFunnelEvent("form_submit", {
        form: "revenue_snapshot",
        main_issue: parsed.data.main_issue,
        ab_hero: ab.heroId,
        ab_cta: ab.ctaId,
        ab_combo: ab.combo,
      });
      setDone(true);
    } catch (err) {
      toast({
        title: tx("Übermittlung fehlgeschlagen", "Submission failed"),
        description: tx("Bitte erneut versuchen oder uns direkt kontaktieren.", "Please try again or contact us directly."),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-md border border-border bg-card p-8 text-center space-y-3">
        <CheckCircle2 className="w-8 h-8 text-success mx-auto" />
        <h3 className="font-display text-xl font-semibold text-foreground">{tx("Bewerbung erhalten.", "Application received.")}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          {tx(
            "Wir prüfen jede Bewerbung manuell und melden uns, wenn es einen Fit gibt.",
            "We review every application manually and will respond if there is a fit."
          )}
        </p>
      </div>
    );
  }

  const field = "w-full px-3 py-2.5 rounded-sm border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
  const label = "text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block";

  return (
    <form onSubmit={onSubmit} className="rounded-md border border-border bg-card p-6 md:p-8 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="name">{tx("Name", "Name")}</label>
          <input id="name" name="name" required className={field} placeholder={tx("Dein vollständiger Name", "Your full name")} />
        </div>
        <div>
          <label className={label} htmlFor="email">{tx("E-Mail", "Email")}</label>
          <input id="email" name="email" type="email" required className={field} placeholder="you@company.com" />
        </div>
        <div>
          <label className={label} htmlFor="company">{tx("Unternehmen", "Company")}</label>
          <input id="company" name="company" required className={field} placeholder={tx("Unternehmensname", "Company name")} />
        </div>
        <div>
          <label className={label} htmlFor="website">{tx("Website", "Website")}</label>
          <input id="website" name="website" className={field} placeholder="https://" />
        </div>
        <div>
          <label className={label} htmlFor="revenue">{tx("Monatsumsatz", "Monthly revenue")}</label>
          <select id="revenue" name="revenue" required defaultValue="" className={field}>
            <option value="" disabled>{tx("Bereich wählen", "Select range")}</option>
            <option>&lt; €10k</option>
            <option>€10k – €30k</option>
            <option>€30k – €100k</option>
            <option>€100k – €300k</option>
            <option>€300k+</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="lead_volume">{tx("Leads / Monat", "Leads / month")}</label>
          <select id="lead_volume" name="lead_volume" required defaultValue="" className={field}>
            <option value="" disabled>{tx("Bereich wählen", "Select range")}</option>
            <option>&lt; 50</option>
            <option>50 – 200</option>
            <option>200 – 500</option>
            <option>500 – 1500</option>
            <option>1500+</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="main_issue">{tx("Hauptproblem", "Main issue")}</label>
        <select id="main_issue" name="main_issue" required defaultValue="" className={field}>
          <option value="" disabled>{tx("Auswählen", "Select")}</option>
          <option value="no_booking">{tx("Keine Buchung", "No booking")}</option>
          <option value="no_show">{tx("No-Show", "No show")}</option>
          <option value="low_close_rate">{tx("Niedrige Close-Rate", "Low close rate")}</option>
          <option value="weak_followup">{tx("Schwaches Follow-up", "Weak follow-up")}</option>
          <option value="unclear_crm">{tx("Unklares CRM", "Unclear CRM")}</option>
          <option value="need_sales_team">{tx("Sales-Team benötigt", "Need sales team")}</option>
          <option value="other">{tx("Anderes", "Other")}</option>
        </select>
      </div>
      <div>
        <label className={label} htmlFor="note">{tx("Sollten wir etwas wissen? (optional)", "Anything we should know? (optional)")}</label>
        <textarea id="note" name="note" rows={3} className={field} placeholder={tx("Kontext, aktuelles Setup, Ziele…", "Context, current setup, goals…")} />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-sm bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-60"
      >
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {tx("Wird gesendet…", "Submitting…")}</> : <>{tx("Revenue Snapshot anfragen", "Request Revenue Snapshot")} <ArrowRight className="w-4 h-4" /></>}
      </button>
      <p className="text-[11px] text-muted-foreground/70 text-center">
        {tx(
          "Wir prüfen jede Bewerbung manuell und melden uns, wenn es einen Fit gibt.",
          "We review every application manually and will respond if there is a fit."
        )}
      </p>
    </form>
  );
};

/* ── final CTA + form ── */
const ApplySection = () => {
  const { tx } = useLanguage();
  const benefits = [
    tx("Operator-geführter Review", "Operator-led review"),
    tx("Kein generischer Agentur-Pitch", "No generic agency pitch"),
    tx("Direkte, ehrliche Fit-Einschätzung", "Direct, honest fit assessment"),
  ];
  return (
    <section id="apply" className="py-16 md:py-24 px-5 md:px-6 bg-muted/30">
      <div className="max-w-[1100px] mx-auto grid md:grid-cols-12 gap-10">
        <FadeIn className="md:col-span-5 space-y-5">
          <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Revenue Snapshot</span>
          <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
            {tx("Finde den Umsatz, der bereits in deinem Unternehmen liegt.", "Find the revenue already inside your business.")}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {tx(
              "Bevor du mehr Traffic kaufst, verstehe, was dein aktueller Lead-Pool bereits wert ist.",
              "Before buying more traffic, understand what your current lead pool is already worth."
            )}
          </p>
          <ul className="space-y-2 text-sm text-foreground pt-2">
            {benefits.map((t) => (
              <li key={t} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </FadeIn>
        <div className="md:col-span-7">
          <ApplyForm />
        </div>
      </div>
    </section>
  );
};

/* ── page ── */
const Partners = () => {
  const { lang } = useLanguage();
  const [ab] = useState<PartnersAbAssignment>(() => getPartnersAbVariants());

  useEffect(() => {
    const title = lang === "de"
      ? "Revenue OS™ — Lead Autobahn™ | Ethical Closer Partners"
      : "Revenue OS™ — Lead Autobahn™ | Ethical Closer Partners";
    document.title = title;
    const desc = lang === "de"
      ? "Revenue OS™ hilft High-Ticket-Unternehmen, verlorenen Umsatz zurückzugewinnen und skalierbare Sales-Infrastruktur über das Lead Autobahn™ Framework zu bauen."
      : "Revenue OS™ helps high-ticket businesses recover lost revenue and build scalable sales infrastructure via the Lead Autobahn™ framework.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
    document.documentElement.setAttribute("lang", lang);
    trackFunnelEvent("partners_view", { page: "/partners", lang });
    trackFunnelEvent("partners_ab_exposure", {
      ab_hero: ab.heroId,
      ab_cta: ab.ctaId,
      ab_combo: ab.combo,
      lang,
    });
  }, [ab, lang]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero ab={ab} />
        <Problem />
        <Autobahn />
        <Fit />
        <Modules />
        <ManagedOps />
        <Outcomes />
        <RevenueDrag />
        <Process />
        <Offers />
        <Ecosystem />
        <Trust />
        <FAQ />
        <ApplySection />
      </main>
      <PartnerFooter />
    </div>
  );
};

export default Partners;
