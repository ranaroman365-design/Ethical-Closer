import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FunnelTransitionProps {
  headline: string;
  body: string;
  variant: "sand" | "red" | "gold";
}

const bgStyles = {
  sand: "bg-funnel-warm-bg text-funnel-dark",
  red: "bg-funnel-dark text-white",
  gold: "bg-funnel-dark text-white",
};

const FunnelTransition = ({ headline, body, variant }: FunnelTransitionProps) => (
  <section className={cn("py-20 md:py-28", bgStyles[variant])}>
    <div className="container mx-auto max-w-2xl px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="space-y-6"
      >
        <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight">
          {headline}
        </h2>
        <p className="font-sans text-lg leading-relaxed opacity-80 max-w-lg mx-auto">
          {body}
        </p>
      </motion.div>
    </div>
  </section>
);

export default FunnelTransition;
