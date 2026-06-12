import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Quote } from "lucide-react";

interface FunnelProofLayerProps {
  statements: string[];
  variant: "sand" | "red" | "gold";
}

const accentLine = {
  sand: "bg-funnel-teal",
  red: "bg-funnel-red",
  gold: "bg-funnel-gold",
};

const FunnelProofLayer = ({ statements, variant }: FunnelProofLayerProps) => (
  <section className="py-20 md:py-28 bg-background">
    <div className="container mx-auto max-w-2xl px-6">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="space-y-8"
      >
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Transformationen
        </p>
        <div className="space-y-6">
          {statements.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="flex gap-4"
            >
              <div className={cn("w-0.5 shrink-0 rounded-full", accentLine[variant])} />
              <p className="font-serif text-base md:text-lg leading-relaxed text-foreground/80 italic">
                "{s}"
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  </section>
);

export default FunnelProofLayer;
