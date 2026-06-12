/**
 * MOS Lead Commitment Line — Part 5.
 *
 * Soft, personal headline rendered ABOVE the existing LeadCaptureGate on
 * the MOS path. Existing capture form remains untouched.
 *
 * MOS-gated: render this component conditionally on `isMosSession`; the
 * fire-and-forget event also self-gates inside `fireMosCroEvent`.
 */
import { useEffect } from "react";
import { useAbSlot } from "@/hooks/useAbSlot";
import {
  MOS_LEAD_COMMITMENT_LINE,
  LEAD_COMMITMENT_COPY,
} from "@/lib/mos-cro-slots";
import { fireMosCroEvent } from "@/lib/mos-cro-events";

export function MosCommitmentLine() {
  const { variant } = useAbSlot(MOS_LEAD_COMMITMENT_LINE);
  const copy = LEAD_COMMITMENT_COPY[variant] ?? LEAD_COMMITMENT_COPY.entwicklungsorientiert;

  useEffect(() => {
    fireMosCroEvent("MASTER_LEAD_COMMITMENT_VIEW", variant);
  }, [variant]);

  return (
    <p className="font-serif text-base italic leading-relaxed text-foreground/80 md:text-lg">
      {copy}
    </p>
  );
}

export default MosCommitmentLine;
