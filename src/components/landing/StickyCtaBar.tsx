import { useState, useEffect, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/i18n/LanguageContext";
import { Link } from "react-router-dom";
import { trackFunnelEvent } from "@/lib/track-event";
import { trackHomeCta, HOME_FUNNEL_ID, HOME_EXPERIMENT_ID } from "@/lib/home-tracking";
import { useCopyVariant } from "@/lib/cro/useCopyVariant";

const StickyCtaBar = forwardRef<HTMLDivElement>((_, ref) => {
  const [visible, setVisible] = useState(false);
  const { tx } = useLanguage();
  // A/B test (cta_label_v1) — shares experiment with hero PrimaryCta.
  const ctaLabel = useCopyVariant("cta_label_v1", "Eignung prüfen", "label");

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 600;
      setVisible((prev) => {
        if (next && !prev) {
          trackFunnelEvent("sticky_cta_shown", {
            funnel: HOME_FUNNEL_ID,
            page_path: "/",
            experiment_id: HOME_EXPERIMENT_ID,
            scroll_y: window.scrollY,
          });
        }
        return next;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={ref}
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          exit={{ y: 80 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md"
        >
          <div className="container flex items-center justify-between py-3">
            <p className="hidden font-serif text-lg font-medium text-foreground sm:block">
              {tx('Bereit für ethisches Closing?', 'Ready for ethical closing?')}
            </p>
            <Link
              to="/apply"
              onClick={() => trackHomeCta("primary_apply", "sticky_bar", "/apply", { cta_type: "sticky", funnel: "root", experiment_id: "root_v3" })}
              className="ml-auto rounded-sm bg-primary px-6 py-2.5 text-sm font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90 inline-block"
            >
              {tx(ctaLabel, "Check Your Fit")}
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

StickyCtaBar.displayName = "StickyCtaBar";

export default StickyCtaBar;
