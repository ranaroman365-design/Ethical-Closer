/**
 * Inline Masterclass Teaser shown at the END of the quiz flow when the
 * lead arrived with `?intent=masterclass` (soft-yes ladder step).
 *
 * Goals:
 *  - No detour: the access trigger is rendered in the same flow, the user
 *    never has to navigate back to /start/masterclass on their own.
 *  - Keep the booking path warm: secondary CTA still leads into /booking,
 *    so a soft-yes can convert into a hard-yes in the same session.
 *  - Track everything: dedicated soft-yes events for funnel attribution.
 */
import { motion } from "framer-motion";
import { ArrowRight, PlayCircle, Calendar } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { trackFunnelEvent } from "@/lib/track-event";
import { resolveVariant, EXPERIMENTS } from "@/lib/experiments";

interface MasterclassTeaserProps {
  funnelId: string;
  qualificationBucket: string;
  /** Class string for the primary button — inherits funnel accent colors. */
  buttonClass: string;
}

const MasterclassTeaser = ({
  funnelId,
  qualificationBucket,
  buttonClass,
}: MasterclassTeaserProps) => {
  const navigate = useNavigate();
  const variant = resolveVariant(EXPERIMENTS.LADDER_VS_ROUTE);
  const experimentMeta = {
    experiment_id: EXPERIMENTS.LADDER_VS_ROUTE.id,
    variant,
  };

  useEffect(() => {
    // Soft-yes pathway view — distinct from the hard-yes /booking step.
    trackFunnelEvent("masterclass_teaser_view", {
      funnel: funnelId,
      qualification_bucket: qualificationBucket,
      intent: "masterclass",
      ladder_step: "soft_yes",
      ...experimentMeta,
    });
  }, [funnelId, qualificationBucket]);

  const handleStartMasterclass = () => {
    trackFunnelEvent("masterclass_unlock_click", {
      funnel: funnelId,
      qualification_bucket: qualificationBucket,
      intent: "masterclass",
      ladder_step: "soft_yes",
      destination: "/start/masterclass",
      ...experimentMeta,
    });
    navigate("/start/masterclass");
  };

  const handleBookCall = () => {
    trackFunnelEvent("masterclass_teaser_secondary_click", {
      funnel: funnelId,
      qualification_bucket: qualificationBucket,
      intent: "masterclass",
      ladder_step: "soft_yes_to_hard_yes",
      destination: `/booking?q=${qualificationBucket}`,
      ...experimentMeta,
    });
    navigate(`/booking?q=${qualificationBucket}`);
  };

  return (
    <motion.div
      key="masterclass-teaser"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-8 text-center"
    >
      {/* Status pill */}
      <div className="flex items-center justify-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-funnel-red opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-funnel-red" />
        </span>
        <span className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-funnel-red">
          Zugang freigeschaltet
        </span>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-3xl md:text-4xl font-semibold leading-tight">
          Deine Masterclass wartet.
        </h2>
        <p className="mx-auto max-w-md font-sans text-base leading-relaxed opacity-70">
          Du erfüllst die Voraussetzungen. Du kannst die 32-minütige Masterclass
          jetzt sofort starten – ohne Umwege, ohne weitere Schritte.
        </p>
      </div>

      {/* Inline player stub — visual access trigger */}
      <button
        onClick={handleStartMasterclass}
        className="group block w-full overflow-hidden rounded-sm border border-funnel-sand/60 bg-funnel-dark transition-all hover:border-funnel-red active:scale-[0.99]"
      >
        <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-funnel-dark via-funnel-dark to-funnel-red/20">
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-funnel-red/90 transition-transform group-hover:scale-110">
              <PlayCircle className="h-10 w-10 text-white" />
            </span>
            <span className="font-sans text-sm font-medium uppercase tracking-[0.15em] text-white/90">
              Jetzt ansehen · 32 Min
            </span>
          </div>
        </div>
      </button>

      {/* Primary CTA — direct masterclass entry */}
      <div className="space-y-4">
        <button
          onClick={handleStartMasterclass}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-sm px-10 py-4 font-sans text-base font-semibold transition-all sm:w-auto ${buttonClass}`}
        >
          Masterclass starten
          <ArrowRight className="h-4 w-4" />
        </button>

        <div className="space-y-2">
          <p className="font-sans text-xs uppercase tracking-[0.15em] text-funnel-grey">
            Oder direkt mit einem Mentor sprechen
          </p>
          <button
            onClick={handleBookCall}
            className="inline-flex items-center gap-2 font-sans text-sm font-medium text-funnel-dark/70 underline-offset-4 transition-colors hover:text-funnel-dark hover:underline"
          >
            <Calendar className="h-4 w-4" />
            Strategie-Call buchen
          </button>
        </div>
      </div>

      <p className="mx-auto max-w-sm font-sans text-xs text-funnel-grey">
        Kein Risiko · Sofortiger Zugang · Du kannst jederzeit pausieren.
      </p>
    </motion.div>
  );
};

export default MasterclassTeaser;
