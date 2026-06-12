import { useEffect, useRef } from "react";
import { PRODUCT } from '@/config/product';
import { motion, useInView } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Minus } from "lucide-react";
import PartnerFooter from "@/components/partners/PartnerFooter";
import heroImg from "@/assets/b2b-hero-operator.jpg";
import chaosImg from "@/assets/b2b-chaos-desk.jpg";
import cleanImg from "@/assets/b2b-clean-workspace.jpg";
import teamImg from "@/assets/b2b-team-focused.jpg";
import { useLanguage } from "@/i18n/LanguageContext";

const FadeIn = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.7, delay, ease: "easeOut" }} className={className}>
      {children}
    </motion.div>
  );
};

const PartnersLicense = () => {
  const { tx, lang } = useLanguage();

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  const replaces = [
    tx("CRM-Fragmentierung über mehrere Plattformen", "CRM fragmentation across multiple platforms"),
    tx("Trainingslücken zwischen Onboarding und Performance", "Training gaps between onboarding and performance"),
    tx("Manuelles Performance-Tracking und Reporting", "Manual performance tracking and reporting"),
    tx("Disconnected Workflows zwischen Sales-Rollen", "Disconnected workflows between sales roles"),
    tx("Inkonsistente Execution im Team", "Inconsistent execution across team members"),
  ];

  const benefits = [
    { title: tx("Höhere Conversion", "Higher Conversion"), desc: tx("Bessere Struktur → mehr Deals aus den gleichen Leads. Systematische Execution ersetzt individuelle Varianz.", "Better structure → more deals from the same leads. Systematic execution replaces individual variance.") },
    { title: tx("Niedrigere operative Kosten", "Lower Operational Cost"), desc: tx("Weniger Tools, weniger Handarbeit, weniger Aufsicht. Ein integriertes System ersetzt Schichten operativer Reibung.", "Less tools, less manual work, less oversight. One integrated system replaces layers of operational friction.") },
    { title: tx("Skalierbare Performance", "Scalable Performance"), desc: tx("Das System funktioniert über Teams und Umgebungen hinweg. Performance wird Funktion von Struktur, nicht von Talent.", "System works across teams and environments. Performance becomes a function of structure, not individual talent.") },
  ];

  const licensing = [
    { title: tx("System-Implementierung", "System Implementation"), desc: tx("Vollständige Infrastruktur-Deployment, zugeschnitten auf deine Sales-Struktur, Rollen und Funnel-Architektur.", "Full infrastructure deployment tailored to your sales structure, roles, and funnel architecture.") },
    { title: tx("Zugriffsstruktur", "Access Structure"), desc: tx("Rollenbasierter Zugriff für dein Team — vom Setter über Closer bis Director-Level — mit adaptiven Permissions.", "Role-based access for your team — from setter to closer to director level — with adaptive permissions.") },
    { title: tx("Laufende Optimierung", "Ongoing Optimization"), desc: tx("Das System entwickelt sich mit deinem Business. Intelligence-Layer verbessern Performance kontinuierlich.", "The system evolves with your business. Intelligence layers improve performance continuously.") },
    { title: tx("Support & Integration", "Support & Integration"), desc: tx("CRM-Synchronisierung, Funnel-Integration und strukturiertes Onboarding für dein Team.", "CRM synchronization, funnel integration, and structured onboarding for your team.") },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 h-14">
          <Link to="/partners" className="font-display text-base tracking-tight text-foreground font-semibold">
            {PRODUCT.nameTM}
          </Link>
          <Link to="/partners/apply" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors">
            {tx("Zugang anfragen", "Request Access")}
          </Link>
        </div>
      </header>

      <section className="pt-28 pb-20 md:pt-36 md:pb-28 px-6">
        <div className="max-w-[1200px] mx-auto grid md:grid-cols-2 gap-12 items-center">
          <FadeIn>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">{tx("Lizenz & Geschäftsmodell", "Licensing & Business Model")}</p>
            <h1 className="font-display text-3xl md:text-[2.75rem] font-semibold tracking-tight leading-[1.15] mb-6">
              {tx("Baue auf einem System, das Performance verstärkt", "Build on a system that compounds performance")}
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed mb-8 max-w-lg">
              {tx(
                `${PRODUCT.nameTM} wird nicht nur implementiert. Es wird Teil deiner Business-Infrastruktur.`,
                `${PRODUCT.nameTM} is not just implemented. It becomes part of your business infrastructure.`
              )}
            </p>
            <Link to="/partners/apply" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-sm bg-foreground text-background font-medium text-sm hover:bg-foreground/90 transition-colors">
              {tx("Zugang anfragen", "Request Access")} <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div className="rounded-lg overflow-hidden aspect-[4/3]">
              <img src={heroImg} alt={tx("Gründer am Schreibtisch", "Founder working at desk")} className="w-full h-full object-cover" width={1280} height={854} />
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="py-20 md:py-28 px-6 bg-muted/30">
        <div className="max-w-[1200px] mx-auto grid md:grid-cols-2 gap-12 items-center">
          <FadeIn delay={0.1}>
            <div className="rounded-lg overflow-hidden aspect-[4/3]">
              <img src={chaosImg} alt={tx("Fragmentierte Workflow-Umgebung", "Fragmented workflow environment")} className="w-full h-full object-cover" loading="lazy" width={1280} height={854} />
            </div>
          </FadeIn>
          <FadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-6">
              {tx(
                "Warum die meisten Sales-Systeme teuer sind — auch wenn sie billig aussehen",
                "Why most sales systems are expensive — even when they look cheap"
              )}
            </h2>
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <p>{tx("Tool-Stacking. Disconnected Workflows. Manuelle Aufsicht, die Senior-Aufmerksamkeit für operative Basics erfordert.", "Tool stacking. Disconnected workflows. Manual oversight that requires senior attention for basic operational tasks.")}</p>
              <p>{tx("Der sichtbare Preis ist das Abo. Der echte Preis ist die Ineffizienz, die es erzeugt — fragmentierte Daten, inkonsistente Execution und Entscheidungen auf unvollständiger Basis.", "The visible cost is the subscription. The real cost is the inefficiency it creates — fragmented data, inconsistent execution, and decisions based on incomplete information.")}</p>
              <p className="text-foreground font-medium pt-2">
                {tx("Komplexität ist der teuerste Teil deines Systems.", "Complexity is the most expensive part of your system.")}
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="py-20 md:py-28 px-6">
        <div className="max-w-[1200px] mx-auto grid md:grid-cols-2 gap-12 items-center">
          <FadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-6">
              {tx("Was dieses System konsolidiert", "What this system consolidates")}
            </h2>
            <div className="space-y-3">
              {replaces.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <Minus className="w-3 h-3 text-muted-foreground mt-1 shrink-0" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-foreground font-medium mt-6">
              {tx("Ein System ersetzt mehrere Schichten operativer Komplexität.", "One system replaces multiple layers of operational complexity.")}
            </p>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div className="rounded-lg overflow-hidden aspect-[4/3]">
              <img src={cleanImg} alt={tx("Sauberer organisierter Arbeitsplatz", "Clean organized workspace")} className="w-full h-full object-cover" loading="lazy" width={1280} height={854} />
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="py-20 md:py-28 px-6 bg-muted/30">
        <div className="max-w-[1200px] mx-auto">
          <FadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-10 text-center">
              {tx("Woher der wirtschaftliche Upside kommt", "Where the economic upside comes from")}
            </h2>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-6">
            {benefits.map((b, i) => (
              <FadeIn key={b.title} delay={i * 0.08}>
                <div className="border border-border/60 rounded-lg p-6 bg-card h-full">
                  <h3 className="text-sm font-semibold text-foreground mb-3">{b.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={0.2}>
            <div className="mt-10 rounded-lg overflow-hidden aspect-[21/9] max-w-3xl mx-auto">
              <img src={teamImg} alt={tx("Fokussiertes Team", "Focused team collaboration")} className="w-full h-full object-cover" loading="lazy" width={1280} height={854} />
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="py-20 md:py-28 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <FadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-6">
              {tx("Das ist kein Kostenfaktor. Es ist ein Multiplikator.", "This is not a cost. It is a multiplier.")}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {tx(
                "Die Frage ist nicht, was das System kostet. Die Frage ist, was deine aktuelle Ineffizienz kostet — und was passiert, wenn du sie entfernst.",
                "The question is not what the system costs. The question is what your current inefficiency costs — and what happens when you remove it."
              )}
            </p>
            <p className="text-sm text-foreground font-medium">
              {tx("Schon kleine Conversion-Verbesserungen erzeugen unverhältnismäßigen Umsatz-Impact.", "Even small improvements in conversion create disproportionate revenue impact.")}
            </p>
          </FadeIn>
        </div>
      </section>

      <section className="py-20 md:py-28 px-6 bg-muted/30">
        <div className="max-w-[1200px] mx-auto max-w-2xl">
          <FadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-8">
              {tx("Wie das Lizenzmodell funktioniert", "How the licensing model works")}
            </h2>
          </FadeIn>
          <div className="space-y-4">
            {licensing.map((item, i) => (
              <FadeIn key={item.title} delay={i * 0.06}>
                <div className="flex items-start gap-4 p-4 rounded-lg border border-border/40 bg-card">
                  <Check className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
          <FadeIn delay={0.3}>
            <p className="text-xs text-muted-foreground/70 italic mt-6">
              {tx("Details werden in einem strukturierten Gespräch besprochen.", "Details are discussed in a structured conversation.")}
            </p>
          </FadeIn>
        </div>
      </section>

      <section className="py-24 md:py-32 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <FadeIn>
            <h2 className="font-display text-2xl md:text-3xl font-semibold tracking-tight mb-6">
              {tx("Erkunde, wie dieses System in dein Business integriert werden würde", "Explore how this system would integrate into your business")}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">
              {tx(
                "Du fügst dieses System nicht deinem Business hinzu. Du baust deine Performance darauf neu auf.",
                "You don't add this system to your business. You rebuild your performance on top of it."
              )}
            </p>
            <Link to="/partners/apply" className="inline-flex items-center gap-2 px-8 py-4 rounded-sm bg-foreground text-background font-medium text-sm hover:bg-foreground/90 transition-colors">
              {tx("Zugang anfragen", "Request Access")} <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-xs text-muted-foreground/60 mt-4">{tx("Nur qualifizierte Gespräche.", "Qualified conversations only.")}</p>
          </FadeIn>
        </div>
      </section>

      <PartnerFooter />
    </div>
  );
};

export default PartnersLicense;
