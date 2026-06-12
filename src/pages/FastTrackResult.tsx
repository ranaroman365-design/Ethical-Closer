import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, Zap, CheckCircle2 } from "lucide-react";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import { cn } from "@/lib/utils";
import type { FastTrackBucket } from "@/lib/fast-track-engine";

const FastTrackResult = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const bucket = (params.get("bucket") as FastTrackBucket) || "low";
  const score = parseInt(params.get("score") || "0", 10);

  return (
    <div className="min-h-screen bg-funnel-warm-bg text-funnel-dark flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-lg text-center space-y-8"
        >
          {bucket === "high" && <HighResult onStart={() => navigate("/fast-track/offer")} />}
          {bucket === "mid" && (
            <MidResult
              onBook={() => navigate("/booking")}
              onStart={() => navigate("/fast-track/offer")}
            />
          )}
          {bucket === "low" && <LowResult onBook={() => navigate("/booking")} />}

          {/* Micro-trust */}
          <p className="text-xs text-funnel-grey/60 mt-6">
            Keine unnötigen Schritte. Klare Entscheidung.
          </p>
        </motion.div>
      </div>
      <FunnelFooter />
    </div>
  );
};

/* ─── HIGH ─── */
function HighResult({ onStart }: { onStart: () => void }) {
  return (
    <>
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-funnel-gold/15 text-funnel-gold text-xs font-semibold uppercase tracking-widest">
        <CheckCircle2 className="h-3.5 w-3.5" /> Qualifiziert
      </div>

      <h1 className="font-display text-3xl md:text-4xl font-semibold leading-[1.15]">
        Du bist bereit.
      </h1>

      <p className="font-sans text-lg leading-relaxed opacity-70 max-w-md mx-auto">
        Basierend auf deinen Antworten erfüllst du die Voraussetzungen, direkt zu starten.
      </p>

      <div className="bg-white border border-funnel-sand/40 rounded-sm p-6 text-left space-y-3">
        <p className="font-sans text-base leading-relaxed opacity-80">
          Die meisten Bewerber gehen den klassischen Weg über ein Gespräch.
        </p>
        <p className="font-sans text-base font-semibold">
          Du musst das nicht.
        </p>
        <p className="font-sans text-base leading-relaxed opacity-80">
          Wenn du willst, kannst du heute starten.
        </p>
      </div>

      <button
        onClick={onStart}
        className="inline-flex items-center gap-2 px-10 py-4 rounded-sm font-sans font-semibold text-base transition-all bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90"
      >
        <Zap className="h-4 w-4" />
        Heute starten
      </button>
      <p className="text-xs opacity-50">Sofortiger Zugang nach Bestätigung</p>
    </>
  );
}

/* ─── MID ─── */
function MidResult({ onBook, onStart }: { onBook: () => void; onStart: () => void }) {
  return (
    <>
      <h1 className="font-display text-3xl md:text-4xl font-semibold leading-[1.15]">
        Du bist geeignet — aber nicht eindeutig.
      </h1>

      <p className="font-sans text-lg leading-relaxed opacity-70 max-w-md mx-auto">
        Du hast Potenzial, aber wir empfehlen dir ein Gespräch, um die richtige Entscheidung zu treffen.
        <br /><br />
        Wenn du dir sicher bist, kannst du trotzdem direkt starten.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onBook}
          className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-sm font-sans font-semibold text-base transition-all border border-funnel-dark/20 hover:bg-funnel-dark/5"
        >
          <Calendar className="h-4 w-4" />
          Termin buchen
        </button>
        <button
          onClick={onStart}
          className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-sm font-sans font-semibold text-base transition-all bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90"
        >
          <Zap className="h-4 w-4" />
          Direkt starten
        </button>
      </div>
    </>
  );
}

/* ─── LOW ─── */
function LowResult({ onBook }: { onBook: () => void }) {
  return (
    <>
      <h1 className="font-display text-3xl md:text-4xl font-semibold leading-[1.15]">
        Ein Gespräch ist sinnvoll.
      </h1>

      <p className="font-sans text-lg leading-relaxed opacity-70 max-w-md mx-auto">
        Basierend auf deinen Antworten ist es sinnvoll, zuerst Klarheit im Gespräch zu schaffen.
        <br /><br />
        So stellen wir sicher, dass du die richtige Entscheidung triffst.
      </p>

      <button
        onClick={onBook}
        className="inline-flex items-center gap-2 px-10 py-4 rounded-sm font-sans font-semibold text-base transition-all bg-funnel-dark text-white hover:bg-funnel-dark/90"
      >
        <Calendar className="h-4 w-4" />
        Termin buchen
      </button>
    </>
  );
}

export default FastTrackResult;
