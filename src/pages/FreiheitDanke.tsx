import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import { trackFunnelEvent } from "@/lib/track-event";

const steps = [
  "Kurze Bewerbung ausfüllen",
  "Passenden Termin wählen",
  "Klarheit gewinnen",
];

const fade = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 } };

const FreiheitDanke = () => {
  useEffect(() => {
    trackFunnelEvent("thank_you_view", { funnel: "freiheit" });
  }, []);

  return (
    <div className="min-h-screen bg-funnel-warm-bg text-funnel-dark">
      <div className="mx-auto max-w-lg px-6 py-20 md:py-28">

        <motion.div {...fade} transition={{ duration: 0.7 }} className="text-center mb-12">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] mb-4 text-funnel-gold">
            Auswertung abgeschlossen
          </p>
          <h1 className="font-display text-[28px] md:text-4xl font-semibold leading-[1.15] mb-4">
            Das passt zu dir.
          </h1>
          <p className="font-sans text-base md:text-lg leading-relaxed opacity-75">
            Basierend auf deinen Antworten haben wir einen klaren Weg für dich.
          </p>
        </motion.div>

        <motion.div {...fade} transition={{ delay: 0.15, duration: 0.6 }} className="mb-12">
          <h2 className="font-display text-lg font-semibold mb-5">Was jetzt passiert:</h2>
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-4 font-sans text-base">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold bg-funnel-gold/15 text-funnel-gold">
                  {i + 1}
                </span>
                <span className="opacity-85">{step}</span>
              </li>
            ))}
          </ol>
        </motion.div>

        <motion.div {...fade} transition={{ delay: 0.3, duration: 0.6 }} className="text-center mb-6">
          <Link
            to="/freiheit/bewerbung"
            onClick={() => trackFunnelEvent("thank_you_cta_click", { funnel: "freiheit" })}
            className="inline-flex w-full items-center justify-center gap-2 px-10 py-4 rounded-lg font-sans font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98] bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90"
          >
            Zur Bewerbung
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>

        <motion.div {...fade} transition={{ delay: 0.4, duration: 0.6 }} className="text-center">
          <div className="flex items-center justify-center gap-2 opacity-50">
            <Shield className="h-3.5 w-3.5" />
            <span className="font-sans text-xs tracking-wide">
              Keine Verpflichtung • Kein Druck • Klare Einschätzung deiner Situation
            </span>
          </div>
        </motion.div>

      </div>
      <FunnelFooter />
    </div>
  );
};

export default FreiheitDanke;
