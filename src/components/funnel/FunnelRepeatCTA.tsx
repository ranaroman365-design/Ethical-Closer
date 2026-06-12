import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowRight, Shield } from "lucide-react";

interface FunnelRepeatCTAProps {
  headline: string;
  ctaLabel: string;
  onCtaClick: () => void;
  variant: "sand" | "red" | "gold";
}

const bgStyles = {
  sand: "bg-funnel-warm-bg",
  red: "bg-funnel-dark",
  gold: "bg-funnel-dark",
};

const textStyles = {
  sand: "text-funnel-dark",
  red: "text-white",
  gold: "text-white",
};

const btnStyles = {
  sand: "bg-funnel-teal text-white hover:bg-funnel-teal/90",
  red: "bg-funnel-red text-white hover:bg-funnel-red/90",
  gold: "bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90",
};

const FunnelRepeatCTA = ({ headline, ctaLabel, onCtaClick, variant }: FunnelRepeatCTAProps) => (
  <section className={cn("py-20 md:py-28", bgStyles[variant])}>
    <div className="container mx-auto max-w-xl px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="space-y-6"
      >
        <h2 className={cn("font-display text-2xl md:text-3xl font-semibold", textStyles[variant])}>
          {headline}
        </h2>
        <button
          onClick={onCtaClick}
          className={cn(
            "group inline-flex items-center justify-center gap-2 px-10 py-4 rounded-sm font-sans font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98]",
            btnStyles[variant]
          )}
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
        <p className={cn("font-sans text-xs tracking-wide opacity-50", textStyles[variant])}>
          <Shield className="inline h-3 w-3 mr-1" />
          100% anonym • keine Verpflichtung
        </p>
      </motion.div>
    </div>
  </section>
);

export default FunnelRepeatCTA;
