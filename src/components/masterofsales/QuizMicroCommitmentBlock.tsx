/**
 * Phase 9.7 · Section D — Micro-Commitment direkt vor Quiz-CTA.
 *
 * Renders ONLY when `mos_quiz_micro_commitment` variant !== "control".
 * Pure presentational copy block. No tracking, no routing.
 */

export default function QuizMicroCommitmentBlock() {
  return (
    <div
      aria-label="Micro-Commitment vor Quiz"
      className="mb-5 max-w-2xl rounded-2xl border border-accent/40 bg-accent/[0.04] p-5 md:p-6"
    >
      <p className="text-[10px] uppercase tracking-[0.26em] text-accent">
        Bevor du startest
      </p>
      <h3 className="mt-2 font-serif text-xl leading-snug text-foreground md:text-2xl">
        Bevor du Zeit investierst, solltest du eine Sache wissen.
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-foreground/75 md:text-base">
        Closing ist nicht für jeden geeignet. Genau deshalb gibt es diesen Test.
        In wenigen Minuten erfährst du, ob die Tätigkeit zu deinen Stärken,
        deinen Zielen und deinem Karriereweg passt.
      </p>
    </div>
  );
}
