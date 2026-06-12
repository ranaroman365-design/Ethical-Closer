/**
 * Talent Flow™  (Layer 47 · Talent Engine · Dashboard 2 of 3)
 * ──────────────────────────────────────────────────────────
 * Full Operator Intelligence Layer — Setter, Closer, Team, Alerts, Decisions.
 *
 * Route:  /members/performance/talent  (nested in PerformanceShell)
 *         /members/admin/performance   (standalone legacy)
 * Access: L6+ (Senior Closer sees own team), L7+ full org, Admin/Owner all.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import LoadingTimeoutFallback from "@/components/ui/LoadingTimeoutFallback";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import { getLevelForStage } from "@/lib/kpi-config";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, RefreshCw, ArrowUpRight, ArrowDownRight,
  Plus, Check, X, ChevronRight, Minus,
  UserX, GraduationCap, AlertTriangle, ArrowUp, Repeat, Eye,
  TrendingUp, Users, Target, BarChart3, Activity,
  ExternalLink, Shield, Zap, Phone, Calendar, Award,
  Clock, MessageSquare,
} from "lucide-react";
import { playCue } from "@/lib/sound-design";
import { roleLabel } from "@/lib/canonical-roles";
import { useOptionalPerformanceFilters } from "@/contexts/PerformanceFiltersContext";
import { CrossNavCta } from "@/components/performance/CrossNavCta";
import AccessDenied from "@/components/members/AccessDenied";
import { useNavigate } from "react-router-dom";
import LeadDistributionPanel from "@/components/performance/LeadDistributionPanel";
import TalentAuditTimeline from "@/components/performance/TalentAuditTimeline";

// ─── Types ──────────────────────────────────────────────────────
interface TalentRow {
  user_id: string; full_name: string; business_stage: string; level_num: number;
  operator_role: string; tenure_days: number;
  total_leads: number; total_bookings: number; total_shows: number; total_closes: number; total_revenue: number;
  booking_rate: number; show_rate: number; close_rate: number; revenue_per_lead: number;
  consistency_score: number; activity_score: number; hygiene_score: number;
  talent_score: number; talent_category: string;
  primary_bottleneck: string; bottleneck_confidence: number; trend_7d: number; sparkline_data: number[];
}
interface SetterRow {
  user_id: string; full_name: string; business_stage: string; level_num: number;
  assigned_leads: number; contacted_leads: number; response_rate: number;
  bookings_created: number; booking_rate: number;
  shows: number; show_rate: number; no_shows: number; no_show_rate: number;
  reschedules: number; reschedule_rate: number;
  avg_time_to_first_touch_hours: number; total_revenue: number;
  trend_7d: number; talent_score: number; ranking: string;
}
interface CloserRow {
  user_id: string; full_name: string; business_stage: string; level_num: number;
  calls_assigned: number; calls_completed: number; close_rate: number;
  revenue_closed: number; avg_deal_value: number;
  lost_count: number; refund_count: number; refund_rate: number;
  shows: number; show_to_close_rate: number;
  trend_7d: number; talent_score: number; primary_bottleneck: string; ranking: string;
}
interface AlertRow {
  alert_type: string; subject_type: string; subject_id: string; subject_name: string;
  severity: string; metric_name: string; metric_value: number; threshold: number;
  reason: string; recommended_action: string;
}
interface TalentFlag {
  id: string; user_id: string; flag_type: "red" | "green"; flag_key: string; title: string; details: Record<string, any>; created_at: string;
}
interface TalentAction {
  id: string; user_id: string; action_type: string; title: string; description: string | null; status: string; due_date: string | null; created_at: string;
}

// ─── Design Tokens ──────────────────────────────────────────────
const T = {
  bg: "#F8F5F0", card: "#FFFFFF", border: "#E8E2D9", ink: "#1A1A1A",
  secondary: "#6A6A6A", muted: "#9A9590", gold: "#C6A96B", goldLight: "#F5F0E6",
  danger: "#B04A3A", dangerLight: "#FDF2F0", success: "#7A9E7E", successLight: "#F2F7F3",
  orange: "#C87E3A", orangeLight: "#FDF6EE",
} as const;

// ─── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(Math.round(n || 0));
const fmtEur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;

type StrategicStatus = "promotion_ready" | "coaching_required" | "at_risk" | "replace_pause";
function deriveStrategicStatus(m: TalentRow): { status: StrategicStatus; reason: string } {
  if (m.talent_score >= 75 && m.total_closes >= 3 && m.trend_7d >= 0) return { status: "promotion_ready", reason: `Score ${fmt(m.talent_score)}, ${m.total_closes} Closes, Trend stabil/positiv.` };
  if (m.talent_score < 30 && m.tenure_days > 30) return { status: "replace_pause", reason: `Score ${fmt(m.talent_score)} seit ${m.tenure_days} Tagen.` };
  if (m.talent_score < 50 || (m.close_rate < 15 && m.total_shows >= 3) || m.trend_7d < -20) {
    const parts: string[] = [];
    if (m.close_rate < 15 && m.total_shows >= 3) parts.push(`Close Rate ${fmtPct(m.close_rate)}`);
    if (m.show_rate < 50 && m.total_bookings >= 3) parts.push(`Show Rate ${fmtPct(m.show_rate)}`);
    if (m.trend_7d < -20) parts.push(`7d Trend ${fmt(m.trend_7d)}%`);
    return { status: "at_risk", reason: parts.length > 0 ? parts.join(", ") + "." : `Score ${fmt(m.talent_score)}.` };
  }
  return { status: "coaching_required", reason: m.primary_bottleneck !== "No Major Issue" ? `Bottleneck: ${m.primary_bottleneck}` : "Weiter beobachten." };
}

const CATEGORY_STYLE: Record<string, { color: string; bg: string; label: { de: string; en: string } }> = {
  a_player: { color: T.gold, bg: T.goldLight, label: { de: "A-Player", en: "A-Player" } },
  stable: { color: T.secondary, bg: "#F4F3F0", label: { de: "Stabil", en: "Stable" } },
  risk: { color: T.orange, bg: T.orangeLight, label: { de: "Risiko", en: "Risk" } },
  critical: { color: T.danger, bg: T.dangerLight, label: { de: "Kritisch", en: "Critical" } },
};

const STRATEGIC_CONFIG: Record<StrategicStatus, { label: { de: string; en: string }; color: string; bg: string; icon: typeof ArrowUp }> = {
  promotion_ready: { label: { de: "Promotion Ready", en: "Promotion Ready" }, color: T.success, bg: T.successLight, icon: ArrowUp },
  coaching_required: { label: { de: "Coaching", en: "Coaching" }, color: T.orange, bg: T.orangeLight, icon: GraduationCap },
  at_risk: { label: { de: "At Risk", en: "At Risk" }, color: T.danger, bg: T.dangerLight, icon: AlertTriangle },
  replace_pause: { label: { de: "Replace / Pause", en: "Replace / Pause" }, color: T.danger, bg: T.dangerLight, icon: UserX },
};

const RANKING_STYLE: Record<string, { color: string; bg: string; label: { de: string; en: string } }> = {
  top: { color: T.gold, bg: T.goldLight, label: { de: "Top", en: "Top" } },
  rising: { color: T.success, bg: T.successLight, label: { de: "Rising", en: "Rising" } },
  stable: { color: T.secondary, bg: "#F4F3F0", label: { de: "Stabil", en: "Stable" } },
  at_risk: { color: T.danger, bg: T.dangerLight, label: { de: "At Risk", en: "At Risk" } },
};

function trendIcon(val: number) {
  if (val > 5) return { Icon: ArrowUpRight, color: T.success };
  if (val < -5) return { Icon: ArrowDownRight, color: T.danger };
  return { Icon: Minus, color: T.muted };
}
function scoreColor(s: number) { return s >= 80 ? T.gold : s >= 60 ? T.ink : s >= 40 ? T.orange : T.danger; }
function categoryKey(c: string) { return c?.toLowerCase().replace("-", "_").replace(" ", "_") || "risk"; }

const ACTION_TYPES = [
  { value: "coaching", label: "Coaching" }, { value: "script_review", label: "Script Review" },
  { value: "shadowing", label: "Shadowing" }, { value: "training", label: "Training" },
  { value: "escalation", label: "Eskalation" }, { value: "reassign", label: "Reassign" },
  { value: "promotion", label: "Promotion" }, { value: "downgrade", label: "Downgrade" },
] as const;

type TabKey = "overview" | "setters" | "closers" | "alerts" | "distribution" | "audit";

// ─── Component ──────────────────────────────────────────────────
export default function TalentOS() {
  const { profile, isAdmin, isOwner } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const stage = (profile as any)?.business_stage ?? "opener";
  const myLevel = getLevelForStage(stage);
  const isAdminLike = isAdmin || isOwner;
  const effectiveLevel = isAdminLike ? 8 : myLevel;
  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const shellFilters = useOptionalPerformanceFilters();
  const nested = !!shellFilters;

  // State
  const [loading, setLoading] = useState(true);
  const { timedOut } = useLoadingTimeout(loading);
  const [tab, setTab] = useState<TabKey>("overview");
  const [rows, setRows] = useState<TalentRow[]>([]);
  const [setters, setSetters] = useState<SetterRow[]>([]);
  const [closers, setClosers] = useState<CloserRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [flags, setFlags] = useState<TalentFlag[]>([]);
  const [actions, setActions] = useState<TalentAction[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [drillMember, setDrillMember] = useState<TalentRow | null>(null);
  const [drillSetter, setDrillSetter] = useState<SetterRow | null>(null);
  const [drillCloser, setDrillCloser] = useState<CloserRow | null>(null);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionTargetId, setActionTargetId] = useState<string>("");
  const [actionTargetName, setActionTargetName] = useState<string>("");
  const [newAction, setNewAction] = useState({ type: "coaching", title: "", description: "" });

  if (effectiveLevel < 6) return <AccessDenied />;

  const rangeDays = useMemo(() => {
    if (!shellFilters) return 30;
    const r = shellFilters.filters.range;
    return r === "24h" ? 1 : r === "7d" ? 7 : r === "90d" ? 90 : 30;
  }, [shellFilters?.filters.range]);

  const funnelFilter = useMemo(() => {
    if (!shellFilters) return undefined;
    const f = shellFilters.filters.funnel;
    return f && f !== "__all" ? f : undefined;
  }, [shellFilters?.filters.funnel]);

  const operatorFilter = useMemo(() => {
    if (!shellFilters) return undefined;
    const o = shellFilters.filters.operator;
    return o && o !== "__all" ? o : undefined;
  }, [shellFilters?.filters.operator]);

  // L6 = sees own team (operator filter defaults to self), L7+ / Admin = all
  const scopeUserId = useMemo(() => {
    if (isAdminLike || effectiveLevel >= 7) return undefined;
    // L6 operator: scope to own operator unit via operator filter
    return profile?.id ?? undefined;
  }, [isAdminLike, effectiveLevel, profile?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rpcArgs: Record<string, any> = { p_range_days: rangeDays };
      if (scopeUserId) rpcArgs.p_user_id = scopeUserId;
      if (funnelFilter) rpcArgs.p_funnel = funnelFilter;
      if (operatorFilter) rpcArgs.p_operator_id = operatorFilter;

      const setterArgs: Record<string, any> = { p_range_days: rangeDays };
      if (scopeUserId) setterArgs.p_user_id = scopeUserId;
      if (operatorFilter) setterArgs.p_operator_id = operatorFilter;

      const closerArgs: Record<string, any> = { p_range_days: rangeDays };
      if (scopeUserId) closerArgs.p_user_id = scopeUserId;
      if (operatorFilter) closerArgs.p_operator_id = operatorFilter;

      const alertArgs: Record<string, any> = { p_range_days: rangeDays };
      if (scopeUserId) alertArgs.p_user_id = scopeUserId;

      const [scoreRes, setterRes, closerRes, alertRes, flagRes, actionRes] = await Promise.all([
        supabase.rpc("compute_talent_scores", rpcArgs),
        supabase.rpc("get_setter_intelligence", setterArgs),
        supabase.rpc("get_closer_intelligence", closerArgs),
        supabase.rpc("get_talent_alerts", alertArgs),
        supabase.from("talent_flags").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(100),
        supabase.from("talent_actions").select("*").neq("status", "dismissed").order("created_at", { ascending: false }).limit(100),
      ]);

      if (!scoreRes.error) setRows((scoreRes.data as unknown as TalentRow[]) ?? []);
      else console.error("[TalentFlow] talent score error", scoreRes.error);
      if (!setterRes.error) setSetters((setterRes.data as unknown as SetterRow[]) ?? []);
      else console.error("[TalentFlow] setter error", setterRes.error);
      if (!closerRes.error) setClosers((closerRes.data as unknown as CloserRow[]) ?? []);
      else console.error("[TalentFlow] closer error", closerRes.error);
      if (!alertRes.error) setAlerts((alertRes.data as unknown as AlertRow[]) ?? []);
      else console.error("[TalentFlow] alert error", alertRes.error);

      setFlags((flagRes.data as TalentFlag[]) ?? []);
      setActions((actionRes.data as TalentAction[]) ?? []);
      setLastUpdated(new Date());
      playCue("success");
    } catch (e) {
      console.error("[TalentFlow] load failed", e);
      playCue("error");
    } finally {
      setLoading(false);
    }
  }, [rangeDays, scopeUserId, funnelFilter, operatorFilter]);

  useEffect(() => { load(); }, [load]);

  // Client-side level filter
  const filtered = useMemo(() => {
    let result = [...rows];
    if (shellFilters?.filters.level && shellFilters.filters.level !== "__all") {
      const lvl = parseInt(shellFilters.filters.level.replace("L", ""));
      result = result.filter(r => r.level_num === lvl);
    }
    result.sort((a, b) => b.talent_score - a.talent_score);
    return result;
  }, [rows, shellFilters?.filters.level]);

  // KPI Aggregates
  const kpi = useMemo(() => {
    const total = filtered.length;
    const avgScore = total ? filtered.reduce((a, b) => a + b.talent_score, 0) / total : 0;
    const totalRevenue = filtered.reduce((a, b) => a + b.total_revenue, 0);
    const totalShows = filtered.reduce((a, b) => a + b.total_shows, 0);
    const totalCloses = filtered.reduce((a, b) => a + b.total_closes, 0);
    const totalBookings = filtered.reduce((a, b) => a + b.total_bookings, 0);
    const avgShowRate = totalBookings ? (totalShows / totalBookings) * 100 : 0;
    const avgCloseRate = totalShows ? (totalCloses / totalShows) * 100 : 0;
    const revPerOperator = total ? totalRevenue / total : 0;
    return { total, avgScore, totalRevenue, avgShowRate, avgCloseRate, revPerOperator, hasData: total > 0, totalShows, totalCloses, totalBookings };
  }, [filtered]);

  const catDist = useMemo(() => {
    const counts: Record<string, number> = { a_player: 0, stable: 0, risk: 0, critical: 0 };
    for (const r of filtered) { const key = categoryKey(r.talent_category) as keyof typeof counts; if (key in counts) counts[key]++; }
    return counts;
  }, [filtered]);

  const strategicSummary = useMemo(() => {
    const summary: Record<StrategicStatus, TalentRow[]> = { promotion_ready: [], coaching_required: [], at_risk: [], replace_pause: [] };
    for (const r of filtered) { summary[deriveStrategicStatus(r).status].push(r); }
    return summary;
  }, [filtered]);

  const rootCause = useMemo(() => {
    const causes = new Map<string, { count: number; members: string[] }>();
    for (const r of filtered) {
      if (r.primary_bottleneck === "No Major Issue") continue;
      const existing = causes.get(r.primary_bottleneck) || { count: 0, members: [] };
      existing.count++; existing.members.push(r.full_name);
      causes.set(r.primary_bottleneck, existing);
    }
    return Array.from(causes.entries()).map(([cause, data]) => ({ cause, ...data })).sort((a, b) => b.count - a.count);
  }, [filtered]);

  const pendingActions = useMemo(() => actions.filter(a => a.status === "pending" || a.status === "in_progress"), [actions]);

  const criticalAlerts = useMemo(() => alerts.filter(a => a.severity === "critical"), [alerts]);

  // Handlers
  const handleCreateAction = async () => {
    if (!actionTargetId || !newAction.title.trim()) return;
    try {
      const { error } = await supabase.rpc("create_talent_action", { p_user_id: actionTargetId, p_action_type: newAction.type, p_title: newAction.title, p_description: newAction.description || null });
      if (error) throw error;
      playCue("success");
      setShowActionDialog(false);
      setNewAction({ type: "coaching", title: "", description: "" });
      load();
    } catch (e) { console.error("[TalentFlow] create action failed", e); playCue("error"); }
  };
  const handleResolveAction = async (actionId: string, status: "completed" | "dismissed") => {
    try {
      const { error } = await supabase.rpc("resolve_talent_action", { p_action_id: actionId, p_status: status });
      if (error) throw error;
      playCue("success"); load();
    } catch (e) { console.error("[TalentFlow] resolve action failed", e); }
  };
  const openAction = (userId: string, name: string, type = "coaching", title = "", desc = "") => {
    setActionTargetId(userId); setActionTargetName(name);
    setNewAction({ type, title, description: desc });
    setShowActionDialog(true);
  };

  const scopeLabel = effectiveLevel >= 8 ? t("Gesamte Plattform", "Full Platform") : effectiveLevel >= 7 ? t("Director-Bereich", "Director Area") : t("Mein Team", "My Team") + ` (${roleLabel(effectiveLevel, "external", lang)})`;

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.ink, fontFamily: "'DM Sans', sans-serif" }}>
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 py-6 sm:py-8 space-y-6">

        {/* ─── HEADER ──────────────────────────────── */}
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[28px] sm:text-[34px] font-light tracking-[-0.02em]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Talent Flow™
            </h1>
            <p className="text-[13px] mt-1 tracking-wide" style={{ color: T.muted }}>
              {scopeLabel} · {rangeDays}d · {t("Echte Daten", "Real Data")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {nested && <><CrossNavCta variant="to_revenue" /><CrossNavCta variant="to_intelligence" /><span className="mx-1 h-5 w-px" style={{ background: T.border }} /></>}
            <span className="text-[11px]" style={{ color: T.muted }}>{lastUpdated ? lastUpdated.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "—"}</span>
            <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium transition-all hover:shadow-sm" style={{ border: `1px solid ${T.border}`, color: T.secondary, background: T.card }}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </button>
          </div>
        </header>

        {/* ─── TABS ──────────────────────────────── */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="bg-white/80 border" style={{ borderColor: T.border }}>
            <TabsTrigger value="overview" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />{t("Übersicht", "Overview")}</TabsTrigger>
            <TabsTrigger value="setters" className="gap-1.5 text-xs"><Phone className="h-3.5 w-3.5" />{t("Setter", "Setters")} ({setters.length})</TabsTrigger>
            <TabsTrigger value="closers" className="gap-1.5 text-xs"><Zap className="h-3.5 w-3.5" />{t("Closer", "Closers")} ({closers.length})</TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />Alerts
              {criticalAlerts.length > 0 && <span className="ml-1 h-4 min-w-[16px] rounded-full text-[10px] font-bold grid place-items-center" style={{ background: T.danger, color: "white" }}>{criticalAlerts.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="distribution" className="gap-1.5 text-xs"><BarChart3 className="h-3.5 w-3.5" />{t("Verteilung", "Distribution")}</TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5 text-xs"><Clock className="h-3.5 w-3.5" />{t("Audit Log", "Audit Log")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading && (
          timedOut ? (
            <LoadingTimeoutFallback onRetry={load} />
          ) : (
            <div className="flex items-center gap-2 py-8 text-[13px]" style={{ color: T.muted }}>
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Lade Talent Flow…", "Loading Talent Flow…")}
            </div>
          )
        )}

        {!loading && tab === "overview" && <OverviewTab filtered={filtered} kpi={kpi} catDist={catDist} strategicSummary={strategicSummary} rootCause={rootCause} flags={flags} pendingActions={pendingActions} rows={rows} t={t} lang={lang} effectiveLevel={effectiveLevel} onDrill={setDrillMember} onResolveAction={handleResolveAction} />}
        {!loading && tab === "setters" && <SetterTab setters={setters} t={t} lang={lang} onDrill={setDrillSetter} onAction={openAction} />}
        {!loading && tab === "closers" && <CloserTab closers={closers} t={t} lang={lang} onDrill={setDrillCloser} onAction={openAction} onNavigateRevenue={(id) => navigate(`/members/performance/revenue?operator=${id}`)} />}
        {!loading && tab === "alerts" && <AlertsTab alerts={alerts} t={t} lang={lang} onAction={openAction} />}
        {!loading && tab === "distribution" && <LeadDistributionPanel userId={profile?.id} t={t} lang={lang} />}
        {!loading && tab === "audit" && <TalentAuditTimeline />}
      </div>

      {/* ─── DRILLDOWNS ───────────────────────────── */}
      <Sheet open={drillMember !== null} onOpenChange={(o) => !o && setDrillMember(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0" style={{ background: T.bg, borderLeft: `1px solid ${T.border}` }}>
          {drillMember && <OperatorDetail m={drillMember} flags={flags.filter(f => f.user_id === drillMember.user_id)} actions={actions.filter(a => a.user_id === drillMember.user_id)} lang={lang} avgCloseRate={kpi.avgCloseRate} avgShowRate={kpi.avgShowRate} onCreateAction={() => openAction(drillMember.user_id, drillMember.full_name)} onResolveAction={handleResolveAction} onNavigateRevenue={() => navigate(`/members/performance/revenue?operator=${drillMember.user_id}`)} />}
        </SheetContent>
      </Sheet>
      <Sheet open={drillSetter !== null} onOpenChange={(o) => !o && setDrillSetter(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0" style={{ background: T.bg, borderLeft: `1px solid ${T.border}` }}>
          {drillSetter && <SetterDetail s={drillSetter} t={t} lang={lang} onAction={(type, title, desc) => openAction(drillSetter.user_id, drillSetter.full_name, type, title, desc)} />}
        </SheetContent>
      </Sheet>
      <Sheet open={drillCloser !== null} onOpenChange={(o) => !o && setDrillCloser(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0" style={{ background: T.bg, borderLeft: `1px solid ${T.border}` }}>
          {drillCloser && <CloserDetail c={drillCloser} t={t} lang={lang} onAction={(type, title, desc) => openAction(drillCloser.user_id, drillCloser.full_name, type, title, desc)} onNavigateRevenue={() => navigate(`/members/performance/revenue?operator=${drillCloser.user_id}`)} />}
        </SheetContent>
      </Sheet>

      {/* ─── CREATE ACTION DIALOG ──────────────────── */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent className="rounded-2xl border-0 shadow-xl" style={{ background: T.card }}>
          <DialogHeader>
            <DialogTitle className="text-[16px] font-medium" style={{ color: T.ink }}>
              {t("Maßnahme erstellen", "Create Action")} — {actionTargetName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: T.muted }}>Typ</label>
              <Select value={newAction.type} onValueChange={v => setNewAction(p => ({ ...p, type: v }))}><SelectTrigger className="rounded-xl" style={{ border: `1px solid ${T.border}` }}><SelectValue /></SelectTrigger><SelectContent>{ACTION_TYPES.map(at => <SelectItem key={at.value} value={at.value}>{at.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: T.muted }}>{t("Titel", "Title")}</label>
              <Input value={newAction.title} onChange={e => setNewAction(p => ({ ...p, title: e.target.value }))} className="rounded-xl" style={{ border: `1px solid ${T.border}` }} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: T.muted }}>{t("Beschreibung", "Description")}</label>
              <Textarea value={newAction.description} onChange={e => setNewAction(p => ({ ...p, description: e.target.value }))} className="rounded-xl min-h-[80px]" style={{ border: `1px solid ${T.border}` }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionDialog(false)} className="rounded-xl">{t("Abbrechen", "Cancel")}</Button>
            <Button onClick={handleCreateAction} disabled={!newAction.title.trim()} className="rounded-xl" style={{ background: T.ink, color: T.card }}><Plus className="h-4 w-4 mr-1.5" />{t("Erstellen", "Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB A: OVERVIEW
// ═══════════════════════════════════════════════════════════════
function OverviewTab({ filtered, kpi, catDist, strategicSummary, rootCause, flags, pendingActions, rows, t, lang, effectiveLevel, onDrill, onResolveAction }: any) {
  if (!kpi.hasData) return (
    <div className="rounded-2xl p-10 text-center" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      <Users className="h-10 w-10 mx-auto mb-3" style={{ color: T.muted }} />
      <div className="text-[16px] font-medium mb-2">{t("Keine Daten im gewählten Zeitraum", "No data for selected period")}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile label={t("Operatoren", "Operators")} value={fmt(kpi.total)} icon={<Users className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Talent Score Ø", "Avg Score")} value={fmt(kpi.avgScore)} accent icon={<Target className="h-3.5 w-3.5" />} />
        <KpiTile label="Revenue" value={fmtEur(kpi.totalRevenue)} icon={<TrendingUp className="h-3.5 w-3.5" />} />
        <KpiTile label="Close Rate" value={fmtPct(kpi.avgCloseRate)} icon={<Zap className="h-3.5 w-3.5" />} />
        <KpiTile label="Show Rate" value={fmtPct(kpi.avgShowRate)} icon={<Activity className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Rev / Operator", "Rev / Op")} value={fmtEur(kpi.revPerOperator)} accent icon={<BarChart3 className="h-3.5 w-3.5" />} />
      </section>

      {/* Category Distribution */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["a_player", "stable", "risk", "critical"] as const).map(cat => {
          const style = CATEGORY_STYLE[cat]; const count = catDist[cat]; const pct = kpi.total ? Math.round((count / kpi.total) * 100) : 0;
          return <div key={cat} className="rounded-2xl px-4 py-3 text-center" style={{ background: style.bg, border: `1px solid ${T.border}` }}>
            <div className="text-[20px] font-semibold tabular-nums" style={{ color: style.color }}>{count}</div>
            <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: style.color }}>{style.label[lang]} · {pct}%</div>
          </div>;
        })}
      </section>

      {/* Strategic Assessment */}
      <section>
        <h2 className="text-[15px] font-medium mb-4" style={{ color: T.ink }}>{t("Strategische Bewertung", "Strategic Assessment")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(["promotion_ready", "at_risk", "coaching_required", "replace_pause"] as const).map(st => {
            const cfg = STRATEGIC_CONFIG[st]; const members = strategicSummary[st]; const StIcon = cfg.icon;
            return <div key={st} className="rounded-2xl p-4" style={{ background: cfg.bg, border: `1px solid ${T.border}` }}>
              <div className="flex items-center gap-2 mb-2"><StIcon className="h-4 w-4" style={{ color: cfg.color }} /><span className="text-[12px] font-medium uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label[lang]}</span></div>
              <div className="text-[22px] font-semibold tabular-nums" style={{ color: cfg.color }}>{members.length}</div>
              {members.slice(0, 3).map((m: TalentRow) => <div key={m.user_id} className="text-[11px] cursor-pointer hover:underline mt-1" style={{ color: T.secondary }} onClick={() => onDrill(m)}><strong>{m.full_name}</strong>: {deriveStrategicStatus(m).reason}</div>)}
              {members.length > 3 && <div className="text-[10px] mt-1" style={{ color: T.muted }}>+{members.length - 3} {t("weitere", "more")}</div>}
            </div>;
          })}
        </div>
      </section>

      {/* Leaderboard */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-medium" style={{ color: T.ink }}>{t("Operator Ranking", "Operator Ranking")}</h2>
          <span className="text-[11px]" style={{ color: T.muted }}>{filtered.length} {t("Personen", "People")}</span>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="hidden sm:flex items-center gap-4 px-5 py-2.5 text-[10px] uppercase tracking-wider font-medium" style={{ color: T.muted, background: "#FAFAF7", borderBottom: `1px solid ${T.border}` }}>
            <span className="w-6 text-right">#</span><span className="flex-1">Person</span>
            <span className="w-14 text-right">Leads</span><span className="w-14 text-right">Shows</span>
            <span className="w-16 text-right">Close %</span><span className="w-20 text-right">Revenue</span>
            <span className="w-14 text-right">7d Δ</span><span className="w-16 text-center">Status</span><span className="w-14 text-right">Score</span><span className="w-5" />
          </div>
          {filtered.map((r: TalentRow, i: number) => {
            const catStyle = CATEGORY_STYLE[categoryKey(r.talent_category)] || CATEGORY_STYLE.risk;
            const trend = trendIcon(r.trend_7d);
            const insufficient = r.total_leads < 3 && r.total_shows < 2;
            return (
              <div key={r.user_id} onClick={() => onDrill(r)} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 cursor-pointer transition-colors hover:bg-[#F5F2ED]" style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <span className="text-[13px] tabular-nums w-6 text-right font-medium hidden sm:block" style={{ color: T.muted }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] font-medium truncate block" style={{ color: T.ink }}>{r.full_name}</span>
                  <span className="text-[11px]" style={{ color: T.muted }}>L{r.level_num} · {r.operator_role}</span>
                </div>
                <span className="hidden sm:block w-14 text-right text-[13px] tabular-nums" style={{ color: T.secondary }}>{r.total_leads}</span>
                <span className="hidden sm:block w-14 text-right text-[13px] tabular-nums" style={{ color: T.secondary }}>{r.total_shows}</span>
                <span className="hidden sm:block w-16 text-right text-[13px] tabular-nums" style={{ color: T.secondary }}>{fmtPct(r.close_rate)}</span>
                <span className="hidden sm:block w-20 text-right text-[13px] tabular-nums font-medium" style={{ color: T.ink }}>{fmtEur(r.total_revenue)}</span>
                <div className="hidden sm:flex items-center justify-end gap-1 w-14"><trend.Icon className="h-3.5 w-3.5" style={{ color: trend.color }} /><span className="text-[11px] tabular-nums" style={{ color: trend.color }}>{r.trend_7d > 0 ? "+" : ""}{fmt(r.trend_7d)}%</span></div>
                <span className="w-16 text-center">{insufficient ? <span className="text-[9px] px-2 py-0.5 rounded-lg" style={{ background: "#F4F3F0", color: T.muted }}>{t("Zu wenig", "Low data")}</span> : <span className="text-[9px] px-2 py-0.5 rounded-lg font-medium uppercase tracking-wider" style={{ background: catStyle.bg, color: catStyle.color }}>{catStyle.label[lang]}</span>}</span>
                <span className="w-10 sm:w-14 text-right text-[18px] sm:text-[20px] font-semibold tabular-nums" style={{ color: insufficient ? T.muted : scoreColor(r.talent_score) }}>{insufficient ? "—" : fmt(r.talent_score)}</span>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: T.border }} />
              </div>
            );
          })}
        </div>
      </section>

      {/* System Diagnosis */}
      {rootCause.length > 0 && <section>
        <h2 className="text-[15px] font-medium mb-4" style={{ color: T.ink }}>{t("Systemdiagnose", "System Diagnosis")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rootCause.slice(0, 3).map((rc: any) => <div key={rc.cause} className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="text-[13px] font-medium" style={{ color: T.ink }}>{rc.cause}</div>
            <div className="text-[11px] mt-1" style={{ color: T.muted }}>{rc.count} {t("Personen", "people")}</div>
            <div className="text-[11px] mt-2" style={{ color: T.secondary }}>{rc.members.slice(0, 3).join(", ")}{rc.members.length > 3 ? ` +${rc.members.length - 3}` : ""}</div>
          </div>)}
        </div>
      </section>}

      {/* Pending Actions */}
      {pendingActions.length > 0 && <section>
        <h2 className="text-[15px] font-medium mb-3" style={{ color: T.ink }}>{t("Offene Maßnahmen", "Pending Actions")} <span className="ml-2 text-[12px] font-normal" style={{ color: T.muted }}>{pendingActions.length}</span></h2>
        <div className="space-y-2">
          {pendingActions.slice(0, 6).map((a: TalentAction) => {
            const member = rows.find((r: TalentRow) => r.user_id === a.user_id);
            return <div key={a.id} className="flex items-center gap-4 px-5 py-3 rounded-2xl" style={{ background: T.card, border: `1px solid ${T.border}` }}>
              <div className="flex-1 min-w-0"><div className="text-[13px] font-medium" style={{ color: T.ink }}>{a.title}</div><div className="text-[11px]" style={{ color: T.muted }}>{member?.full_name} · {a.action_type}</div></div>
              <span className="text-[10px] px-2 py-0.5 rounded-lg font-medium" style={{ background: T.goldLight, color: T.gold }}>{a.status}</span>
              <div className="flex gap-1">
                <button onClick={() => onResolveAction(a.id, "completed")} className="h-7 w-7 rounded-lg grid place-items-center" style={{ color: T.success }}><Check className="h-4 w-4" /></button>
                <button onClick={() => onResolveAction(a.id, "dismissed")} className="h-7 w-7 rounded-lg grid place-items-center" style={{ color: T.muted }}><X className="h-4 w-4" /></button>
              </div>
            </div>;
          })}
        </div>
      </section>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB B: SETTER INTELLIGENCE
// ═══════════════════════════════════════════════════════════════
function SetterTab({ setters, t, lang, onDrill, onAction }: { setters: SetterRow[]; t: (d: string, e: string) => string; lang: string; onDrill: (s: SetterRow) => void; onAction: (id: string, name: string, type: string, title: string, desc: string) => void }) {
  if (setters.length === 0) return <EmptyState icon={<Phone className="h-10 w-10" />} text={t("Keine Setter im Zeitraum gefunden", "No setters found in period")} />;

  const avgBookingRate = setters.length ? setters.reduce((a, b) => a + b.booking_rate, 0) / setters.length : 0;
  const avgShowRate = setters.length ? setters.reduce((a, b) => a + b.show_rate, 0) / setters.length : 0;
  const totalBookings = setters.reduce((a, b) => a + b.bookings_created, 0);
  const totalNoShows = setters.reduce((a, b) => a + b.no_shows, 0);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiTile label={t("Setter", "Setters")} value={String(setters.length)} icon={<Phone className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Bookings", "Bookings")} value={fmt(totalBookings)} icon={<Calendar className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Booking Rate Ø", "Avg Booking Rate")} value={fmtPct(avgBookingRate)} icon={<Target className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Show Rate Ø", "Avg Show Rate")} value={fmtPct(avgShowRate)} icon={<Eye className="h-3.5 w-3.5" />} />
        <KpiTile label={t("No-Shows", "No-Shows")} value={fmt(totalNoShows)} icon={<UserX className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Revenue (über Setter)", "Revenue (via Setters)")} value={fmtEur(setters.reduce((a, b) => a + b.total_revenue, 0))} accent icon={<TrendingUp className="h-3.5 w-3.5" />} />
      </section>

      {/* Setter List */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="hidden sm:flex items-center gap-3 px-5 py-2.5 text-[10px] uppercase tracking-wider font-medium" style={{ color: T.muted, background: "#FAFAF7", borderBottom: `1px solid ${T.border}` }}>
          <span className="w-6 text-right">#</span><span className="flex-1">Setter</span>
          <span className="w-14 text-right">Leads</span><span className="w-14 text-right">Bookings</span>
          <span className="w-16 text-right">Booking %</span><span className="w-14 text-right">Shows</span>
          <span className="w-16 text-right">Show %</span><span className="w-14 text-right">No-Show</span>
          <span className="w-14 text-right">Score</span><span className="w-16 text-center">Status</span><span className="w-5" />
        </div>
        {setters.map((s, i) => {
          const rank = RANKING_STYLE[s.ranking] || RANKING_STYLE.stable;
          const trend = trendIcon(s.trend_7d);
          return (
            <div key={s.user_id} onClick={() => onDrill(s)} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 cursor-pointer transition-colors hover:bg-[#F5F2ED]" style={{ borderBottom: i < setters.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span className="hidden sm:block text-[13px] tabular-nums w-6 text-right font-medium" style={{ color: T.muted }}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[14px] font-medium truncate block" style={{ color: T.ink }}>{s.full_name}</span>
                <span className="text-[11px]" style={{ color: T.muted }}>L{s.level_num}</span>
              </div>
              <span className="hidden sm:block w-14 text-right text-[13px] tabular-nums" style={{ color: T.secondary }}>{s.assigned_leads}</span>
              <span className="hidden sm:block w-14 text-right text-[13px] tabular-nums" style={{ color: T.secondary }}>{s.bookings_created}</span>
              <span className="hidden sm:block w-16 text-right text-[13px] tabular-nums" style={{ color: s.booking_rate >= 20 ? T.success : s.booking_rate >= 10 ? T.orange : T.danger }}>{fmtPct(s.booking_rate)}</span>
              <span className="hidden sm:block w-14 text-right text-[13px] tabular-nums" style={{ color: T.secondary }}>{s.shows}</span>
              <span className="hidden sm:block w-16 text-right text-[13px] tabular-nums" style={{ color: s.show_rate >= 60 ? T.success : s.show_rate >= 40 ? T.orange : T.danger }}>{fmtPct(s.show_rate)}</span>
              <span className="hidden sm:block w-14 text-right text-[13px] tabular-nums" style={{ color: s.no_shows > 0 ? T.danger : T.muted }}>{s.no_shows}</span>
              <span className="w-10 sm:w-14 text-right text-[18px] sm:text-[20px] font-semibold tabular-nums" style={{ color: scoreColor(s.talent_score) }}>{fmt(s.talent_score)}</span>
              <span className="w-16 text-center"><span className="text-[9px] px-2 py-0.5 rounded-lg font-medium uppercase tracking-wider" style={{ background: rank.bg, color: rank.color }}>{rank.label[lang]}</span></span>
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: T.border }} />
            </div>
          );
        })}
      </div>

      {/* Decision recommendations */}
      {setters.filter(s => s.ranking === "at_risk").length > 0 && (
        <section className="rounded-2xl p-5" style={{ background: T.dangerLight, border: `1px solid #E8C9C4` }}>
          <h3 className="text-[13px] font-medium mb-3" style={{ color: T.danger }}>{t("Setter-Empfehlungen", "Setter Recommendations")}</h3>
          {setters.filter(s => s.ranking === "at_risk").slice(0, 3).map(s => {
            let recommendation = "";
            if (s.booking_rate < 10) recommendation = t(`Setter ${s.full_name} hat eine Booking Rate von ${fmtPct(s.booking_rate)}. Lead-Engagement und Erstansprache prüfen.`, `Setter ${s.full_name} has a booking rate of ${fmtPct(s.booking_rate)}. Review lead engagement and initial contact.`);
            else if (s.show_rate < 40) recommendation = t(`Setter ${s.full_name} hat starke Buchungen aber schwache Show Rate (${fmtPct(s.show_rate)}). Reminder-Compliance und Qualifikations-Script prüfen.`, `Setter ${s.full_name} has strong bookings but weak show rate (${fmtPct(s.show_rate)}). Review reminder compliance and qualification script.`);
            else recommendation = t(`Setter ${s.full_name} ist At Risk (Score: ${fmt(s.talent_score)}). Aktivität und Response-Zeit prüfen.`, `Setter ${s.full_name} is At Risk (Score: ${fmt(s.talent_score)}). Review activity and response time.`);
            return <div key={s.user_id} className="text-[12px] mb-2 cursor-pointer hover:underline" style={{ color: T.secondary }} onClick={() => onAction(s.user_id, s.full_name, "coaching", `Setter Coaching: ${s.full_name}`, recommendation)}>
              💡 {recommendation}
            </div>;
          })}
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB C: CLOSER INTELLIGENCE
// ═══════════════════════════════════════════════════════════════
function CloserTab({ closers, t, lang, onDrill, onAction, onNavigateRevenue }: { closers: CloserRow[]; t: (d: string, e: string) => string; lang: string; onDrill: (c: CloserRow) => void; onAction: (id: string, name: string, type: string, title: string, desc: string) => void; onNavigateRevenue: (id: string) => void }) {
  if (closers.length === 0) return <EmptyState icon={<Zap className="h-10 w-10" />} text={t("Keine Closer im Zeitraum gefunden", "No closers found in period")} />;

  const avgCloseRate = closers.length ? closers.reduce((a, b) => a + b.close_rate, 0) / closers.length : 0;
  const totalRevenue = closers.reduce((a, b) => a + b.revenue_closed, 0);
  const totalCalls = closers.reduce((a, b) => a + b.calls_completed, 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiTile label={t("Closer", "Closers")} value={String(closers.length)} icon={<Zap className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Calls Completed", "Calls Completed")} value={fmt(totalCalls)} icon={<Phone className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Close Rate Ø", "Avg Close Rate")} value={fmtPct(avgCloseRate)} icon={<Target className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Revenue Total", "Total Revenue")} value={fmtEur(totalRevenue)} accent icon={<TrendingUp className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Avg Deal Value", "Avg Deal")} value={fmtEur(closers.length ? totalRevenue / Math.max(1, closers.reduce((a, b) => a + (b.close_rate > 0 ? 1 : 0), 0)) : 0)} icon={<Award className="h-3.5 w-3.5" />} />
        <KpiTile label={t("Rev / Closer", "Rev / Closer")} value={fmtEur(closers.length ? totalRevenue / closers.length : 0)} icon={<BarChart3 className="h-3.5 w-3.5" />} />
      </section>

      <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="hidden sm:flex items-center gap-3 px-5 py-2.5 text-[10px] uppercase tracking-wider font-medium" style={{ color: T.muted, background: "#FAFAF7", borderBottom: `1px solid ${T.border}` }}>
          <span className="w-6 text-right">#</span><span className="flex-1">Closer</span>
          <span className="w-14 text-right">Calls</span><span className="w-16 text-right">Close %</span>
          <span className="w-20 text-right">Revenue</span><span className="w-18 text-right">Avg Deal</span>
          <span className="w-12 text-right">Lost</span><span className="w-14 text-right">7d Δ</span>
          <span className="w-14 text-right">Score</span><span className="w-16 text-center">Status</span><span className="w-5" />
        </div>
        {closers.map((c, i) => {
          const rank = RANKING_STYLE[c.ranking] || RANKING_STYLE.stable;
          const trend = trendIcon(c.trend_7d);
          return (
            <div key={c.user_id} onClick={() => onDrill(c)} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 cursor-pointer transition-colors hover:bg-[#F5F2ED]" style={{ borderBottom: i < closers.length - 1 ? `1px solid ${T.border}` : "none" }}>
              <span className="hidden sm:block text-[13px] tabular-nums w-6 text-right font-medium" style={{ color: T.muted }}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[14px] font-medium truncate block" style={{ color: T.ink }}>{c.full_name}</span>
                <span className="text-[11px]" style={{ color: T.muted }}>L{c.level_num} {c.primary_bottleneck !== "No Major Issue" && `· ${c.primary_bottleneck}`}</span>
              </div>
              <span className="hidden sm:block w-14 text-right text-[13px] tabular-nums" style={{ color: T.secondary }}>{c.calls_completed}</span>
              <span className="hidden sm:block w-16 text-right text-[13px] tabular-nums" style={{ color: c.close_rate >= 25 ? T.success : c.close_rate >= 15 ? T.orange : T.danger }}>{fmtPct(c.close_rate)}</span>
              <span className="hidden sm:block w-20 text-right text-[13px] tabular-nums font-medium" style={{ color: T.ink }}>{fmtEur(c.revenue_closed)}</span>
              <span className="hidden sm:block w-18 text-right text-[13px] tabular-nums" style={{ color: T.secondary }}>{fmtEur(c.avg_deal_value)}</span>
              <span className="hidden sm:block w-12 text-right text-[13px] tabular-nums" style={{ color: c.lost_count > 0 ? T.danger : T.muted }}>{c.lost_count}</span>
              <div className="hidden sm:flex items-center justify-end gap-1 w-14"><trend.Icon className="h-3.5 w-3.5" style={{ color: trend.color }} /></div>
              <span className="w-10 sm:w-14 text-right text-[18px] sm:text-[20px] font-semibold tabular-nums" style={{ color: scoreColor(c.talent_score) }}>{fmt(c.talent_score)}</span>
              <span className="w-16 text-center"><span className="text-[9px] px-2 py-0.5 rounded-lg font-medium uppercase tracking-wider" style={{ background: rank.bg, color: rank.color }}>{rank.label[lang]}</span></span>
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: T.border }} />
            </div>
          );
        })}
      </div>

      {closers.filter(c => c.ranking === "at_risk").length > 0 && (
        <section className="rounded-2xl p-5" style={{ background: T.dangerLight, border: `1px solid #E8C9C4` }}>
          <h3 className="text-[13px] font-medium mb-3" style={{ color: T.danger }}>{t("Closer-Empfehlungen", "Closer Recommendations")}</h3>
          {closers.filter(c => c.ranking === "at_risk").slice(0, 3).map(c => {
            let rec = "";
            if (c.close_rate < 15 && c.calls_completed >= 3) rec = t(`Closer ${c.full_name} hat hohe Show-Anzahl aber niedrige Close Rate (${fmtPct(c.close_rate)}). Objection Handling und Call Recordings analysieren.`, `Closer ${c.full_name} has high show volume but low close rate (${fmtPct(c.close_rate)}). Review objection handling and call recordings.`);
            else if (c.refund_count > 0) rec = t(`Closer ${c.full_name} hat ${c.refund_count} Refunds. Erwartungsmanagement im Call prüfen.`, `Closer ${c.full_name} has ${c.refund_count} refunds. Review expectation management in calls.`);
            else rec = t(`Closer ${c.full_name} ist At Risk (Score: ${fmt(c.talent_score)}). Bottleneck: ${c.primary_bottleneck}.`, `Closer ${c.full_name} is At Risk (Score: ${fmt(c.talent_score)}). Bottleneck: ${c.primary_bottleneck}.`);
            return <div key={c.user_id} className="text-[12px] mb-2 cursor-pointer hover:underline" style={{ color: T.secondary }} onClick={() => onAction(c.user_id, c.full_name, "coaching", `Closer Coaching: ${c.full_name}`, rec)}>💡 {rec}</div>;
          })}
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB D: ALERTS & DECISION
// ═══════════════════════════════════════════════════════════════
function AlertsTab({ alerts, t, lang, onAction }: { alerts: AlertRow[]; t: (d: string, e: string) => string; lang: string; onAction: (id: string, name: string, type: string, title: string, desc: string) => void }) {
  if (alerts.length === 0) return <EmptyState icon={<Shield className="h-10 w-10" />} text={t("Keine Alerts — alles im grünen Bereich", "No alerts — everything looks good")} />;

  const criticals = alerts.filter(a => a.severity === "critical");
  const warnings = alerts.filter(a => a.severity === "warning");

  const alertIcon = (type: string) => {
    switch (type) {
      case "high_no_show": return <UserX className="h-4 w-4" />;
      case "low_booking": return <Calendar className="h-4 w-4" />;
      case "low_close": return <Zap className="h-4 w-4" />;
      case "declining_revenue": return <TrendingUp className="h-4 w-4" />;
      case "low_activity": return <Activity className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiTile label={t("Alerts Gesamt", "Total Alerts")} value={String(alerts.length)} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        <KpiTile label="Critical" value={String(criticals.length)} icon={<Shield className="h-3.5 w-3.5" />} />
        <KpiTile label="Warning" value={String(warnings.length)} icon={<Eye className="h-3.5 w-3.5" />} />
      </section>

      {/* Critical Alerts */}
      {criticals.length > 0 && (
        <section>
          <h2 className="text-[15px] font-medium mb-3" style={{ color: T.danger }}>🚨 {t("Kritische Alerts", "Critical Alerts")}</h2>
          <div className="space-y-2">
            {criticals.map((a, i) => (
              <div key={`${a.subject_id}-${a.alert_type}-${i}`} className="rounded-2xl p-4" style={{ background: T.dangerLight, border: `1px solid #E8C9C4` }}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5" style={{ color: T.danger }}>{alertIcon(a.alert_type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium" style={{ color: T.ink }}>{a.subject_name}</div>
                    <div className="text-[12px] mt-1" style={{ color: T.secondary }}>{a.reason}</div>
                    <div className="text-[11px] mt-2 px-3 py-2 rounded-xl" style={{ background: T.card, color: T.secondary }}>
                      💡 {a.recommended_action}
                    </div>
                    <button onClick={() => onAction(a.subject_id, a.subject_name, "coaching", `Alert: ${a.alert_type} — ${a.subject_name}`, a.recommended_action)} className="text-[11px] font-medium mt-2 inline-flex items-center gap-1" style={{ color: T.gold }}>
                      <Plus className="h-3 w-3" /> {t("Maßnahme erstellen", "Create Action")}
                    </button>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] uppercase tracking-wider font-medium" style={{ color: T.danger }}>Critical</div>
                    <div className="text-[12px] mt-1" style={{ color: T.muted }}>{a.metric_name}: {fmtPct(a.metric_value)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <section>
          <h2 className="text-[15px] font-medium mb-3" style={{ color: T.orange }}>⚠️ {t("Warnungen", "Warnings")}</h2>
          <div className="space-y-2">
            {warnings.map((a, i) => (
              <div key={`${a.subject_id}-${a.alert_type}-${i}`} className="rounded-2xl p-4" style={{ background: T.orangeLight, border: `1px solid ${T.border}` }}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5" style={{ color: T.orange }}>{alertIcon(a.alert_type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium" style={{ color: T.ink }}>{a.subject_name}</div>
                    <div className="text-[12px] mt-1" style={{ color: T.secondary }}>{a.reason}</div>
                    <div className="text-[11px] mt-2 px-3 py-2 rounded-xl" style={{ background: T.card, color: T.secondary }}>
                      💡 {a.recommended_action}
                    </div>
                    <button onClick={() => onAction(a.subject_id, a.subject_name, "coaching", `Alert: ${a.alert_type} — ${a.subject_name}`, a.recommended_action)} className="text-[11px] font-medium mt-2 inline-flex items-center gap-1" style={{ color: T.gold }}>
                      <Plus className="h-3 w-3" /> {t("Maßnahme erstellen", "Create Action")}
                    </button>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] uppercase tracking-wider font-medium" style={{ color: T.orange }}>Warning</div>
                    <div className="text-[12px] mt-1" style={{ color: T.muted }}>{a.metric_name}: {fmtPct(a.metric_value)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DRILLDOWN: Setter Detail
// ═══════════════════════════════════════════════════════════════
function SetterDetail({ s, t, lang, onAction }: { s: SetterRow; t: (d: string, e: string) => string; lang: string; onAction: (type: string, title: string, desc: string) => void }) {
  const rank = RANKING_STYLE[s.ranking] || RANKING_STYLE.stable;
  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-wider" style={{ color: T.muted }}>L{s.level_num} · Setter</div>
        <h2 className="text-[24px] font-light mt-1" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{s.full_name}</h2>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[42px] font-semibold tabular-nums leading-none" style={{ color: scoreColor(s.talent_score) }}>{fmt(s.talent_score)}</span>
          <span className="text-[13px] font-medium px-2.5 py-1 rounded-lg" style={{ background: rank.bg, color: rank.color }}>{rank.label[lang]}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: t("Zugewiesene Leads", "Assigned Leads"), v: fmt(s.assigned_leads) },
          { l: t("Kontaktiert", "Contacted"), v: fmt(s.contacted_leads) },
          { l: t("Response Rate", "Response Rate"), v: fmtPct(s.response_rate) },
          { l: "Bookings", v: fmt(s.bookings_created) },
          { l: "Booking Rate", v: fmtPct(s.booking_rate), color: s.booking_rate >= 20 ? T.success : s.booking_rate >= 10 ? T.orange : T.danger },
          { l: "Shows", v: fmt(s.shows) },
          { l: "Show Rate", v: fmtPct(s.show_rate), color: s.show_rate >= 60 ? T.success : s.show_rate >= 40 ? T.orange : T.danger },
          { l: "No-Shows", v: fmt(s.no_shows), color: s.no_shows > 2 ? T.danger : undefined },
          { l: "No-Show Rate", v: fmtPct(s.no_show_rate), color: s.no_show_rate > 30 ? T.danger : undefined },
          { l: "Reschedules", v: fmt(s.reschedules) },
          { l: t("Ø Erstansprache", "Avg First Touch"), v: `${s.avg_time_to_first_touch_hours.toFixed(1)}h` },
          { l: "Revenue", v: fmtEur(s.total_revenue) },
        ].map(m => (
          <div key={m.l} className="rounded-xl px-3 py-2.5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: T.muted }}>{m.l}</div>
            <div className="text-[14px] font-semibold tabular-nums mt-0.5" style={{ color: (m as any).color || T.ink }}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: T.muted }}>{t("Empfehlungen", "Recommendations")}</div>
        {s.booking_rate < 15 && <ActionButton label={t("Lead-Engagement Coaching", "Lead Engagement Coaching")} desc={t(`Booking Rate ${fmtPct(s.booking_rate)} — Erstansprache optimieren`, `Booking rate ${fmtPct(s.booking_rate)} — optimize initial contact`)} onClick={() => onAction("coaching", `Lead Engagement: ${s.full_name}`, `Booking Rate ${fmtPct(s.booking_rate)}`)} />}
        {s.show_rate < 50 && s.bookings_created >= 3 && <ActionButton label={t("Show-Rate Analyse", "Show Rate Analysis")} desc={t(`Show Rate ${fmtPct(s.show_rate)} — Reminder & Qualification prüfen`, `Show rate ${fmtPct(s.show_rate)} — review reminders & qualification`)} onClick={() => onAction("script_review", `Show Rate Review: ${s.full_name}`, `Show Rate ${fmtPct(s.show_rate)}`)} />}
        {s.no_show_rate > 30 && <ActionButton label={t("No-Show Intervention", "No-Show Intervention")} desc={t(`No-Show Rate ${fmtPct(s.no_show_rate)} — Termin-Compliance prüfen`, `No-show rate ${fmtPct(s.no_show_rate)} — review appointment compliance`)} onClick={() => onAction("escalation", `No-Show Alert: ${s.full_name}`, `No-Show Rate ${fmtPct(s.no_show_rate)}`)} />}
        {s.avg_time_to_first_touch_hours > 24 && <ActionButton label={t("Response-Zeit Coaching", "Response Time Coaching")} desc={t(`Ø ${s.avg_time_to_first_touch_hours.toFixed(0)}h bis Erstansprache — viel zu lang`, `Avg ${s.avg_time_to_first_touch_hours.toFixed(0)}h to first touch — too slow`)} onClick={() => onAction("coaching", `Response Zeit: ${s.full_name}`, `Erstansprache: ${s.avg_time_to_first_touch_hours.toFixed(0)}h`)} />}
        <ActionButton label={t("Eigene Maßnahme erstellen", "Create custom action")} desc="" onClick={() => onAction("coaching", "", "")} isCustom />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DRILLDOWN: Closer Detail
// ═══════════════════════════════════════════════════════════════
function CloserDetail({ c, t, lang, onAction, onNavigateRevenue }: { c: CloserRow; t: (d: string, e: string) => string; lang: string; onAction: (type: string, title: string, desc: string) => void; onNavigateRevenue: () => void }) {
  const rank = RANKING_STYLE[c.ranking] || RANKING_STYLE.stable;
  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-wider" style={{ color: T.muted }}>L{c.level_num} · Closer</div>
        <h2 className="text-[24px] font-light mt-1" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{c.full_name}</h2>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[42px] font-semibold tabular-nums leading-none" style={{ color: scoreColor(c.talent_score) }}>{fmt(c.talent_score)}</span>
          <span className="text-[13px] font-medium px-2.5 py-1 rounded-lg" style={{ background: rank.bg, color: rank.color }}>{rank.label[lang]}</span>
        </div>
      </div>

      {c.primary_bottleneck !== "No Major Issue" && (
        <div className="rounded-2xl p-4" style={{ background: T.dangerLight, border: `1px solid #E8C9C4` }}>
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: T.muted }}>{t("Hauptengpass", "Main Bottleneck")}</div>
          <div className="text-[15px] font-medium" style={{ color: T.ink }}>{c.primary_bottleneck}</div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: t("Calls zugewiesen", "Calls Assigned"), v: fmt(c.calls_assigned) },
          { l: t("Calls absolviert", "Calls Completed"), v: fmt(c.calls_completed) },
          { l: "Close Rate", v: fmtPct(c.close_rate), color: c.close_rate >= 25 ? T.success : c.close_rate >= 15 ? T.orange : T.danger },
          { l: "Revenue", v: fmtEur(c.revenue_closed) },
          { l: "Avg Deal", v: fmtEur(c.avg_deal_value) },
          { l: t("Show→Close", "Show→Close"), v: fmtPct(c.show_to_close_rate) },
          { l: "Lost", v: fmt(c.lost_count), color: c.lost_count > 3 ? T.danger : undefined },
          { l: "Refunds", v: fmt(c.refund_count), color: c.refund_count > 0 ? T.danger : undefined },
          { l: "Refund Rate", v: fmtPct(c.refund_rate), color: c.refund_rate > 5 ? T.danger : undefined },
        ].map(m => (
          <div key={m.l} className="rounded-xl px-3 py-2.5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: T.muted }}>{m.l}</div>
            <div className="text-[14px] font-semibold tabular-nums mt-0.5" style={{ color: (m as any).color || T.ink }}>{m.v}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: T.muted }}>{t("Maßnahmen", "Actions")}</div>
        {c.close_rate < 20 && c.calls_completed >= 3 && <ActionButton label={t("Closing Coaching", "Closing Coaching")} desc={t(`Close Rate ${fmtPct(c.close_rate)} bei ${c.calls_completed} Calls`, `Close Rate ${fmtPct(c.close_rate)} with ${c.calls_completed} calls`)} onClick={() => onAction("coaching", `Closing Coaching: ${c.full_name}`, `Close Rate ${fmtPct(c.close_rate)}`)} />}
        {c.refund_count > 0 && <ActionButton label={t("Refund-Analyse", "Refund Analysis")} desc={t(`${c.refund_count} Refunds — Erwartungsmanagement prüfen`, `${c.refund_count} refunds — review expectation management`)} onClick={() => onAction("script_review", `Refund Review: ${c.full_name}`, `${c.refund_count} Refunds`)} />}
        <ActionButton label={t("Revenue Dashboard öffnen", "Open Revenue Dashboard")} desc={t("Mit Closer-Filter", "With closer filter")} onClick={onNavigateRevenue} isRevenue />
        <ActionButton label={t("Eigene Maßnahme erstellen", "Create custom action")} desc="" onClick={() => onAction("coaching", "", "")} isCustom />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DRILLDOWN: Operator Detail (from Overview tab)
// ═══════════════════════════════════════════════════════════════
function OperatorDetail({ m, flags, actions, lang, avgCloseRate, avgShowRate, onCreateAction, onResolveAction, onNavigateRevenue }: any) {
  const t = (de: string, en: string) => (lang === "de" ? de : en);
  const catStyle = CATEGORY_STYLE[categoryKey(m.talent_category)] || CATEGORY_STYLE.risk;
  const strategic = deriveStrategicStatus(m);
  const stratCfg = STRATEGIC_CONFIG[strategic.status];
  const insufficient = m.total_leads < 3 && m.total_shows < 2;
  const StratIcon = stratCfg.icon;

  const breakdown = [
    { label: "Close Rate", weight: 25, value: fmtPct(m.close_rate), raw: m.close_rate, benchmark: avgCloseRate },
    { label: "Show Rate", weight: 20, value: fmtPct(m.show_rate), raw: m.show_rate, benchmark: avgShowRate },
    { label: "Booking Rate", weight: 15, value: fmtPct(m.booking_rate), raw: m.booking_rate },
    { label: "Rev/Lead", weight: 15, value: fmtEur(m.revenue_per_lead), raw: Math.min(100, m.revenue_per_lead / 50 * 100) },
    { label: t("Konsistenz", "Consistency"), weight: 10, value: fmtPct(m.consistency_score), raw: m.consistency_score },
    { label: t("Aktivität", "Activity"), weight: 10, value: fmtPct(m.activity_score), raw: m.activity_score },
    { label: t("Hygiene", "Hygiene"), weight: 5, value: fmtPct(m.hygiene_score), raw: m.hygiene_score },
  ];

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-wider" style={{ color: T.muted }}>L{m.level_num} · {m.operator_role} · {m.tenure_days}d Tenure</div>
        <h2 className="text-[24px] font-light mt-1" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{m.full_name}</h2>
        <div className="flex items-center gap-3 mt-3">
          {insufficient ? <span className="text-[13px] px-3 py-1.5 rounded-lg" style={{ background: "#F4F3F0", color: T.muted }}>{t("Zu wenig Daten", "Insufficient data")}</span> : (
            <><span className="text-[42px] font-semibold tabular-nums leading-none" style={{ color: scoreColor(m.talent_score) }}>{fmt(m.talent_score)}</span>
            <span className="text-[13px] font-medium px-2.5 py-1 rounded-lg" style={{ background: catStyle.bg, color: catStyle.color }}>{catStyle.label[lang]}</span></>
          )}
        </div>
      </div>

      {!insufficient && <div className="rounded-2xl p-4" style={{ background: stratCfg.bg, border: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2 mb-1"><StratIcon className="h-4 w-4" style={{ color: stratCfg.color }} /><span className="text-[12px] font-medium uppercase tracking-wider" style={{ color: stratCfg.color }}>{stratCfg.label[lang]}</span></div>
        <div className="text-[12px]" style={{ color: T.secondary }}>{strategic.reason}</div>
      </div>}

      <div className="grid grid-cols-3 gap-2">
        {[{ l: "Leads", v: fmt(m.total_leads) }, { l: "Bookings", v: fmt(m.total_bookings) }, { l: "Shows", v: fmt(m.total_shows) }, { l: "No-Shows", v: fmt(Math.max(0, m.total_bookings - m.total_shows)), bad: m.total_bookings - m.total_shows > 2 }, { l: "Closes", v: fmt(m.total_closes) }, { l: "Revenue", v: fmtEur(m.total_revenue) }].map(s => (
          <div key={s.l} className="rounded-xl px-3 py-2.5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: T.muted }}>{s.l}</div>
            <div className="text-[14px] font-semibold tabular-nums mt-0.5" style={{ color: s.bad ? T.danger : T.ink }}>{s.v}</div>
          </div>
        ))}
      </div>

      {!insufficient && <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-[11px] uppercase tracking-wider mb-4" style={{ color: T.muted }}>{t("Score-Aufschlüsselung", "Score Breakdown")}</div>
        <div className="space-y-3">
          {breakdown.map(b => (
            <div key={b.label}>
              <div className="flex justify-between text-[12px] mb-1">
                <span style={{ color: T.secondary }}>{b.label} <span style={{ color: T.muted }}>({b.weight}%){b.benchmark !== undefined && ` · Ø ${fmtPct(b.benchmark)}`}</span></span>
                <span className="tabular-nums font-medium" style={{ color: T.ink }}>{b.value}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#EDE9E2" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, b.raw)}%`, background: b.raw >= 70 ? T.success : b.raw >= 40 ? T.gold : T.danger }} />
              </div>
            </div>
          ))}
        </div>
      </div>}

      {!insufficient && m.primary_bottleneck !== "No Major Issue" && <div className="rounded-2xl p-5" style={{ background: T.dangerLight, border: `1px solid #E8C9C4` }}>
        <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: T.muted }}>{t("Hauptengpass", "Main Bottleneck")}</div>
        <div className="text-[15px] font-medium" style={{ color: T.ink }}>{m.primary_bottleneck}</div>
        <div className="text-[11px] mt-1" style={{ color: T.muted }}>{t("Konfidenz", "Confidence")}: {fmtPct(m.bottleneck_confidence)}</div>
      </div>}

      <div className="space-y-2">
        <button onClick={onNavigateRevenue} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition hover:shadow-sm" style={{ background: T.goldLight, border: `1px solid ${T.gold}18` }}>
          <ExternalLink className="h-4 w-4" style={{ color: T.gold }} />
          <div className="flex-1"><div className="text-[13px] font-medium" style={{ color: T.ink }}>{t("Revenue Dashboard öffnen", "Open Revenue Dashboard")}</div></div>
        </button>
        <button onClick={onCreateAction} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium" style={{ border: `1px solid ${T.border}`, color: T.secondary }}>
          <Plus className="h-3.5 w-3.5" />{t("Maßnahme erstellen", "Create Action")}
        </button>
      </div>

      {actions.length > 0 && <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider" style={{ color: T.muted }}>{t("Maßnahmen", "Actions")}</div>
        {actions.map((a: TalentAction) => <div key={a.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div><div className="text-[13px] font-medium" style={{ color: T.ink }}>{a.title}</div><div className="text-[11px]" style={{ color: T.muted }}>{a.action_type}</div></div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-lg" style={{ background: T.goldLight, color: T.gold }}>{a.status}</span>
            {a.status === "pending" && <><button onClick={() => onResolveAction(a.id, "completed")} style={{ color: T.success }}><Check className="h-4 w-4" /></button><button onClick={() => onResolveAction(a.id, "dismissed")} style={{ color: T.muted }}><X className="h-4 w-4" /></button></>}
          </div>
        </div>)}
      </div>}

      {flags.length > 0 && <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider" style={{ color: T.muted }}>Flags</div>
        {flags.map((f: TalentFlag) => <div key={f.id} className="flex items-center gap-2 text-[12px] px-3 py-2 rounded-xl" style={{ background: f.flag_type === "red" ? T.dangerLight : T.successLight, color: f.flag_type === "red" ? T.danger : T.success }}>
          {f.flag_type === "red" ? "⚠" : "✦"} {f.title}
        </div>)}
      </div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared Sub-components
// ═══════════════════════════════════════════════════════════════
function KpiTile({ label, value, accent, icon }: { label: string; value: string; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl px-4 sm:px-5 py-3 sm:py-4" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      <div className="flex items-center gap-1.5"><span style={{ color: T.muted }}>{icon}</span><span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: T.muted }}>{label}</span></div>
      <div className="text-[20px] sm:text-[22px] font-semibold tabular-nums mt-1" style={{ color: accent ? T.gold : T.ink }}>{value}</div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-2xl p-10 text-center" style={{ background: T.card, border: `1px solid ${T.border}` }}>
      <div className="mx-auto mb-3" style={{ color: T.muted }}>{icon}</div>
      <div className="text-[14px]" style={{ color: T.muted }}>{text}</div>
    </div>
  );
}

function ActionButton({ label, desc, onClick, isCustom, isRevenue }: { label: string; desc: string; onClick: () => void; isCustom?: boolean; isRevenue?: boolean }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition hover:shadow-sm mb-2" style={{ background: isRevenue ? T.goldLight : isCustom ? T.card : T.orangeLight, border: `1px solid ${isRevenue ? T.gold : isCustom ? T.border : T.orange}18` }}>
      {isRevenue ? <ExternalLink className="h-4 w-4" style={{ color: T.gold }} /> : isCustom ? <Plus className="h-4 w-4" style={{ color: T.secondary }} /> : <GraduationCap className="h-4 w-4" style={{ color: T.orange }} />}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium" style={{ color: T.ink }}>{label}</div>
        {desc && <div className="text-[11px] truncate" style={{ color: T.muted }}>{desc}</div>}
      </div>
    </button>
  );
}
