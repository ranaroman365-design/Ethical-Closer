import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

interface FunnelCTASectionProps {
  headline?: string;
  ctas: { label: string; href: string }[];
  variant: "teal" | "red" | "gold";
}

const bgStyles = {
  teal: "bg-funnel-teal/5",
  red: "bg-funnel-dark",
  gold: "bg-funnel-dark",
};

const primaryStyles = {
  teal: "bg-funnel-teal text-white hover:bg-funnel-teal/90",
  red: "bg-funnel-red text-white hover:bg-funnel-red/90",
  gold: "bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90",
};

const secondaryTextStyles = {
  teal: "text-funnel-dark hover:text-funnel-teal",
  red: "text-white/70 hover:text-white",
  gold: "text-funnel-gold/70 hover:text-funnel-gold",
};

const FunnelCTASection = ({ headline, ctas, variant }: FunnelCTASectionProps) => (
  <section className={cn("py-20 md:py-28", bgStyles[variant])}>
    <div className="container mx-auto max-w-xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="text-center space-y-6"
      >
        {headline && (
          <h2 className={cn(
            "font-display text-2xl md:text-3xl font-semibold",
            variant === "red" || variant === "gold" ? "text-white" : "text-funnel-dark"
          )}>
            {headline}
          </h2>
        )}
        <div className="flex flex-col gap-3 pt-4">
          {ctas.map((cta, i) => (
            <Link
              key={cta.label}
              to={cta.href}
              className={cn(
                "inline-flex items-center justify-center gap-2 px-8 py-4 rounded-sm font-sans font-semibold text-base transition-all",
                i === 0
                  ? primaryStyles[variant]
                  : cn("bg-transparent underline-offset-4 hover:underline", secondaryTextStyles[variant])
              )}
            >
              {i === 0 && <ArrowRight className="h-4 w-4" />}
              {cta.label}
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  </section>
);

export default FunnelCTASection;
