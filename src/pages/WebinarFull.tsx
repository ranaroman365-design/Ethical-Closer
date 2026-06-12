import { useEffect, useState } from "react";
import { PRODUCT } from "@/config/product";
import { motion, AnimatePresence } from "framer-motion";
import {
  LanguageProvider,
  LanguageToggle,
  useLanguage,
} from "@/components/webinar/LanguageContext";
import WebinarPart1 from "@/components/webinar/WebinarPart1";
import WebinarPart2 from "@/components/webinar/WebinarPart2";
import WebinarPart3 from "@/components/webinar/WebinarPart3";
import FooterSection from "@/components/landing/FooterSection";
import { captureCurrentPageAttribution } from "@/lib/lead-attribution";

/**
 * Legacy 3-part webinar deck. Preserved at /webinar/full for backward compat
 * (links from emails, ads, internal docs). The primary /webinar route now
 * serves <WebinarEntry/>, the strategic nurture layer.
 */
const WebinarFullContent = () => {
  const [showStickyCta, setShowStickyCta] = useState(false);
  const { lang } = useLanguage();

  useEffect(() => {
    captureCurrentPageAttribution("WebinarFull");
  }, []);

  useEffect(() => {
    const container = document.getElementById("webinar-scroll");
    if (!container) return;
    const handleScroll = () => {
      const scrollPercent =
        container.scrollTop / (container.scrollHeight - container.clientHeight);
      setShowStickyCta(scrollPercent > 0.15 && scrollPercent < 0.95);
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div id="webinar-scroll" className="snap-y snap-mandatory overflow-y-scroll h-screen">
      <LanguageToggle />
      <WebinarPart1 />
      <WebinarPart2 />
      <WebinarPart3 />

      <AnimatePresence>
        {showStickyCta && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-md border-t border-border py-3 px-6"
          >
            <div className="container mx-auto max-w-4xl flex items-center justify-between gap-4">
              <p className="font-serif text-sm font-medium hidden sm:block">{PRODUCT.nameTM}</p>
              <a
                href="/apply"
                className="rounded-sm bg-primary px-8 py-3 font-sans text-xs font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90 ml-auto"
              >
                {lang === "de" ? "Jetzt bewerben" : "Apply now"}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <FooterSection />
    </div>
  );
};

const WebinarFull = () => (
  <LanguageProvider>
    <WebinarFullContent />
  </LanguageProvider>
);

export default WebinarFull;
