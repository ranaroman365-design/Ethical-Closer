import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";
import { useAbSlot } from "@/hooks/useAbSlot";

/**
 * Phase 10.2 — Sticky CTA for /closer-karriere only.
 * - Appears after scroll > 50vh
 * - Hides when any registration form is in viewport
 * - Smooth-scrolls to #register-form-inline (fallback: #register-form-final)
 * - Tracks `closer_karriere_sticky_cta_click`
 */

const FORM_IDS = ["register-form-inline", "register-form-final"];

const CTA_FALLBACK = "Kostenlos registrieren";

export default function StickyRegisterCta() {
  const [visible, setVisible] = useState(false);
  const [formInView, setFormInView] = useState(false);

  // Reuses the existing form CTA AB slot so variants stay consistent.
  const ctaSlot = useAbSlot({
    slot: "mos_register_form_cta",
    variants: [
      { id: "control" },
      { id: "A_zugang" },
      { id: "B_pruefen" },
      { id: "C_platz" },
    ],
  });
  const CTA_COPY: Record<string, string> = {
    control: CTA_FALLBACK,
    A_zugang: "Zugang sichern",
    B_pruefen: "Karriereweg prüfen",
    C_platz: "Kostenlosen Platz sichern",
  };
  const ctaLabel = CTA_COPY[ctaSlot.variant] ?? CTA_FALLBACK;

  useEffect(() => {
    const threshold = () => window.innerHeight * 0.5;
    const onScroll = () => setVisible(window.scrollY > threshold());
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = FORM_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => !!el,
    );
    if (targets.length === 0) return;
    const states = new Map<Element, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => states.set(e.target, e.isIntersecting));
        setFormInView(Array.from(states.values()).some(Boolean));
      },
      { threshold: 0.15 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  const onClick = () => {
    trackFunnelEvent("closer_karriere_sticky_cta_click", {
      funnel: "closer_karriere",
      cta_position: "sticky",
      ab_cta: ctaSlot.variant ?? null,
    });
    const target =
      document.getElementById("register-form-inline") ??
      document.getElementById("register-form-final");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const show = visible && !formInView;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="fixed inset-x-0 bottom-0 z-40 pointer-events-none"
        >
          <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 pb-4 sm:justify-end sm:pb-6">
            <button
              type="button"
              onClick={onClick}
              className="pointer-events-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A84C] px-7 py-4 font-sans text-sm font-semibold uppercase tracking-[0.08em] text-[#1A1A1A] shadow-[0_10px_30px_-10px_rgba(201,168,76,0.6)] ring-1 ring-[#1A1A1A]/10 transition-all hover:bg-[#b89540] hover:shadow-[0_14px_36px_-12px_rgba(201,168,76,0.75)] active:scale-[0.98] sm:w-auto"
              aria-label={ctaLabel}
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
