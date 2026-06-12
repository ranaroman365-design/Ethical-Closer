/**
 * MosInstantQ1 — sofort beantwortbare, non-scoring Frage 1 (MOS-only).
 *
 * STRICTLY ADDITIVE. Rendered ONLY for MOS sessions when the direct-entry
 * slot routes here. The answer is non-scoring (Momentum only) and the
 * selected option is forwarded to the parent which then advances the user
 * to the real quiz step 0 — existing scoring, CRM, GHL, pixel/CAPI bleiben
 * unverändert.
 *
 * Fires:
 *   MASTER_Q1_INSTANT_ANSWER_VIEW (once per session per variant)
 *   MASTER_Q1_VISIBLE             (once per session, on viewport entry)
 *   MASTER_Q1_FIRST_ANSWER        (once per session, on first selection)
 *   MASTER_Q1_ULTRA_FAST_VIEW
 *   MASTER_Q1_MICRO_COMMITMENT_VIEW
 *   MASTER_PROGRESS_FAST_VIEW
 */
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Compass,
  Globe2,
  GraduationCap,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fireMosCroEvent } from "@/lib/mos-cro-events";
import { useAbSlot } from "@/hooks/useAbSlot";
import {
  Q1_INSTANT_OPTIONS,
  MOS_Q1_ULTRA_FAST,
  MOS_Q1_MICRO_COMMITMENT,
  MOS_PROGRESS_FAST,
  Q1_MICRO_COMMITMENT_COPY,
  PROGRESS_FAST_COPY,
} from "@/lib/mos-cro-slots";

type Variant = "list" | "cards" | "cards_icons" | "auto_advance";

const ICONS = [Sparkles, Compass, Globe2, GraduationCap, Target];

export interface MosInstantQ1Props {
  variant: string;
  onContinue: (selectedIndex: number, label: string) => void;
}

export default function MosInstantQ1({ variant, onContinue }: MosInstantQ1Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const v = (["list", "cards", "cards_icons", "auto_advance"].includes(variant)
    ? variant
    : "list") as Variant;

  // Ultra-Fast Sprint — additive layout/commitment/progress overrides.
  const ultraFast = useAbSlot(MOS_Q1_ULTRA_FAST);
  const microCommitment = useAbSlot(MOS_Q1_MICRO_COMMITMENT);
  const progressFast = useAbSlot(MOS_PROGRESS_FAST);
  const commitmentLine = Q1_MICRO_COMMITMENT_COPY[microCommitment.variant] ?? null;
  const progressLine = PROGRESS_FAST_COPY[progressFast.variant] ?? null;

  useEffect(() => {
    fireMosCroEvent("MASTER_Q1_INSTANT_ANSWER_VIEW", v);
  }, [v]);

  useEffect(() => {
    fireMosCroEvent("MASTER_Q1_ULTRA_FAST_VIEW", ultraFast.variant);
  }, [ultraFast.variant]);

  useEffect(() => {
    if (commitmentLine) fireMosCroEvent("MASTER_Q1_MICRO_COMMITMENT_VIEW", microCommitment.variant);
  }, [microCommitment.variant, commitmentLine]);

  useEffect(() => {
    if (progressLine) fireMosCroEvent("MASTER_PROGRESS_FAST_VIEW", progressFast.variant);
  }, [progressFast.variant, progressLine]);

  // Q1 visibility tracker — fires once when the question enters viewport.
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.4) {
            fireMosCroEvent("MASTER_Q1_VISIBLE", "q1");
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.4] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleSelect = (idx: number, label: string) => {
    if (activeIdx !== null) return;
    setActiveIdx(idx);
    fireMosCroEvent("MASTER_Q1_FIRST_ANSWER", "q1", {
      option_index: idx,
      option_label: label,
    });
    // Auto-advance variants: minimize transition (<150ms per spec).
    const isAutoAdvance =
      v === "auto_advance" || ultraFast.variant === "auto_advance";
    const delay = isAutoAdvance ? 120 : 240;
    window.setTimeout(() => onContinue(idx, label), delay);
  };

  // Ultra-Fast layout overrides take precedence when non-control.
  const ufHasOverride = ultraFast.variant !== "control";
  const isCards =
    ufHasOverride
      ? ultraFast.variant !== "list" // every ultra-fast non-control is card-based
      : v === "cards" || v === "cards_icons" || v === "auto_advance";
  const showIcons =
    ufHasOverride
      ? ultraFast.variant === "large_cards_icons"
      : v === "cards_icons";
  const hoverEffect = ultraFast.variant === "hover_cards";

  return (
    <div ref={ref} className="space-y-5">
      {progressLine && (
        <p className="font-sans text-[10px] uppercase tracking-[0.24em] text-foreground/55">
          {progressLine}
        </p>
      )}

      <h2 className="font-serif text-2xl font-semibold leading-tight tracking-tight md:text-4xl">
        Welche Situation beschreibt dich aktuell am besten?
      </h2>

      {commitmentLine ? (
        <p className="font-sans text-[12px] uppercase tracking-[0.18em] text-foreground/70">
          {commitmentLine}
        </p>
      ) : (
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Es gibt keine richtigen oder falschen Antworten.
        </p>
      )}

      <div className={cn("grid gap-3", isCards ? "sm:grid-cols-1" : "")}>
        {Q1_INSTANT_OPTIONS.map((label, idx) => {
          const Icon = ICONS[idx % ICONS.length];
          const isActive = activeIdx === idx;
          return (
            <button
              key={label}
              onClick={() => handleSelect(idx, label)}
              className={cn(
                "group flex w-full items-center gap-4 rounded-sm border text-left font-serif transition-all active:scale-[0.99]",
                isCards
                  ? "px-5 py-5 text-base md:text-lg"
                  : "px-5 py-4 text-base md:text-lg",
                hoverEffect && !isActive && "hover:-translate-y-0.5 hover:shadow-md",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/60 bg-background hover:border-foreground hover:bg-muted/40",
              )}
            >
              {showIcons && (
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                    isActive
                      ? "border-background/40 bg-background/10"
                      : "border-border/60 bg-muted/30",
                  )}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" />
                </span>
              )}
              <span className="flex-1">{label}</span>
              <ArrowRight
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  isActive
                    ? "translate-x-1"
                    : "opacity-40 group-hover:translate-x-1 group-hover:opacity-100",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
