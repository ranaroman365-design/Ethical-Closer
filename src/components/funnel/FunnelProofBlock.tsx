import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FunnelProofBlockProps {
  quote: string;
  variant?: "light" | "dark";
}

const FunnelProofBlock = ({ quote, variant = "light" }: FunnelProofBlockProps) => (
  <section className={cn("py-16 md:py-24", variant === "dark" ? "bg-funnel-dark" : "bg-white")}>
    <div className="container mx-auto max-w-2xl px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <blockquote className={cn(
          "font-display text-xl md:text-2xl italic leading-relaxed",
          variant === "dark" ? "text-white/80" : "text-funnel-dark/70"
        )}>
          „{quote}"
        </blockquote>
      </motion.div>
    </div>
  </section>
);

export default FunnelProofBlock;
