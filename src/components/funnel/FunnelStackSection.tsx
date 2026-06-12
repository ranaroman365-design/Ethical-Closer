import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FunnelStackSectionProps {
  headline?: string;
  items: { text: string; result?: string }[];
  variant?: "light" | "dark";
  arrow?: string;
}

const FunnelStackSection = ({ headline, items, variant = "light", arrow }: FunnelStackSectionProps) => (
  <section className={cn("py-20 md:py-28", variant === "dark" ? "bg-funnel-dark text-white" : "bg-funnel-warm-bg text-funnel-dark")}>
    <div className="container mx-auto max-w-2xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="space-y-6"
      >
        {headline && (
          <h2 className="font-display text-2xl md:text-3xl font-semibold mb-8">{headline}</h2>
        )}
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.text}
              className={cn(
                "flex items-start gap-3 font-sans text-base md:text-lg",
                variant === "dark" ? "opacity-85" : "opacity-80"
              )}
            >
              <span className={cn(
                "mt-2 h-2 w-2 rounded-full shrink-0",
                variant === "dark" ? "bg-funnel-gold" : "bg-funnel-teal"
              )} />
              <span>
                {item.text}
                {item.result && (
                  <span className="opacity-60"> → {item.result}</span>
                )}
              </span>
            </div>
          ))}
        </div>
        {arrow && (
          <p className="font-sans text-base md:text-lg font-semibold mt-6 opacity-90">
            👉 {arrow}
          </p>
        )}
      </motion.div>
    </div>
  </section>
);

export default FunnelStackSection;
