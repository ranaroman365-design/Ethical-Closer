import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface FunnelHighlightBlockProps {
  headline: string;
  items: string[];
  variant: "teal" | "dark" | "purple" | "gold" | "red";
  arrow?: string;
}

const styles = {
  teal: "bg-funnel-teal/10 border-funnel-teal/30 text-funnel-dark",
  dark: "bg-funnel-dark text-white border-funnel-dark",
  purple: "bg-funnel-purple text-white border-funnel-purple",
  gold: "bg-funnel-gold/10 border-funnel-gold/40 text-funnel-dark",
  red: "bg-funnel-red/10 border-funnel-red/30 text-funnel-dark",
};

const checkColors = {
  teal: "text-funnel-teal",
  dark: "text-funnel-gold",
  purple: "text-funnel-gold",
  gold: "text-funnel-gold",
  red: "text-funnel-red",
};

const FunnelHighlightBlock = ({ headline, items, variant, arrow }: FunnelHighlightBlockProps) => (
  <section className="py-20 md:py-28 bg-funnel-warm-bg">
    <div className="container mx-auto max-w-2xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className={cn("rounded-sm border p-8 md:p-12", styles[variant])}
      >
        <h2 className="font-display text-2xl md:text-3xl font-semibold mb-8">
          {headline}
        </h2>
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <Check className={cn("mt-1 h-5 w-5 shrink-0", checkColors[variant])} strokeWidth={2} />
              <span className="font-sans text-base md:text-lg opacity-90">{item}</span>
            </li>
          ))}
        </ul>
        {arrow && (
          <p className="font-sans text-base md:text-lg font-semibold mt-8 opacity-90">
            👉 {arrow}
          </p>
        )}
      </motion.div>
    </div>
  </section>
);

export default FunnelHighlightBlock;
