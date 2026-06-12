/**
 * Phase 12.2 — /closer-now CTA-Maximierungs-Komponenten
 * Additive Sticky / Scroll-Trigger / Inline CTAs für die Salesbook-Conversion.
 * Keine bestehenden CTAs verändern. Alle Links → /salesbook-offer.
 */
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackFunnelEvent } from "@/lib/track-event";

const SALESBOOK_HREF = "/salesbook-offer";

export const STICKY_CTA_COPY: Record<string, string> = {
  A: "SalesBook ansehen",
  B: "Mehr erfahren",
  C: "Karrierechance prüfen",
  D: "Jetzt starten",
  E: "High-Ticket Closing entdecken",
};

interface BaseProps {
  ab_slots: Record<string, string>;
  onClicked?: () => void;
}

/* ── Sticky CTA — mobile bottom bar + desktop floating button ─────────── */
export function CloserNowStickyCta({
  label,
  ab_slots,
  onClicked,
}: BaseProps & { label: string }) {
  const [visible, setVisible] = useState(false);
  const [viewFired, setViewFired] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.25);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (visible && !viewFired) {
      setViewFired(true);
      try {
        trackFunnelEvent("CLOSER_NOW_STICKY_CTA_VIEW", {
          funnel: "closer_now",
          ab_slots,
          label,
        });
      } catch { /* never throw */ }
    }
  }, [visible, viewFired, ab_slots, label]);

  const handleClick = () => {
    try {
      trackFunnelEvent("CLOSER_NOW_STICKY_CTA_CLICK", {
        funnel: "closer_now",
        ab_slots,
        label,
      });
      trackFunnelEvent("CLOSER_NOW_SALESBOOK_CLICK", {
        funnel: "closer_now",
        ab_slots,
        section: "sticky",
      });
    } catch { /* never throw */ }
    onClicked?.();
  };

  if (!visible) return null;

  return (
    <>
      {/* Mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md lg:hidden safe-area-bottom">
        <Button asChild size="lg" className="h-12 w-full text-base" onClick={handleClick}>
          <a href={SALESBOOK_HREF} aria-label={label}>
            <BookOpen className="mr-2 h-4 w-4" />
            {label}
            <ArrowRight className="ml-auto h-4 w-4" />
          </a>
        </Button>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          Kostenlos · Sofort verfügbar
        </p>
      </div>
      {/* Desktop floating */}
      <div className="fixed bottom-6 right-6 z-40 hidden lg:block">
        <Button asChild size="lg" className="h-12 px-5 shadow-lg" onClick={handleClick}>
          <a href={SALESBOOK_HREF} aria-label={label}>
            <BookOpen className="mr-2 h-4 w-4" />
            {label}
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </>
  );
}

/* ── Inline CTA used after every section ──────────────────────────────── */
export function CloserNowInlineCta({
  label,
  section,
  hint = "Kostenlos · Sofort verfügbar",
  ab_slots,
  onClicked,
}: BaseProps & { label: string; section: string; hint?: string }) {
  const handleClick = () => {
    try {
      trackFunnelEvent("CLOSER_NOW_SECTION_CTA_CLICK", {
        funnel: "closer_now",
        ab_slots,
        section,
        label,
      });
      trackFunnelEvent("CLOSER_NOW_SALESBOOK_CLICK", {
        funnel: "closer_now",
        ab_slots,
        section,
      });
    } catch { /* never throw */ }
    onClicked?.();
  };
  return (
    <div className="mt-10 flex flex-col items-center gap-2">
      <Button asChild size="lg" className="h-12 px-7 text-base" onClick={handleClick}>
        <a href={SALESBOOK_HREF}>
          <BookOpen className="mr-2 h-4 w-4" />
          {label}
          <ArrowRight className="ml-2 h-4 w-4" />
        </a>
      </Button>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/* ── Scroll-triggered CTA cards at 50 % and 75 % ──────────────────────── */
export function CloserNowScrollCta({
  ab_slots,
  hasInteracted,
  onClicked,
}: BaseProps & { hasInteracted: boolean }) {
  const [show50, setShow50] = useState(false);
  const [show75, setShow75] = useState(false);
  const [dismissed50, setDismissed50] = useState(false);
  const [dismissed75, setDismissed75] = useState(false);

  useEffect(() => {
    if (hasInteracted) return;
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
      const pct = (window.scrollY / scrollable) * 100;
      if (pct >= 50 && !dismissed50) setShow50(true);
      if (pct >= 75 && !dismissed75) setShow75(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasInteracted, dismissed50, dismissed75]);

  // Fire view events once per card
  useEffect(() => {
    if (show50) {
      try {
        trackFunnelEvent("CLOSER_NOW_SCROLL_CTA_VIEW", {
          funnel: "closer_now",
          ab_slots,
          trigger: "50pct",
        });
      } catch { /* */ }
    }
  }, [show50, ab_slots]);
  useEffect(() => {
    if (show75) {
      try {
        trackFunnelEvent("CLOSER_NOW_SCROLL_CTA_VIEW", {
          funnel: "closer_now",
          ab_slots,
          trigger: "75pct",
        });
      } catch { /* */ }
    }
  }, [show75, ab_slots]);

  const fireClick = (trigger: "50pct" | "75pct") => {
    try {
      trackFunnelEvent("CLOSER_NOW_SCROLL_CTA_CLICK", {
        funnel: "closer_now",
        ab_slots,
        trigger,
      });
      trackFunnelEvent("CLOSER_NOW_SALESBOOK_CLICK", {
        funnel: "closer_now",
        ab_slots,
        section: `scroll_${trigger}`,
      });
    } catch { /* */ }
    onClicked?.();
  };

  const Card = ({
    title,
    button,
    trigger,
    onDismiss,
  }: {
    title: string;
    button: string;
    trigger: "50pct" | "75pct";
    onDismiss: () => void;
  }) => (
    <section className="border-y border-primary/20 bg-primary/5 py-10">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <h3 className="font-serif text-2xl text-foreground sm:text-3xl">{title}</h3>
        <Button asChild size="lg" className="h-12 px-7 text-base" onClick={() => fireClick(trigger)}>
          <a href={SALESBOOK_HREF}>
            {button}
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Später ansehen
        </button>
      </div>
    </section>
  );

  return (
    <>
      {show50 && !dismissed50 && (
        <Card
          title="Möchtest du verstehen, wie High-Ticket Closing funktioniert?"
          button="SalesBook ansehen"
          trigger="50pct"
          onDismiss={() => { setShow50(false); setDismissed50(true); }}
        />
      )}
      {show75 && !dismissed75 && (
        <Card
          title="Der nächste Schritt wartet bereits auf dich."
          button="Jetzt ansehen"
          trigger="75pct"
          onDismiss={() => { setShow75(false); setDismissed75(true); }}
        />
      )}
    </>
  );
}
