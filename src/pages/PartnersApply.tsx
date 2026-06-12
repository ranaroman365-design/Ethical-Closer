import { useEffect } from "react";
import { PRODUCT } from '@/config/product';
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import PartnerFooter from "@/components/partners/PartnerFooter";
import { useLanguage } from "@/i18n/LanguageContext";

const fade = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: "easeOut" as const } };

const PartnersApply = () => {
  const { tx, lang } = useLanguage();

  useEffect(() => {
    document.title = `${tx("Zugang anfragen", "Request Access")} — ${PRODUCT.nameTM}`;
    document.documentElement.setAttribute("lang", lang);
  }, [tx, lang]);

  const steps = [
    { title: tx("System-Walkthrough", "System Walkthrough"), desc: tx(`Wir zeigen, wie das ${PRODUCT.nameTM} System aufgebaut ist.`, `We show how the ${PRODUCT.nameTM} system is structured.`) },
    { title: tx("Anwendung auf dein Setup", "Application to Your Setup"), desc: tx("Wir mappen das System auf dein aktuelles Modell.", "We map the system to your current model.") },
    { title: tx("Performance & Struktur", "Performance & Structure"), desc: tx("Wir identifizieren, wo Performance messbar und skalierbar gemacht werden kann.", "We identify where performance can be made measurable and scalable.") },
    { title: tx("Nächste Schritte (falls relevant)", "Next Steps (if relevant)"), desc: tx("Nur, wenn es einen echten Fit gibt.", "Only if there is a real fit.") },
  ];
  const fits = [
    tx("Du betreibst ein High-Ticket-Angebot", "You operate a high-ticket offer"),
    tx("Du arbeitest mit Calls, Settern oder Closern", "You work with calls, setters, or closers"),
    tx("Du willst messbare Performance, nicht nur Training", "You want measurable performance, not just training"),
    tx("Du baust oder skalierst ein Team", "You are building or scaling a team"),
    tx("Du bist offen für strukturierte Systeme", "You are open to structured systems"),
  ];
  const notFits = [
    tx("Du suchst schnelle Tricks", "You are looking for quick tactics"),
    tx("Du hast kein echtes Angebot", "You don't have a real offer"),
    tx("Du arbeitest noch nicht auf seriösem Level", "You are not operating at a serious level yet"),
  ];
  const prep = [
    tx("Sei in einer ruhigen Umgebung", "Be in a quiet environment"),
    tx("Sei bereit, dein aktuelles Setup zu besprechen", "Be ready to discuss your current setup"),
    tx("Bringe Klarheit zu deinem Angebot und deiner Struktur", "Bring clarity on your offer and structure"),
    tx("Plane 20–30 Minuten fokussierte Zeit ein", "Plan 20–30 minutes of focused time"),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 h-14">
          <span className="font-display text-base tracking-tight text-foreground font-semibold">{PRODUCT.nameTM}</span>
          <Link to="/partners" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> {tx("Zurück zur Übersicht", "Back to overview")}
          </Link>
        </div>
      </header>

      <section className="pt-28 pb-16 md:pt-36 md:pb-20 px-6">
        <motion.div {...fade} className="max-w-2xl mx-auto text-center space-y-4">
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">{tx("Zugang anfragen", "Request Access")}</h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            {tx(
              "Du bist einen Schritt davon entfernt zu verstehen, wie dieses System auf deine Organisation angewendet werden kann.",
              "You're one step away from understanding how this system could be applied to your organization."
            )}
          </p>
          <p className="text-sm text-muted-foreground/70">
            {tx(
              "Das ist keine generische Demo. Das ist ein strukturiertes Gespräch zur Bewertung des Fits.",
              "This is not a generic demo. This is a structured conversation to evaluate fit."
            )}
          </p>
        </motion.div>
      </section>

      <section className="pb-16 md:pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.h2 {...fade} className="font-display text-xl md:text-2xl font-semibold tracking-tight mb-8 text-center">
            {tx("Worum es in diesem Gespräch geht", "What this conversation is about")}
          </motion.h2>
          <div className="grid sm:grid-cols-2 gap-5">
            {steps.map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }} className="border border-border rounded-md p-5 bg-card space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium text-foreground">{i + 1}</span>
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 md:pb-20 px-6">
        <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8">
          <motion.div {...fade} className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{tx("Passt, wenn", "This is a fit if")}</h3>
            {fits.map((t) => (
              <div key={t} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{t}</p>
              </div>
            ))}
          </motion.div>
          <motion.div {...fade} className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{tx("Passt nicht, wenn", "Not a fit if")}</h3>
            {notFits.map((t) => (
              <p key={t} className="text-sm text-muted-foreground py-1">{t}</p>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="booking" className="pb-16 md:pb-24 px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div {...fade} className="bg-card border border-border rounded-lg p-8 md:p-12 shadow-sm text-center space-y-6">
            <h2 className="font-display text-xl md:text-2xl font-semibold tracking-tight">{tx("Buche dein Gespräch", "Book your conversation")}</h2>
            <p className="text-sm text-muted-foreground">{tx("Wähle eine Zeit, die für dich passt.", "Select a time that works for you.")}</p>
            <div className="border border-border/60 rounded-md bg-muted/20 flex items-center justify-center min-h-[320px]">
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">{tx("Kalender-Embed wird hier geladen", "Calendar embed loads here")}</p>
                <a
                  href="/terminbuchung"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-sm bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
                >
                  {tx("Buchungsseite öffnen", "Open Booking Page")}
                </a>
              </div>
            </div>
            <p className="text-xs text-muted-foreground/60">{tx("Gespräche sind limitiert, um Qualität zu erhalten.", "Conversations are limited to maintain quality.")}</p>
          </motion.div>
        </div>
      </section>

      <section className="pb-16 md:pb-20 px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div {...fade} className="space-y-6">
            <h2 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-center">{tx("Wie du dich vorbereitest", "How to prepare")}</h2>
            <div className="space-y-3 max-w-md mx-auto">
              {prep.map((t) => (
                <p key={t} className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                  {t}
                </p>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="pb-16 md:pb-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div {...fade} className="space-y-4">
            <h3 className="font-display text-lg font-semibold text-foreground">{tx("Wichtig", "Important")}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {tx("Wir halten diesen Prozess selektiv, um hochwertige Gespräche zu sichern.", "We keep this process selective to ensure high-quality conversations.")}<br />
              {tx("Wenn es keinen klaren Fit gibt, sagen wir es dir direkt.", "If there is no clear fit, we will tell you directly.")}<br />
              {tx("Wenn es einen Fit gibt, zeigen wir dir, wie es weitergeht.", "If there is a fit, we will show you how to move forward.")}
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-24 px-6 bg-muted/30">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div {...fade} className="space-y-3">
            <p className="text-sm text-foreground font-medium leading-relaxed">
              {tx("Dieses System ist nicht für jeden gebaut.", "This system is not designed for everyone.")}<br />
              {tx("Aber für den richtigen Operator verändert es, wie Performance gebaut wird.", "But for the right operator, it changes how performance is built.")}
            </p>
            <p className="text-xs text-muted-foreground/60">{tx("Wir freuen uns auf das Gespräch.", "We look forward to the conversation.")}</p>
          </motion.div>
        </div>
      </section>

      <PartnerFooter />
    </div>
  );
};

export default PartnersApply;
