// Calendar Deep-Link · Layer 50
// Conversion Control Panel — 4-block appointment detail for max pre-call intelligence.

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { calculateLeadScore, buildScoringInput, getTierColor, getTierBg, getTierEmoji, type LeadScoringResult } from "@/lib/lead-scoring-engine";
import { deriveAutoActions, getActionPriorityColor, getActionCategoryLabel, getChannelIcon, getRiskLevelConfig, formatTimeline, type AutoActionPlan, type AutoAction } from "@/lib/auto-action-engine";
import { formatAppointmentTime as formatAppointmentTimeFn, getAppointmentLocalDate } from "@/lib/appointment-time-display";
import { useAuth } from "@/hooks/useAuth";
import {
  exportAppointmentsICS,
  exportAppointmentsGoogle,

  exportAppointmentsOutlook,
  type ExportAppointment,
  type ExportMeta,
} from "@/lib/calendar-export";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ChevronLeft,
  Mail,
  Phone,
  Calendar,
  User,
  Activity,
  AlertTriangle,
  RefreshCw,
  X,
  ChevronDown,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  ExternalLink,
  Globe,
  UserCheck,
  ArrowRightLeft,
  MessageCircle,
  Zap,
  Target,
  Clock,
  BarChart3,
  FileText,
  PhoneCall,
  Send,
  Video,
  Search,
} from "lucide-react";
import { formatDistanceToNow, format, differenceInHours, differenceInMinutes } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ── Types ──

type Ctx = {
  appointment?: Record<string, any>;
  lead?: Record<string, any> | null;
  lead_missing?: boolean;
  stats?: { calls_count: number; messages_count: number; appointments_count: number; avg_response_time_minutes?: number | null; has_lead_replied?: boolean; first_contact_minutes?: number | null; lead_reply_count?: number };
  last_quiz?: Record<string, any> | null;
  last_call?: Record<string, any> | null;
  error?: string;
  message?: string;
};

type ProfileRef = { id: string; full_name: string | null; email: string | null; current_phase: number | null };

import type { ResolveTarget } from '@/components/calendar/SmartAlerts';

interface Props {
  appointmentId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source?: string;
  /** When set, auto-scrolls to the matching resolve section on open */
  resolveTarget?: ResolveTarget | null;
}

// ── Main Modal ──

export function AppointmentDetailModal({ appointmentId, open, onOpenChange, source, resolveTarget }: Props) {
  const { user, isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"appointment" | "lead">("appointment");
  const [reloadKey, setReloadKey] = useState(0);
  const [profiles, setProfiles] = useState<Map<string, ProfileRef>>(new Map());
  const [callerLevel, setCallerLevel] = useState<number>(0);
  const [inCall, setInCall] = useState(false);
  const [qualDrawerOpen, setQualDrawerOpen] = useState(true);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    setCtx(null);
    const startedAt = performance.now();
    const surface = source ?? "unknown";
    console.info("[AppointmentModal] rpc.start", { appointmentId, source: surface });
    let success = false;
    let errCode: string | null = null;
    let errMessage: string | null = null;
    try {
      const { data, error } = await supabase.rpc("get_appointment_full_context", {
        p_appointment_id: appointmentId,
      });
      if (error) {
        errCode = (error as any).code ?? "rpc_error";
        errMessage = error.message;
        setCtx({ error: "rpc_error", message: error.message });
        console.error("[AppointmentModal] rpc.error", { appointmentId, source: surface, error });
      } else if (!data || (data as Ctx).error || !(data as Ctx).appointment) {
        const payload = (data as Ctx) ?? { error: "empty" };
        errCode = payload.error ?? "empty_or_no_appointment";
        errMessage = payload.message ?? "no appointment in payload";
        setCtx(payload);
        console.warn("[AppointmentModal] rpc.empty", { appointmentId, source: surface, code: errCode, data });
      } else {
        success = true;
        setCtx(data as Ctx);
        console.info("[AppointmentModal] rpc.success", {
          appointmentId, source: surface, hasLead: !!(data as Ctx).lead, leadMissing: !!(data as Ctx).lead_missing,
        });
      }
    } catch (e: any) {
      errCode = "exception";
      errMessage = e?.message ?? String(e);
      setCtx({ error: errMessage });
      console.error("[AppointmentModal] rpc.exception", { appointmentId, source: surface, e });
    } finally {
      setLoading(false);
      const latency = Math.round(performance.now() - startedAt);
      supabase
        .rpc("log_appointment_modal_open", {
          p_appointment_id: appointmentId,
          p_success: success,
          p_error_code: errCode,
          p_error_message: errMessage,
          p_latency_ms: latency,
          p_source: surface,
        })
        .then(({ error: logErr }) => {
          if (logErr) console.warn("[AppointmentModal] audit.log_failed", logErr);
        });
    }
  }, [appointmentId, source]);

  useEffect(() => {
    if (!open || !appointmentId) return;
    setView("appointment");
    setInCall(false);
    setQualDrawerOpen(true);
    void load();
  }, [appointmentId, open, reloadKey, load]);

  useEffect(() => {
    if (!ctx?.appointment) return;
    const a = ctx.appointment;
    const ids = new Set<string>();
    for (const k of ['setter_id', 'closer_id', 'current_owner_id', 'original_owner_id', 'assigned_operator_id']) {
      const v = a[k];
      if (v && typeof v === 'string') ids.add(v);
    }
    if (ctx.lead?.setter_id) ids.add(ctx.lead.setter_id);
    if (ctx.lead?.closer_id) ids.add(ctx.lead.closer_id);
    if (ctx.lead?.owner_id) ids.add(ctx.lead.owner_id);
    if (ids.size === 0) return;
    supabase
      .from('profiles')
      .select('id, full_name, email, current_phase')
      .in('id', Array.from(ids))
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, ProfileRef>();
        for (const p of data) map.set(p.id, p as ProfileRef);
        setProfiles(map);
      });
  }, [ctx]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('current_phase')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setCallerLevel(data.current_phase ?? 0);
      });
  }, [user]);

  // Auto-scroll to resolve target section when data is loaded
  useEffect(() => {
    if (!resolveTarget || loading || !ctx?.appointment) return;
    // Delay to let DOM render
    const timer = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const target = container.querySelector(`[data-resolve-id="${resolveTarget}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Brief highlight pulse
        target.classList.add('ring-2', 'ring-primary/50', 'ring-offset-2');
        setTimeout(() => target.classList.remove('ring-2', 'ring-primary/50', 'ring-offset-2'), 2500);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [resolveTarget, loading, ctx]);

  const isError = !loading && (!ctx || ctx.error || !ctx.appointment);
  const hasLead = !!ctx?.lead;
  const title = inCall ? "In Call" : view === "appointment" ? "Conversion Control Panel" : "Lead-Profil";

  const videoCallUrl = ctx?.appointment
    ? (ctx.appointment.video_call_link || (ctx.appointment.meeting_id ? `https://zoom.us/j/${ctx.appointment.meeting_id}` : null))
    : null;

  const handleStartCall = () => {
    if (videoCallUrl) setInCall(true);
  };
  const handleEndCall = () => {
    setInCall(false);
    setQualDrawerOpen(true);
  };

  const qualificationElement = !loading && !isError && ctx?.lead?.id && ctx?.appointment?.id ? (
    <InlineQualificationPanel
      leadId={ctx.lead.id as string}
      appointmentId={ctx.appointment.id as string}
      initialData={{
        setter_notes: ctx.appointment.setter_notes as string || '',
        closer_notes: ctx.lead.closer_notes as string || '',
        outcome: ctx.appointment.outcome as string || '',
        setter_budget_readiness: ctx.lead.setter_budget_readiness as string || '',
        setter_decision_readiness: ctx.lead.setter_decision_readiness as string || '',
        setter_problem_clarity: ctx.lead.setter_problem_clarity as string || '',
        setter_recommendation: ctx.lead.setter_recommendation as string || '',
        qualification_score: ctx.lead.qualification_score as number | null,
      }}
      onSaved={() => setReloadKey(k => k + 1)}
    />
  ) : null;

  const Body = (
    <>
      {loading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <ErrorState code={ctx?.error} message={ctx?.message} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : view === "appointment" ? (
        <ConversionPanel
          ctx={ctx!}
          profiles={profiles}
          callerLevel={callerLevel}
          onLeadClick={hasLead ? () => setView("lead") : undefined}
          onReload={() => setReloadKey((k) => k + 1)}
          onStartCall={videoCallUrl ? handleStartCall : undefined}
          inCall={inCall}
          isAdmin={isAdmin}
        />
      ) : (
        <LeadView ctx={ctx!} onBack={() => setView("appointment")} />
      )}
    </>
  );

  // ── Mobile: In-Call mode ──
  if (isMobile && inCall) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "p-0 rounded-t-2xl border-t border-border/60",
            "h-[100dvh] max-h-[100dvh] flex flex-col gap-0",
            "[&>button.absolute]:hidden",
          )}
        >
          {/* Video iframe area */}
          <div className="flex-1 min-h-0 bg-black relative">
            <iframe
              src={videoCallUrl!}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="w-full h-full border-0"
              title="Video Call"
            />
            <div className="absolute top-2 right-2 flex gap-1.5 z-10">
              <button
                onClick={() => setQualDrawerOpen(v => !v)}
                className="h-9 w-9 rounded-full bg-background/90 backdrop-blur-sm flex items-center justify-center shadow-lg"
                aria-label="Qualification öffnen"
              >
                <Target size={16} className="text-primary" />
              </button>
              <button
                onClick={handleEndCall}
                className="h-9 w-9 rounded-full bg-red-500/90 backdrop-blur-sm flex items-center justify-center shadow-lg"
                aria-label="Call beenden"
              >
                <X size={16} className="text-white" />
              </button>
            </div>
          </div>
          {/* Bottom Drawer for Qualification */}
          {qualDrawerOpen && qualificationElement && (
            <div
              className="border-t border-border/40 bg-background overflow-y-auto overscroll-contain"
              style={{
                maxHeight: "45dvh",
                paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
              }}
            >
              <div className="flex items-center justify-between px-4 pt-2 pb-1 sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qualification</span>
                <button onClick={() => setQualDrawerOpen(false)} className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center">
                  <ChevronDown size={14} />
                </button>
              </div>
              <div className="px-4 pb-3">
                {qualificationElement}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  // ── Mobile: Normal mode ──
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "p-0 rounded-t-2xl border-t border-border/60",
            "h-[92dvh] max-h-[92dvh] flex flex-col gap-0",
            "[&>button.absolute]:hidden",
          )}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/40 bg-background/95 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              {view === "lead" && (
                <button
                  onClick={() => setView("appointment")}
                  aria-label="Zurück"
                  className="h-9 w-9 -ml-2 inline-flex items-center justify-center rounded-full hover:bg-muted active:bg-muted/80"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              <h2 className="font-serif text-lg truncate">{title}</h2>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Schließen"
              className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted active:bg-muted/80"
            >
              <X size={18} />
            </button>
          </div>
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3"
            style={{
              paddingBottom: hasLead && view === "appointment"
                ? "calc(96px + env(safe-area-inset-bottom))"
                : "calc(24px + env(safe-area-inset-bottom))",
            }}
          >
            {Body}
          </div>
          {!loading && !isError && hasLead && view === "appointment" && (
            <div
              className="absolute inset-x-0 bottom-0 px-4 pt-3 border-t border-border/40 bg-background/95 backdrop-blur-sm"
              style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
            >
              <Button onClick={() => setView("lead")} className="w-full h-12 rounded-xl" size="lg">
                Vollständiger Lead-Kontext →
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  // ── Desktop: In-Call mode ──
  if (inCall) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] h-[92vh] p-0 overflow-hidden">
          <div className="flex h-full">
            {/* Video Area */}
            <div className="flex-1 min-w-0 bg-black relative">
              <iframe
                src={videoCallUrl!}
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                className="w-full h-full border-0"
                title="Video Call"
              />
              <div className="absolute top-3 left-3 flex gap-2 z-10">
                <button
                  onClick={handleEndCall}
                  className="px-3 py-1.5 rounded-lg bg-red-500/90 backdrop-blur-sm text-white text-sm font-medium flex items-center gap-1.5 shadow-lg hover:bg-red-600/90 transition"
                >
                  <X size={14} /> Call beenden
                </button>
                {!qualDrawerOpen && (
                  <button
                    onClick={() => setQualDrawerOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-background/90 backdrop-blur-sm text-sm font-medium flex items-center gap-1.5 shadow-lg hover:bg-background transition"
                  >
                    <Target size={14} className="text-primary" /> Qualification
                  </button>
                )}
              </div>
            </div>
            {/* Side Drawer for Qualification */}
            {qualDrawerOpen && qualificationElement && (
              <div className="w-[380px] shrink-0 border-l border-border/40 bg-background flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Target size={16} className="text-primary" />
                    <span className="text-sm font-semibold">Qualification & Notizen</span>
                  </div>
                  <button onClick={() => setQualDrawerOpen(false)} className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {qualificationElement}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Desktop: Normal mode ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={scrollContainerRef} className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target size={18} className="text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {Body}
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──

function LoadingSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

function ErrorState({ code, message, onRetry }: { code?: string; message?: string; onRetry: () => void }) {
  const { title, hint, showRetry } = (() => {
    switch (code) {
      case "not_found":
        return { title: "Termin existiert nicht", hint: "Dieser Termin wurde gelöscht oder die Verknüpfung ist veraltet.", showRetry: false };
      case "forbidden":
        return { title: "Keine Berechtigung", hint: "Du hast keinen Zugriff auf diesen Termin. Falls das ein Fehler ist, wende dich an deinen Director.", showRetry: false };
      case "lead_missing":
        return { title: "Lead fehlt", hint: "Der Termin existiert, aber der zugehörige Lead-Datensatz wurde entfernt.", showRetry: true };
      default:
        return { title: "Termin-Daten konnten nicht geladen werden", hint: "Bitte versuche es erneut.", showRetry: true };
    }
  })();
  return (
    <div className="py-10 px-2 flex flex-col items-center text-center gap-3">
      <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
        <AlertTriangle size={22} />
      </div>
      <div>
        <div className="font-serif text-lg">{title}</div>
        <p className="text-sm text-muted-foreground mt-1">{hint}</p>
        {message && <div className="mt-2 text-xs text-muted-foreground/70 break-words">{message}</div>}
      </div>
      {showRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="mt-2">
          <RefreshCw size={14} className="mr-2" /> Erneut versuchen
        </Button>
      )}
    </div>
  );
}

function Field({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
      {icon && <div className="mt-0.5 text-muted-foreground shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium break-words">{value}</div>
      </div>
    </div>
  );
}

// ── Section wrapper ──

function PanelSection({ icon, title, children, className, resolveId }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string; resolveId?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/50 bg-card/50 overflow-hidden transition-all", className)} data-resolve-id={resolveId}>
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 border-b border-border/30">
        <div className="text-primary shrink-0">{icon}</div>
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// ── Intent helpers ──

const HEAT_DISPLAY: Record<string, { label: string; color: string }> = {
  hot: { label: "🔥 Hot", color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40" },
  warm: { label: "☀️ Warm", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40" },
  cold: { label: "❄️ Cold", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40" },
};

function deriveIntentLevel(lead: Record<string, any> | null, quizScore: number | null): { level: "hot" | "warm" | "cold"; label: string; color: string } {
  const score = quizScore ?? lead?.qualification_score ?? lead?.quiz_score ?? 0;
  const commitment = lead?.commitment_level ?? 0;
  const whatsappConfirmed = !!lead?.whatsapp_confirmed;

  let level: "hot" | "warm" | "cold" = "cold";
  if (score >= 10 || commitment >= 8 || whatsappConfirmed) {
    level = "hot";
  } else if (score >= 5 || commitment >= 4) {
    level = "warm";
  }
  const display = HEAT_DISPLAY[level];
  return { level, label: display.label, color: display.color };
}

function deriveShowReadiness(
  lead: Record<string, any> | null,
  appointment: Record<string, any>,
  stats: Ctx["stats"],
): { signal: "green" | "yellow" | "red"; label: string; reason: string } {
  const noShows = lead?.total_no_shows ?? 0;
  const attended = lead?.total_calls_attended ?? 0;
  const booked = lead?.total_calls_booked ?? 0;
  const messages = stats?.messages_count ?? 0;

  // Red: repeated no-shows or zero engagement
  if (noShows >= 2) return { signal: "red", label: "Hohes Risiko", reason: `${noShows} No-Shows` };
  if (booked > 0 && attended === 0 && noShows > 0) return { signal: "red", label: "Hohes Risiko", reason: "Noch nie erschienen" };

  // Yellow: some risk
  if (noShows === 1) return { signal: "yellow", label: "Mittel", reason: "1 No-Show" };
  if (messages === 0 && booked > 0) return { signal: "yellow", label: "Mittel", reason: "Kein Nachrichtenrücklauf" };

  // Green
  return { signal: "green", label: "Hohe Wahrscheinlichkeit", reason: attended > 0 ? `${attended} Calls besucht` : "Neuer Lead" };
}

const SIGNAL_COLORS = {
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40",
  yellow: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  red: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40",
} as const;

const SIGNAL_DOT = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
} as const;

// ── Conversion Panel (4-Block) ──

function ConversionPanel({
  ctx,
  profiles,
  callerLevel,
  onLeadClick,
  onReload,
  onStartCall,
  inCall,
  isAdmin = false,
}: {
  ctx: Ctx;
  profiles: Map<string, ProfileRef>;
  callerLevel: number;
  onLeadClick?: () => void;
  onReload: () => void;
  onStartCall?: () => void;
  inCall?: boolean;
  isAdmin?: boolean;
}) {
  const a = ctx.appointment!;
  const l = ctx.lead;
  const s = ctx.stats;
  const quiz = ctx.last_quiz;
  const [assignTarget, setAssignTarget] = useState<'setter' | 'closer' | null>(null);

  const resolveName = (id: string | null | undefined): string => {
    if (!id) return "Nicht zugewiesen";
    const p = profiles.get(id);
    return p?.full_name || p?.email || id.slice(0, 8);
  };

  // Canonical setter resolution chain (5 layers):
  // 1. appointment.setter_id (direct assignment)
  // 2. lead.setter_id (lead-level assignment)
  // 3. appointment.current_owner_id IF current_owner_role is setter/operator
  // 4. lead.owner_id (lead owner fallback)
  // 5. appointment.assigned_operator_id (operator fallback)
  const resolvedSetterId = a.setter_id
    || l?.setter_id
    || (a.current_owner_role && ['setter', 'operator'].includes(a.current_owner_role) ? a.current_owner_id : null)
    || l?.owner_id
    || a.assigned_operator_id
    || null;
  // Canonical closer resolution chain: appointment.closer_id → lead.closer_id
  const resolvedCloserId = a.closer_id || l?.closer_id || null;
  const resolveProfile = (id: string | null | undefined): ProfileRef | null => {
    if (!id) return null;
    return profiles.get(id) ?? null;
  };

  // Timezone-aware rendering
  const displayResult = formatAppointmentTimeFn({
    starts_at: a.starts_at as string | undefined,
    ends_at: a.ends_at as string | undefined,
    booking_timezone: a.booking_timezone as string | undefined,
    original_local_date: a.original_local_date as string | undefined,
    original_local_time: a.original_local_time as string | undefined,
  });
  const displayDateTime = displayResult.dateTime;

  // Dev diagnostic
  if (import.meta.env.DEV && a.starts_at) {
    const utcDate = (a.starts_at as string).slice(0, 10);
    const modalDate = displayResult.date;
    const groupKey = getAppointmentLocalDate({
      starts_at: a.starts_at as string,
      booking_timezone: a.booking_timezone as string | undefined,
      original_local_date: a.original_local_date as string | undefined,
    });
    const modalYmd = (() => {
      const m = modalDate.match(/(\d+)\.\s+([A-Za-zÄÖÜäöü]+)\s+(\d{4})/);
      if (!m) return "?";
      const monthMap: Record<string, string> = {
        Januar:"01",Februar:"02",März:"03",April:"04",Mai:"05",Juni:"06",
        Juli:"07",August:"08",September:"09",Oktober:"10",November:"11",Dezember:"12",
      };
      return `${m[3]}-${monthMap[m[2]] ?? "??"}-${m[1].padStart(2,"0")}`;
    })();
    const mismatch = groupKey !== modalYmd;
    console[mismatch ? "error" : "info"](
      `[Calendar·Detail] apt=${a.id} utcDate=${utcDate} groupKey=${groupKey} modalDate=${modalYmd} tz=${a.booking_timezone ?? "browser"} source=${displayResult.source} owner=${a.current_owner_id ?? "—"}` +
        (mismatch ? " ⚠️ DAY MISMATCH" : "")
    );
  }

  // Derived intelligence
  const quizScore = quiz?.score ?? l?.qualification_score ?? null;
  const intent = deriveIntentLevel(l, quizScore);
  const readiness = deriveShowReadiness(l, a, s);

  // Time intelligence
  const timeIntel = useMemo(() => {
    const now = new Date();
    const createdAt = l?.created_at ? new Date(l.created_at) : null;
    const bookedAt = a.created_at ? new Date(a.created_at) : null;
    const startsAt = a.starts_at ? new Date(a.starts_at) : null;

    return {
      leadAge: createdAt ? formatDistanceToNow(createdAt, { addSuffix: true, locale: de }) : null,
      bookingToCall: bookedAt && startsAt
        ? `${differenceInHours(startsAt, bookedAt)}h ${differenceInMinutes(startsAt, bookedAt) % 60}min`
        : null,
      touchpoints: (s?.messages_count ?? 0) + (s?.calls_count ?? 0),
      lastContact: ctx.last_call?.created_at
        ? formatDistanceToNow(new Date(ctx.last_call.created_at), { addSuffix: true, locale: de })
        : null,
      hasResponded: (s?.messages_count ?? 0) > 0,
    };
  }, [l, a, s, ctx.last_call]);

  // Lead Scoring Engine
  const scoringInput = useMemo(() => buildScoringInput(l ?? null, a, s, quiz), [l, a, s, quiz]);
  const scoring = useMemo<LeadScoringResult>(() => calculateLeadScore(scoringInput), [scoringInput]);

  // Auto-Action Engine
  const autoActionPlan = useMemo<AutoActionPlan>(() => {
    const startsAt = a.starts_at ? new Date(a.starts_at) : null;
    const hoursUntilCall = startsAt ? differenceInHours(startsAt, new Date()) : null;
    return deriveAutoActions(scoring, {
      appointmentId: (a.id as string) ?? "unknown",
      leadName: l?.name ?? undefined,
      hoursUntilCall,
      hasNoShowHistory: (l?.total_no_shows ?? 0) > 0,
      noResponseToMessages: (s?.messages_count ?? 0) > 0 && !(s?.has_lead_replied),
      totalNoShows: l?.total_no_shows ?? 0,
    });
  }, [scoring, a, l, s]);


  const [auditHistory, setAuditHistory] = useState<Array<{
    id: string; lead_score: number; show_probability: number; close_probability: number;
    breakdown: Record<string, number>; trigger: string; previous_lead_score: number | null;
    score_delta: number | null; created_at: string;
  }>>([]);

  useEffect(() => {
    if (!l?.id || !scoring) return;
    const leadId = l.id as string;
    const appointmentId = a.id as string;

    // Fetch previous audit entries
    const fetchAndLog = async () => {
      // Get last entry to compute delta
      const { data: prev } = await supabase
        .from("lead_score_audit")
        .select("lead_score")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1);

      const previousScore = prev?.[0]?.lead_score ?? null;
      const delta = previousScore != null ? scoring.leadScore - previousScore : null;

      // Only insert if score changed or no previous entry
      if (previousScore === null || previousScore !== scoring.leadScore) {
        await supabase.from("lead_score_audit").insert({
          lead_id: leadId,
          appointment_id: appointmentId,
          lead_score: scoring.leadScore,
          show_probability: scoring.showProbability,
          close_probability: scoring.closeProbability,
          breakdown: scoring.breakdown as any,
          input_snapshot: scoringInput as any,
          trigger: "ccp_open",
          previous_lead_score: previousScore,
          score_delta: delta,
        } as any);
      }

      // Fetch history
      const { data: history } = await supabase
        .from("lead_score_audit")
        .select("id, lead_score, show_probability, close_probability, breakdown, trigger, previous_lead_score, score_delta, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (history) setAuditHistory(history as any);
    };

    fetchAndLog();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l?.id, scoring.leadScore, scoring.showProbability, scoring.closeProbability]);

  // Export helpers
  const buildExportAppt = (): ExportAppointment => ({
    id: a.id, starts_at: a.starts_at, ends_at: a.ends_at,
    call_type: a.call_type, appointment_status: a.appointment_status,
    call_status: a.call_status, outcome: a.outcome,
    pricing_tier: a.pricing_tier, lead_id: a.lead_id,
    location: a.video_call_link || (a.meeting_id ? `https://zoom.us/j/${a.meeting_id}` : null),
  });
  const buildExportMeta = (): ExportMeta => ({
    memberName: l?.name || "Lead", memberEmail: l?.email, rangeLabel: displayDateTime,
  });
  const tz = (a.booking_timezone as string) || "Europe/Berlin";

  const setterProfile = resolveProfile(resolvedSetterId);
  const closerProfile = resolveProfile(resolvedCloserId);

  // Source info
  const attrSnapshot = a.attribution_snapshot as Record<string, any> | null;
  const sourceFunnel = l?.source_funnel || l?.funnel_id || a.origin_source || a.booking_source || null;

  return (
    <div className="space-y-3">
      {/* ═══ BLOCK 1: LEAD SNAPSHOT ═══ */}
      <PanelSection icon={<User size={16} />} title="Lead Snapshot">
        {l?.name ? (
          <div className="space-y-3">
            {/* Name + Intent + Status Row */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <button
                  onClick={onLeadClick}
                  disabled={!onLeadClick}
                  className="font-serif text-xl truncate hover:underline underline-offset-2 disabled:no-underline text-left"
                >
                  {l.name}
                </button>
                {sourceFunnel && (
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Globe size={12} /> {sourceFunnel}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge className={cn("text-[10px] border", intent.color)}>{intent.label}</Badge>
                <Badge variant="outline" className="text-[10px]">{a.appointment_status ?? "—"}</Badge>
              </div>
            </div>

            {/* Quiz Score */}
            {quizScore != null && (
              <div className="flex items-center gap-2 text-sm">
                <BarChart3 size={14} className="text-muted-foreground" />
                <span className="text-muted-foreground">Quiz Score:</span>
                <span className="font-semibold">{quizScore} / 14</span>
              </div>
            )}

            {/* Contact Actions (clickable) */}
            <div className="flex flex-wrap gap-2">
              {l.phone && (
                <a
                  href={`tel:${l.phone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition"
                >
                  <Phone size={14} /> {l.phone}
                </a>
              )}
              {l.email && (
                <a
                  href={`mailto:${l.email}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80 transition"
                >
                  <Mail size={14} /> {l.email}
                </a>
              )}
              {l.phone && (
                <a
                  href={`https://wa.me/${l.phone.replace(/[^0-9+]/g, "").replace(/^\+/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition"
                >
                  <MessageCircle size={14} /> WhatsApp
                </a>
              )}
            </div>

            {/* Setter / Closer — clickable for L4+ to open assignment */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <button
                type="button"
                onClick={callerLevel >= 4 ? () => setAssignTarget('setter') : undefined}
                disabled={callerLevel < 4}
                className={cn(
                  "text-left rounded-lg p-2 transition",
                  callerLevel >= 4 && "hover:bg-muted/50 cursor-pointer"
                )}
              >
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  Setter {callerLevel >= 4 && <ArrowRightLeft size={10} />}
                </div>
                <div className="font-medium truncate">{setterProfile?.full_name || resolveName(resolvedSetterId)}</div>
              </button>
              <button
                type="button"
                onClick={callerLevel >= 4 ? () => setAssignTarget('closer') : undefined}
                disabled={callerLevel < 4}
                className={cn(
                  "text-left rounded-lg p-2 transition",
                  callerLevel >= 4 && "hover:bg-muted/50 cursor-pointer"
                )}
              >
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                  Closer {callerLevel >= 4 && <ArrowRightLeft size={10} />}
                </div>
                <div className="font-medium truncate">{closerProfile?.full_name || resolveName(resolvedCloserId)}</div>
              </button>
            </div>

            {/* Inline assignment panel */}
            {assignTarget && (
              <InlineAssignmentPanel
                appointmentId={a.id as string}
                leadId={l?.id as string | undefined}
                role={assignTarget}
                currentId={assignTarget === 'setter' ? resolvedSetterId : resolvedCloserId}
                onClose={() => setAssignTarget(null)}
                onAssigned={() => { setAssignTarget(null); onReload(); }}
              />
            )}

            {/* Appointment Time */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar size={14} /> {displayDateTime}
            </div>
          </div>
        ) : (
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Kein Lead verknüpft</div>
              <div className="text-xs opacity-80">Termin existiert ohne Lead-Datensatz.</div>
            </div>
          </div>
        )}
      </PanelSection>

      {/* ═══ SCORING BLOCK ═══ */}
      <PanelSection icon={<BarChart3 size={16} />} title="Lead Intelligence">
        <div className="grid grid-cols-3 gap-3">
          {/* Lead Score */}
          <div className={cn("rounded-xl border p-3 text-center", getTierBg(scoring.leadTier))}>
            <div className={cn("text-2xl font-serif font-bold", getTierColor(scoring.leadTier))}>
              {scoring.leadScore}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Lead Score</div>
            <div className="text-xs mt-1">{getTierEmoji(scoring.leadTier)}</div>
          </div>
          {/* Show Probability */}
          <div className={cn("rounded-xl border p-3 text-center", getTierBg(scoring.showTier))}>
            <div className={cn("text-2xl font-serif font-bold", getTierColor(scoring.showTier))}>
              {scoring.showProbability}%
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Show</div>
            <div className="text-xs mt-1">{getTierEmoji(scoring.showTier)}</div>
          </div>
          {/* Close Probability */}
          <div className={cn("rounded-xl border p-3 text-center", getTierBg(scoring.closeTier))}>
            <div className={cn("text-2xl font-serif font-bold", getTierColor(scoring.closeTier))}>
              {scoring.closeProbability}%
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Close</div>
            <div className="text-xs mt-1">{getTierEmoji(scoring.closeTier)}</div>
          </div>
        </div>
        {/* Breakdown (collapsible) */}
        <details className="mt-3 group">
          <summary className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer font-semibold flex items-center gap-1">
            Score-Breakdown
            <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-1.5">
            {([
              ["Intent", scoring.breakdown.intent],
              ["Behavior", scoring.breakdown.behavior],
              ["Speed", scoring.breakdown.speed],
              ["Source", scoring.breakdown.sourceQuality],
              ["Daten", scoring.breakdown.dataCompleteness],
            ] as const).map(([label, val]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">{label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all",
                      val >= 70 ? "bg-emerald-500" : val >= 40 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${val}%` }}
                  />
                </div>
                <span className="text-xs font-medium w-8 text-right">{val}</span>
              </div>
            ))}
          </div>
          {/* Real metrics from message data */}
          <div className="mt-3 pt-2 border-t border-border/30 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Ø Antwortzeit</span>
              <span className={cn("font-medium", 
                s?.avg_response_time_minutes != null 
                  ? s.avg_response_time_minutes <= 30 ? "text-emerald-600 dark:text-emerald-400"
                    : s.avg_response_time_minutes <= 120 ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
              )}>
                {s?.avg_response_time_minutes != null 
                  ? s.avg_response_time_minutes < 60 
                    ? `${Math.round(s.avg_response_time_minutes)} min`
                    : `${(s.avg_response_time_minutes / 60).toFixed(1)} h`
                  : "Keine Daten"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Lead hat geantwortet</span>
              <span className={cn("font-medium", s?.has_lead_replied ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                {s?.has_lead_replied ? `Ja (${s?.lead_reply_count ?? 0}×)` : "Nein"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Erstkontakt nach</span>
              <span className={cn("font-medium",
                s?.first_contact_minutes != null
                  ? s.first_contact_minutes <= 5 ? "text-emerald-600 dark:text-emerald-400"
                    : s.first_contact_minutes <= 60 ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
              )}>
                {s?.first_contact_minutes != null
                  ? s.first_contact_minutes < 60
                    ? `${Math.round(s.first_contact_minutes)} min`
                    : `${(s.first_contact_minutes / 60).toFixed(1)} h`
                  : "Keine Daten"}
              </span>
            </div>
          </div>
        </details>

        {/* Score Audit Trail */}
        {auditHistory.length > 0 && (
          <details className="mt-3 group">
            <summary className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer font-semibold flex items-center gap-1">
              Score-Verlauf ({auditHistory.length})
              <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
              {auditHistory.map((entry, i) => {
                const bd = entry.breakdown as Record<string, number> | null;
                const isLatest = i === 0;
                return (
                  <div key={entry.id} className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs",
                    isLatest ? "bg-primary/5 border-primary/20" : "bg-muted/20 border-border/30"
                  )}>
                    <div className="shrink-0 w-16 font-mono text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                      {" "}
                      {new Date(entry.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={cn("font-bold text-sm",
                        entry.lead_score >= 75 ? "text-emerald-600" : entry.lead_score >= 55 ? "text-amber-600" : entry.lead_score >= 35 ? "text-foreground" : "text-red-600"
                      )}>
                        {entry.lead_score}
                      </span>
                      {entry.score_delta != null && entry.score_delta !== 0 && (
                        <span className={cn("text-[10px] font-semibold",
                          entry.score_delta > 0 ? "text-emerald-600" : "text-red-600"
                        )}>
                          {entry.score_delta > 0 ? "+" : ""}{entry.score_delta}
                        </span>
                      )}
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        S:{entry.show_probability}% C:{entry.close_probability}%
                      </span>
                    </div>
                    {bd && (
                      <div className="ml-auto text-[9px] text-muted-foreground/70 hidden sm:block">
                        I:{bd.intent} B:{bd.behavior} Sp:{bd.speed}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </PanelSection>

      {/* ═══ BLOCK 2: CALL READINESS ═══ */}
      <PanelSection icon={<Activity size={16} />} title="Call Readiness" resolveId="call-readiness">
        {/* Traffic Light */}
        <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border mb-3", SIGNAL_COLORS[readiness.signal])}>
          <div className={cn("h-3 w-3 rounded-full shrink-0 animate-pulse", SIGNAL_DOT[readiness.signal])} />
          <span className="text-sm font-semibold">{readiness.label}</span>
          <span className="text-xs opacity-80 ml-auto">{readiness.reason}</span>
        </div>

        {/* No-Show Risk Analysis + Next Steps */}
        <NoShowRiskPanel lead={l} appointment={a} stats={s} timeIntel={timeIntel} readiness={readiness} />

        <div className="grid grid-cols-2 gap-3">
          <MiniStat icon={<Clock size={14} />} label="Lead erstellt" value={timeIntel.leadAge ?? "—"} />
          <MiniStat icon={<Calendar size={14} />} label="Booking → Call" value={timeIntel.bookingToCall ?? "—"} />
          <MiniStat icon={<Zap size={14} />} label="Touchpoints" value={String(timeIntel.touchpoints)} />
          <MiniStat icon={<MessageCircle size={14} />} label="Letzter Kontakt" value={timeIntel.lastContact ?? "Kein Kontakt"} />
        </div>

        {/* Response behaviour */}
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Antwortverhalten:</span>
          {timeIntel.hasResponded ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
              ✓ Hat geantwortet
            </Badge>
          ) : (
            <Badge className="bg-muted text-muted-foreground border-border text-[10px]">
              Keine Antwort erfasst
            </Badge>
          )}
        </div>

        {/* Stats row */}
        {s && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <StatBadge label="Termine" value={s.appointments_count} />
            <StatBadge label="Calls" value={s.calls_count} />
            <StatBadge label="Nachrichten" value={s.messages_count} />
          </div>
        )}
      </PanelSection>

      {/* ═══ BLOCK 3: CALL BRIEFING ═══ */}
      <PanelSection icon={<FileText size={16} />} title="Call Briefing">
        <div className="space-y-3">
          {/* Lead Summary from quiz + lead data */}
          <BriefingRow
            label="Problem / Pain"
            value={l?.pain_point || l?.problem || quiz?.pain_point || "Nicht erfasst — im Call erfragen"}
            fallback
          />
          <BriefingRow
            label="Ziel / Desired Outcome"
            value={l?.desired_outcome || l?.goal || quiz?.goal || "Nicht erfasst"}
            fallback
          />
          <BriefingRow
            label="Motivation"
            value={l?.motivation || quiz?.motivation || quiz?.intent || "Nicht erfasst"}
            fallback
          />
          <BriefingRow
            label="Einwände / Risiken"
            value={l?.objections || l?.close_reason || (ctx.last_call?.result === "no_close" ? "Vorheriger Nicht-Abschluss" : null) || null}
            fallback
          />
          {/* Closer recommendation */}
          <div className="mt-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
            <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">Empfehlung</div>
            <div className="text-sm">
              {intent.level === "hot" && "→ Direct Close Angle. Lead ist hoch motiviert. Fokus auf System-Klarheit + Proof."}
              {intent.level === "warm" && "→ Qualification first. Herausfinden was den Lead zurückhält. Dann Value-Frame setzen."}
              {intent.level === "cold" && "→ Engagement aufbauen. Problem vertiefen, Vision aktivieren. Kein Druck."}
            </div>
          </div>

          {/* ── Auto-generated Gesprächs-Agenda ── */}
          <CallAgenda
            intent={intent}
            lead={l}
            quiz={quiz}
            lastCall={ctx.last_call}
            readiness={readiness}
            scoring={scoring}
          />

          {/* Setter notes */}
          {a.setter_notes && (
            <div className="text-sm">
              <span className="text-muted-foreground">Setter-Notizen: </span>
              <span>{a.setter_notes}</span>
            </div>
          )}
        </div>
      </PanelSection>

      {/* ═══ BLOCK 4: ACTIONS ═══ */}
      <PanelSection icon={<Zap size={16} />} title="Actions">
        <div className="grid grid-cols-2 gap-2">
          {/* Video Call Button — In-Call Mode or Deep Link */}
          {(a.video_call_link || a.meeting_id) && (
            onStartCall && !inCall ? (
              <Button
                onClick={onStartCall}
                className="gap-2 h-10 text-sm bg-primary text-primary-foreground hover:bg-primary/90 col-span-2"
              >
                <Video size={16} /> Video Call starten
              </Button>
            ) : (
              <a
                href={a.video_call_link || `https://zoom.us/j/${a.meeting_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="contents"
              >
                <Button className="gap-2 h-10 text-sm bg-primary text-primary-foreground hover:bg-primary/90 col-span-2">
                  <Video size={16} /> {inCall ? "Neues Fenster öffnen" : "Video Call starten"}
                </Button>
              </a>
            )
          )}
          {l?.phone && (
            <a href={`tel:${l.phone}`} className="contents">
              <Button variant="outline" className="gap-2 h-10 text-sm">
                <PhoneCall size={16} /> Call starten
              </Button>
            </a>
          )}
          {l?.phone && (
            <a
              href={`https://wa.me/${l.phone.replace(/[^0-9+]/g, "").replace(/^\+/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="contents"
            >
              <Button variant="outline" className="gap-2 h-10 text-sm text-emerald-700 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10">
                <MessageCircle size={16} /> WhatsApp
              </Button>
            </a>
          )}
          {l?.email && (
            <a href={`mailto:${l.email}`} className="contents">
              <Button variant="outline" className="gap-2 h-10 text-sm">
                <Mail size={16} /> E-Mail senden
              </Button>
            </a>
          )}
          <Button variant="outline" className="gap-2 h-10 text-sm" onClick={onLeadClick} disabled={!onLeadClick}>
            <User size={16} /> Lead-Profil
          </Button>
        </div>

        {/* Calendar Export */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/30">
          <Button variant="ghost" size="sm" onClick={() => exportAppointmentsICS([buildExportAppt()], buildExportMeta(), { timeZone: tz })} className="text-xs gap-1.5">
            <Download size={14} /> .ics
          </Button>
          <Button variant="ghost" size="sm" onClick={() => exportAppointmentsGoogle([buildExportAppt()], buildExportMeta(), { timeZone: tz })} className="text-xs gap-1.5">
            <ExternalLink size={14} /> Google
          </Button>
          <Button variant="ghost" size="sm" onClick={() => exportAppointmentsOutlook([buildExportAppt()], buildExportMeta(), { timeZone: tz })} className="text-xs gap-1.5">
            <Globe size={14} /> Outlook
          </Button>
        </div>
      </PanelSection>

      {/* ═══ BLOCK 5: AUTO-ACTION ENGINE ═══ */}
      {autoActionPlan.actions.length > 0 && (
        <AutoActionPanel plan={autoActionPlan} appointmentId={a.id as string} leadId={l?.id as string | undefined} />
      )}

      {/* ═══ INLINE QUALIFICATION ═══ */}
      {l?.id && (
        <InlineQualificationPanel
          leadId={l.id as string}
          appointmentId={a.id as string}
          initialData={{
            setter_notes: a.setter_notes as string || '',
            closer_notes: l.closer_notes as string || '',
            outcome: a.outcome as string || '',
            setter_budget_readiness: l.setter_budget_readiness as string || '',
            setter_decision_readiness: l.setter_decision_readiness as string || '',
            setter_problem_clarity: l.setter_problem_clarity as string || '',
            setter_recommendation: l.setter_recommendation as string || '',
            qualification_score: l.qualification_score as number | null,
          }}
          onSaved={onReload}
        />
      )}

      {/* ═══ QUICK ACTIONS ═══ */}
      <div data-resolve-id="quick-actions">
        <QuickActionsPanel
          appointmentId={a.id as string}
          currentStatus={a.appointment_status as string}
          onStatusChanged={onReload}
          leadEmail={l?.email as string | null}
          leadName={l?.name as string | null}
          callerLevel={callerLevel}
          isAdmin={isAdmin}
          leadId={l?.id as string | null}
          setterId={a.setter_id as string | null}
        />
      </div>

      {/* ═══ Termin-Zuweisung block removed (V3 canonicalization) ═══
          This panel duplicated the canonical Setter/Closer assignment surface
          rendered above via <InlineAssignmentPanel> (click on the Setter or
          Closer card). It also called the legacy `reassign_appointment` RPC
          whose log INSERT references the non-existent column
          `appointment_reassignment_log.from_user_id`, causing the UI error
          "column from_user_id of relation appointment_reassignment_log does
          not exist". The canonical reassignment+reschedule path
          (`reassign_and_reschedule_appointment`) used by <ReschedulePanel/>
          writes the correct columns. No DB/RPC changes here — only the
          duplicate UI surface is removed. */}


      {/* ═══ L4+ Reschedule ═══ */}
      {callerLevel >= 4 && ['booked','confirmed','scheduled'].includes(a.appointment_status) && (
        <div data-resolve-id="reschedule">
          <ReschedulePanel
            appointmentId={a.id as string}
            currentStartsAt={a.starts_at as string}
            currentEndsAt={a.ends_at as string}
            callerLevel={callerLevel}
            onRescheduled={onReload}
            leadEmail={l?.email as string | null}
            leadName={l?.name as string | null}
          />
        </div>
      )}

      {/* ═══ No-Show Recovery ═══ */}
      {a.appointment_status === "no_show" && a.id && (
        <div data-resolve-id="no-show-recovery">
          <NoShowRecoveryPanel appointmentId={a.id as string} />
        </div>
      )}

      {/* ═══ Source & Attribution (collapsed) ═══ */}
      <details className="rounded-xl bg-muted/30 border border-border/40 group">
        <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 select-none">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Quelle & Attribution</span>
          <ChevronDown size={14} className="text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-3 pb-3 pt-1">
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {[
              ["Funnel", sourceFunnel],
              ["UTM Source", attrSnapshot?.utm_source || l?.origin_type],
              ["UTM Campaign", attrSnapshot?.utm_campaign],
              ["UTM Content", attrSnapshot?.utm_content],
              ["UTM Medium", attrSnapshot?.utm_medium],
              ["Referrer", attrSnapshot?.referrer],
            ].map(([label, val]) => (
              <React.Fragment key={label as string}>
                <div className="text-muted-foreground">{label}</div>
                <div className="font-medium">{val || <span className="italic text-muted-foreground/60">Nicht erfasst</span>}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </details>

      {/* ═══ Booking Origin (collapsed) ═══ */}
      <details className="rounded-xl bg-muted/30 border border-border/40 group">
        <summary className="flex items-center justify-between cursor-pointer px-3 py-2.5 select-none">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Buchungs-Ursprung</span>
          <ChevronDown size={14} className="text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-3 pb-3 pt-1">
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <div className="text-muted-foreground whitespace-nowrap">Gebuchter Slot</div>
            <div className="font-medium">{displayResult.source !== "none" ? displayDateTime : <span className="text-muted-foreground/60 italic">nicht erfasst</span>}</div>
            <div className="text-muted-foreground whitespace-nowrap">Zeitzone</div>
            <div className="font-medium">{(a.booking_timezone as string) || <span className="text-muted-foreground/60 italic">nicht erfasst</span>}</div>
            <div className="text-muted-foreground whitespace-nowrap">UTC-Offset</div>
            <div className="font-medium">{(a.booking_utc_offset as string) || "—"}</div>
            <div className="text-muted-foreground whitespace-nowrap">Gespeicherte UTC</div>
            <div className="font-medium font-mono text-xs">
              {a.starts_at ? new Date(a.starts_at).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—"}
            </div>
            <div className="text-muted-foreground whitespace-nowrap">Gebucht am</div>
            <div className="font-medium">
              {a.created_at ? format(new Date(a.created_at), "dd.MM.yyyy · HH:mm", { locale: de }) : "—"}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

// ── Mini components ──

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/30">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
        <div className="font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-2 rounded-lg border border-border/40">
      <div className="text-lg font-serif">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function BriefingRow({ label, value, fallback }: { label: string; value: string | null | undefined; fallback?: boolean }) {
  const isEmpty = !value || value === "Nicht erfasst" || value === "Nicht erfasst — im Call erfragen";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={cn("text-sm mt-0.5", isEmpty && "text-muted-foreground/60 italic")}>
        {value || (fallback ? "Nicht erfasst — im Call erfragen" : "—")}
      </div>
    </div>
  );
}

// ── Auto-generated Gesprächs-Agenda ──

function deriveAngle(
  intent: { level: "hot" | "warm" | "cold" },
  lead: Record<string, any> | null,
  quiz: Record<string, any> | null,
): string {
  const pain = lead?.pain_point || lead?.problem || quiz?.pain_point || null;
  const goal = lead?.desired_outcome || lead?.goal || quiz?.goal || null;

  if (intent.level === "hot") {
    if (pain) return `Pain-to-System: "${pain}" direkt adressieren → Systemlösung präsentieren → Social Proof.`;
    return "Direct Close: Motivation bestätigen → System erklären → Entscheidung herbeiführen.";
  }
  if (intent.level === "warm") {
    if (goal) return `Ziel-Frame: "${goal}" als Anker → aktuelles Gap aufzeigen → System als Brücke positionieren.`;
    if (pain) return `Pain-Deepening: "${pain}" vertiefen → Konsequenz klarstellen → System als Lösung.`;
    return "Discovery-First: Aktuelle Situation erfragen → Ziel definieren → Fit prüfen.";
  }
  // cold
  return "Rapport & Neugier: Vertrauen aufbauen → Problem explorieren → Vision aktivieren. Kein Pitch.";
}

function deriveOpenQuestions(
  lead: Record<string, any> | null,
  quiz: Record<string, any> | null,
  lastCall: Record<string, any> | null,
): string[] {
  const questions: string[] = [];
  const pain = lead?.pain_point || lead?.problem || quiz?.pain_point;
  const goal = lead?.desired_outcome || lead?.goal || quiz?.goal;
  const motivation = lead?.motivation || quiz?.motivation || quiz?.intent;

  if (!pain) questions.push("Was ist aktuell deine größte Herausforderung im Beruf/Einkommen?");
  else questions.push(`Du hast "${pain}" genannt — wie wirkt sich das konkret auf deinen Alltag aus?`);

  if (!goal) questions.push("Was wäre dein ideales Ergebnis in den nächsten 6–12 Monaten?");
  else questions.push(`Dein Ziel "${goal}" — was hast du bisher versucht, um dahin zu kommen?`);

  if (!motivation) questions.push("Was hat dich dazu gebracht, dich heute zu informieren?");

  if (lastCall?.result === "no_close") {
    questions.push("Beim letzten Gespräch war noch etwas offen — was hat sich seitdem verändert?");
  }

  if (!lead?.monthly_income && !quiz?.income) {
    questions.push("Wo stehst du aktuell einkommensmäßig — und wo willst du hin?");
  }

  return questions.slice(0, 5);
}

function derivePossibleObjections(
  intent: { level: "hot" | "warm" | "cold" },
  lead: Record<string, any> | null,
  quiz: Record<string, any> | null,
  lastCall: Record<string, any> | null,
  scoring: LeadScoringResult,
): { objection: string; reframe: string }[] {
  const objections: { objection: string; reframe: string }[] = [];

  // Previous no-close
  if (lastCall?.result === "no_close") {
    const reason = lead?.close_reason || lead?.objections || lastCall?.close_reason;
    objections.push({
      objection: reason ? `Letzter Einwand: "${reason}"` : "Hat beim letzten Call nicht abgeschlossen",
      reframe: "Veränderung seit letztem Gespräch erfragen → neuen Blickwinkel bieten.",
    });
  }

  // Price / money
  if (intent.level !== "hot") {
    objections.push({
      objection: "\"Das ist mir zu teuer / Ich kann mir das nicht leisten\"",
      reframe: "Kosten von Nicht-Handeln aufzeigen → ROI-Frame → Finanzierungsoptionen.",
    });
  }

  // Time
  objections.push({
    objection: "\"Ich habe keine Zeit daf\u00FCr\"",
    reframe: "Flexible Struktur betonen → Ergebnis pro Stunde → andere schaffen es auch nebenberuflich.",
  });

  // Doubt / trust
  if (scoring.leadScore < 60) {
    objections.push({
      objection: "\"Ich bin mir nicht sicher, ob das funktioniert\"",
      reframe: "Social Proof (Ergebnisse ähnlicher Teilnehmer) → System statt Talent → Garantie/Testphase.",
    });
  }

  // Partner / need to think
  objections.push({
    objection: "\"Ich muss noch mit meinem Partner sprechen / darüber nachdenken\"",
    reframe: "Entscheidungskriterien klären → Was fehlt zur Entscheidung? → Folgetermin nur wenn konkreter Grund.",
  });

  return objections.slice(0, 4);
}

function CallAgenda({
  intent,
  lead,
  quiz,
  lastCall,
  readiness,
  scoring,
}: {
  intent: { level: "hot" | "warm" | "cold"; label: string; color: string };
  lead: Record<string, any> | null;
  quiz: Record<string, any> | null;
  lastCall: Record<string, any> | null;
  readiness: { signal: string; label: string; reason: string };
  scoring: LeadScoringResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const angle = deriveAngle(intent, lead, quiz);
  const openQuestions = deriveOpenQuestions(lead, quiz, lastCall);
  const objections = derivePossibleObjections(intent, lead, quiz, lastCall, scoring);

  return (
    <div className="mt-3 rounded-lg border border-border/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/40 transition text-left"
      >
        <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/80 flex items-center gap-1.5">
          <Target size={12} className="text-primary" />
          Gesprächs-Agenda
        </span>
        <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="p-3 space-y-3 text-sm">
          {/* Recommended Angle */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1 flex items-center gap-1">
              <Play size={10} /> Empfohlener Angle
            </div>
            <div className="text-sm leading-relaxed">{angle}</div>
          </div>

          {/* Open Questions */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold mb-1.5">
              Offene Fragen ({openQuestions.length})
            </div>
            <ul className="space-y-1.5">
              {openQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Possible Objections */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400 font-semibold mb-1.5">
              Mögliche Einwände ({objections.length})
            </div>
            <div className="space-y-2">
              {objections.map((o, i) => (
                <div key={i} className="rounded-lg bg-muted/30 p-2">
                  <div className="text-sm font-medium">{o.objection}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">↪ {o.reframe}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── No-Show Recovery Panel (unchanged logic) ──

// ── No-Show Risk Panel ──

type RiskFactor = { label: string; severity: "high" | "medium" | "low"; detail: string };
type NextStep = { action: string; priority: "urgent" | "recommended" | "optional"; icon: React.ReactNode };

function deriveNoShowRiskFactors(
  lead: Record<string, any> | null,
  appointment: Record<string, any>,
  stats: { messages_count: number; avg_response_time_minutes?: number | null; has_lead_replied?: boolean; first_contact_minutes?: number | null } | undefined,
  timeIntel: { bookingToCall: string | null; touchpoints: number; hasResponded: boolean },
): RiskFactor[] {
  const factors: RiskFactor[] = [];
  const noShows = lead?.total_no_shows ?? 0;
  const attended = lead?.total_calls_attended ?? 0;

  // No-Show history
  if (noShows >= 3) factors.push({ label: "Wiederholte No-Shows", severity: "high", detail: `${noShows} No-Shows — chronisches Muster` });
  else if (noShows === 2) factors.push({ label: "2 No-Shows", severity: "high", detail: "Hohes Wiederholungsrisiko" });
  else if (noShows === 1) factors.push({ label: "1 No-Show", severity: "medium", detail: attended > 0 ? "War aber auch schon da" : "Noch nie erschienen" });

  // Never attended
  if (noShows > 0 && attended === 0) {
    factors.push({ label: "Nie erschienen", severity: "high", detail: `${noShows} Termin(e) gebucht, 0 besucht` });
  }

  // Time gap
  const apptCreated = appointment.created_at ? new Date(appointment.created_at).getTime() : null;
  const apptStarts = appointment.starts_at ? new Date(appointment.starts_at).getTime() : null;
  if (apptCreated && apptStarts) {
    const gapHours = (apptStarts - apptCreated) / 3_600_000;
    if (gapHours > 168) factors.push({ label: "Extreme Time Gap", severity: "high", detail: `${Math.round(gapHours / 24)} Tage zwischen Buchung und Call` });
    else if (gapHours > 72) factors.push({ label: "Lange Time Gap", severity: "medium", detail: `${Math.round(gapHours / 24)} Tage zwischen Buchung und Call` });
  }

  // No response to messages
  if ((stats?.messages_count ?? 0) > 0 && !stats?.has_lead_replied) {
    factors.push({ label: "Keine Antwort", severity: "high", detail: `${stats?.messages_count} Nachrichten gesendet, keine Reaktion` });
  }

  // Slow response
  if (stats?.avg_response_time_minutes != null && stats.avg_response_time_minutes > 480) {
    factors.push({ label: "Langsame Antwortzeit", severity: "medium", detail: `Ø ${Math.round(stats.avg_response_time_minutes / 60)}h Antwortzeit` });
  }

  // Zero touchpoints
  if (timeIntel.touchpoints === 0) {
    factors.push({ label: "Kein Kontakt", severity: "medium", detail: "Noch kein Touchpoint vor dem Call" });
  }

  // Late first contact
  if (stats?.first_contact_minutes != null && stats.first_contact_minutes > 240) {
    factors.push({ label: "Späte Erstansprache", severity: "low", detail: `Erstkontakt erst nach ${Math.round(stats.first_contact_minutes / 60)}h` });
  }

  return factors.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

function deriveNextSteps(
  factors: RiskFactor[],
  lead: Record<string, any> | null,
  readiness: { signal: string },
): NextStep[] {
  const steps: NextStep[] = [];
  const hasHighRisk = factors.some(f => f.severity === "high");
  const hasNoResponse = factors.some(f => f.label === "Keine Antwort");
  const hasTimeGap = factors.some(f => f.label.includes("Time Gap"));
  const hasNoShows = factors.some(f => f.label.includes("No-Show") || f.label === "Nie erschienen");

  if (hasHighRisk && lead?.phone) {
    steps.push({ action: "Jetzt WhatsApp-Bestätigung senden", priority: "urgent", icon: <MessageCircle size={12} /> });
  }

  if (hasNoResponse && lead?.phone) {
    steps.push({ action: "Anruf zur Terminbestätigung", priority: "urgent", icon: <PhoneCall size={12} /> });
  }

  if (hasTimeGap) {
    steps.push({ action: "Reminder 2h vor Termin senden", priority: "recommended", icon: <Clock size={12} /> });
  }

  if (hasNoShows) {
    steps.push({ action: "Erwartungen im Call direkt ansprechen", priority: "recommended", icon: <AlertTriangle size={12} /> });
  }

  if (readiness.signal === "red") {
    steps.push({ action: "Backup-Lead vorbereiten", priority: "recommended", icon: <RefreshCw size={12} /> });
  }

  if (factors.length === 0) {
    steps.push({ action: "Standard-Vorbereitung — keine besonderen Risiken", priority: "optional", icon: <CheckCircle2 size={12} /> });
  }

  return steps;
}

const SEVERITY_STYLES = {
  high: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  low: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
} as const;

const SEVERITY_LABEL = { high: "Hoch", medium: "Mittel", low: "Niedrig" } as const;

const PRIORITY_STYLES = {
  urgent: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
  recommended: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
  optional: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
} as const;

function NoShowRiskPanel({
  lead,
  appointment,
  stats,
  timeIntel,
  readiness,
}: {
  lead: Record<string, any> | null;
  appointment: Record<string, any>;
  stats: any;
  timeIntel: { bookingToCall: string | null; touchpoints: number; hasResponded: boolean };
  readiness: { signal: string; label: string; reason: string };
}) {
  const factors = useMemo(() => deriveNoShowRiskFactors(lead, appointment, stats, timeIntel), [lead, appointment, stats, timeIntel]);
  const steps = useMemo(() => deriveNextSteps(factors, lead, readiness), [factors, lead, readiness]);

  if (factors.length === 0 && readiness.signal === "green") return null;

  return (
    <div className="mt-3 rounded-lg border border-border/40 overflow-hidden">
      <div className="px-3 py-2 bg-muted/20 border-b border-border/30">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-foreground/80 flex items-center gap-1.5">
          <AlertTriangle size={12} className="text-red-500" />
          No-Show Risikoanalyse
          {factors.length > 0 && (
            <Badge variant="outline" className={cn("text-[9px] ml-auto", factors[0].severity === "high" ? "border-red-500/40 text-red-600" : "border-amber-500/40 text-amber-600")}>
              {factors.filter(f => f.severity === "high").length > 0
                ? `${factors.filter(f => f.severity === "high").length} hohes Risiko`
                : `${factors.length} Faktor${factors.length > 1 ? "en" : ""}`}
            </Badge>
          )}
        </span>
      </div>
      <div className="p-3 space-y-3">
        {/* Risk Factors */}
        {factors.length > 0 && (
          <div className="space-y-1.5">
            {factors.map((f, i) => (
              <div key={i} className={cn("flex items-start gap-2 px-2.5 py-1.5 rounded-lg border text-sm", SEVERITY_STYLES[f.severity])}>
                <Badge variant="outline" className={cn("text-[9px] shrink-0 mt-0.5", SEVERITY_STYLES[f.severity])}>
                  {SEVERITY_LABEL[f.severity]}
                </Badge>
                <div className="min-w-0">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-xs opacity-80 ml-1.5">— {f.detail}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Derived Next Steps */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
            Nächste Schritte
          </div>
          <div className="space-y-1.5">
            {steps.map((s, i) => (
              <div key={i} className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm", PRIORITY_STYLES[s.priority])}>
                <span className="shrink-0">{s.icon}</span>
                <span>{s.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


type RecoveryResult = {
  ok: boolean;
  stage?: number;
  stage1?: unknown;
  stage2?: unknown;
  stage3?: unknown;
  stage3_wa?: unknown;
  stage3_task?: unknown;
  skipped?: boolean;
  reason?: string;
  error?: string;
  [k: string]: unknown;
};

function NoShowRecoveryPanel({ appointmentId }: { appointmentId: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [stageToRun, setStageToRun] = useState(1);

  const runRecovery = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("mark-no-show-and-recover", {
        body: { appointment_id: appointmentId, stage: stageToRun },
      });
      if (error) {
        setResult({ ok: false, error: error.message ?? "Edge Function Fehler" });
      } else {
        setResult(data as RecoveryResult);
      }
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setRunning(false);
    }
  };

  const diagnoseResult = (r: RecoveryResult): Array<{ label: string; status: "ok" | "fail" | "skip" | "warn"; detail: string }> => {
    const checks: Array<{ label: string; status: "ok" | "fail" | "skip" | "warn"; detail: string }> = [];
    if (r.skipped) {
      checks.push({ label: "Voraussetzung", status: "skip", detail: `Übersprungen: ${r.reason ?? "unbekannt"}` });
      return checks;
    }
    if (r.error) {
      const err = String(r.error).toLowerCase();
      if (err.includes("not_found")) checks.push({ label: "Appointment Lookup", status: "fail", detail: "Termin nicht gefunden" });
      else if (err.includes("not_no_show")) checks.push({ label: "Status Check", status: "warn", detail: "Kein No-Show" });
      else if (err.includes("no_contact_info")) checks.push({ label: "Kontaktdaten", status: "fail", detail: "Kein Telefon/Email" });
      else if (err.includes("dispatch")) checks.push({ label: "Dispatch", status: "fail", detail: "dispatch-communication Fehler" });
      else if (err.includes("template")) checks.push({ label: "Template Lookup", status: "fail", detail: "Kein Template gefunden" });
      else if (err.includes("rls") || err.includes("policy")) checks.push({ label: "RLS", status: "fail", detail: "Berechtigungsfehler" });
      else checks.push({ label: "Fehler", status: "fail", detail: String(r.error) });
      return checks;
    }
    if (r.stage1 !== undefined) {
      const s1 = r.stage1;
      if (s1 === "already_sent") checks.push({ label: "Stage 1 (+5min)", status: "skip", detail: "Dedup" });
      else if (typeof s1 === "object" && s1 !== null && (s1 as any).ok) checks.push({ label: "Stage 1 (+5min)", status: "ok", detail: "OK" });
      else checks.push({ label: "Stage 1", status: "fail", detail: JSON.stringify(s1) });
    }
    if (r.stage2 !== undefined) {
      const s2 = r.stage2;
      if (s2 === "already_sent") checks.push({ label: "Stage 2 (+2h)", status: "skip", detail: "Dedup" });
      else if (typeof s2 === "object" && s2 !== null && (s2 as any).ok) checks.push({ label: "Stage 2 (+2h)", status: "ok", detail: "OK" });
      else checks.push({ label: "Stage 2", status: "fail", detail: JSON.stringify(s2) });
    }
    if (r.stage3_wa !== undefined) {
      const s3 = r.stage3_wa as any;
      if (typeof s3 === "object" && s3?.ok) checks.push({ label: "Stage 3 (+24h WA)", status: "ok", detail: "OK" });
      else checks.push({ label: "Stage 3 (+24h WA)", status: "fail", detail: JSON.stringify(s3) });
    } else if (r.stage3 === "already_sent") {
      checks.push({ label: "Stage 3", status: "skip", detail: "Dedup" });
    }
    if (r.stage3_task !== undefined) {
      const t = r.stage3_task as any;
      if (t?.ok) checks.push({ label: "Call Task", status: "ok", detail: "Erstellt" });
      else checks.push({ label: "Call Task", status: "fail", detail: JSON.stringify(t) });
    }
    if (checks.length === 0 && r.ok) checks.push({ label: "Recovery", status: "ok", detail: "Erfolgreich" });
    return checks;
  };

  const statusIcon = (s: "ok" | "fail" | "skip" | "warn") => {
    switch (s) {
      case "ok": return <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />;
      case "fail": return <XCircle size={14} className="text-red-500 shrink-0" />;
      case "skip": return <RefreshCw size={14} className="text-muted-foreground shrink-0" />;
      case "warn": return <AlertTriangle size={14} className="text-amber-500 shrink-0" />;
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
        <span className="text-sm font-semibold text-amber-800 dark:text-amber-400">No-Show Recovery</span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={stageToRun}
          onChange={(e) => setStageToRun(Number(e.target.value))}
          className="text-xs rounded-lg border border-border/60 bg-background px-2 py-1.5"
          disabled={running}
        >
          <option value={1}>Stage 1 (+5min WA)</option>
          <option value={2}>Stage 2 (+2h WA)</option>
          <option value={3}>Stage 3 (+24h WA + Call Task)</option>
        </select>
        <Button size="sm" variant="outline" onClick={runRecovery} disabled={running} className="gap-1.5 text-xs">
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? "Läuft…" : "Recovery ausführen"}
        </Button>
      </div>
      {result && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Ergebnis</div>
          {diagnoseResult(result).map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              {statusIcon(c.status)}
              <div className="min-w-0">
                <span className="font-medium">{c.label}:</span>{" "}
                <span className="text-muted-foreground break-words">{c.detail}</span>
              </div>
            </div>
          ))}
          <details className="mt-2">
            <summary className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">Raw Response</summary>
            <pre className="text-[10px] mt-1 p-2 rounded bg-muted/50 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ── Reassignment Panel — REMOVED (V3) ──
// The duplicate "Termin-Zuweisung" panel was removed; the canonical
// assignment surface is <InlineAssignmentPanel> (click Setter/Closer card)
// and the canonical reassignment+reschedule path is <ReschedulePanel> via
// the `reassign_and_reschedule_appointment` RPC. Audit history is still
// written by that RPC to `appointment_reassignment_log` using the correct
// columns (previous_owner_id / new_owner_id / reassigned_by). No DB
// changes were made as part of this removal.


// ── Assignment History Filters + Timeline ──

type TimelineEntryType = {
  id: string;
  type: 'reassignment' | 'event';
  event_type: string;
  from_name: string;
  to_name: string;
  actor_name: string;
  role: string | null;
  reason: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

const SOURCE_FILTERS = [
  { key: 'all', label: 'Alle Quellen' },
  { key: 'leadpool', label: 'Leadpool' },
  { key: 'manual', label: 'Manuell' },
  { key: 'webhook', label: 'Webhook' },
] as const;

const ACTION_FILTERS = [
  { key: 'all', label: 'Alle Aktionen' },
  { key: 'initial', label: 'Initial' },
  { key: 'reassignment', label: 'Reassignment' },
] as const;

function deriveSource(entry: TimelineEntryType): string {
  const src = entry.metadata?.booking_source || entry.metadata?.source || '';
  if (['leadpool', 'pool'].includes(src)) return 'leadpool';
  if (['manual'].includes(src)) return 'manual';
  if (['webhook', 'ghl', 'calendly', 'api', 'funnel'].includes(src)) return 'webhook';
  // For creation events without explicit source, assume manual
  if (entry.event_type.includes('created')) return 'manual';
  // Reassignments inherit no source filter by default
  return 'any';
}

function deriveAction(entry: TimelineEntryType): 'initial' | 'reassignment' {
  return entry.event_type.includes('created') || entry.event_type === 'booking_created'
    ? 'initial'
    : 'reassignment';
}

const EVENT_TYPE_LABELS_INLINE: Record<string, { label: string; icon: string }> = {
  appointment_created_manual: { label: 'Manuell erstellt', icon: '✨' },
  appointment_created: { label: 'Erstellt', icon: '✨' },
  appointment_reassigned: { label: 'Neuzuweisung', icon: '🔄' },
  ownership_reassigned: { label: 'Eigentümer gewechselt', icon: '🔄' },
  closer_assigned: { label: 'Closer zugewiesen', icon: '🎯' },
  setter_reassigned: { label: 'Setter gewechselt', icon: '👤' },
  operator_takeover: { label: 'Operator-Übernahme', icon: '⚡' },
  booking_created: { label: 'Gebucht', icon: '📅' },
  booking_rescheduled: { label: 'Verschoben', icon: '📅' },
  booking_cancelled: { label: 'Storniert', icon: '❌' },
  no_show_detected: { label: 'No-Show', icon: '⏰' },
  attendance_confirmed: { label: 'Teilnahme bestätigt', icon: '✅' },
  call_started: { label: 'Call gestartet', icon: '📞' },
  call_completed: { label: 'Call beendet', icon: '📞' },
};

const BOOKING_SOURCE_LABELS_INLINE: Record<string, string> = {
  manual: 'Manuell erstellt',
  leadpool: 'Aus Leadpool',
  pool: 'Aus Leadpool',
  webhook: 'Webhook / Automatisch',
  ghl: 'GHL Import',
  calendly: 'Calendly',
  funnel: 'Funnel-Booking',
  api: 'API',
};

function AssignmentHistoryFilters({ timeline }: { timeline: TimelineEntryType[] }) {
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return timeline.filter(e => {
      if (sourceFilter !== 'all') {
        const src = deriveSource(e);
        if (src !== sourceFilter && src !== 'any') return false;
      }
      if (actionFilter !== 'all') {
        if (deriveAction(e) !== actionFilter) return false;
      }
      return true;
    });
  }, [timeline, sourceFilter, actionFilter]);

  const hasActiveFilter = sourceFilter !== 'all' || actionFilter !== 'all';

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-1">
        {SOURCE_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setSourceFilter(sourceFilter === f.key ? 'all' : f.key)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors",
              sourceFilter === f.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/40 bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="w-px h-4 bg-border/40 self-center mx-0.5" />
        {ACTION_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setActionFilter(actionFilter === f.key ? 'all' : f.key)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors",
              actionFilter === f.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/40 bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {hasActiveFilter && filtered.length !== timeline.length && (
        <div className="text-[10px] text-muted-foreground mt-1">
          {filtered.length} von {timeline.length} Einträgen
        </div>
      )}

      <div className="mt-2 space-y-0 border-l-2 border-border/40 ml-1.5 pl-3">
        {filtered.length === 0 && (
          <div className="text-[10px] text-muted-foreground py-2">Keine Einträge für diesen Filter.</div>
        )}
        {filtered.map((entry) => {
          const evtInfo = EVENT_TYPE_LABELS_INLINE[entry.event_type] || { label: entry.event_type, icon: '📋' };
          const timeAgo = formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: de });
          const exactTime = format(new Date(entry.created_at), "dd.MM.yyyy · HH:mm", { locale: de });
          const isCreation = entry.event_type.includes('created');
          const bookingSource = entry.metadata?.booking_source || entry.metadata?.source;
          const callType = entry.metadata?.call_type;

          return (
            <div key={entry.id} className="relative pb-3 last:pb-0">
              <div className={cn(
                "absolute -left-[calc(0.75rem+5px)] top-1 h-2.5 w-2.5 rounded-full border-2 border-background",
                isCreation ? "bg-primary" : "bg-muted-foreground/40"
              )} />
              <div className="space-y-0.5">
                <div className="text-xs font-medium flex items-center gap-1.5 flex-wrap">
                  <span>{evtInfo.icon}</span>
                  <span className="text-foreground">{evtInfo.label}</span>
                  {entry.role && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                      {entry.role}
                    </Badge>
                  )}
                </div>

                {!isCreation && entry.from_name !== '—' && (
                  <div className="text-[11px]">
                    <span className="text-muted-foreground">{entry.from_name}</span>
                    <span className="text-muted-foreground/60 mx-1">→</span>
                    <span className="text-foreground font-medium">{entry.to_name}</span>
                  </div>
                )}

                {isCreation && (
                  <div className="text-[11px] space-y-0.5">
                    {entry.to_name !== '—' && (
                      <div><span className="text-muted-foreground">Eigentümer:</span> <span className="font-medium">{entry.to_name}</span></div>
                    )}
                    {bookingSource && (
                      <div><span className="text-muted-foreground">Quelle:</span> <span className="font-medium">{BOOKING_SOURCE_LABELS_INLINE[bookingSource] || bookingSource}</span></div>
                    )}
                    {callType && (
                      <div><span className="text-muted-foreground">Typ:</span> <span className="font-medium">{callType}</span></div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                  <span title={exactTime}>{timeAgo}</span>
                  {entry.actor_name !== '—' && (
                    <>
                      <span>·</span>
                      <span>von {entry.actor_name}</span>
                    </>
                  )}
                </div>

                {entry.reason && entry.reason !== "Manual reassignment" && entry.reason !== "Manuell erstellt" && (
                  <div className="text-[10px] text-muted-foreground/70 italic">
                    „{entry.reason}"
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Inline Qualification Panel ──

const READINESS_OPTIONS = [
  { value: '', label: '— Nicht erfasst —' },
  { value: 'ready', label: '✅ Bereit' },
  { value: 'partially', label: '⚠️ Teilweise' },
  { value: 'not_ready', label: '❌ Nicht bereit' },
];

const RECOMMENDATION_OPTIONS = [
  { value: '', label: '— Keine —' },
  { value: 'close', label: 'Abschluss empfohlen' },
  { value: 'follow_up', label: 'Follow-Up nötig' },
  { value: 'not_qualified', label: 'Nicht qualifiziert' },
  { value: 'nurture', label: 'Nurture / Langfristig' },
];

const OUTCOME_OPTIONS = [
  { value: '', label: '— Kein Ergebnis —' },
  { value: 'closed_won', label: '✅ Abschluss' },
  { value: 'closed_lost', label: '❌ Kein Abschluss' },
  { value: 'follow_up', label: '📅 Follow-Up' },
  { value: 'no_show', label: '⏰ No-Show' },
  { value: 'rescheduled', label: '🔄 Verschoben' },
];

function InlineQualificationPanel({
  leadId,
  appointmentId,
  initialData,
  onSaved,
}: {
  leadId: string;
  appointmentId: string;
  initialData: {
    setter_notes: string;
    closer_notes: string;
    outcome: string;
    setter_budget_readiness: string;
    setter_decision_readiness: string;
    setter_problem_clarity: string;
    setter_recommendation: string;
    qualification_score: number | null;
  };
  onSaved: () => void;
}) {
  const [fields, setFields] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateField = (key: string, value: string | number | null) => {
    setFields(prev => ({ ...prev, [key]: value }));
    setDirty(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      autoSave({ ...fields, [key]: value });
    }, 1200);
  };

  const autoSave = async (data: typeof fields) => {
    setSaving(true);
    try {
      const { error: leadErr } = await supabase
        .from('leads')
        .update({
          closer_notes: data.closer_notes || null,
          setter_budget_readiness: data.setter_budget_readiness || null,
          setter_decision_readiness: data.setter_decision_readiness || null,
          setter_problem_clarity: data.setter_problem_clarity || null,
          setter_recommendation: data.setter_recommendation || null,
          qualification_score: data.qualification_score,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', leadId);

      const { error: apptErr } = await supabase
        .from('appointments')
        .update({
          setter_notes: data.setter_notes || null,
          outcome: data.outcome || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', appointmentId);

      if (leadErr) console.error('[Qualification] lead save error', leadErr);
      if (apptErr) console.error('[Qualification] appt save error', apptErr);

      if (!leadErr && !apptErr) {
        setDirty(false);
      }
    } catch (e) {
      console.error('[Qualification] save error', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelSection icon={<Target size={16} />} title="Qualification & Notizen" resolveId="qualification">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Setter-Notizen</label>
          <textarea
            value={fields.setter_notes}
            onChange={e => updateField('setter_notes', e.target.value)}
            placeholder="Setter-Notizen hier eingeben..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[50px] resize-y focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Closer-Notizen</label>
          <textarea
            value={fields.closer_notes}
            onChange={e => updateField('closer_notes', e.target.value)}
            placeholder="Closer-Notizen hier eingeben..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[50px] resize-y focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Call-Ergebnis</label>
          <select
            value={fields.outcome}
            onChange={e => updateField('outcome', e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition"
          >
            {OUTCOME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Budget</label>
            <select value={fields.setter_budget_readiness} onChange={e => updateField('setter_budget_readiness', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary/30 transition">
              {READINESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Entscheidung</label>
            <select value={fields.setter_decision_readiness} onChange={e => updateField('setter_decision_readiness', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary/30 transition">
              {READINESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Problem-Klarheit</label>
            <select value={fields.setter_problem_clarity} onChange={e => updateField('setter_problem_clarity', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary/30 transition">
              {READINESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Empfehlung</label>
            <select value={fields.setter_recommendation} onChange={e => updateField('setter_recommendation', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary/30 transition">
              {RECOMMENDATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">Qualification Score (0–100)</label>
          <input type="number" min={0} max={100} value={fields.qualification_score ?? ''}
            onChange={e => updateField('qualification_score', e.target.value ? Number(e.target.value) : null)}
            placeholder="0–100"
            className="w-24 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:ring-1 focus:ring-primary/30 transition"
          />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {saving ? (
            <><Loader2 size={12} className="animate-spin" /> Wird gespeichert…</>
          ) : dirty ? (
            <><Clock size={12} /> Änderungen werden automatisch gespeichert</>
          ) : (
            <><CheckCircle2 size={12} className="text-emerald-500" /> Gespeichert</>
          )}
        </div>
      </div>
    </PanelSection>
  );
}

// ── Quick Actions Panel ──

function QuickActionsPanel({
  appointmentId,
  currentStatus,
  onStatusChanged,
  leadEmail,
  leadName,
  callerLevel = 0,
  isAdmin = false,
  leadId,
  setterId,
}: {
  appointmentId: string;
  currentStatus: string;
  onStatusChanged: () => void;
  leadEmail?: string | null;
  leadName?: string | null;
  callerLevel?: number;
  isAdmin?: boolean;
  leadId?: string | null;
  setterId?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showTeamleadBlock, setShowTeamleadBlock] = useState(false);

  const canCancel = callerLevel >= 6 || isAdmin;

  const updateStatus = async (newStatus: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ appointment_status: newStatus, updated_at: new Date().toISOString() } as any)
        .eq("id", appointmentId);
      if (error) throw error;
      toast.success(`Status → ${newStatus}`);
      onStatusChanged();
    } catch (e: any) {
      toast.error("Status-Update fehlgeschlagen", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  const handleGovernedCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error("Bitte Grund angeben");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("cancel_appointment_governed", {
        p_appointment_id: appointmentId,
        p_reason: cancelReason.trim(),
      });
      if (error) throw error;
      const res = data as any;
      if (res && res.success === false) {
        toast.error("Stornierung abgelehnt", { description: res.error });
        return;
      }
      toast.success("Termin storniert — Lead kehrt in den Pool zurück");
      setShowCancelDialog(false);
      setCancelReason("");
      onStatusChanged();
    } catch (e: any) {
      toast.error("Stornierung fehlgeschlagen", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAttempt = () => {
    if (canCancel) {
      setShowCancelDialog(true);
    } else {
      setShowTeamleadBlock(true);
    }
  };

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ setter_notes: noteText.trim(), updated_at: new Date().toISOString() } as any)
        .eq("id", appointmentId);
      if (error) throw error;
      toast.success("Notiz gespeichert");
      setShowNote(false);
      setNoteText("");
      onStatusChanged();
    } catch (e: any) {
      toast.error("Notiz konnte nicht gespeichert werden", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  const isActive = ["booked", "confirmed", "scheduled"].includes(currentStatus);

  return (
    <PanelSection icon={<Play size={16} />} title="Aktionen">
      <div className="flex flex-wrap gap-2">
        {isActive && currentStatus !== "confirmed" && (
          <Button size="sm" variant="outline" disabled={loading} onClick={() => updateStatus("confirmed")} className="text-xs gap-1.5">
            <CheckCircle2 size={14} className="text-emerald-600" /> Bestätigt
          </Button>
        )}
        {isActive && (
          <Button size="sm" variant="outline" disabled={loading} onClick={() => updateStatus("no_show")} className="text-xs gap-1.5">
            <XCircle size={14} className="text-red-500" /> No-Show
          </Button>
        )}
        {(isActive || currentStatus === "confirmed") && (
          <Button size="sm" variant="outline" disabled={loading} onClick={() => updateStatus("completed")} className="text-xs gap-1.5">
            <CheckCircle2 size={14} /> Erschienen
          </Button>
        )}

        {/* Cancel: only shown as action, governed by level */}
        {isActive && (
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={handleCancelAttempt}
            className={`text-xs gap-1.5 ${canCancel ? 'text-red-600 hover:text-red-700 border-red-200 hover:border-red-300' : 'text-muted-foreground border-border'}`}
          >
            <XCircle size={14} /> {canCancel ? 'Termin stornieren' : 'Absagen'}
          </Button>
        )}

        <Button size="sm" variant="outline" disabled={loading} onClick={() => setShowNote(!showNote)} className="text-xs gap-1.5">
          <FileText size={14} /> Notiz
        </Button>
      </div>

      {/* Non-L6 blocker: teamlead contact CTA */}
      {showTeamleadBlock && !canCancel && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Termin kann nicht gelöscht werden.</p>
              <p>Der Termin muss wahrgenommen oder durch deinen Teamlead einem anderen geeigneten Teammitglied zugewiesen werden.</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
            onClick={() => {
              // Navigate to chat or show contact info
              toast.info("Teamlead kontaktieren", {
                description: "Bitte kontaktiere deinen Teamlead im Chat, um den Termin neu zuweisen zu lassen.",
                duration: 6000,
              });
            }}
          >
            <MessageCircle size={14} /> Teamlead im Chat kontaktieren
          </Button>
          <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => setShowTeamleadBlock(false)}>
            Schließen
          </Button>
        </div>
      )}

      {/* L6+ cancel dialog with warning */}
      {showCancelDialog && canCancel && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
            <div className="text-xs text-red-900 space-y-1">
              <p className="font-semibold">Termin löschen ist Ultima Ratio.</p>
              <p>Bitte prüfe zuerst, ob der Termin einem anderen Setter/Closer zur gleichen Zeit zugewiesen werden kann.</p>
            </div>
          </div>
          <textarea
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            placeholder="Grund für die Stornierung eingeben (Pflichtfeld)..."
            className="w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm min-h-[50px] resize-y"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={loading || !cancelReason.trim()}
              onClick={handleGovernedCancel}
              className="text-xs gap-1.5"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              Stornierung bestätigen
            </Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setShowCancelDialog(false); setCancelReason(""); }}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {showNote && (
        <div className="mt-2 space-y-2">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Notiz hinzufügen..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
          />
          <Button size="sm" onClick={saveNote} disabled={loading || !noteText.trim()} className="text-xs">
            {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Speichern
          </Button>
        </div>
      )}
    </PanelSection>
  );
}

// ── Auto-Action Panel ──

function AutoActionPanel({ plan, appointmentId, leadId }: { plan: AutoActionPlan; appointmentId: string; leadId?: string }) {
  const [actionStates, setActionStates] = useState<Record<string, "pending" | "executed" | "dismissed">>({});
  const [saving, setSaving] = useState(false);

  // Persist actions on mount
  useEffect(() => {
    if (!appointmentId || plan.actions.length === 0) return;
    const persist = async () => {
      for (const action of plan.actions) {
        await supabase.from("lead_auto_actions").upsert({
          appointment_id: appointmentId,
          lead_id: leadId ?? null,
          action_key: action.id,
          category: action.category,
          priority: action.priority,
          channel: action.channel,
          title: action.title,
          description: action.description,
          trigger_reason: action.triggerReason,
          timeline_minutes: action.timelineMinutes,
          can_auto_execute: action.canAutoExecute,
          status: "pending",
        }, { onConflict: "appointment_id,action_key", ignoreDuplicates: true });
      }
      // Load current states
      const { data } = await supabase
        .from("lead_auto_actions")
        .select("action_key, status")
        .eq("appointment_id", appointmentId);
      if (data) {
        const map: Record<string, "pending" | "executed" | "dismissed"> = {};
        data.forEach(r => { map[r.action_key] = r.status as any; });
        setActionStates(map);
      }
    };
    persist();
  }, [appointmentId, plan.actions.length]);

  const updateStatus = async (actionKey: string, status: "executed" | "dismissed") => {
    setSaving(true);
    const now = new Date().toISOString();
    await supabase
      .from("lead_auto_actions")
      .update({
        status,
        ...(status === "executed" ? { executed_at: now } : {}),
        ...(status === "dismissed" ? { dismissed_at: now } : {}),
      })
      .eq("appointment_id", appointmentId)
      .eq("action_key", actionKey);
    setActionStates(prev => ({ ...prev, [actionKey]: status }));
    setSaving(false);
  };

  const riskConfig = getRiskLevelConfig(plan.riskLevel);

  return (
    <PanelSection icon={<Zap size={16} />} title="Auto-Action Engine">
      {/* Risk Level Header */}
      <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border mb-3", riskConfig.bg)}>
        <span>{riskConfig.emoji}</span>
        <span className={cn("text-sm font-semibold", riskConfig.color)}>Risiko-Level: {riskConfig.label}</span>
        <span className="text-xs opacity-70 ml-auto">{plan.summary}</span>
      </div>

      {/* Action List */}
      <div className="space-y-2">
        {plan.actions.map((action) => {
          const state = actionStates[action.id] ?? "pending";
          const isDone = state === "executed" || state === "dismissed";

          return (
            <div
              key={action.id}
              className={cn(
                "rounded-lg border p-3 transition-all",
                isDone ? "opacity-50 bg-muted/20" : "bg-background",
                !isDone && action.priority === "critical" && "border-red-500/40 bg-red-500/5",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg shrink-0 mt-0.5">{getChannelIcon(action.channel)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold">{action.title}</span>
                    <Badge className={cn("text-[9px] px-1.5 py-0 border", getActionPriorityColor(action.priority))}>
                      {action.priority}
                    </Badge>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                      {getActionCategoryLabel(action.category)}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {formatTimeline(action.timelineMinutes)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">
                    Grund: {action.triggerReason}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              {!isDone && (
                <div className="flex gap-2 mt-2 ml-8">
                  <Button
                    size="sm"
                    variant="default"
                    className="text-[10px] h-6 px-2 gap-1"
                    disabled={saving}
                    onClick={() => updateStatus(action.id, "executed")}
                  >
                    <CheckCircle2 size={12} /> Erledigt
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[10px] h-6 px-2 gap-1 text-muted-foreground"
                    disabled={saving}
                    onClick={() => updateStatus(action.id, "dismissed")}
                  >
                    <XCircle size={12} /> Verwerfen
                  </Button>
                </div>
              )}
              {isDone && (
                <div className="ml-8 mt-1">
                  <Badge variant="outline" className="text-[9px]">
                    {state === "executed" ? "✓ Erledigt" : "✗ Verworfen"}
                  </Badge>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PanelSection>
  );
}

// ── Reschedule Panel ──

function ReschedulePanel({
  appointmentId,
  currentStartsAt,
  currentEndsAt,
  callerLevel,
  onRescheduled,
  leadEmail,
  leadName,
}: {
  appointmentId: string;
  currentStartsAt: string;
  currentEndsAt: string;
  callerLevel: number;
  onRescheduled: () => void;
  leadEmail?: string | null;
  leadName?: string | null;
}) {
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pre-fill with current date/time
  useEffect(() => {
    const d = new Date(currentStartsAt);
    setNewDate(format(d, "yyyy-MM-dd"));
    setNewTime(format(d, "HH:mm"));
  }, [currentStartsAt]);

  const handleReschedule = async () => {
    if (!newDate || !newTime) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const newStartsAt = new Date(`${newDate}T${newTime}:00`).toISOString();
      const durationMs = new Date(currentEndsAt).getTime() - new Date(currentStartsAt).getTime();
      const newEndsAt = new Date(new Date(newStartsAt).getTime() + durationMs).toISOString();

      const { data, error } = await supabase.rpc("reschedule_appointment", {
        _old_id: appointmentId,
        _new_starts_at: newStartsAt,
        _new_ends_at: newEndsAt,
        _reason: reason || "Manuell verschoben",
      });

      if (error) throw error;
      const result = data as any;
      if (result && !result.success) {
        setErrorMsg(result.error || "Verschiebung fehlgeschlagen");
        return;
      }
      // Fire-and-forget: send reschedule email
      if (leadEmail) {
        const rDate = new Date(newStartsAt);
        const dateStr = rDate.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
        const timeStr = rDate.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
        supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "lp-appointment-rescheduled",
            recipientEmail: leadEmail,
            idempotencyKey: `reschedule-${result?.new_appointment_id || appointmentId}`,
            templateData: { name: leadName || undefined, date: dateStr, time: timeStr },
          },
        }).catch(() => {});
      }

      toast.success("Termin wurde verschoben — Email gesendet");
      onRescheduled();
    } catch (e: any) {
      setErrorMsg(e?.message || "Fehler beim Verschieben");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <RefreshCw size={16} className="text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold">Termin verschieben</span>
      </div>

      {errorMsg && (
        <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1.5">{errorMsg}</div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Datum</label>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            disabled={loading}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Uhrzeit</label>
          <input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="w-full mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Grund (optional)</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="z.B. Zeitkonflikt, Kundenwunsch..."
          className="w-full mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          disabled={loading}
        />
      </div>

      <Button
        size="sm"
        variant="outline"
        disabled={!newDate || !newTime || loading}
        onClick={handleReschedule}
        className="text-xs gap-1.5 w-full"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        Termin verschieben
      </Button>
    </div>
  );
}

// ── Inline Setter/Closer Assignment Panel ──

function InlineAssignmentPanel({
  appointmentId,
  leadId,
  role,
  currentId,
  onClose,
  onAssigned,
}: {
  appointmentId: string;
  leadId?: string;
  role: 'setter' | 'closer';
  currentId: string | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [ops, setOps] = useState<Array<{ id: string; full_name: string | null; email: string | null; current_phase: number | null; appts_this_week?: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user?.id) { setLoading(false); return; }

      // Try stats-enriched RPC first, fall back to basic
      const { data, error } = await supabase.rpc('get_assignable_operators_with_stats' as any, { p_user_id: authData.user.id });
      if (error) {
        const { data: fallback } = await supabase.rpc('get_assignable_operators' as any, { p_user_id: authData.user.id });
        setOps((fallback || []).map((o: any) => ({ ...o, appts_this_week: 0 })));
      } else {
        setOps(data || []);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = ops.filter(o => {
    if (o.id === currentId) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (o.full_name || '').toLowerCase().includes(q) || (o.email || '').toLowerCase().includes(q);
  });

  const handleAssign = async (targetId: string) => {
    setAssigning(true);
    try {
      if (role === 'setter') {
        // Update appointment setter_id + lead setter_id
        const { error: apptErr } = await supabase
          .from('appointments')
          .update({ setter_id: targetId, current_owner_id: targetId, current_owner_role: 'setter' } as any)
          .eq('id', appointmentId);
        if (apptErr) throw apptErr;
        if (leadId) {
          await supabase.from('leads').update({ setter_id: targetId } as any).eq('id', leadId);
        }
      } else {
        // Closer assignment — use reassign_appointment RPC for proper audit trail
        const { data: result, error } = await supabase.rpc('reassign_appointment', {
          p_appointment_id: appointmentId,
          p_new_owner_id: targetId,
          p_new_owner_role: 'closer',
          p_reassignment_type: 'reassignment',
          p_reason: `${role}_assignment_panel`,
        });
        if (error) throw error;
        const res = result as any;
        if (res && !res.success) throw new Error(res.error || 'Assignment failed');

        if (leadId) {
          await supabase.from('leads').update({ closer_id: targetId } as any).eq('id', leadId);
        }
      }

      toast.success(role === 'setter' ? 'Setter zugewiesen' : 'Closer zugewiesen');
      onAssigned();
    } catch (e: any) {
      toast.error(e?.message || 'Zuweisung fehlgeschlagen');
    } finally {
      setAssigning(false);
    }
  };

  const roleLabel = role === 'setter' ? 'Setter' : 'Closer';

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2 animate-in fade-in slide-in-from-top-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">{roleLabel} zuweisen</span>
        <button onClick={onClose} className="h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center">
          <X size={14} />
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      <div className="max-h-40 overflow-y-auto divide-y divide-border/30 rounded-lg border border-border/40">
        {loading && <div className="p-3 text-center text-xs text-muted-foreground">Lade…</div>}
        {!loading && filtered.length === 0 && (
          <div className="p-3 text-center text-xs text-muted-foreground">Keine verfügbaren {roleLabel}</div>
        )}
        {filtered.map(op => (
          <button
            key={op.id}
            onClick={() => handleAssign(op.id)}
            disabled={assigning}
            className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors disabled:opacity-50 flex items-center justify-between"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{op.full_name || op.email || op.id.slice(0, 8)}</div>
              {op.current_phase != null && (
                <div className="text-[10px] text-muted-foreground">L{op.current_phase}{(op as any).appts_this_week != null ? ` · ${(op as any).appts_this_week} Termine/Woche` : ''}</div>
              )}
            </div>
            <UserCheck size={14} className="shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Lead View ──

function LeadView({ ctx, onBack }: { ctx: Ctx; onBack: () => void }) {
  const l = ctx.lead;
  const s = ctx.stats;
  const a = ctx.appointment;
  const quiz = ctx.last_quiz;

  if (!l) {
    return (
      <div className="py-10 text-center">
        <AlertTriangle size={28} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Kein Lead-Datensatz verknüpft.</p>
        <Button variant="ghost" size="sm" onClick={onBack} className="mt-3">
          <ChevronLeft size={16} className="mr-1" /> Zurück
        </Button>
      </div>
    );
  }

  const quizAnswers = (quiz?.answers ?? l.quiz_answers ?? l.qualification_checklist) as Record<string, any> | null;

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 hidden md:inline-flex">
        <ChevronLeft size={16} className="mr-1" /> Zurück zum Termin
      </Button>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <StatBadge label="Termine" value={s?.appointments_count ?? 0} />
        <StatBadge label="Calls" value={s?.calls_count ?? 0} />
        <StatBadge label="Nachrichten" value={s?.messages_count ?? 0} />
      </div>

      {/* Identity */}
      <PanelSection icon={<User size={16} />} title="Identität">
        <Field icon={<User size={16} />} label="Name" value={l.name} />
        <Field icon={<Mail size={16} />} label="E-Mail" value={l.email} />
        <Field icon={<Phone size={16} />} label="Telefon" value={l.phone} />
        <Field label="Stage" value={<Badge variant="secondary">{l.stage ?? l.lead_status ?? "—"}</Badge>} />
        <Field label="Owner" value={l.owner_id ? "Zugewiesen" : "Nicht zugewiesen"} />
        <Field label="Setter" value={l.setter_id || "—"} />
        <Field label="Closer" value={l.closer_id || "—"} />
        <Field label="Erstellt" value={l.created_at ? formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: de }) : "—"} />
      </PanelSection>

      {/* Funnel & Attribution */}
      <PanelSection icon={<Globe size={16} />} title="Funnel & Attribution">
        <Field label="Quelle" value={l.source ?? "—"} />
        <Field label="Funnel" value={l.source_funnel ?? l.funnel_id ?? "—"} />
        <Field label="Quiz-Funnel" value={l.quiz_funnel_source ?? "—"} />
        <Field label="Origin-Typ" value={l.origin_type ?? "—"} />
        <Field label="Referral" value={l.referral_code ?? "—"} />
      </PanelSection>

      {/* Quiz Intelligence */}
      <PanelSection icon={<BarChart3 size={16} />} title="Quiz-Intelligenz">
        <Field label="Score" value={l.quiz_score != null ? `${l.quiz_score}` : "—"} />
        <Field label="Bucket" value={l.qualification_bucket ?? "—"} />
        <Field label="Qualifikation" value={l.qualification_status ?? l.qualification_path ?? "—"} />
        <Field label="Fit-Score" value={l.fit_score != null ? `${l.fit_score}` : "—"} />
        <Field label="Motivation" value={l.motivation ?? "—"} />
        <Field label="Pain Points" value={l.pain_points ?? "—"} />
        <Field label="Sales-Erfahrung" value={l.sales_experience ?? "—"} />
        <Field label="Dringlichkeit" value={l.urgency ?? "—"} />
        <Field label="Finanzielle Bereitschaft" value={l.financial_readiness ?? "—"} />
        <Field label="Einwand-Status" value={l.objection_status ?? "—"} />
        {quizAnswers && Object.keys(quizAnswers).length > 0 && (
          <details className="mt-2 group">
            <summary className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer font-semibold flex items-center gap-1">
              Alle Quiz-Antworten ({Object.keys(quizAnswers).length})
              <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-1">
              {Object.entries(quizAnswers).map(([key, val]) => (
                <div key={key} className="flex items-start gap-2 text-sm border-b border-border/20 py-1 last:border-0">
                  <span className="text-muted-foreground text-xs min-w-[100px] shrink-0">{key}</span>
                  <span className="font-medium break-words">{String(val)}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </PanelSection>

      {/* Appointment History */}
      <PanelSection icon={<Calendar size={16} />} title="Termin-Verlauf">
        <Field label="Calls gebucht / besucht / no-show"
          value={`${l.total_calls_booked ?? 0} / ${l.total_calls_attended ?? 0} / ${l.total_no_shows ?? 0}`} />
        <Field label="Reschedules" value={`${l.reschedule_count ?? 0}`} />
        <Field label="Letzter Call-Status" value={l.last_call_status ?? "—"} />
        <Field label="WhatsApp bestätigt" value={l.whatsapp_confirmed ? "Ja ✓" : "Nein"} />
        {ctx.last_call && (
          <div className="mt-2 rounded-lg bg-muted/40 p-3 text-sm">
            <div className="text-xs uppercase text-muted-foreground mb-1">Letzter Call</div>
            <div>{ctx.last_call.result ?? ctx.last_call.status ?? "—"}</div>
          </div>
        )}
      </PanelSection>

      {/* Setter Prep */}
      <PanelSection icon={<FileText size={16} />} title="Setter-Vorbereitung">
        <Field label="Budget-Readiness" value={l.setter_budget_readiness ?? "—"} />
        <Field label="Entscheidungs-Readiness" value={l.setter_decision_readiness ?? "—"} />
        <Field label="Problem-Klarheit" value={l.setter_problem_clarity ?? "—"} />
        <Field label="Empfehlung" value={l.setter_recommendation ?? "—"} />
        <Field label="Qualifikations-Score" value={l.setter_qualification_score != null ? `${l.setter_qualification_score}` : "—"} />
        <Field label="Call-Outcome" value={l.setter_call_outcome ?? "—"} />
        <Field label="Setter-Notes" value={l.setter_notes ?? "—"} />
      </PanelSection>

      {/* Notes & Activity */}
      <PanelSection icon={<Activity size={16} />} title="Notizen & Aktivität">
        <Field label="Outcome" value={l.outcome ?? "—"} />
        <Field label="Close-Reason" value={l.close_reason ?? "—"} />
        <Field label="Closer-Notes" value={l.closer_notes ?? "—"} />
        <Field label="Qualification-Notes" value={l.qualification_notes ?? "—"} />
        <Field label="Nächster Schritt" value={l.next_step ?? "—"} />
      </PanelSection>
    </div>
  );
}
