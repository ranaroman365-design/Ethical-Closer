import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useFunnel } from "@/hooks/useFunnel";

const Live = () => {
  const navigate = useNavigate();
  const { path: funnelPath } = useFunnel();
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewers, setViewers] = useState(47);
  const [applied, setApplied] = useState(18);
  const viewerInterval = useRef<ReturnType<typeof setInterval>>();
  const appliedInterval = useRef<ReturnType<typeof setInterval>>();

  // Simulate viewer count fluctuation
  useEffect(() => {
    viewerInterval.current = setInterval(() => {
      setViewers((v) => {
        const delta = Math.random() < 0.6 ? 1 : Math.random() < 0.5 ? 0 : -1;
        return Math.max(38, Math.min(94, v + delta));
      });
    }, 4000 + Math.random() * 3000);
    return () => clearInterval(viewerInterval.current);
  }, []);

  // Simulate applied count slowly increasing
  useEffect(() => {
    appliedInterval.current = setInterval(() => {
      if (Math.random() < 0.3) {
        setApplied((a) => a + 1);
      }
    }, 12000 + Math.random() * 8000);
    return () => clearInterval(appliedInterval.current);
  }, []);

  // Video progress
  useEffect(() => {
    if (!started) return;
    const interval = setInterval(() => {
      setProgress((p) => (p >= 100 ? 100 : p + 100 / (32 * 60)));
    }, 1000);
    return () => clearInterval(interval);
  }, [started]);

  const handleStart = () => {
    setStarted(true);
    window.dispatchEvent(new CustomEvent("analytics", { detail: { event: "masterclass_start" } }));
  };

  const handleApply = () => {
    window.dispatchEvent(new CustomEvent("analytics", { detail: { event: "cta_primary_click", location: "masterclass_page" } }));
    navigate(funnelPath("bewerbung"));
  };

  const pad = (n: number) => n.toString().padStart(2, "0");
  const elapsed = Math.floor(progress * 19.2);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="min-h-screen bg-foreground">
      {/* Minimal top bar */}
      <div className="border-b border-primary-foreground/5">
        <div className="container flex items-center justify-between py-3">
          <button
            onClick={() => navigate("/")}
            className="font-sans text-xs text-primary-foreground/40 transition-colors hover:text-primary-foreground/70"
          >
            ← Zurück
          </button>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            <span className="font-sans text-[11px] font-medium text-primary-foreground/50">
              <motion.span
                key={viewers}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-block"
              >
                {viewers}
              </motion.span>
              {" "}schauen gerade zu
            </span>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-3xl px-4 py-8 md:py-14">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

          {/* Video area — primary focus */}
          <div className="relative mb-4 overflow-hidden rounded bg-primary-foreground/[0.03] border border-primary-foreground/[0.06]">
            <div className="aspect-video flex items-center justify-center">
              {!started ? (
                <button
                  onClick={handleStart}
                  className="group flex flex-col items-center gap-3"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/90 transition-transform group-hover:scale-105">
                    <svg className="ml-1 h-6 w-6 text-accent-foreground" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                  <span className="font-sans text-xs text-primary-foreground/40">Masterclass starten</span>
                </button>
              ) : (
                <div className="text-center">
                  <p className="font-serif text-lg text-primary-foreground/70">Masterclass läuft …</p>
                  <p className="mt-1 font-sans text-xs text-primary-foreground/30">Video-Player Platzhalter</p>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0">
              <div className="h-[3px] w-full bg-primary-foreground/5">
                <motion.div
                  className="h-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </div>

          {/* Time indicator */}
          <div className="mb-10 flex items-center justify-between font-mono text-[11px] text-primary-foreground/30">
            <span>{started ? `${mins}:${pad(secs)}` : "0:00"}</span>
            <span>32:00</span>
          </div>

          {/* Social proof bar */}
          <div className="mb-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded border border-primary-foreground/5 bg-primary-foreground/[0.03] px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="font-sans text-xs text-primary-foreground/50">
                <motion.span key={viewers} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-block font-medium text-primary-foreground/70">
                  {viewers}
                </motion.span>
                {" "}live dabei
              </span>
            </div>
            <span className="hidden text-primary-foreground/10 sm:inline">|</span>
            <span className="font-sans text-xs text-primary-foreground/50">
              <motion.span key={applied} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-block font-medium text-primary-foreground/70">
                {applied}
              </motion.span>
              {" "}haben sich beworben
            </span>
          </div>

          {/* CTA section */}
          <div className="text-center">
            <p className="mb-3 font-sans text-xs font-medium uppercase tracking-[0.15em] text-accent/80">
              Plätze sind begrenzt
            </p>
            <button
              onClick={handleApply}
              className="w-full max-w-sm rounded bg-accent px-10 py-4 font-sans text-sm font-medium tracking-wide text-accent-foreground transition-opacity hover:opacity-90 sm:w-auto"
            >
              Jetzt bewerben
            </button>
            <p className="mx-auto mt-5 max-w-sm font-sans text-[11px] leading-relaxed text-primary-foreground/30">
              Nach der Qualifizierung kannst du einen freien Termin buchen.
              Wer seinen Termin verpasst, kann sich aus Fairness nicht erneut bewerben.
            </p>
          </div>

        </motion.div>
      </div>
    </div>
  );
};

export default Live;
