/**
 * MicroCommitmentBlock — additiv direkt VOR dem Booking-Embed.
 *
 * 3 kurze Reflexionsfragen erhöhen mentales Commitment vor der
 * Slot-Auswahl. Antworten werden NICHT persistiert (nur lokaler React-State),
 * nicht ans CRM, Pixel, Backend oder Logs gesendet.
 *
 * Events (1x/Session):
 *  - MASTER_MICRO_COMMITMENT_VIEW
 *  - MASTER_MICRO_COMMITMENT_COMPLETE (sobald alle 3 Felder befüllt sind)
 */
import { useEffect, useRef, useState } from "react";
import { trackFunnelEvent } from "@/lib/track-event";

const VIEW_KEY = "mos_micro_commitment_view_v1";
const COMPLETE_KEY = "mos_micro_commitment_complete_v1";

const QUESTIONS = [
  "Was möchtest du verändern?",
  "Warum interessiert dich dieser Weg?",
  "Was wäre in 12 Monaten anders?",
];

const MicroCommitmentBlock = () => {
  const ref = useRef<HTMLElement | null>(null);
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const completeFiredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    try {
      if (sessionStorage.getItem(VIEW_KEY) === "1") return;
    } catch { /* ignore */ }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            try {
              sessionStorage.setItem(VIEW_KEY, "1");
              trackFunnelEvent("MASTER_MICRO_COMMITMENT_VIEW", {
                funnel: "masterofsales",
              });
            } catch { /* never throw */ }
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (completeFiredRef.current) return;
    const allFilled = answers.every((a) => a.trim().length >= 3);
    if (!allFilled) return;
    try {
      if (sessionStorage.getItem(COMPLETE_KEY) === "1") {
        completeFiredRef.current = true;
        return;
      }
      sessionStorage.setItem(COMPLETE_KEY, "1");
    } catch { /* ignore */ }
    completeFiredRef.current = true;
    try {
      trackFunnelEvent("MASTER_MICRO_COMMITMENT_COMPLETE", {
        funnel: "masterofsales",
        // niemals Inhalte loggen — nur Längen.
        lens: answers.map((a) => a.trim().length),
      });
    } catch { /* never throw */ }
  }, [answers]);

  return (
    <section
      ref={ref}
      data-mos-section="micro_commitment"
      className="border-t border-[hsl(var(--funnel-sand))] bg-white/60 px-6 py-12 md:py-14"
    >
      <div className="mx-auto max-w-2xl">
        <p className="text-center font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--funnel-grey))]">
          Drei kurze Fragen für dich selbst
        </p>
        <p className="mx-auto mt-3 max-w-lg text-center font-sans text-[13.5px] leading-relaxed text-[hsl(var(--funnel-grey))]">
          Nur für dich. Wird nirgendwo gespeichert oder gesendet.
        </p>

        <div className="mt-7 space-y-4">
          {QUESTIONS.map((q, i) => (
            <label key={q} className="block">
              <span className="font-display text-[14.5px] font-medium text-[hsl(30,10%,16%)]">
                {q}
              </span>
              <textarea
                value={answers[i]}
                onChange={(e) =>
                  setAnswers((prev) => {
                    const next = [...prev];
                    next[i] = e.target.value;
                    return next;
                  })
                }
                rows={2}
                placeholder="Kurz für dich notieren …"
                className="mt-2 w-full rounded-md border border-[hsl(var(--funnel-sand))] bg-white px-3 py-2.5 font-sans text-[14px] leading-relaxed text-[hsl(30,10%,12%)] outline-none transition-colors focus:border-[hsl(var(--funnel-teal))]"
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MicroCommitmentBlock;
