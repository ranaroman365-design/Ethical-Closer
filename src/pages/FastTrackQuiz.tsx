import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import { trackFunnelEvent } from "@/lib/track-event";
import {
  FAST_TRACK_QUESTIONS,
  calculateFastTrackScore,
} from "@/lib/fast-track-engine";

const FastTrackQuiz = () => {
  const [step, setStep] = useState(-1);
  const [answerScores, setAnswerScores] = useState<number[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const navigate = useNavigate();

  const totalQuestions = FAST_TRACK_QUESTIONS.length;

  useEffect(() => {
    trackFunnelEvent("fast_track_quiz_view", {});
  }, []);

  const handleAnswer = (score: number, optionIndex: number) => {
    setSelectedIdx(optionIndex);

    setTimeout(() => {
      const next = [...answerScores, score];
      setAnswerScores(next);
      setSelectedIdx(null);

      if (step + 1 < totalQuestions) {
        setStep(step + 1);
      } else {
        setStep(totalQuestions);

        const result = calculateFastTrackScore(next);

        localStorage.setItem("fast_track_score", String(result.score));
        localStorage.setItem("fast_track_bucket", result.bucket);
        localStorage.setItem("fast_track_answers", JSON.stringify(result.answers));
        localStorage.setItem("fast_track_completed_at", new Date().toISOString());

        trackFunnelEvent("fast_track_quiz_completed", {
          score: result.score,
          bucket: result.bucket,
        });

        setTimeout(() => {
          navigate(`/fast-track/ergebnis?bucket=${result.bucket}&score=${result.score}`);
        }, 2000);
      }
    }, 350);
  };

  const progress = step >= 0 ? ((step + 1) / totalQuestions) * 100 : 0;
  const currentQ = step >= 0 && step < totalQuestions ? FAST_TRACK_QUESTIONS[step] : null;

  return (
    <div className="min-h-screen bg-funnel-warm-bg text-funnel-dark flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl">
          <AnimatePresence mode="wait">
            {step === -1 ? (
              <motion.div
                key="intro"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.5 }}
                className="text-center space-y-8"
              >
                <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-funnel-gold">
                  Fast Track
                </p>
                <h1 className="font-display text-3xl md:text-4xl font-semibold leading-[1.15]">
                  Das ist keine Bewerbung.
                  <br />
                  Das ist eine Entscheidung.
                </h1>
                <p className="font-sans text-lg leading-relaxed opacity-70 max-w-md mx-auto">
                  Die meisten Menschen brauchen ein Gespräch, um Klarheit zu bekommen.
                  Einige wissen bereits, was sie wollen.
                  <br /><br />
                  Dieses kurze Assessment zeigt uns, ob du bereit bist, direkt zu starten — ohne Umwege.
                </p>
                <button
                  onClick={() => {
                    setStep(0);
                    trackFunnelEvent("fast_track_quiz_started", {});
                  }}
                  className="inline-flex items-center gap-2 px-10 py-4 rounded-sm font-sans font-semibold text-base transition-all bg-funnel-gold text-funnel-dark hover:bg-funnel-gold/90"
                >
                  Assessment starten
                  <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>
            ) : step === totalQuestions ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-center space-y-6"
              >
                <div className="mx-auto h-12 w-12 rounded-full animate-pulse bg-funnel-gold/20" />
                <h2 className="font-display text-2xl font-semibold">
                  Dein Ergebnis wird ausgewertet.
                </h2>
                <p className="font-sans text-base opacity-60">Einen Moment…</p>
              </motion.div>
            ) : currentQ ? (
              <motion.div
                key={`q-${step}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                <div className="w-full h-1 bg-funnel-sand/50 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-funnel-gold"
                    initial={{ width: `${((step) / totalQuestions) * 100}%` }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>

                <p className="font-sans text-xs text-funnel-grey uppercase tracking-wider">
                  Frage {step + 1} von {totalQuestions}
                </p>

                <h2 className="font-display text-2xl md:text-3xl font-semibold leading-tight">
                  {currentQ.question}
                </h2>

                <div className="space-y-3">
                  {currentQ.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(opt.score, idx)}
                      className={cn(
                        "flex w-full items-center gap-3 text-left rounded-sm border p-5 font-sans text-base md:text-lg transition-all active:scale-[0.98]",
                        selectedIdx === idx
                          ? "border-funnel-gold bg-funnel-gold/5"
                          : "border-funnel-sand/60 bg-white hover:border-funnel-gold hover:bg-funnel-gold/5",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-all",
                          selectedIdx === idx ? "border-funnel-gold bg-funnel-gold/20" : "border-funnel-sand",
                        )}
                      >
                        {selectedIdx === idx ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          String.fromCharCode(65 + idx)
                        )}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <FunnelFooter />
    </div>
  );
};

export default FastTrackQuiz;
