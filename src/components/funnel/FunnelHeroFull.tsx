import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowRight, Shield } from "lucide-react";

interface FunnelHeroFullProps {
  headline: string;
  sub: string;
  ctaLabel: string;
  onCtaClick: () => void;
  imageSrc: string;
  variant: "sand" | "red" | "gold";
}

const overlayStyles = {
  sand: "from-funnel-warm-bg/95 via-funnel-warm-bg/70 to-transparent",
  red: "from-funnel-dark/95 via-funnel-dark/80 to-funnel-dark/40",
  gold: "from-funnel-dark/95 via-funnel-dark/80 to-funnel-dark/40",
};

const ctaBtnStyles = {
  sand: "bg-funnel-teal text-white hover:bg-funnel-teal/90",
  red: "bg-funnel-red text-white hover:bg-funnel-red/90",
  gold: "bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90",
};

const textColor = {
  sand: "text-funnel-dark",
  red: "text-white",
  gold: "text-white",
};

const FunnelHeroFull = ({ headline, sub, ctaLabel, onCtaClick, imageSrc, variant }: FunnelHeroFullProps) => (
  <section className="relative h-[75vh] min-h-[520px] max-h-[720px] flex items-end overflow-hidden">
    {/* Background image */}
    <img
      src={imageSrc}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      loading="eager"
    />
    {/* Gradient overlay — stronger on mobile for readability */}
    <div className={cn("absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r", overlayStyles[variant])} />

    <div className={cn("container relative z-10 mx-auto max-w-3xl px-5 pb-8 md:pb-16 md:pt-32", textColor[variant])}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="space-y-4 md:space-y-6"
      >
        <h1 className="font-display text-[28px] md:text-4xl lg:text-5xl font-semibold leading-[1.15] tracking-tight max-w-[20ch]">
          {headline}
        </h1>
        <p className="font-sans text-base md:text-lg leading-relaxed opacity-85 max-w-sm whitespace-pre-line">
          {sub}
        </p>

        <div className="pt-1">
          <button
            onClick={onCtaClick}
            className={cn(
              "group inline-flex w-full sm:w-auto items-center justify-center gap-2 px-8 py-3.5 rounded-lg font-sans font-semibold text-[15px] transition-all hover:scale-[1.02] active:scale-[0.98]",
              ctaBtnStyles[variant]
            )}
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Trust signal */}
        <div className="flex items-center gap-2 opacity-60">
          <Shield className="h-3.5 w-3.5" />
          <span className="font-sans text-xs tracking-wide">
            100% anonym • 40 Sekunden • keine Verpflichtung
          </span>
        </div>
      </motion.div>
    </div>
  </section>
);

export default FunnelHeroFull;
