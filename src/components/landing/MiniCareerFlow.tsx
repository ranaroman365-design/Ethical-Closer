import { useState } from "react";

/**
 * MiniCareerFlow — Compact above-the-fold visual.
 * Applicant → Setter → Closer → Placed
 * Light interactivity: hover (desktop) / tap (mobile) reveals 1–2 line tooltip.
 * No navigation, no heavy animation.
 */

type Step = {
  key: string;
  label: string;
  detail: string;
  highlight?: "placement" | "end";
};

const STEPS: Step[] = [
  {
    key: "applicant",
    label: "Applicant",
    detail: "You apply and get evaluated. Structured entry — not random.",
  },
  {
    key: "setter",
    label: "Setter",
    detail: "You qualify real leads, earn first commissions while learning.",
  },
  {
    key: "closer",
    label: "Closer",
    detail: "You handle real client calls. Performance-based income.",
    highlight: "placement",
  },
  {
    key: "placed",
    label: "Placed",
    detail: "Level 6: placed with partner companies. High-ticket deals.",
    highlight: "end",
  },
];

export default function MiniCareerFlow() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="w-full">
      <div className="flex items-stretch justify-between gap-2 md:gap-3">
        {STEPS.map((step, i) => {
          const isActive = active === step.key;
          const isHighlight = step.highlight === "placement" || step.highlight === "end";

          return (
            <div key={step.key} className="flex flex-1 items-center">
              {/* Node */}
              <button
                type="button"
                onMouseEnter={() => setActive(step.key)}
                onMouseLeave={() => setActive((cur) => (cur === step.key ? null : cur))}
                onClick={() => setActive((cur) => (cur === step.key ? null : step.key))}
                className={`group relative flex w-full flex-col items-center rounded-xl border px-2 py-3 text-center transition-all duration-150 md:px-3 md:py-4 ${
                  isHighlight
                    ? "border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/5"
                    : "border-border bg-background"
                } ${isActive ? "shadow-sm md:scale-[1.02]" : "hover:border-foreground/40"}`}
                aria-expanded={isActive}
              >
                <span
                  className={`font-sans text-[10px] uppercase tracking-[0.18em] ${
                    isHighlight ? "text-[hsl(var(--accent))]" : "text-muted-foreground"
                  }`}
                >
                  L{i === 0 ? "0" : i === 1 ? "1–3" : i === 2 ? "4–5" : "6"}
                </span>
                <span className="mt-1 font-serif text-base font-medium text-foreground md:text-lg">
                  {step.label}
                </span>

                {/* Tooltip / overlay */}
                <span
                  role="tooltip"
                  className={`pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-44 -translate-x-1/2 rounded-md border border-border bg-background px-3 py-2 text-left text-[11px] leading-snug text-foreground shadow-md transition-opacity duration-150 md:w-52 md:text-xs ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {step.detail}
                </span>
              </button>

              {/* Connector */}
              {i < STEPS.length - 1 && (
                <div
                  aria-hidden
                  className="mx-1 h-px flex-1 bg-border md:mx-2"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Microtext */}
      <p className="mt-6 text-center font-sans text-xs text-muted-foreground md:text-sm">
        Earn while learning · Placement track from Level 4 · High-ticket commissions
      </p>
    </div>
  );
}
