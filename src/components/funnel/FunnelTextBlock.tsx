import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface FunnelTextBlockProps {
  headline?: string;
  children: ReactNode;
  variant?: "light" | "dark" | "muted";
  className?: string;
  arrow?: string;
}

const bgStyles = {
  light: "bg-funnel-warm-bg text-funnel-dark",
  dark: "bg-funnel-dark text-white",
  muted: "bg-white text-funnel-dark",
};

const FunnelTextBlock = ({ headline, children, variant = "light", className, arrow }: FunnelTextBlockProps) => (
  <section className={cn("py-20 md:py-28", bgStyles[variant], className)}>
    <div className="container mx-auto max-w-2xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="space-y-6"
      >
        {headline && (
          <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight">
            {headline}
          </h2>
        )}
        <div className="font-sans text-lg md:text-xl leading-relaxed opacity-85 space-y-4">
          {children}
        </div>
        {arrow && (
          <p className="font-sans text-lg md:text-xl font-semibold opacity-90 pt-2">
            👉 {arrow}
          </p>
        )}
      </motion.div>
    </div>
  </section>
);

export default FunnelTextBlock;
