import { motion } from "framer-motion";
import { XCircle, ArrowRight, BookOpen } from "lucide-react";
import FunnelFooter from "@/components/funnel/FunnelFooter";

/**
 * No-call fallback page for low-qualification leads.
 * Shown when qualification_bucket = "low".
 * Polite, honest, non-burning — but no booking access.
 */
const NoCallOutcome = () => (
  <div className="min-h-screen bg-funnel-warm-bg text-funnel-dark flex flex-col">
    <div className="flex-1 flex items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg text-center space-y-8"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-funnel-red/10">
          <XCircle className="h-7 w-7 text-funnel-red" />
        </div>

        <h1 className="font-display text-2xl md:text-3xl font-semibold leading-[1.15]">
          Aktuell ist kein Termin möglich.
        </h1>

        <p className="font-sans text-base leading-relaxed text-funnel-grey max-w-md mx-auto">
          Basierend auf deinen Antworten sehen wir, dass der Zeitpunkt gerade nicht ideal ist.
          Das ist kein Urteil — sondern Ehrlichkeit.
        </p>

        <div className="rounded-sm border border-funnel-sand bg-white p-6 text-left space-y-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-funnel-teal shrink-0" />
            <h3 className="font-display text-lg font-semibold">Was du jetzt tun kannst:</h3>
          </div>
          <ul className="space-y-2.5 font-sans text-sm text-funnel-grey">
            <li className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-funnel-teal" />
              <span>Kläre deine aktuelle Situation und dein Commitment</span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-funnel-teal" />
              <span>Wenn sich deine Lage verändert, kannst du den Test jederzeit wiederholen</span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-funnel-teal" />
              <span>Wir verschwenden keine Zeit — weder deine noch unsere</span>
            </li>
          </ul>
        </div>

        <p className="font-sans text-xs text-funnel-grey/60">
          Ethical Closing ist nicht für jeden — und das ist okay.
        </p>
      </motion.div>
    </div>
    <FunnelFooter />
  </div>
);

export default NoCallOutcome;
