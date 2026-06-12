/**
 * Q1 Momentum Banner — Phase 11, additive, MOS-gated.
 *
 * Renders a small momentum label above Q1 of the quiz, sourced from
 * the `mos_q1_momentum` A/B slot. Variant `A_normal` renders nothing.
 *
 * Strict guarantees:
 *   - Only renders for MOS sessions (attribution_source starts with masterofsales).
 *   - Never alters the question, options, or quiz logic.
 *   - View event fires once per session per variant via fireMosPhase11Event.
 */
import { useEffect, useMemo } from "react";
import { useAbSlot } from "@/hooks/useAbSlot";
import {
  MOS_Q1_MOMENTUM,
  Q1_MOMENTUM_COPY,
} from "@/lib/mos-phase11-slots";
import { getAttributionSource } from "@/lib/attribution-source";
import { fireMosPhase11Event } from "@/lib/mos-phase11-events";

interface Props {
  totalQuestions: number;
}

export default function Q1MomentumBanner({ totalQuestions }: Props) {
  const isMos = useMemo(() => {
    const s = getAttributionSource();
    return !!s && s.startsWith("masterofsales");
  }, []);
  const slot = useAbSlot(MOS_Q1_MOMENTUM);

  useEffect(() => {
    if (!isMos) return;
    fireMosPhase11Event("MASTER_Q1_MOMENTUM_VIEW", slot.variant);
  }, [isMos, slot.variant]);

  if (!isMos) return null;

  const label = Q1_MOMENTUM_COPY[slot.variant];

  if (slot.variant === "C_progress_bar") {
    return (
      <div className="mb-3 flex items-center gap-2 text-[11px] text-foreground/65">
        <span className="font-medium">Frage 1 von {totalQuestions}</span>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{ width: `${Math.round((1 / totalQuestions) * 100)}%` }}
          />
        </div>
      </div>
    );
  }

  if (slot.variant === "B_1_of_5") {
    return (
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        1 von {totalQuestions}
      </div>
    );
  }

  if (!label) return null;

  return (
    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/[0.04] px-2.5 py-1 text-[11px] text-foreground/70">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
      {label}
    </div>
  );
}
