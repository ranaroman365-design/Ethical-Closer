/**
 * Above-the-fold micro-commitment prefill bridge between /apply and /apply/quiz.
 *
 * The /apply landing page renders 3 time-investment buttons above the fold so a
 * user can begin the application without scrolling. The picked answer is stored
 * in sessionStorage and consumed exactly once by ApplyQuiz on mount, where it is
 * mapped onto the existing `time` question's optionIndex (no quiz logic change).
 *
 * Mapping rationale: APPLY_QUESTIONS[time].options are
 *   [0] "Weniger als 5 Stunden" / [1] "5–10" / [2] "10–20" / [3] "Mehr als 20"
 * The above-fold UI exposes only the 3 commitment-positive buckets (1, 2, 3).
 */

export type ApplyTimeBucket = "5-10" | "10-20" | "20+";

const KEY = "apply_prefill_time";

export const TIME_BUCKET_TO_QUIZ_INDEX: Record<ApplyTimeBucket, number> = {
  "5-10": 1,
  "10-20": 2,
  "20+": 3,
};

export function setApplyTimePrefill(bucket: ApplyTimeBucket): void {
  try {
    sessionStorage.setItem(KEY, bucket);
  } catch {
    /* storage disabled — prefill simply degrades to normal quiz start */
  }
}

export function consumeApplyTimePrefill(): ApplyTimeBucket | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    if (raw === "5-10" || raw === "10-20" || raw === "20+") return raw;
    return null;
  } catch {
    return null;
  }
}
