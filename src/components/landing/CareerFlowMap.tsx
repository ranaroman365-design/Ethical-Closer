/**
 * Career Flow Map™ — Landingpage / B2C visual conversion asset.
 *
 * Canon:
 *   ETC OS · Visualization Layer (Layer 47) · public mirror of Talent Engine.
 *   Block: Conversion (Acquisition→Conversion bridge).
 *   Aligned with `src/lib/canonical-roles.ts` (external labels).
 *
 * Goal:
 *   Applicant sees a clear path from Apply → Placed Closer (L6),
 *   with believable income progression and visual emphasis on:
 *     · L4 = "Placement Track Starts"
 *     · L6 = "Placed Closer"
 *
 * Hard rules:
 *   · No hype copy ("schnelles Geld", "garantiert", "passive income").
 *   · External role labels only (L6 = "Senior Closer").
 *   · Income shown as ranges, never as promises.
 *   · Bilingual via useLanguage.
 */
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { Sparkles, ArrowRight, ArrowDown, Trophy } from "lucide-react";
import { trackHomeCta } from "@/lib/home-tracking";

type Level = {
  key: string;
  badge: string;
  title: { de: string; en: string };
  text: { de: string; en: string };
  income: { de: string; en: string };
  highlight?: "placement_start" | "placed";
};

const LEVELS: Level[] = [
  {
    key: "L0",
    badge: "Apply",
    title: { de: "Bewerber", en: "Applicant" },
    text: { de: "Start deines Wegs", en: "Start your journey" },
    income: { de: "Eignungsprüfung", en: "Qualification step" },
  },
  {
    key: "L1",
    badge: "L1",
    title: { de: "Trainee · Opener", en: "Trainee · Opener" },
    text: { de: "Grundlagen lernen — Earn while learning", en: "Learn fundamentals — earn while learning" },
    income: { de: "Erste Provisionen möglich", en: "First commissions possible" },
  },
  {
    key: "L2",
    badge: "L2",
    title: { de: "Setter", en: "Setter" },
    text: { de: "Qualifizierte Calls buchen", en: "Book qualified calls" },
    income: { de: "€ pro gebuchtem Call", en: "€ per booked call" },
  },
  {
    key: "L3",
    badge: "L3",
    title: { de: "Senior Setter", en: "Senior Setter" },
    text: { de: "Höher qualifizierte Leads", en: "Higher-quality leads" },
    income: { de: "Höhere Provision pro Booking", en: "Higher commission per booking" },
  },
  {
    key: "L4",
    badge: "L4",
    title: { de: "Junior Closer", en: "Junior Closer" },
    text: { de: "Du closer echte Deals", en: "You begin closing real deals" },
    income: { de: "% Provision pro Verkauf", en: "% commission per sale" },
    highlight: "placement_start",
  },
  {
    key: "L5",
    badge: "L5",
    title: { de: "Managing Closer", en: "Managing Closer" },
    text: { de: "Höhere Ticket-Größen", en: "Higher ticket deals" },
    income: { de: "Höhere % Provisionen", en: "Higher % commissions" },
  },
  {
    key: "L6",
    badge: "L6",
    title: { de: "Senior Closer", en: "Senior Closer" },
    text: { de: "Arbeit mit Partner-Unternehmen", en: "Work with partner companies" },
    income: { de: "High-Ticket Provisionen", en: "High-ticket commissions" },
    highlight: "placed",
  },
];

const tx = (lang: "de" | "en", o: { de: string; en: string }) => o[lang];

export default function CareerFlowMap() {
  const { lang } = useLanguage();
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  // Sequential reveal on scroll-into-view (calm, no bounce)
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      data-home-section="career_flow"
      className="border-b border-border/40 bg-background"
    >
      <div className="container mx-auto max-w-6xl px-6 py-20 md:py-28">
        {/* Header */}
        <div className="text-center">
          <p className="mb-4 font-sans text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Career Flow Map™
          </p>
          <h2 className="mx-auto max-w-3xl font-serif text-3xl font-medium leading-tight text-foreground md:text-5xl">
            {lang === "de"
              ? "Vom Bewerber zum platzierten Closer."
              : "From Applicant to Placed Closer."}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl font-sans text-base text-muted-foreground md:text-lg">
            {lang === "de"
              ? "Ein klarer Weg mit echter Progression und echtem Einkommen."
              : "A clear path with real progression and real income."}
          </p>
        </div>

        {/* ─── DESKTOP: horizontal flow ─────────────────────────── */}
        <div className="mt-14 hidden lg:block">
          <div className="grid grid-cols-7 gap-2">
            {LEVELS.map((lvl, idx) => (
              <FlowNode
                key={lvl.key}
                lvl={lvl}
                lang={lang}
                index={idx}
                visible={visible}
                orientation="horizontal"
                isLast={idx === LEVELS.length - 1}
              />
            ))}
          </div>
        </div>

        {/* ─── TABLET: 2-row horizontal flow ────────────────────── */}
        <div className="mt-14 hidden md:block lg:hidden">
          <div className="grid grid-cols-4 gap-3">
            {LEVELS.slice(0, 4).map((lvl, idx) => (
              <FlowNode
                key={lvl.key}
                lvl={lvl}
                lang={lang}
                index={idx}
                visible={visible}
                orientation="horizontal"
                isLast={idx === 3}
              />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {LEVELS.slice(4).map((lvl, idx) => (
              <FlowNode
                key={lvl.key}
                lvl={lvl}
                lang={lang}
                index={idx + 4}
                visible={visible}
                orientation="horizontal"
                isLast={idx === 2}
              />
            ))}
          </div>
        </div>

        {/* ─── MOBILE: vertical stack ───────────────────────────── */}
        <div className="mt-12 space-y-3 md:hidden">
          {LEVELS.map((lvl, idx) => (
            <FlowNode
              key={lvl.key}
              lvl={lvl}
              lang={lang}
              index={idx}
              visible={visible}
              orientation="vertical"
              isLast={idx === LEVELS.length - 1}
            />
          ))}
        </div>

        {/* Optional L7+ extension */}
        <p className="mt-10 text-center font-sans text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
          {lang === "de"
            ? "Weiter: L7 Director · L8 Partner (optional)"
            : "Beyond: L7 Director · L8 Partner (optional)"}
        </p>

        {/* Trust copy */}
        <div className="mt-12 border-t border-border/50 pt-10 text-center">
          <p className="font-serif text-xl text-foreground md:text-2xl">
            {lang === "de" ? "Klare Progression." : "Clear progression."}{" "}
            <span className="text-muted-foreground">·</span>{" "}
            {lang === "de" ? "Echte Fähigkeit." : "Real skills."}{" "}
            <span className="text-muted-foreground">·</span>{" "}
            {lang === "de" ? "Echtes Einkommen." : "Real income."}
          </p>
          <a
            href="/apply"
            onClick={() =>
              trackHomeCta("primary_apply", "career_flow_map", "/apply", {
                cta_type: "secondary",
                funnel: "root",
                experiment_id: "root_v3",
              })
            }
            className="mt-8 inline-flex items-center justify-center rounded-sm bg-primary px-7 py-3.5 text-sm font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
          >
            {lang === "de" ? "Eignung prüfen" : "Check your fit"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Sub component ────────────────────────────────────────────────────────

function FlowNode({
  lvl,
  lang,
  index,
  visible,
  orientation,
  isLast,
}: {
  lvl: Level;
  lang: "de" | "en";
  index: number;
  visible: boolean;
  orientation: "horizontal" | "vertical";
  isLast: boolean;
}) {
  const isPlacementStart = lvl.highlight === "placement_start";
  const isPlaced = lvl.highlight === "placed";
  const isHighlight = !!lvl.highlight;

  // Sequential reveal delay (8 levels × ~60ms)
  const delay = `${index * 60}ms`;

  return (
    <div
      className={[
        "relative flex flex-col",
        orientation === "vertical" ? "" : "h-full",
      ].join(" ")}
    >
      {/* Highlight banner ABOVE node */}
      {isPlacementStart && (
        <div
          className="mb-2 inline-flex items-center justify-center gap-1.5 self-center rounded-full bg-primary/10 px-3 py-1 font-sans text-[10px] uppercase tracking-[0.18em] text-primary"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(4px)",
            transition: `opacity 220ms ease-out ${delay}, transform 220ms ease-out ${delay}`,
          }}
        >
          <Sparkles className="h-3 w-3" />
          {lang === "de" ? "Placement Track startet" : "Placement Track Starts"}
        </div>
      )}
      {isPlaced && (
        <div
          className="mb-2 inline-flex items-center justify-center gap-1.5 self-center rounded-full bg-foreground px-3 py-1 font-sans text-[10px] uppercase tracking-[0.18em] text-background"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(4px)",
            transition: `opacity 220ms ease-out ${delay}, transform 220ms ease-out ${delay}`,
          }}
        >
          <Trophy className="h-3 w-3" />
          {lang === "de" ? "Placed Closer" : "Placed Closer"}
        </div>
      )}

      {/* Spacer when no banner — preserve alignment */}
      {!isHighlight && orientation === "horizontal" && (
        <div className="mb-2 h-[22px]" aria-hidden />
      )}

      {/* Node card */}
      <div
        className={[
          "relative flex flex-1 flex-col rounded-sm border p-4 transition-colors",
          isHighlight
            ? "border-primary/60 bg-card shadow-[0_2px_24px_-12px_hsl(var(--primary)/0.45)]"
            : "border-border bg-card/40",
        ].join(" ")}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(8px)",
          transition: `opacity 260ms ease-out ${delay}, transform 260ms ease-out ${delay}`,
        }}
      >
        <div className="flex items-center justify-between">
          <span
            className={[
              "font-sans text-[10px] font-semibold uppercase tracking-[0.18em]",
              isHighlight ? "text-primary" : "text-muted-foreground",
            ].join(" ")}
          >
            {lvl.badge}
          </span>
          {/* Progress dots */}
          <div className="flex gap-0.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className={[
                  "h-0.5 w-1.5 rounded-full",
                  i <= index ? "bg-primary/70" : "bg-border",
                ].join(" ")}
              />
            ))}
          </div>
        </div>

        <h3 className="mt-3 font-serif text-lg font-medium leading-tight text-foreground">
          {tx(lang, lvl.title)}
        </h3>
        <p className="mt-2 font-sans text-xs leading-relaxed text-muted-foreground">
          {tx(lang, lvl.text)}
        </p>

        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="font-sans text-[9px] uppercase tracking-[0.18em] text-muted-foreground/80">
            {lang === "de" ? "Einkommen" : "Income"}
          </div>
          <div
            className={[
              "mt-1 font-sans text-xs",
              isHighlight ? "text-foreground" : "text-foreground/85",
            ].join(" ")}
          >
            {tx(lang, lvl.income)}
          </div>
        </div>
      </div>

      {/* Connector arrow */}
      {!isLast && (
        <div
          aria-hidden
          className={[
            "pointer-events-none flex items-center justify-center text-muted-foreground/50",
            orientation === "horizontal"
              ? "absolute right-[-10px] top-1/2 -translate-y-1/2"
              : "py-1",
          ].join(" ")}
          style={{
            opacity: visible ? 1 : 0,
            transition: `opacity 200ms ease-out ${`${index * 60 + 120}ms`}`,
          }}
        >
          {orientation === "horizontal" ? (
            <ArrowRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )}
        </div>
      )}
    </div>
  );
}
