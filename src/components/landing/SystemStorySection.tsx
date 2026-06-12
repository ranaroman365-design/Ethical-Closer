/**
 * ETC System Map™ — Landingpage master visual + SCROLL-DRIVEN reveal.
 *
 * Canon:
 *   ETC OS · Visualization Layer (Layer 47) · public master visual.
 *   Block: Conversion. One image, the entire system, understood as the user scrolls.
 *
 * Layout:
 *   TOP    — Revenue Flow:      Leads → Conversations → Calls → Show-Up → Revenue
 *   MIDDLE — Talent Flow:       Applicant → Setter → Closer → Partner
 *   BOTTOM — Intelligence:      Channels → AI → Decisions → Improvement
 *   Thin connector lines rise from Intelligence up to Revenue and Talent.
 *   Closing claim: "One system. Revenue. People. Intelligence. All connected."
 *
 * Scroll sequence (one IntersectionObserver per row):
 *   1) Revenue row         — reveals when its row enters viewport
 *   2) Talent row          — reveals when scrolled into view
 *   3) Intelligence row    — reveals next
 *   4) Connector + Closing — reveals last
 *
 * Within each revealed row: short, subtle stagger across nodes (CSS transforms only).
 * Respects prefers-reduced-motion (instant static visual).
 *
 * Hard rules:
 *   · Minimal. White background. No technical terms. Bilingual via useLanguage.
 */
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";

type Node = { label: { de: string; en: string }; sub?: { de: string; en: string } };

const REVENUE: Node[] = [
  { label: { de: "Leads", en: "Leads" }, sub: { de: "Traffic", en: "Traffic" } },
  { label: { de: "Gespräche", en: "Conversations" }, sub: { de: "AI Setter", en: "AI Setter" } },
  { label: { de: "Calls", en: "Calls" }, sub: { de: "Booking", en: "Booking" } },
  { label: { de: "Show-Up", en: "Show-Up" }, sub: { de: "Attendance", en: "Attendance" } },
  { label: { de: "Umsatz", en: "Revenue" }, sub: { de: "Closing", en: "Closing" } },
];

const TALENT: Node[] = [
  { label: { de: "Bewerber", en: "Applicant" } },
  { label: { de: "Setter", en: "Setter" } },
  { label: { de: "Closer", en: "Closer" } },
  { label: { de: "Partner", en: "Partner" } },
];

const INTELLIGENCE: Node[] = [
  { label: { de: "Kanäle", en: "Channels" }, sub: { de: "WhatsApp · SMS · Email · Voice · Push", en: "WhatsApp · SMS · Email · Voice · Push" } },
  { label: { de: "KI", en: "AI" } },
  { label: { de: "Entscheidungen", en: "Decisions" } },
  { label: { de: "Verbesserung", en: "Improvement" } },
];

// ── Reveal hook: triggers once when element enters viewport ──────────────
function useReveal<T extends Element>(threshold = 0.35) {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        });
      },
      { threshold, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, shown };
}

// ── Reduced-motion ───────────────────────────────────────────────────────
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const onChange = () => setReduced(m.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

// ── Style helpers ────────────────────────────────────────────────────────
function nodeStyle(shown: boolean, delay: number, reduced: boolean): React.CSSProperties {
  if (reduced) return { opacity: 1, transform: "none" };
  return {
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0)" : "translateY(8px)",
    transition: "opacity 240ms ease-out, transform 240ms ease-out",
    transitionDelay: shown ? `${delay}ms` : "0ms",
    willChange: "opacity, transform",
  };
}

function fadeStyle(shown: boolean, delay: number, reduced: boolean): React.CSSProperties {
  if (reduced) return { opacity: 1, transform: "none" };
  return {
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0)" : "translateY(8px)",
    transition: "opacity 320ms ease-out, transform 320ms ease-out",
    transitionDelay: shown ? `${delay}ms` : "0ms",
    willChange: "opacity, transform",
  };
}

function lineStyle(shown: boolean, delay: number, reduced: boolean): React.CSSProperties {
  if (reduced) return { transform: "scaleX(1)" };
  return {
    transform: shown ? "scaleX(1)" : "scaleX(0)",
    transition: "transform 280ms ease-out",
    transitionDelay: shown ? `${delay}ms` : "0ms",
  };
}

// ── Row of nodes (one flow) ──────────────────────────────────────────────
function Flow({
  nodes,
  lang,
  emphasis = "default",
  shown,
  stagger,
  reduced,
}: {
  nodes: Node[];
  lang: "de" | "en";
  emphasis?: "default" | "muted";
  shown: boolean;
  stagger: number;
  reduced: boolean;
}) {
  const labelClass = emphasis === "muted" ? "text-foreground/80" : "text-foreground";

  return (
    <div className="flex flex-wrap items-start justify-center gap-x-2 gap-y-3 md:gap-x-1">
      {nodes.map((n, i) => {
        const delay = i * stagger;
        return (
          <div key={n.label.en} className="flex items-start">
            <div
              className="flex min-w-[88px] flex-col items-center px-2 md:min-w-[110px] md:px-3"
              style={nodeStyle(shown, delay, reduced)}
            >
              <span className={`font-sans text-[15px] font-medium md:text-[17px] ${labelClass}`}>
                {n.label[lang]}
              </span>
              {n.sub && (
                <span className="mt-1 text-center font-sans text-[11px] uppercase tracking-[0.14em] text-foreground/45 md:text-[12px]">
                  {n.sub[lang]}
                </span>
              )}
            </div>
            {i < nodes.length - 1 && (
              <span
                aria-hidden
                className="mt-2 hidden h-px w-6 origin-left bg-foreground/20 md:mt-3 md:block md:w-10"
                style={lineStyle(shown, delay + 60, reduced)}
              />
            )}
            {i < nodes.length - 1 && (
              <span
                aria-hidden
                className="mt-1 px-1 text-foreground/30 md:hidden"
                style={nodeStyle(shown, delay + 40, reduced)}
              >
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SystemStorySection() {
  const { lang: rawLang } = useLanguage();
  const lang = (rawLang === "en" ? "en" : "de") as "de" | "en";

  const reduced = useReducedMotion();

  // Section opacity (whole block fades in once)
  const section = useReveal<HTMLElement>(0.1);

  // One reveal per scroll-step
  const revRow = useReveal<HTMLDivElement>(0.4);
  const talRow = useReveal<HTMLDivElement>(0.4);
  const intRow = useReveal<HTMLDivElement>(0.4);
  const connRow = useReveal<HTMLDivElement>(0.5);

  const t = {
    eyebrow: { de: "Das System", en: "The System" },
    headline: {
      de: "Ein Bild. Das gesamte System.",
      en: "One image. The entire system.",
    },
    sub: {
      de: "Umsatz wird oben erzeugt. Menschen wachsen in der Mitte. Intelligenz steuert alles.",
      en: "Revenue is created at the top. People grow in the middle. Intelligence orchestrates everything.",
    },
    revenueTitle: { de: "Revenue Flow", en: "Revenue Flow" },
    revenueCaption: { de: "So entsteht Umsatz.", en: "This is how revenue is created." },
    handoff: { de: "Output: Neue Mitglieder", en: "Output: New Members" },
    talentTitle: { de: "Talent Flow", en: "Talent Flow" },
    talentCaption: {
      de: "So wachsen Menschen im System.",
      en: "This is how people grow inside the system.",
    },
    intelTitle: {
      de: "Communication & Intelligence",
      en: "Communication & Intelligence",
    },
    intelCaption: {
      de: "Jede Interaktion wird orchestriert und kontinuierlich verbessert.",
      en: "Every interaction is orchestrated and continuously improved.",
    },
    intelConnector: {
      de: "steuert beide Flows",
      en: "orchestrates both flows",
    },
    closing1: { de: "Ein System.", en: "One system." },
    closingLine: { de: "Umsatz. Menschen. Intelligenz.", en: "Revenue. People. Intelligence." },
    closing2: { de: "Alles verbunden.", en: "All connected." },
  };

  // SVG path-draw for connector lines
  const PATH_LEN = 240;
  const drawStyle = (delay: number): React.CSSProperties =>
    reduced
      ? {}
      : {
          strokeDasharray: PATH_LEN,
          strokeDashoffset: connRow.shown ? 0 : PATH_LEN,
          transition: "stroke-dashoffset 700ms ease-out",
          transitionDelay: connRow.shown ? `${delay}ms` : "0ms",
        };

  // Per-row stagger (slightly faster on Talent → signals follow-up, per spec)
  const STAGGER_REVENUE = 110;
  const STAGGER_TALENT = 90;
  const STAGGER_INTEL = 90;

  return (
    <section
      ref={section.ref}
      aria-labelledby="system-story-heading"
      className={`bg-background px-6 py-20 transition-opacity duration-700 md:px-10 md:py-28 ${
        section.shown ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-14 text-center md:mb-20">
          <div className="font-sans text-xs uppercase tracking-[0.22em] text-foreground/50">
            {t.eyebrow[lang]}
          </div>
          <h2
            id="system-story-heading"
            className="mt-4 font-serif text-3xl font-medium leading-tight text-foreground md:text-5xl"
          >
            {t.headline[lang]}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl font-sans text-base text-foreground/65 md:text-lg">
            {t.sub[lang]}
          </p>
        </div>

        {/* MASTER VISUAL — ETC System Map™ */}
        <div className="relative rounded-2xl border border-border bg-background px-6 py-10 md:px-12 md:py-16">
          {/* SCROLL STEP 1 — Revenue Flow */}
          <div ref={revRow.ref}>
            <div className="mb-5 text-center" style={fadeStyle(revRow.shown, 0, reduced)}>
              <div className="font-sans text-[11px] uppercase tracking-[0.22em] text-foreground/45">
                {t.revenueTitle[lang]}
              </div>
            </div>
            <Flow
              nodes={REVENUE}
              lang={lang}
              shown={revRow.shown}
              stagger={STAGGER_REVENUE}
              reduced={reduced}
            />
            <p
              className="mt-5 text-center font-sans text-sm italic text-foreground/55"
              style={fadeStyle(
                revRow.shown,
                (REVENUE.length - 1) * STAGGER_REVENUE + 200,
                reduced
              )}
            >
              {t.revenueCaption[lang]}
            </p>
          </div>

          {/* Hand-off arrow Revenue → Talent (revealed with Talent step) */}
          <div
            className="my-10 flex flex-col items-center md:my-14"
            style={fadeStyle(talRow.shown, 0, reduced)}
          >
            <span aria-hidden className="h-8 w-px bg-foreground/15" />
            <span className="mt-2 font-sans text-[11px] uppercase tracking-[0.2em] text-foreground/45">
              ↓ {t.handoff[lang]}
            </span>
            <span aria-hidden className="mt-2 h-8 w-px bg-foreground/15" />
          </div>

          {/* SCROLL STEP 2 — Talent Flow */}
          <div ref={talRow.ref}>
            <div className="mb-5 text-center" style={fadeStyle(talRow.shown, 100, reduced)}>
              <div className="font-sans text-[11px] uppercase tracking-[0.22em] text-foreground/45">
                {t.talentTitle[lang]}
              </div>
            </div>
            <Flow
              nodes={TALENT}
              lang={lang}
              shown={talRow.shown}
              stagger={STAGGER_TALENT}
              reduced={reduced}
            />
            <p
              className="mt-5 text-center font-sans text-sm italic text-foreground/55"
              style={fadeStyle(
                talRow.shown,
                (TALENT.length - 1) * STAGGER_TALENT + 200,
                reduced
              )}
            >
              {t.talentCaption[lang]}
            </p>
          </div>

          {/* SCROLL STEP 4 — Connector lines (revealed with the connector row) */}
          <div ref={connRow.ref} className="my-10 md:my-14" aria-hidden>
            <div className="relative mx-auto h-16 w-full max-w-3xl md:h-20">
              <svg
                viewBox="0 0 600 80"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                <path
                  d="M 300 80 C 300 40, 150 40, 100 0"
                  stroke="hsl(var(--gold, 42 45% 55%))"
                  strokeOpacity="0.45"
                  strokeWidth="1"
                  fill="none"
                  style={drawStyle(0)}
                />
                <path
                  d="M 300 80 C 300 40, 450 40, 500 0"
                  stroke="hsl(var(--gold, 42 45% 55%))"
                  strokeOpacity="0.45"
                  strokeWidth="1"
                  fill="none"
                  style={drawStyle(120)}
                />
                <circle
                  cx="300"
                  cy="80"
                  r="2"
                  fill="hsl(var(--gold, 42 45% 55%))"
                  fillOpacity="0.7"
                  style={fadeStyle(connRow.shown, 0, reduced)}
                />
              </svg>
            </div>
            <div
              className="mt-2 flex justify-center"
              style={fadeStyle(connRow.shown, 250, reduced)}
            >
              <div className="rounded-full border border-[hsl(var(--gold,42_45%_55%))]/40 bg-[hsl(var(--gold,42_45%_55%))]/5 px-4 py-1.5">
                <span className="font-sans text-[11px] uppercase tracking-[0.2em] text-foreground/70">
                  {t.intelConnector[lang]}
                </span>
              </div>
            </div>
          </div>

          {/* SCROLL STEP 3 — Intelligence Flow */}
          <div ref={intRow.ref}>
            <div className="mb-5 text-center" style={fadeStyle(intRow.shown, 0, reduced)}>
              <div className="font-sans text-[11px] uppercase tracking-[0.22em] text-foreground/45">
                {t.intelTitle[lang]}
              </div>
            </div>
            <Flow
              nodes={INTELLIGENCE}
              lang={lang}
              emphasis="muted"
              shown={intRow.shown}
              stagger={STAGGER_INTEL}
              reduced={reduced}
            />
            <p
              className="mt-5 text-center font-sans text-sm italic text-foreground/55"
              style={fadeStyle(
                intRow.shown,
                (INTELLIGENCE.length - 1) * STAGGER_INTEL + 200,
                reduced
              )}
            >
              {t.intelCaption[lang]}
            </p>
          </div>
        </div>

        {/* Closing claim — fades in with the connector step */}
        <div className="mt-16 text-center md:mt-20">
          <p
            className="font-serif text-2xl font-medium text-foreground md:text-3xl"
            style={fadeStyle(connRow.shown, 400, reduced)}
          >
            {t.closing1[lang]}
          </p>
          <p
            className="mt-3 font-sans text-base text-foreground/70 md:text-lg"
            style={fadeStyle(connRow.shown, 600, reduced)}
          >
            {t.closingLine[lang]}
          </p>
          <p
            className="mt-3 font-serif text-2xl font-medium text-foreground md:text-3xl"
            style={fadeStyle(connRow.shown, 800, reduced)}
          >
            {t.closing2[lang]}
          </p>
        </div>
      </div>
    </section>
  );
}
