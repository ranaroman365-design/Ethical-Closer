/**
 * HeroHumanProofMount — additive above-the-fold mount for the
 * `mos_hero_human_proof` Phase 9.3 image slot.
 *
 * STRICTLY ADDITIVE. Pure presentation. Does NOT touch Quiz, Booking,
 * CRM, Calendly, Auth, Routing, Tracking, Revenue, Thompson Sampling,
 * `ab_slot_weights`, or `force_slot` — it simply renders the existing
 * `MosImageSlot` for the canonical slot key in two placements:
 *
 *   • Desktop (md+): polished inline card meant to live in the right
 *     column of a 2-col hero grid (max-w-[440px]).
 *   • Mobile  (<md): inline directly under headline/subline.
 *
 * Mount BOTH variants once per Hero — placement is controlled via the
 * `placement` prop. On control / no-asset the underlying MosImageSlot
 * renders `null` → no DOM, no layout shift.
 */
import MosImageSlot from "./MosImageSlot";

export interface HeroHumanProofMountProps {
  placement: "desktop" | "mobile";
}

export default function HeroHumanProofMount({
  placement,
}: HeroHumanProofMountProps) {
  if (placement === "desktop") {
    return (
      <div
        data-mos-hero-human-proof="desktop"
        className="hidden md:flex md:justify-end"
      >
        <div className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-accent/25 bg-foreground/[0.03] shadow-[0_30px_60px_-25px_rgba(0,0,0,0.55),0_10px_30px_-15px_rgba(0,0,0,0.4)] ring-1 ring-foreground/5">
          <MosImageSlot
            slot="mos_hero_human_proof"
            priority
            hideCaption
            unstyled
          />
        </div>
      </div>
    );
  }
  return (
    <div
      data-mos-hero-human-proof="mobile"
      className="mb-6 mt-5 md:hidden"
    >
      <div className="relative w-full overflow-hidden rounded-2xl border border-accent/25 bg-foreground/[0.03] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.55)] ring-1 ring-foreground/5">
        <MosImageSlot
          slot="mos_hero_human_proof"
          priority
          hideCaption
          unstyled
        />
      </div>
    </div>
  );
}
