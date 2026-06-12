import { useNavigate } from "react-router-dom";
import { Zap, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Fast Track entry card for L0 applicant dashboard.
 * Prominent but not aggressive — pull mechanic.
 */
export default function FastTrackEntry() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="relative overflow-hidden rounded-sm border border-funnel-gold/30 bg-gradient-to-br from-funnel-gold/5 to-funnel-gold/10 p-6 space-y-4"
    >
      {/* Accent bar */}
      <div className="absolute top-0 left-0 w-full h-0.5 bg-funnel-gold" />

      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-funnel-gold" />
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-funnel-gold">
          Fast Track
        </span>
      </div>

      <h3 className="font-display text-xl font-semibold text-funnel-dark leading-tight">
        Du kannst heute starten — ohne Gespräch.
      </h3>

      <p className="font-sans text-sm text-funnel-dark/70 leading-relaxed">
        Wenn du die Voraussetzungen erfüllst, musst du nicht warten.
        <br />
        Prüfe jetzt, ob du direkt einsteigen kannst.
      </p>

      <button
        onClick={() => navigate("/fast-track/quiz")}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-sm font-sans font-semibold text-sm transition-all bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90"
      >
        Jetzt prüfen
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}
