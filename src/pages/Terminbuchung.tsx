import { useState, useEffect } from "react";
import { PRODUCT } from '@/config/product';
import { motion } from "framer-motion";
import { Check, Play, ArrowRight, Info, Download, FileText, Clock } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { trackFunnelEvent } from "@/lib/track-event";

const fade = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5 } };

const Terminbuchung = () => {
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    trackFunnelEvent("booking_view");
  }, []);
  const { tx } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[700px] px-6 py-16 md:py-24">

        {/* SECTION 1 — Application Frame */}
        <motion.section {...fade} className="mb-16 text-center">
          <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {tx("Auswahlprozess", "Selection Process")}
          </p>
          <h1 className="mb-6 font-serif text-3xl font-semibold leading-tight text-foreground md:text-4xl">
            {tx(
              "Bewirb dich für ein Klarheitsgespräch",
              "Apply for a Clarity Call"
            )}
          </h1>
          <p className="mx-auto max-w-[560px] font-sans text-sm leading-relaxed text-muted-foreground">
            {tx(
              "Das ist kein Verkaufsgespräch. Es ist ein Gespräch, in dem wir prüfen, ob du geeignet bist – und ob das System zu dir passt.",
              "This is not a sales call. It's a conversation where we assess your fit – and whether the system is right for you."
            )}
          </p>
        </motion.section>

        {/* SECTION — Application Result */}
        <motion.section {...fade} transition={{ delay: 0.08 }} className="mb-16">
          <div className="rounded-sm px-8 py-8" style={{ background: "hsl(var(--muted) / 0.5)" }}>
            <p className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              {tx("Bewerbungsauswertung", "Application Evaluation")}
            </p>
            <h2 className="mb-5 font-serif text-xl font-semibold leading-snug text-foreground md:text-2xl">
              {tx(
                "Basierend auf deinen Antworten scheint High‑Ticket Closing sehr gut zu dir zu passen.",
                "Based on your answers, High-Ticket Closing seems like an excellent fit for you."
              )}
            </h2>
            <div className="space-y-4 font-sans text-sm leading-relaxed text-muted-foreground">
              <p>
                {tx(
                  "Wir haben deine Antworten aus dem Quiz analysiert. Dein Profil deutet darauf hin, dass du gute Voraussetzungen mitbringst, um im Bereich High‑Ticket Closing erfolgreich zu sein.",
                  "We've analyzed your quiz answers. Your profile indicates strong potential for success in High-Ticket Closing."
                )}
              </p>
              <p>
                {tx(
                  "Im nächsten Schritt führen wir ein kurzes Strategiegespräch, um gemeinsam herauszufinden:",
                  "Next, we'll have a brief strategy call to determine together:"
                )}
              </p>
            </div>
            <ul className="mt-5 space-y-2 font-sans text-sm text-foreground/80">
              <li className="flex items-start gap-2"><span>•</span> {tx("ob High‑Ticket Closing wirklich zu dir passt", "whether High-Ticket Closing is truly right for you")}</li>
              <li className="flex items-start gap-2"><span>•</span> {tx("wie schnell du erste Einnahmen erzielen kannst", "how quickly you can generate your first income")}</li>
              <li className="flex items-start gap-2"><span>•</span> {tx(`ob du für das ${PRODUCT.name} Programm geeignet bist`, `whether you qualify for the ${PRODUCT.name} program`)}</li>
            </ul>
          </div>
        </motion.section>

        {/* SECTION — Founder Video */}
        <motion.section {...fade} transition={{ delay: 0.12 }} className="mb-16">
          <h2 className="mb-6 text-center font-serif text-xl font-semibold text-foreground">
            {tx("Kurze persönliche Nachricht", "A Brief Personal Message")}
          </h2>
          <div className="flex aspect-video items-center justify-center rounded-sm bg-muted">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary">
                <Play className="h-5 w-5 text-primary-foreground" />
              </div>
              <p className="font-sans text-xs text-muted-foreground">
                {tx("Video-Platzhalter – persönliche Nachricht vom Gründer", "Video placeholder – personal message from the founder")}
              </p>
            </div>
          </div>
        </motion.section>

        {/* SECTION — Preparation PDF Download */}
        <motion.section {...fade} transition={{ delay: 0.15 }} className="mb-16">
          <div className="rounded-sm border-2 border-accent/20 bg-accent/5 p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="h-5 w-5 text-accent" />
              <h3 className="font-serif text-lg font-semibold text-foreground">
                {tx("Gesprächsvorbereitung", "Call Preparation Guide")}
              </h3>
            </div>
            <p className="mb-4 font-sans text-sm text-muted-foreground">
              {tx(
                "Lade dir unsere Vorbereitungsunterlage herunter, damit du optimal vorbereitet in das Gespräch gehst.",
                "Download our preparation guide to ensure you're fully prepared for the call."
              )}
            </p>
            <ul className="mb-5 space-y-2 font-sans text-xs text-foreground/70">
              {[
                tx("Ablauf des Gesprächs", "How the call works"),
                tx("KPI-System Erklärung", "KPI system explained"),
                tx("Häufige Fehler vermeiden", "Common mistakes to avoid"),
                tx("Optimale Vorbereitung", "How to prepare optimally"),
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <button className="flex items-center gap-2 rounded-sm bg-accent px-5 py-3 font-sans text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
              <Download className="h-4 w-4" />
              {tx("PDF herunterladen", "Download PDF")}
            </button>
          </div>
        </motion.section>

        {/* SECTION — What we clarify */}
        <motion.section {...fade} transition={{ delay: 0.18 }} className="mb-16">
          <h3 className="mb-5 font-serif text-lg font-semibold text-foreground">
            {tx("Was wir im Gespräch klären", "What We'll Discuss")}
          </h3>
          <ul className="space-y-3">
            {[
              tx("Deine aktuelle Situation und Ziele", "Your current situation and goals"),
              tx("Ob High‑Ticket Closing der richtige Weg für dich ist", "Whether High-Ticket Closing is the right path for you"),
              tx("Welche nächsten Schritte sinnvoll wären", "What next steps make sense"),
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 font-sans text-sm text-foreground/80">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-8 font-sans text-xs italic leading-relaxed text-muted-foreground">
            {tx(
              "Unser Ziel ist nicht, jedem das Programm zu verkaufen. Sondern gemeinsam herauszufinden, ob High‑Ticket Closing wirklich zu dir passt.",
              "Our goal is not to sell the program to everyone. It's to find out together whether High-Ticket Closing is truly right for you."
            )}
          </p>
        </motion.section>

        {/* SECTION — Choose Your Call Option */}
        <motion.section {...fade} transition={{ delay: 0.22 }} className="mb-16">
          <h2 className="mb-3 text-center font-serif text-2xl font-semibold text-foreground">
            {tx(
              "Wähle, wie schnell du dein Gespräch führen möchtest",
              "Choose How Fast You Want Your Strategy Call"
            )}
          </h2>
          <p className="mb-10 text-center font-sans text-sm text-muted-foreground">
            {tx("Zwei Optionen – du entscheidest, was besser zu dir passt.", "Two options — you decide what works best.")}
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Standard */}
            <div className="flex flex-col rounded-sm border border-border bg-card p-6">
              <h3 className="mb-2 font-serif text-lg font-semibold text-foreground">
                {tx("Standard Strategiegespräch", "Standard Strategy Call")}
              </h3>
              <p className="mb-1 font-sans text-sm font-medium text-primary">
                {tx("Kostenlos", "Free")}
              </p>
              <p className="mb-6 flex-1 font-sans text-xs leading-relaxed text-muted-foreground">
                {tx("Verfügbare Termine in den nächsten Tagen.", "Available slots in the coming days.")}
              </p>
              <button className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-5 py-3 font-sans text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                {tx("Klassischen Termin buchen", "Book Standard Slot")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Priority / Fastlane */}
            <div className="relative flex flex-col rounded-sm border-2 border-accent bg-card p-6 shadow-sm">
              <span className="absolute -top-3 right-4 rounded-sm bg-accent px-3 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                {tx("Empfohlen", "Recommended")}
              </span>
              <h3 className="mb-2 font-serif text-lg font-semibold text-foreground">
                {tx("Priority Strategiegespräch", "Priority Strategy Call")} <span className="text-accent">(Fastlane)</span>
              </h3>
              <p className="mb-1 font-sans text-xs leading-relaxed text-muted-foreground">
                {tx("Sprich noch heute oder morgen mit uns.", "Talk to us today or tomorrow.")}
              </p>
              <div className="relative mb-6 mt-2 flex items-center gap-1.5">
                <p className="font-sans text-sm font-medium text-accent">
                  {tx("29 € Schutzgebühr — wird auf das Programm angerechnet", "€29 deposit — credited toward the program")}
                </p>
                <button
                  className="relative flex-shrink-0"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onClick={() => setShowTooltip(!showTooltip)}
                  aria-label={tx("Mehr Informationen zur Schutzgebühr", "More info about the deposit")}
                >
                  <Info className="h-4 w-4 text-muted-foreground transition-colors hover:text-accent" />
                </button>
                {showTooltip && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-[320px] rounded-md border border-border bg-card p-4 shadow-lg">
                    <div className="space-y-2 font-sans text-xs leading-relaxed text-muted-foreground">
                      <p>{tx("Wir reservieren Fastlane-Termine für Bewerber, die schnell handeln möchten.", "We reserve Fastlane slots for applicants who want to move fast.")}</p>
                      <p>{tx("Um sicherzustellen, dass diese Zeitfenster respektiert werden, erheben wir eine kleine Schutzgebühr von 29 €.", "To ensure these time slots are respected, we charge a small €29 deposit.")}</p>
                      <p>{tx("Die Gebühr wird ", "The fee is ")}<strong className="text-foreground/80">{tx("vollständig auf das Programm angerechnet", "fully credited toward the program")}</strong>{tx(", falls du dich entscheidest teilzunehmen.", " if you decide to join.")}</p>
                    </div>
                  </div>
                )}
              </div>
              <p className="mb-6 flex-1 font-sans text-xs italic leading-relaxed text-muted-foreground">
                {tx("Fastlane-Termine sind für Bewerber reserviert, die schnell handeln möchten.", "Fastlane slots are reserved for applicants who are ready to move fast.")}
              </p>
              <a
                href="/booking?mode=priority"
                onClick={() =>
                  trackFunnelEvent("fastlane_cta_clicked", { surface: "terminbuchung" })
                }
                className="flex w-full items-center justify-center gap-2 rounded-sm bg-accent px-5 py-3 font-sans text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
              >
                {tx("Commitment-Termin heute sichern", "Secure Your Priority Slot Today")}
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </motion.section>

        {/* GHL Calendar Embed Placeholder */}
        <motion.section {...fade} transition={{ delay: 0.25 }} className="mb-16">
          <div className="flex min-h-[400px] items-center justify-center rounded-sm border-2 border-dashed border-border">
            <div className="px-6 text-center">
              <p className="mb-2 font-sans text-sm font-medium text-foreground/70">
                [GHL CALENDAR EMBED HERE]
              </p>
              <p className="font-sans text-xs text-muted-foreground">
                {tx("Ersetze diesen Platzhalter mit dem GoHighLevel Kalender-Widget.", "Replace this placeholder with the GoHighLevel calendar widget.")}
              </p>
            </div>
          </div>
        </motion.section>

        {/* SECTION — What they will get */}
        <motion.section {...fade} transition={{ delay: 0.28 }} className="mb-16">
          <p className="mb-5 font-sans text-sm font-medium text-foreground/80">
            {tx("In diesem Gespräch zeigen wir dir:", "In this call, we'll show you:")}
          </p>
          <ul className="space-y-3">
            {[
              tx("Wie das Ethical Closing System funktioniert", "How the Ethical Closing System works"),
              tx("Wie Top Closer monatlich 5.000 € – 25.000 € verdienen", "How Top Closers earn €5,000 – €25,000/month"),
              tx("Ob du für unser Programm geeignet bist", "Whether you qualify for our program"),
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 font-sans text-sm text-foreground/80">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </motion.section>

        {/* SECTION — Next Steps */}
        <motion.section {...fade} transition={{ delay: 0.3 }} className="mb-16">
          <div className="rounded-sm border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-serif text-lg font-semibold text-foreground">
                {tx("Deine nächsten Schritte", "Your Next Steps")}
              </h3>
            </div>
            <ol className="space-y-3 font-sans text-sm">
              {[
                tx("Termin buchen (Standard oder Priority)", "Book your slot (Standard or Priority)"),
                tx("Vorbereitungs-PDF lesen", "Read the preparation PDF"),
                tx("Pünktlich und vorbereitet erscheinen", "Show up on time and prepared"),
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-foreground/80">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </motion.section>

        {/* SECTION — Trust Signals */}
        <motion.section {...fade} transition={{ delay: 0.33 }} className="mb-16">
          <ul className="flex flex-wrap justify-center gap-x-8 gap-y-2">
            {[
              tx("100% transparent", "100% transparent"),
              tx("Keine versteckten Kosten", "No hidden costs"),
              tx("Schutzgebühr wird angerechnet", "Deposit is credited"),
              tx("Nur für ernsthafte Bewerber", "For serious applicants only"),
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 font-sans text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-accent" />
                {item}
              </li>
            ))}
          </ul>
        </motion.section>

        {/* SECTION — Commitment */}
        <motion.section {...fade} transition={{ delay: 0.36 }}>
          <div className="rounded-sm border border-border px-6 py-6" style={{ background: "hsl(var(--muted) / 0.3)" }}>
            <p className="mb-3 font-sans text-sm font-semibold text-foreground">
              {tx(
                "Wenn du einen Termin buchst: erscheine pünktlich, sei vorbereitet, triff eine Entscheidung.",
                "If you book a slot: show up on time, be prepared, make a decision."
              )}
            </p>
            <p className="font-sans text-xs leading-relaxed text-muted-foreground">
              {tx(
                "Wenn du den Termin nicht wahrnimmst, gibt es keine zweite Möglichkeit.",
                "If you don't attend, there won't be a second chance."
              )}
            </p>
          </div>
        </motion.section>

      </div>
    </div>
  );
};

export default Terminbuchung;
