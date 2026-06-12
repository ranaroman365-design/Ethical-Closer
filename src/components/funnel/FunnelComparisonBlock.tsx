import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ComparisonItem {
  label: string;
  result: string;
  variant: "muted" | "accent" | "highlight";
}

interface FunnelComparisonBlockProps {
  items: ComparisonItem[];
}

const itemStyles = {
  muted: "bg-funnel-grey/10 border-funnel-grey/20 text-funnel-dark",
  accent: "bg-funnel-dark text-white border-funnel-dark",
  highlight: "bg-funnel-gold/15 border-funnel-gold/50 text-funnel-dark",
};

const resultStyles = {
  muted: "text-funnel-grey",
  accent: "text-white/70",
  highlight: "text-funnel-gold font-semibold",
};

const FunnelComparisonBlock = ({ items }: FunnelComparisonBlockProps) => (
  <section className="py-20 md:py-28 bg-funnel-warm-bg">
    <div className="container mx-auto max-w-2xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="space-y-4"
      >
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "rounded-sm border p-6 md:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2",
              itemStyles[item.variant]
            )}
          >
            <span className="font-display text-xl md:text-2xl font-semibold">{item.label}</span>
            <span className={cn("font-sans text-base md:text-lg", resultStyles[item.variant])}>
              → {item.result}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default FunnelComparisonBlock;
