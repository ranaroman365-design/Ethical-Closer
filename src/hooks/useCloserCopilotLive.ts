/**
 * useCloserCopilotLive
 *
 * Manages a live coaching session: speech recognition → tick every TICK_MS →
 * edge function call → latest CopilotTick state for the UI.
 *
 * - Tick fires only when there is *new* finalized transcript content.
 * - Latency-protected: while a tick is in flight, no new tick is started.
 * - Auto-creates a copilot_sessions row on first successful tick.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export type CopilotTick = {
  session_id: string;
  tick_index: number;
  latency_ms: number;
  phase: string;
  buyer_state: string;
  deal_risk: string;
  detected_objection: string;
  next_best_action: string;
  exact_phrase: string;
  alt_phrase: string;
  reasoning: string;
  risk_alert: string | null;
  clarity_score: number;
  confidence_score: number;
  control_score: number;
  objection_score: number;
  ethical_score: number;
};

const TICK_MS = 4000;

export function useCloserCopilotLive(opts?: { callId?: string | null }) {
  const callId = opts?.callId ?? null;

  const speech = useSpeechRecognition("de");
  const [running, setRunning] = useState(false);
  const [latest, setLatest] = useState<CopilotTick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");

  const sessionIdRef = useRef<string | null>(null);
  const tickIndexRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastSentLenRef = useRef(0);
  const intervalRef = useRef<number | null>(null);

  const callTick = useCallback(
    async (windowText: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke(
          "closer-copilot-live-v2",
          {
            body: {
              session_id: sessionIdRef.current ?? undefined,
              call_id: callId ?? undefined,
              transcript_window: windowText,
              tick_index: tickIndexRef.current,
            },
          },
        );
        if (fnErr) {
          setError(fnErr.message ?? "tick_failed");
          return;
        }
        const tick = data as CopilotTick;
        if (tick?.session_id) sessionIdRef.current = tick.session_id;
        tickIndexRef.current += 1;
        setLatest(tick);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "tick_failed");
      } finally {
        inFlightRef.current = false;
      }
    },
    [callId],
  );

  const start = useCallback(() => {
    setError(null);
    sessionIdRef.current = null;
    tickIndexRef.current = 0;
    lastSentLenRef.current = 0;
    speech.clearTranscript();
    speech.startListening();
    setRunning(true);
  }, [speech]);

  const stop = useCallback(async () => {
    setRunning(false);
    speech.stopListening();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (sessionIdRef.current) {
      await (supabase as any)
        .from("copilot_sessions")
        .update({
          ended_at: new Date().toISOString(),
          outcome: "ended",
        })
        .eq("id", sessionIdRef.current);
    }
  }, [speech]);

  const sendManual = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      await callTick(t);
      setManualText("");
    },
    [callTick],
  );

  // tick loop
  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      const text = (speech.transcript + " " + speech.interimTranscript).trim();
      if (text.length === 0) return;
      // Only call when there's at least 20 new chars since last tick
      if (text.length - lastSentLenRef.current < 20) return;
      lastSentLenRef.current = text.length;
      void callTick(text.slice(-3000));
    }, TICK_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [running, speech.transcript, speech.interimTranscript, callTick]);

  return {
    running,
    latest,
    error,
    start,
    stop,
    speech,
    manualText,
    setManualText,
    sendManual,
    sessionId: sessionIdRef.current,
    tickCount: tickIndexRef.current,
  };
}
