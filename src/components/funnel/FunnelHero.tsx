import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface FunnelHeroProps {
  headline: string;
  sub: string;
  ctaPrimary: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
  variant: "sand" | "red" | "dark";
}

const variantStyles = {
  sand: "bg-funnel-warm-bg text-funnel-dark",
  red: "bg-gradient-to-br from-funnel-dark via-funnel-dark to-funnel-red/20 text-white",
  dark: "bg-funnel-dark text-white",
};

const ctaStyles = {
  sand: "bg-funnel-teal text-white hover:bg-funnel-teal/90",
  red: "bg-funnel-red text-white hover:bg-funnel-red/90",
  dark: "bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90",
};

const secondaryStyles = {
  sand: "border-funnel-dark/20 text-funnel-dark hover:bg-funnel-dark/5",
  red: "border-white/30 text-white hover:bg-white/10",
  dark: "border-funnel-gold/40 text-funnel-gold hover:bg-funnel-gold/10",
};

const FunnelHero = ({ headline, sub, ctaPrimary, ctaSecondary, variant }: FunnelHeroProps) => (
  <section className={cn("min-h-[90vh] flex items-center relative overflow-hidden", variantStyles[variant])}>
    <div className="container mx-auto max-w-3xl px-6 py-24 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="space-y-8"
      >
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.1] tracking-tight">
          {headline}
        </h1>
        <p className="font-sans text-lg md:text-xl leading-relaxed opacity-80 max-w-xl whitespace-pre-line">
          {sub}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <Link
            to={ctaPrimary.href}
            className={cn(
              "inline-flex items-center justify-center gap-2 px-8 py-4 rounded-sm font-sans font-semibold text-base transition-all",
              ctaStyles[variant]
            )}
          >
            {ctaPrimary.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
          {ctaSecondary && (
            <Link
              to={ctaSecondary.href}
              className={cn(
                "inline-flex items-center justify-center gap-2 px-8 py-4 rounded-sm font-sans font-medium text-base border transition-all",
                secondaryStyles[variant]
              )}
            >
              {ctaSecondary.label}
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  </section>
);

export default FunnelHero;
