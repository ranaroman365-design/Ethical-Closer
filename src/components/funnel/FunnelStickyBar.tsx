import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { trackFunnelEvent } from "@/lib/track-event";

interface FunnelStickyBarProps {
  label: string;
  href: string;
  variant?: "teal" | "red" | "gold";
  funnelName?: string;
}

const btnStyles = {
  teal: "bg-funnel-teal text-white hover:bg-funnel-teal/90",
  red: "bg-funnel-red text-white hover:bg-funnel-red/90",
  gold: "bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90",
};

const FunnelStickyBar = ({ label, href, variant = "teal", funnelName }: FunnelStickyBarProps) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const threshold = window.innerHeight * 0.2;
    const onScroll = () => setVisible(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          exit={{ y: 80 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/30 bg-card/95 backdrop-blur-md safe-area-bottom"
        >
          <div className="container mx-auto flex items-center justify-center px-5 py-3">
            <Link
              to={href}
              onClick={() => trackFunnelEvent("sticky_cta_click", { funnel: funnelName })}
              className={cn(
                "inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg px-8 py-3 font-sans text-sm font-semibold transition-all active:scale-[0.98]",
                btnStyles[variant]
              )}
            >
              {label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FunnelStickyBar;
