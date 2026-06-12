import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FunnelMicroCommitProps {
  items: string[];
  variant: "sand" | "red" | "gold";
}

const checkColor = {
  sand: "text-funnel-teal",
  red: "text-funnel-red",
  gold: "text-funnel-gold",
};

const FunnelMicroCommit = ({ items, variant }: FunnelMicroCommitProps) => (
  <section className="py-16 md:py-20 bg-background">
    <div className="container mx-auto max-w-xl px-6">
      <div className="space-y-4">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12, duration: 0.4 }}
            className="flex items-start gap-3"
          >
            <CheckCircle2 className={cn("mt-0.5 h-5 w-5 shrink-0", checkColor[variant])} />
            <span className="font-sans text-[15px] leading-relaxed text-foreground/80">{item}</span>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default FunnelMicroCommit;
