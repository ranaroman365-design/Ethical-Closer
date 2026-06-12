/**
 * CopilotLiveWidget
 *
 * Floating, draggable, real-time coaching overlay for closers.
 * Mounts globally; collapsed by default; toggled by a small launcher button.
 * Inside a live call:
 *   1. Tap ▶ to start listening.
 *   2. Closer sees BIG next sentence + risk + buyer state + score live.
 *   3. Manual text input as fallback when speech is unreliable.
 *
 * Pure presentation — all logic lives in useCloserCopilotLive.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertTriangle,
  GripVertical,
  Mic,
  MicOff,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCloserCopilotLive } from "@/hooks/useCloserCopilotLive";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "etc.copilot_widget.v1";

type Pos = { x: number; y: number };

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { x: 16, y: 96 };
}

function buyerStateColor(s?: string) {
  switch (s) {
    case "interested": return "bg-emerald-500/15 text-emerald-600";
    case "skeptical": return "bg-amber-500/15 text-amber-600";
    case "resistant": return "bg-rose-500/15 text-rose-600";
    case "emotional": return "bg-violet-500/15 text-violet-600";
    default: return "bg-muted text-muted-foreground";
  }
}

function riskColor(r?: string) {
  switch (r) {
    case "strong": return "bg-emerald-500/15 text-emerald-600";
    case "neutral": return "bg-muted text-muted-foreground";
    case "weak": return "bg-amber-500/15 text-amber-600";
    case "at_risk": return "bg-rose-500/15 text-rose-600";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function CopilotLiveWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>(loadPos);
  const draggingRef = useRef<{ ox: number; oy: number } | null>(null);

  const copilot = useCloserCopilotLive();

  // Strict allow-list: only inside dedicated work environments. Never on
  // dashboard, landing, onboarding, calendar, admin overview, or public funnel.
  const path = location.pathname;
  const allowed =
    path.startsWith("/members/closer-workspace") ||
    path.startsWith("/members/setter-workspace") ||
    path.startsWith("/members/closing-os") ||
    path.startsWith("/members/call-review") ||
    path.startsWith("/members/calls") ||
    path.startsWith("/members/closing");

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos]);

  if (!allowed) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const x = Math.max(8, Math.min(window.innerWidth - 360, e.clientX - draggingRef.current.ox));
    const y = Math.max(8, Math.min(window.innerHeight - 80, e.clientY - draggingRef.current.oy));
    setPos({ x, y });
  };
  const onPointerUp = () => { draggingRef.current = null; };

  const t = copilot.latest;
  const overall = t
    ? Math.round(
        (t.clarity_score + t.confidence_score + t.control_score + t.objection_score + t.ethical_score) / 5,
      )
    : 0;

  // collapsed launcher
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition"
        aria-label="Open Copilot"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  return (
    <Card
      style={{ left: pos.x, top: pos.y, width: 340 }}
      className="fixed z-[60] flex flex-col overflow-hidden border-border/60 shadow-2xl backdrop-blur"
    >
      {/* header (drag handle) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-3 py-2 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-wide uppercase">Live Copilot</span>
          {copilot.running && (
            <span className="ml-1 inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {copilot.running ? (
            <Button size="icon" variant="ghost" onClick={() => void copilot.stop()} className="h-7 w-7">
              <MicOff className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" onClick={copilot.start} className="h-7 w-7">
              <Mic className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => setOpen(false)} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* body */}
      <div className="flex flex-col gap-3 p-3">
        {/* RISK ALERT (top — only when present) */}
        {t?.risk_alert && (
          <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-snug">{t.risk_alert}</span>
          </div>
        )}

        {/* NEXT BEST SENTENCE — BIG */}
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            🎯 Sag jetzt
          </div>
          <p className="text-base font-semibold leading-snug text-foreground">
            {t?.exact_phrase ?? (copilot.running
              ? "Höre zu …"
              : "Tippe das Mikro, um zu starten.")}
          </p>
          {t?.alt_phrase && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">Alt:</span> {t.alt_phrase}
            </p>
          )}
        </div>

        {/* META row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {t?.phase && <Badge variant="secondary" className="text-[10px] uppercase">{t.phase}</Badge>}
          {t?.buyer_state && (
            <Badge className={cn("text-[10px] uppercase border-0", buyerStateColor(t.buyer_state))}>
              {t.buyer_state}
            </Badge>
          )}
          {t?.deal_risk && (
            <Badge className={cn("text-[10px] uppercase border-0", riskColor(t.deal_risk))}>
              {t.deal_risk.replace("_", " ")}
            </Badge>
          )}
          {t?.detected_objection && t.detected_objection !== "none" && (
            <Badge variant="outline" className="text-[10px] uppercase">
              ✋ {t.detected_objection}
            </Badge>
          )}
        </div>

        {/* SCORE bar */}
        {t && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Live Score</span>
              <span className="font-semibold text-foreground">{overall}/100</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  overall >= 70 ? "bg-emerald-500" : overall >= 45 ? "bg-amber-500" : "bg-rose-500",
                )}
                style={{ width: `${overall}%` }}
              />
            </div>
          </div>
        )}

        {/* MANUAL fallback */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void copilot.sendManual(copilot.manualText);
          }}
          className="flex items-center gap-1"
        >
          <Input
            value={copilot.manualText}
            onChange={(e) => copilot.setManualText(e.target.value)}
            placeholder="Manuell tippen (Fallback)…"
            className="h-8 text-xs"
          />
          <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" aria-label="Send">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>

        {/* footer status */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {copilot.running ? `Tick ${copilot.tickCount}` : "Pausiert"}
            {t?.latency_ms ? ` · ${t.latency_ms}ms` : ""}
          </span>
          {copilot.error && <span className="text-rose-600">{copilot.error}</span>}
          {!copilot.speech.isSupported && (
            <span className="text-amber-600">Speech off — Chrome empfohlen</span>
          )}
        </div>
      </div>
    </Card>
  );
}
