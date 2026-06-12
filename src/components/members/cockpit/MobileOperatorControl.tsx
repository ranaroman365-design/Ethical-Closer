import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Pause,
  Play,
  Zap,
  Activity,
  Bell,
  Send,
  PhoneCall,
  Server,
} from "lucide-react";
import { SystemArchitectureView } from "./SystemArchitectureView";

interface ControlView {
  funnels: string[];
  flags: any[];
  next_actions: any[];
  escalations: any[];
  active_locks_count: number;
  is_admin: boolean;
}

interface Props {
  view: ControlView;
  funnelKey: string;
  saving: string | null;
  onDecideNba: (id: string, decision: "approved" | "skipped") => void;
  onAckEscalation: (id: string) => void;
  onEmergencyPause: () => void;
  userId?: string;
}

export function MobileOperatorControl({
  view,
  funnelKey,
  saving,
  onDecideNba,
  onAckEscalation,
  onEmergencyPause,
}: Props) {
  const { lang } = useLanguage();
  const [nbaIndex, setNbaIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const flags = view.flags[0] ?? {};
  const aiOn = !!flags.conversational_ai_enabled || !!flags.ai_setter_enabled;
  const attendanceOn = !!flags.smart_attendance_enabled;
  const activeFunnel = funnelKey === "__all" ? (view.funnels[0] ?? "—") : funnelKey;

  // Performance snapshot (lightweight RPC)
  const [perf, setPerf] = useState<{ bookings: number; show: number; close: number }>({
    bookings: 0,
    show: 0,
    close: 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await (supabase as any).rpc("perf_operator_own_performance", {});
        if (data) {
          setPerf({
            bookings: data.bookings_30d ?? data.bookings ?? 0,
            show: Math.round((data.show_rate ?? 0) * 100),
            close: Math.round((data.close_rate ?? 0) * 100),
          });
        }
      } catch {
        // silent — RPC optional on mobile
      }
    })();
  }, [funnelKey]);

  const nbaList = view.next_actions ?? [];
  const currentNba = nbaList[nbaIndex];

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0 && nbaIndex < nbaList.length - 1) setNbaIndex(nbaIndex + 1);
      if (dx > 0 && nbaIndex > 0) setNbaIndex(nbaIndex - 1);
    }
    touchStartX.current = null;
  };

  return (
    <div className="space-y-3 px-4 pt-4 pb-24">
      {/* 1 — Status Bar */}
      <Card className="animate-section-in rounded-2xl bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {lang === "de" ? "Funnel" : "Funnel"}
            </p>
            <p className="truncate font-mono text-sm font-medium">{activeFunnel}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
              <span className={`rounded-full px-2 py-0.5 ${aiOn ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                AI {aiOn ? "ON" : "OFF"}
              </span>
              <span className={`rounded-full px-2 py-0.5 ${attendanceOn ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                Attendance {attendanceOn ? "ON" : "OFF"}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onEmergencyPause}
            disabled={saving === "emergency_pause"}
            className="h-11 shrink-0 border-rose-300 text-rose-600 hover:bg-rose-50"
          >
            <Pause className="mr-1.5 h-3.5 w-3.5" />
            {lang === "de" ? "Pause" : "Pause"}
          </Button>
        </div>
      </Card>

      {/* 2 — Performance Snapshot (1 row) */}
      <Card className="rounded-2xl p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <PerfCell label={lang === "de" ? "Buchungen" : "Bookings"} value={perf.bookings.toString()} />
          <PerfCell label="Show" value={`${perf.show}%`} />
          <PerfCell label="Close" value={`${perf.close}%`} />
        </div>
      </Card>

      {/* 3 — Next Best Action (single, swipeable) */}
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.14em]">
              {lang === "de" ? "Nächste Aktion" : "Next Best Action"}
            </h2>
          </div>
          {nbaList.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {nbaIndex + 1} / {nbaList.length}
            </span>
          )}
        </div>

        {!currentNba ? (
          <Card className="rounded-2xl p-6 text-center text-sm text-muted-foreground">
            {lang === "de" ? "Keine offenen Aktionen." : "No pending actions."}
          </Card>
        ) : (
          <Card
            className="rounded-2xl bg-muted/20 p-5"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="mb-3 flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px]">
                {currentNba.action.replace(/_/g, " ")}
              </Badge>
              <span className="font-mono text-[10px] text-muted-foreground">
                {currentNba.lead_id?.slice(0, 8)}
              </span>
            </div>
            <p className="font-serif text-lg font-light leading-snug">
              {currentNba.reason}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {currentNba.funnel_key} · conf {Math.round((currentNba.confidence ?? 0) * 100)}% · {new Date(currentNba.run_at).toLocaleString()}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => onDecideNba(currentNba.id, "skipped")}
                disabled={saving === `nba:${currentNba.id}`}
                className="h-11 rounded-xl"
              >
                {lang === "de" ? "Pause" : "Skip"}
              </Button>
              <Button
                onClick={() => onDecideNba(currentNba.id, "approved")}
                disabled={saving === `nba:${currentNba.id}`}
                className="h-11 rounded-xl"
              >
                {lang === "de" ? "Ausführen" : "Execute"}
              </Button>
            </div>

            {nbaList.length > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNbaIndex(Math.max(0, nbaIndex - 1))}
                  disabled={nbaIndex === 0}
                  className="h-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  {lang === "de" ? "Wischen" : "Swipe"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNbaIndex(Math.min(nbaList.length - 1, nbaIndex + 1))}
                  disabled={nbaIndex >= nbaList.length - 1}
                  className="h-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Card>
        )}
      </section>

      {/* 4 — Escalations (max 3) */}
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.14em]">
              {lang === "de" ? "Eskalationen" : "Escalations"}
            </h2>
          </div>
          {view.escalations.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{view.escalations.length - 3}</span>
          )}
        </div>
        <div className="space-y-2">
          {view.escalations.length === 0 && (
            <Card className="rounded-2xl p-4 text-center text-xs text-muted-foreground">
              {lang === "de" ? "Alles klar." : "All clear."}
            </Card>
          )}
          {view.escalations.slice(0, 3).map((e: any) => (
            <Card key={e.id} className="rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge
                  variant={e.severity === "critical" ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {e.severity}
                </Badge>
                <span className="text-xs font-medium">{e.kind}</span>
              </div>
              {e.detail && <p className="mb-3 text-xs text-muted-foreground">{e.detail}</p>}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAckEscalation(e.id)}
                  disabled={saving === `esc:${e.id}`}
                  className="h-10 rounded-xl"
                >
                  {lang === "de" ? "Ignorieren" : "Ignore"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => onAckEscalation(e.id)}
                  disabled={saving === `esc:${e.id}`}
                  className="h-10 rounded-xl"
                >
                  {lang === "de" ? "Übernehmen" : "Take Over"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 5 — Quick Actions */}
      <section>
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em]">
            {lang === "de" ? "Schnellaktionen" : "Quick Actions"}
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <QuickBtn
            icon={<Send className="h-4 w-4" />}
            label={lang === "de" ? "Reminder" : "Reminder"}
            onClick={() => currentNba && onDecideNba(currentNba.id, "approved")}
            disabled={!currentNba}
          />
          <QuickBtn
            icon={<PhoneCall className="h-4 w-4" />}
            label={lang === "de" ? "AI Call" : "AI Call"}
            onClick={() => {}}
            disabled={!aiOn}
          />
          <QuickBtn
            icon={<Pause className="h-4 w-4" />}
            label={lang === "de" ? "Pause" : "Pause"}
            onClick={onEmergencyPause}
            disabled={saving === "emergency_pause"}
          />
        </div>
      </section>

      {/* 6 — Mini System View */}
      <Sheet>
        <SheetTrigger asChild>
          <Card className="cursor-pointer rounded-2xl bg-muted/20 p-4 transition active:scale-[0.99]">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
                  System
                </span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              Supabase → Queue → WhatsApp <span className="text-emerald-600">●</span>{" "}
              · Push <span className="text-muted-foreground">○</span> · Email{" "}
              <span className="text-emerald-600">●</span>
            </p>
          </Card>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-2xl">
          <div className="pt-2">
            <SystemArchitectureView />
          </div>
        </SheetContent>
      </Sheet>

      {/* Bottom safe-area spacer */}
      <div className="h-4" />
    </div>
  );
}

function PerfCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-serif text-xl font-light leading-none">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function QuickBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl border bg-background text-xs transition active:scale-95 disabled:opacity-40"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
