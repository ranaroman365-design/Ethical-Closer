import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import { trackFunnelEvent } from "@/lib/track-event";

const steps = [
  "Bewerbung ausfüllen",
  "Klarheitsgespräch buchen",
  "Deinen Weg starten",
];

const fade = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 } };

/**
 * ETC-specific thank-you page at /danke
 * This page belongs ONLY to the Ethical Top Closer main funnel.
 * Freiheit/Lifestyle/Income funnels have their own thank-you pages.
 */
const ThankYou = () => {
  useEffect(() => {
    trackFunnelEvent("thank_you_view", { funnel: "etc" });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-lg px-6 py-20 md:py-28">

        <motion.div {...fade} transition={{ duration: 0.7 }} className="text-center mb-12">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] mb-4 text-accent">
            Qualifikation abgeschlossen
          </p>
          <h1 className="font-serif text-[28px] md:text-4xl font-semibold leading-[1.15] mb-4">
            Du bist einen Schritt weiter.
          </h1>
          <p className="font-sans text-base md:text-lg leading-relaxed text-muted-foreground">
            Deine Antworten zeigen, dass Ethical Closing zu dir passen könnte. Bewirb dich jetzt für ein Klarheitsgespräch.
          </p>
        </motion.div>

        <motion.div {...fade} transition={{ delay: 0.15, duration: 0.6 }} className="mb-12">
          <h2 className="font-serif text-lg font-semibold mb-5">Deine nächsten Schritte:</h2>
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-4 font-sans text-base">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold bg-accent/15 text-accent">
                  {i + 1}
                </span>
                <span className="text-foreground/85">{step}</span>
              </li>
            ))}
          </ol>
        </motion.div>

        <motion.div {...fade} transition={{ delay: 0.3, duration: 0.6 }} className="text-center mb-6">
          <Link
            to="/start/bewerbung"
            onClick={() => trackFunnelEvent("thank_you_cta_click", { funnel: "etc" })}
            className="inline-flex w-full items-center justify-center gap-2 px-10 py-4 rounded-sm font-sans font-semibold text-base transition-all hover:opacity-90 bg-accent text-accent-foreground"
          >
            Jetzt bewerben
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>

        <motion.div {...fade} transition={{ delay: 0.4, duration: 0.6 }} className="text-center">
          <div className="flex items-center justify-center gap-2 text-muted-foreground/50">
            <Shield className="h-3.5 w-3.5" />
            <span className="font-sans text-xs tracking-wide">
              Kein Verkaufsgespräch • Vertraulich • Ehrliche Einschätzung
            </span>
          </div>
        </motion.div>

      </div>
      <FunnelFooter />
    </div>
  );
};

export default ThankYou;
