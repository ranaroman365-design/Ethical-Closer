import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Check, X, ArrowRight } from "lucide-react";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import { cn } from "@/lib/utils";
import { trackFunnelEvent } from "@/lib/track-event";
import { useEffect } from "react";

const benefits = [
  "Strukturierter Karrierepfad",
  "Reale Sales-Situationen",
  "Klarer Weg zu deinem ersten Einkommen",
  "Zugriff auf ein System, nicht nur Inhalte",
];

const fitYes = [
  "Du willst Ergebnisse, nicht Motivation",
  "Du übernimmst Verantwortung",
  'Du suchst kein \u201Evielleicht\u201C, sondern einen Weg',
];

const fitNo = [
  "\u201EIch schau mal\u201C-Mentalit\u00e4t",
  "Ausreden",
  "Keine Zeit / kein Fokus",
];

const FastTrackOffer = () => {
  const navigate = useNavigate();
  const score = parseInt(localStorage.getItem("fast_track_score") || "0", 10);

  useEffect(() => {
    // Guard: score must be >= 50
    if (score < 50) {
      navigate("/booking", { replace: true });
      return;
    }
    trackFunnelEvent("fast_track_offer_view", { score });
  }, [score, navigate]);

  const handleStart = () => {
    trackFunnelEvent("fast_track_offer_cta_click", { score });
    // For now, navigate to booking with fast_track flag
    // Payment integration will be added when Stripe is enabled
    localStorage.setItem("fast_track_used", "true");
    localStorage.setItem("conversion_without_call", "true");
    navigate("/booking?fast_track=true");
  };

  return (
    <div className="min-h-screen bg-funnel-warm-bg text-funnel-dark flex flex-col">
      <div className="flex-1 px-6 py-16">
        <div className="max-w-2xl mx-auto space-y-16">

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center space-y-5"
          >
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-funnel-gold">
              Fast Track
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-semibold leading-[1.15]">
              Wenn du starten willst,
              <br />
              dann starte richtig.
            </h1>
            <p className="font-sans text-lg leading-relaxed opacity-70 max-w-lg mx-auto">
              Kein Theoriekurs.
              <br />
              Ein System, das dich in reale Abschlüsse bringt.
            </p>
          </motion.div>

          {/* Was du bekommst */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="space-y-4"
          >
            <h2 className="font-display text-xl font-semibold uppercase tracking-wide">
              Was du bekommst
            </h2>
            <div className="grid gap-3">
              {benefits.map((b) => (
                <div key={b} className="flex items-start gap-3 bg-white border border-funnel-sand/40 rounded-sm p-4">
                  <Check className="h-5 w-5 text-funnel-gold shrink-0 mt-0.5" />
                  <span className="font-sans text-base">{b}</span>
                </div>
              ))}
            </div>
          </motion.section>

          {/* Wer hier reinpasst */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="space-y-6"
          >
            <h2 className="font-display text-xl font-semibold uppercase tracking-wide">
              Wer hier reinpasst
            </h2>
            <p className="font-sans text-base opacity-70">
              Dieses Programm ist nicht für jeden.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                {fitYes.map((y) => (
                  <div key={y} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-funnel-gold shrink-0 mt-1" />
                    <span className="font-sans text-sm">{y}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {fitNo.map((n) => (
                  <div key={n} className="flex items-start gap-2 opacity-50">
                    <X className="h-4 w-4 shrink-0 mt-1" />
                    <span className="font-sans text-sm">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          {/* CTA Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-center space-y-6 py-8"
          >
            <h2 className="font-display text-2xl md:text-3xl font-semibold">
              Du kannst heute starten.
            </h2>
            <p className="font-sans text-base opacity-70 max-w-md mx-auto">
              Kein Warten.
              <br />
              Kein weiterer Schritt nötig.
              <br /><br />
              Wenn du bereit bist, beginnt dein Einstieg sofort.
            </p>

            <button
              onClick={handleStart}
              className="inline-flex items-center gap-2 px-12 py-5 rounded-sm font-sans font-bold text-lg transition-all bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90 shadow-lg"
            >
              <Zap className="h-5 w-5" />
              Jetzt starten
            </button>

            <p className="text-xs opacity-50">Sofortiger Zugang nach Bestätigung</p>

            <p className="text-xs opacity-40 mt-4">
              Wir arbeiten nur mit einer begrenzten Anzahl an Teilnehmern.
            </p>
          </motion.section>

        </div>
      </div>
      <FunnelFooter />
    </div>
  );
};

export default FastTrackOffer;
