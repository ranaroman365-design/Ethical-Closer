import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { X, Check } from "lucide-react";

interface FunnelConversionBoostProps {
  variant: "sand" | "red" | "gold";
}

const accentColor = {
  sand: "text-funnel-teal",
  red: "text-funnel-red",
  gold: "text-funnel-gold",
};

const fails = [
  "Kein klarer Skill",
  "Keine Struktur",
  "Kein Umfeld",
];

const wins = [
  "Klare Methodik",
  "Messbare KPIs",
  "System statt Zufall",
];

const FunnelConversionBoost = ({ variant }: FunnelConversionBoostProps) => (
  <section className="py-14 md:py-20 bg-background">
    <div className="container mx-auto max-w-lg px-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5 }}
        className="space-y-8"
      >
        {/* Fail column */}
        <div className="space-y-3">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Warum die meisten scheitern
          </p>
          <div className="space-y-2">
            {fails.map((item, i) => (
              <div key={i} className="flex items-center gap-3 font-sans text-sm text-foreground/70">
                <X className="h-4 w-4 shrink-0 text-destructive/60" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Win column */}
        <div className="space-y-3">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Was hier anders ist
          </p>
          <div className="space-y-2">
            {wins.map((item, i) => (
              <div key={i} className="flex items-center gap-3 font-sans text-sm text-foreground/90 font-medium">
                <Check className={cn("h-4 w-4 shrink-0", accentColor[variant])} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

export default FunnelConversionBoost;
