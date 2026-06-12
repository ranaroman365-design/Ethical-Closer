/**
 * MOS Quiz Completion Booster — Part 3.
 *
 * Tiny anticipation line for the final stretch of the quiz. Purely
 * additive copy; never blocks progression. Self-gates via fireMosCroEvent.
 */
import { useEffect } from "react";
import { useAbSlot } from "@/hooks/useAbSlot";
import {
  MOS_COMPLETION_BOOSTER,
  COMPLETION_BOOSTER_COPY,
} from "@/lib/mos-cro-slots";
import { fireMosCroEvent } from "@/lib/mos-cro-events";

export function MosCompletionBooster() {
  const { variant } = useAbSlot(MOS_COMPLETION_BOOSTER);
  const copy =
    COMPLETION_BOOSTER_COPY[variant] ?? COMPLETION_BOOSTER_COPY.fast_geschafft;

  useEffect(() => {
    fireMosCroEvent("MASTER_COMPLETION_BOOSTER_VIEW", variant);
  }, [variant]);

  return (
    <p className="font-sans text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
      {copy}
    </p>
  );
}

export default MosCompletionBooster;
