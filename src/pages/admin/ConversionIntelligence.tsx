/**
 * Conversion Intelligence Layer
 * -----------------------------
 * Visual Cash Conversion Chain on top of existing Funnel Intelligence (L34).
 * Read-only. No new RPCs. Composes funnel_intelligence_view + leads/appointments/calls.
 *
 * Levels:
 *   L1 — Aggregated chain + bottleneck engine + heat segmentation
 *   L2 — Stage drilldown (KPIs + trend + breakdown)
 *   L3 — Segment filters (funnel · operator · channel · offer)
 *   L4 — Lead-level table + journey timeline drawer
 *
 * Block: Intelligence (primary) + Governance.
 * Canon-Map: extends I6 (Funnel Intelligence). No new canon — pure composition.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getCanonicalHeat, deriveLeadQuality, deriveAttendanceRisk, type CanonicalHeat } from "@/lib/canonical-decision-engine";
import { useAuth } from "@/hooks/useAuth";
import { getLevelForStage } from "@/lib/kpi-config";
import AccessDenied from "@/components/members/AccessDenied";
import { WhatsAppKpiPanel } from "@/components/leads/WhatsAppKpiPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  Flame,
  Snowflake,
  Sun,
  ChevronRight,
  Bell,
  Globe,
  MousePointerClick,
  ClipboardCheck,
  CalendarCheck,
  Phone,
  Headphones,
  Trophy,
  Coins,
  Target,
  Users,
  Zap,
  Filter,
  Activity,
  PercentCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  FileDown,
  Lock,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import {
  type FunnelIntelligencePayload,
  formatEur,
} from "@/lib/canonical-funnel-intelligence";
import { cn } from "@/lib/utils";
import { AutoFixEnginePanel } from "@/components/admin/AutoFixEnginePanel";
import type { AutoFixInputMetrics } from "@/lib/canonical-auto-fix";
import { Sparkline } from "@/components/admin/Sparkline";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SoundToggle } from "@/components/admin/SoundToggle";
import { playCue } from "@/lib/sound-design";
import "./conversion-intelligence-theme.css";
import { useOptionalPerformanceFilters } from "@/contexts/PerformanceFiltersContext";
import { CrossNavCta } from "@/components/performance/CrossNavCta";
import StageLeadsDrilldown from "@/components/performance/StageLeadsDrilldown";
import LeadDetailPanel from "@/components/performance/LeadDetailPanel";

// ---------- Stage model ----------

type StageKey =
  | "traffic"
  | "landing"
  | "engagement"
  | "booking"
  | "setter"
  | "showing"
  | "closer"
  | "offer"
  | "revenue";

interface StageDef {
  key: StageKey;
  label: string;
  problem: string; // human label if this stage is the bottleneck
}

const STAGES: StageDef[] = [
  { key: "traffic", label: "Traffic", problem: "Traffic quality issue" },
  { key: "landing", label: "Landing", problem: "Landing not converting" },
  { key: "engagement", label: "Engagement", problem: "Engagement / quiz drop-off" },
  { key: "booking", label: "Booking", problem: "Booking friction" },
  { key: "setter", label: "Setter", problem: "Setter not qualifying" },
  { key: "showing", label: "Showing", problem: "No-show problem" },
  { key: "closer", label: "Closer", problem: "Closer performance issue" },
  { key: "offer", label: "Offer", problem: "Offer mismatch" },
  { key: "revenue", label: "Revenue", problem: "Revenue compression" },
];

interface FunnelStepDef {
  num: number;
  stageKey: StageKey;
  title: string;
  desc: string;
  color: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}
const FUNNEL_STEPS: FunnelStepDef[] = [
  { num: 1, stageKey: "landing",    title: "Landing Page",  desc: "Creative · Hook",       color: "#60a5fa", icon: Globe,             detail: "Avg Scroll · Bounce Rate" },
  { num: 2, stageKey: "engagement", title: "Engagement",    desc: "Quiz · Email Capture",  color: "#22d3ee", icon: MousePointerClick, detail: "Quiz Completion · Email" },
  { num: 3, stageKey: "booking",    title: "Application",   desc: "Booking · Slot",        color: "#2dd4bf", icon: CalendarCheck,     detail: "Booking · Slot Selection" },
  { num: 4, stageKey: "setter",     title: "Setter Call",   desc: "Qualification",              color: "#fbbf24", icon: ClipboardCheck,    detail: "Qualification Split" },
  { num: 5, stageKey: "closer",     title: "Closer Call",   desc: "Offer · Negotiation",   color: "#fb923c", icon: Headphones,        detail: "Close Rate · Deal Value" },
  { num: 6, stageKey: "revenue",    title: "Closed",        desc: "Payment · Won",         color: "#a78bfa", icon: Trophy,            detail: "Revenue · Payment Status" },
];

interface StageMetric {
  key: StageKey;
  label: string;
  problem: string;
  volume: number;
  /** conversion to NEXT stage (0..100) — null on terminal */
  conversionToNext: number | null;
  /** drop-off TO next (0..100) */
  dropToNext: number | null;
  /** trend vs prior period (-100..+100) */
  trendPct: number | null;
  weakness: "good" | "medium" | "weak";
}

// ---------- Heat segmentation (canonical) ----------

type Heat = CanonicalHeat;
/** Delegates to canonical engine — no inline thresholds. */
function bucketHeat(_score: number | null | undefined, _hasBooking: boolean, lead?: Record<string, any>): Heat {
  const synthetic = lead ?? { qualification_score: _score, total_calls_booked: _hasBooking ? 1 : 0 };
  return getCanonicalHeat(synthetic);
}

// ---------- Lead drilldown row ----------

interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  source: string | null;
  funnel_id: string | null;
  lead_score: number | null;
  stage: string;
  has_booking: boolean;
  setter_id: string | null;
  closer_id: string | null;
  setter_call_outcome: string | null;
  outcome: string | null;
  deal_value: number | null;
  created_at: string;
  appointment_date: string | null;
  no_show_flag: boolean;
  total_calls_attended: number;
  total_calls_booked: number;
  payment_status: string;
  heat: Heat;
}

// ---------- Source Mapping ----------
const SOURCE_MAP: Record<string, string> = {
  // Core funnels
  funnel_apply: "Apply", funnel: "Apply", "funnel_apply-test": "Apply (Test)",
  apply_direct: "Apply",
  qualify_filter: "Qualify",
  high_income_angle: "High-Income Skill",
  // Quiz & Fastlane
  quiz: "Quiz",
  fastlane: "Fastlane", fast_track: "Fastlane",
  // Organic / Direct
  website: "Organic", organic: "Organic", direct: "Organic",
  root: "Root",
  // Paid / Referral
  referral: "Referral",
  instagram: "Instagram",
  cold_outreach: "Cold Outreach",
  webinar: "Webinar",
  // Simulation (will be filtered, but map anyway)
  "go_live_simulation:meta": "Simulation",
};
// Canonical funnel order for dropdown
const CANONICAL_FUNNELS = [
  "Apply", "Apply (Test)", "Qualify", "High-Income Skill", "Root",
  "Fastlane", "Quiz", "Organic", "Referral", "Instagram",
  "Cold Outreach", "Webinar", "Simulation", "Unknown",
];
const REVERSE_SOURCE_MAP: Record<string, string[]> = {};
Object.entries(SOURCE_MAP).forEach(([raw, label]) => {
  if (!REVERSE_SOURCE_MAP[label]) REVERSE_SOURCE_MAP[label] = [];
  REVERSE_SOURCE_MAP[label].push(raw);
});
function mapSource(raw: string | null): string {
  if (!raw) return "Unknown";
  return SOURCE_MAP[raw] ?? raw;
}
/** Check if a lead is test/simulation data */
function isTestLead(l: { name?: string; is_simulation?: boolean; source?: string | null }): boolean {
  if (l.is_simulation) return true;
  if (l.source === "go_live_simulation:meta") return true;
  const n = (l.name ?? "").toLowerCase().trim();
  if (n === "test" || n.startsWith("test_") || n.startsWith("test-") || n.startsWith("test ") || n.includes("test test") || n.includes("kein lead")) return true;
  // Source-based test detection
  const s = (l.source ?? "").toLowerCase();
  if (s.includes("-test") || s.includes("_test") || s === "test") return true;
  return false;
}

// ---------- Component ----------

const WINDOWS = [1, 7, 30, 90] as const;

type ScopeMode = "my" | "team";

export default function ConversionIntelligence() {
  const { profile, isAdmin, isOwner } = useAuth();
  const stage = (profile as any)?.business_stage ?? "opener";
  const effectiveLevel = (isAdmin || isOwner) ? 8 : getLevelForStage(stage);
  const [searchParams, setSearchParams] = useSearchParams();

  // --- URL-synced state helpers ---
  const qp = useCallback((key: string, fallback: string) => searchParams.get(key) ?? fallback, [searchParams]);
  const setQp = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === "" || v === "all" || v === "__default") next.delete(k);
        else next.set(k, v);
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const windowDays = Number(qp("days", "30")) || 30;
  const setWindowDays = (d: number) => setQp({ days: d === 30 ? null : String(d), dpage: null });

  const [payload, setPayload] = useState<FunnelIntelligencePayload | null>(null);
  // Server-side KPIs from performance_revenue_kpis RPC — single source of truth
  const [serverKpis, setServerKpis] = useState<Record<string, number> | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [appointments, setAppointments] = useState<
    Array<{ lead_id: string; appointment_status: string; attendance_flag: boolean | null; outcome: string | null; starts_at: string; setter_id: string | null; closer_id: string | null; assigned_operator_id: string | null }>
  >([]);
  const [calls, setCalls] = useState<
    Array<{ id: string; created_at: string; result: string | null; objection_type: string | null; revenue: number | null; deal_size: number | null; user_id: string | null; lead_id: string | null }>
  >();

  // Build lead_id → confirmed revenue map from calls (source of truth)
  const confirmedRevByLead = useMemo(() => {
    const map: Record<string, number> = {};
    (calls ?? []).filter(c => c.result === 'closed_won' && c.lead_id).forEach(c => {
      map[c.lead_id!] = (map[c.lead_id!] || 0) + (Number(c.revenue) || 0);
    });
    return map;
  }, [calls]);

  const [selectedStage, setSelectedStage] = useState<StageKey | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);

  // KPI drilldown — URL-synced
  const kpiDrilldown = qp("drilldown", "") || null;
  const setKpiDrilldown = (v: string | null) => setQp({ drilldown: v, dpage: null, dpsize: null });

  // Filters (Level 3) — URL-synced (reset dpage on every filter change)
  const funnelFilter = qp("funnel", "all");
  const setFunnelFilter = (v: string) => setQp({ funnel: v === "all" ? null : v, dpage: null });
  const sourceFilter = qp("source", "all");
  const setSourceFilter = (v: string) => setQp({ source: v === "all" ? null : v, dpage: null });
  const heatFilter = (qp("heat", "all") as "all" | Heat);
  const setHeatFilter = (v: "all" | Heat) => setQp({ heat: v === "all" ? null : v, dpage: null });
  const search = qp("q", "");
  const setSearch = (v: string) => setQp({ q: v || null, dpage: null });
  const showSim = qp("sim", "0") === "1";
  const setShowSim = (v: boolean) => setQp({ sim: v ? "1" : null, dpage: null });

  // Team scope — URL-synced
  const scope = (qp("scope", "team") as ScopeMode);
  const setScope = (v: ScopeMode) => setQp({ scope: v === "team" ? null : v, dpage: null });
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [userLevel, setUserLevel] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);
  // Global name cache: uuid → display name
  const [nameCache, setNameCache] = useState<Record<string, string>>({});
  // Shell filters integration
  const shellFilters = useOptionalPerformanceFilters();
  const nested = !!shellFilters;

  // Sync shell filters
  useEffect(() => {
    if (!shellFilters) return;
    const sf = shellFilters.filters;
    const updates: Record<string, string | null> = {};
    // Map shell range to internal days param
    if (sf.range) {
      const days = sf.range === "24h" ? 1 : sf.range === "7d" ? 7 : sf.range === "90d" ? 90 : 30;
      updates.days = days === 30 ? null : String(days);
    }
    // Map shell funnel filter
    if (sf.funnel && sf.funnel !== "__all") {
      updates.funnel = sf.funnel;
    } else {
      updates.funnel = null; // remove = "all"
    }
    updates.dpage = null; // reset pagination
    setQp(updates);
  }, [shellFilters?.filters?.range, shellFilters?.filters?.funnel, setQp]);

  // Load team members
  useEffect(() => {
    (async () => {
      const uid = profile?.id;
      if (!uid) return;
      setUserId(uid);
      setUserLevel(effectiveLevel);

      if (effectiveLevel >= 6) {
        const res = await supabase.rpc("get_team_member_ids" as never, { p_user_id: uid } as never) as { data: any[]; error: any };
        if (!res.error && res.data) {
          setTeamMemberIds(res.data.map((m: any) => m.member_id));
        }
      }
      if (effectiveLevel < 6) setScope("my");
    })();
  }, [profile?.id, effectiveLevel]);

  // Derived filter values for RPC calls
  const activeOperator = (shellFilters?.filters?.operator && shellFilters.filters.operator !== "__all")
    ? shellFilters.filters.operator : null;
  const shellLevel = shellFilters?.filters?.level && shellFilters.filters.level !== "__all"
    ? shellFilters.filters.level : null;
  // Map role-based shell level values to numeric level for RPC, or null if not mappable
  const levelNum = useMemo(() => {
    if (!shellLevel) return null;
    // Role-group values from PerformanceShell
    const ROLE_MAP: Record<string, number | null> = {
      setter: 2, closer: 4, senior_closer: 6, director: 7,
    };
    if (shellLevel in ROLE_MAP) return ROLE_MAP[shellLevel];
    const parsed = parseInt(shellLevel.replace("L", ""), 10);
    return isNaN(parsed) ? null : parsed;
  }, [shellLevel]);

  async function load() {
    setLoading(true);
    try {
      const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

      // Server-side KPIs — single source of truth for all stage counts
      const kpiArgs: Record<string, any> = { p_days: windowDays };
      if (activeOperator) kpiArgs.p_operator_id = activeOperator;
      if (levelNum !== null && !isNaN(levelNum)) kpiArgs.p_level_filter = levelNum;
      if (funnelFilter !== "all") kpiArgs.p_funnel = funnelFilter;
      if (sourceFilter !== "all") kpiArgs.p_source = sourceFilter;

      const [{ data: kpiData, error: kpiErr }, { data: fp, error: fpErr }, leadsRes, apptRes, callsRes] = await Promise.all([
        supabase.rpc("performance_revenue_kpis" as any, kpiArgs),
        supabase.rpc("funnel_intelligence_view", {
          p_window_days: windowDays,
          p_operator_id: activeOperator,
        }),
        // Leads fetch for heat segmentation, KPI strip details, lead table — NOT for KPI counts
        supabase
          .from("leads")
           .select(
             "id,name,email,source,funnel_id,lead_score,stage,has_booking,setter_id,closer_id,setter_call_outcome,outcome,deal_value,created_at,appointment_date,no_show_flag,total_calls_attended,total_calls_booked,payment_status,owner_id,is_simulation",
           )
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("appointments")
          .select("lead_id,appointment_status,attendance_flag,outcome,starts_at,setter_id,closer_id,assigned_operator_id")
          .gte("starts_at", since)
          .limit(1000),
        supabase
          .from("calls")
          .select("id,created_at,result,objection_type,revenue,deal_size,user_id,lead_id")
          .gte("created_at", since)
          .limit(1000),
      ]);

      if (kpiErr) {
        console.error("[ConversionIntelligence] performance_revenue_kpis error (non-fatal):", kpiErr);
        setServerKpis(null);
      }
      if (fpErr) console.warn("[ConversionIntelligence] funnel_intelligence_view error (non-fatal):", fpErr);

      if (!kpiErr) setServerKpis(kpiData as unknown as Record<string, number>);
      setPayload(fp as unknown as FunnelIntelligencePayload);
      setLeads(
        ((leadsRes.data ?? []) as any[])
          .filter((l) => !isTestLead(l))
          .map((l) => ({
            ...l,
            heat: bucketHeat(l.lead_score, !!l.has_booking),
            mappedSource: mapSource(l.source),
          })),
      );
      setAppointments((apptRes.data ?? []) as any[]);
      setCalls((callsRes.data ?? []) as any[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAggregates() {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("funnel-intelligence-refresh", {
        body: { days: windowDays },
      });
      if (error) throw error;
      toast.success("Aggregates refreshed");
      playCue("success");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
      playCue("error");
    } finally {
      setRefreshing(false);
    }
  }

  const [exporting, setExporting] = useState<string | null>(null);
  const [leadExportDialog, setLeadExportDialog] = useState(false);
  const [leadExportPassword, setLeadExportPassword] = useState("");
  const [leadExportReason, setLeadExportReason] = useState("");

  async function handleExport(exportType: "lead" | "appointment", opts?: { password?: string; reason?: string }) {
    if (exportType === "lead") {
      // Lead export is NEVER allowed in normal flow — containment policy
      toast.error("Lead-Daten bleiben aus Sicherheits- und Qualitätsgründen innerhalb der Plattform.");
      return;
    }
    setExporting(exportType);
    try {
      const { data, error } = await supabase.functions.invoke("secure-export", {
        body: { export_type: exportType },
      });
      if (error) throw error;
      const text = typeof data === "string" ? data : await (data as Blob).text?.() ?? JSON.stringify(data);
      if (text.startsWith("{") && JSON.parse(text)?.error) {
        throw new Error(JSON.parse(text).error);
      }
      const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `appointment_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Termin-Export erfolgreich.");
      playCue("success");
    } catch (e: any) {
      toast.error(e.message || "Export fehlgeschlagen.");
      playCue("error");
    } finally {
      setExporting(null);
    }
  }

  // Hidden admin lead export — requires re-auth + reason
  async function handleAdminLeadExport() {
    if (!leadExportPassword || leadExportReason.trim().length < 10) {
      toast.error("Passwort und Begründung (min. 10 Zeichen) erforderlich.");
      return;
    }
    setExporting("lead");
    try {
      const { data, error } = await supabase.functions.invoke("secure-export", {
        body: {
          export_type: "lead",
          password: leadExportPassword,
          reason: leadExportReason.trim(),
        },
      });
      if (error) throw error;
      const text = typeof data === "string" ? data : await (data as Blob).text?.() ?? JSON.stringify(data);
      if (text.startsWith("{") && JSON.parse(text)?.error) {
        throw new Error(JSON.parse(text).error);
      }
      const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Lead-Export erfolgreich. Vorgang wurde protokolliert.");
      playCue("success");
      setLeadExportDialog(false);
      setLeadExportPassword("");
      setLeadExportReason("");
    } catch (e: any) {
      toast.error(e.message || "Export fehlgeschlagen.");
      playCue("error");
    } finally {
      setExporting(null);
    }
  }

  // activeOperator and shellLevel defined above load()

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays, activeOperator, levelNum, funnelFilter, sourceFilter]);

  // Resolve setter/closer IDs to names
  useEffect(() => {
    const ids = new Set<string>();
    leads.forEach((l) => {
      if (l.setter_id && !nameCache[l.setter_id]) ids.add(l.setter_id);
      if (l.closer_id && !nameCache[l.closer_id]) ids.add(l.closer_id);
    });
    if (ids.size === 0) return;
    const arr = [...ids].slice(0, 100);
    supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", arr)
      .then(({ data }) => {
        if (!data) return;
        const m: Record<string, string> = {};
        (data as any[]).forEach((p) => { m[p.id] = p.full_name || "Teammitglied"; });
        // Fill missing with fallback
        arr.forEach((id) => { if (!m[id]) m[id] = "Teammitglied"; });
        setNameCache((prev) => ({ ...prev, ...m }));
      });
  }, [leads]);

  // Hidden admin lead export shortcut: Ctrl+Shift+E (not visible in UI)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "E" && userLevel >= 8) {
        e.preventDefault();
        setLeadExportDialog(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [userLevel]);

  // ---------- Team-scoped leads ----------
  const scopedLeads = useMemo(() => {
    if (scope === "my" && userId) {
      return leads.filter((l: any) => l.owner_id === userId || l.setter_id === userId || l.closer_id === userId);
    }
    if (scope === "team" && userLevel >= 4 && userLevel < 8 && teamMemberIds.length > 0) {
      const ids = new Set([userId!, ...teamMemberIds]);
      return leads.filter((l: any) => ids.has(l.owner_id) || ids.has(l.setter_id) || ids.has(l.closer_id));
    }
    return leads; // L8+ or admin sees all
  }, [leads, scope, userId, userLevel, teamMemberIds]);

  // ---------- Derive stage metrics ----------
  // shellLevel defined above load()

  const filteredLeads = useMemo(() => {
    return scopedLeads.filter((l) => {
      // Simulation filter
      if (!showSim && (l as any).is_simulation) return false;
      // Funnel filter — match mapped source label
      if (funnelFilter !== "all") {
        const mapped = mapSource(l.source);
        if (mapped !== funnelFilter) return false;
      }
      if (sourceFilter !== "all" && (l.source ?? "unknown") !== sourceFilter) return false;
      if (heatFilter !== "all" && l.heat !== heatFilter) return false;
      // Shell operator filter
      if (shellFilters?.filters.operator && shellFilters.filters.operator !== "__all") {
        const opId = shellFilters.filters.operator;
        if ((l as any).owner_id !== opId && l.setter_id !== opId && l.closer_id !== opId) return false;
      }
      // Shell level/role filter — role-group or numeric L-value
      if (shellLevel) {
        const ROLE_GROUPS: Record<string, "setter" | "closer" | "senior" | "director"> = {
          setter: "setter", closer: "closer", senior_closer: "senior", director: "director",
        };
        const group = ROLE_GROUPS[shellLevel];
        if (group === "setter") {
          if (!l.setter_id) return false;
        } else if (group === "closer") {
          if (!l.closer_id && !l.outcome) return false;
        } else if (!group) {
          // Numeric L-value fallback
          const lvl = parseInt(shellLevel.replace("L", ""), 10);
          if (!isNaN(lvl)) {
            if (lvl <= 3 && !l.setter_id) return false;
            else if (lvl <= 7 && !l.closer_id && !l.outcome) return false;
          }
        }
        // senior_closer / director / L8+ → no client-side filter
      }
      if (search) {
        const s = search.toLowerCase();
        if (
          !l.name?.toLowerCase().includes(s) &&
          !l.email?.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [scopedLeads, funnelFilter, sourceFilter, heatFilter, search, showSim, shellFilters?.filters?.operator, shellLevel]);

  const stageMetrics: StageMetric[] = useMemo(() => {
    // Server KPIs = single source of truth for all stage counts
    const sk = serverKpis ?? {};
    const traffic   = Number(sk.traffic ?? 0);
    const engagement = Number(sk.engagement ?? 0);
    const booking   = Number(sk.booking ?? 0);
    const setter    = Number(sk.setter ?? 0);
    const showing   = Number(sk.showing ?? 0);
    const closer    = Number(sk.closer ?? 0);
    const offer     = Number(sk.offer ?? 0);
    const revenueLeads = Number(sk.revenue ?? 0);

    const volumes: Record<StageKey, number> = {
      traffic,
      landing: traffic, // landing = all leads that reached the page = traffic
      engagement,
      booking,
      setter,
      showing,
      closer: Math.max(closer, showing),
      offer: Math.max(offer, revenueLeads),
      revenue: revenueLeads,
    };

    // Daily trend split (first half vs second half)
    const daily = payload?.daily ?? [];
    const half = Math.floor(daily.length / 2);
    const sumKey = (arr: typeof daily, k: keyof (typeof daily)[number]) =>
      arr.reduce((s, d) => s + (Number(d[k] as any) || 0), 0);
    const prior = daily.slice(0, half);
    const recent = daily.slice(half);
    const trendFor = (k: keyof (typeof daily)[number]) => {
      const a = sumKey(prior, k);
      const b = sumKey(recent, k);
      if (!a) return null;
      return ((b - a) / a) * 100;
    };
    const trendMap: Partial<Record<StageKey, number | null>> = {
      traffic: trendFor("leads"),
      landing: trendFor("leads"),
      engagement: trendFor("leads"),
      booking: trendFor("bookings"),
      setter: trendFor("bookings"),
      showing: trendFor("shows"),
      closer: trendFor("shows"),
      offer: trendFor("closes"),
      revenue: trendFor("revenue_cents"),
    };

    const out: StageMetric[] = STAGES.map((s, i) => {
      const next = STAGES[i + 1];
      const v = volumes[s.key];
      const nv = next ? volumes[next.key] : null;
      const conv = nv !== null && v > 0 ? (nv / v) * 100 : null;
      const drop = conv !== null ? 100 - conv : null;
      return {
        key: s.key,
        label: s.label,
        problem: s.problem,
        volume: v,
        conversionToNext: conv,
        dropToNext: drop,
        trendPct: trendMap[s.key] ?? null,
        weakness: "good", // set after we know the worst drop
      };
    });

    // Mark weakness: worst drop = weak, second worst = medium
    const dropRanked = out
      .map((m, idx) => ({ idx, drop: m.dropToNext ?? -1 }))
      .filter((x) => x.drop > 0)
      .sort((a, b) => b.drop - a.drop);
    if (dropRanked[0]) out[dropRanked[0].idx].weakness = "weak";
    if (dropRanked[1] && dropRanked[1].drop > 30) out[dropRanked[1].idx].weakness = "medium";

    return out;
  }, [payload, serverKpis]);

  // Bottleneck = stage with weakness 'weak'
  const bottleneck = useMemo(() => {
    const weak = stageMetrics.find((m) => m.weakness === "weak");
    if (!weak) return null;
    const idx = STAGES.findIndex((s) => s.key === weak.key);
    const next = STAGES[idx + 1];
    return {
      from: weak.label,
      to: next?.label ?? "—",
      label: weak.problem,
      drop: weak.dropToNext ?? 0,
    };
  }, [stageMetrics]);

  // One-shot sound cue when a NEW bottleneck appears (no spam on re-renders)
  const [lastBottleneckKey, setLastBottleneckKey] = useState<string | null>(null);
  useEffect(() => {
    const key = bottleneck ? `${bottleneck.from}>${bottleneck.to}` : null;
    if (key && key !== lastBottleneckKey) {
      playCue("bottleneck");
    }
    setLastBottleneckKey(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottleneck]);

  // Map stage conversions → Auto-Fix Engine input metrics
  const autoFixMetrics: AutoFixInputMetrics = useMemo(() => {
    const get = (key: StageKey) =>
      stageMetrics.find((m) => m.key === key)?.conversionToNext ?? null;
    return {
      funnelKey: funnelFilter === "all" ? null : funnelFilter,
      scopeLabel: funnelFilter === "all" ? "All funnels" : funnelFilter,
      lead_to_engagement_pct: get("traffic"),
      landing_to_quiz_pct: get("landing"),
      quiz_completion_pct: get("engagement"),
      lead_to_booking_pct: get("booking"),
      setter_qualified_pct: get("setter"),
      show_rate_pct: get("showing"),
      close_rate_pct: get("closer"),
      offer_acceptance_pct: get("offer"),
    };
  }, [stageMetrics, funnelFilter]);

  // Heat distribution
  const heatDistribution = useMemo(() => {
    const total = filteredLeads.length || 1;
    const cold = filteredLeads.filter((l) => l.heat === "cold").length;
    const warm = filteredLeads.filter((l) => l.heat === "warm").length;
    const hot = filteredLeads.filter((l) => l.heat === "hot").length;
    return {
      cold: { n: cold, pct: (cold / total) * 100 },
      warm: { n: warm, pct: (warm / total) * 100 },
      hot: { n: hot, pct: (hot / total) * 100 },
    };
  }, [filteredLeads]);

  // ---------- Full KPI strip (§2) — canonical server truth from performance_revenue_kpis RPC ----------
  const kpiStrip = useMemo(() => {
    const sk = serverKpis ?? {};
    const total = Number(sk.traffic ?? 0);
    const booked = Number(sk.booking ?? 0);
    const shows = Number(sk.showing ?? 0);
    const closed = Number(sk.revenue ?? 0); // revenue = closed_won count
    const revenueCents = Number(sk.revenue_total ?? 0) * 100; // RPC returns euros, convert to cents

    const bookingRate = Number(sk.booking_rate ?? 0);
    const showRate = Number(sk.show_rate ?? 0);
    const closeRate = Number(sk.close_rate ?? 0);

    // No-shows: booked minus shows (server canonical)
    const noShows = Math.max(0, booked - shows);
    const noShowRate = booked > 0 ? (noShows / booked) * 100 : 0;
    const noClosed = Math.max(0, shows - closed);

    const revenuePerLead = total > 0 ? revenueCents / total : 0;
    const revenuePerShow = shows > 0 ? revenueCents / shows : 0;
    const revenuePerCall = booked > 0 ? revenueCents / booked : 0;

    return {
      total, booked, shows, noShows, closed, noClosed,
      bookingRate, showRate, noShowRate, closeRate,
      revenueCents, revenuePerLead, revenuePerShow, revenuePerCall,
      overallConv: total > 0 ? (closed / total) * 100 : 0,
    };
  }, [serverKpis]);

  // ---------- Channel performance (§6) — canonical server truth ----------
  const channelRows = useMemo(() => {
    // Primary: use server source_distribution from RPC
    const serverDist = (serverKpis as any)?.source_distribution;
    if (Array.isArray(serverDist) && serverDist.length > 0) {
      return serverDist.map((sd: any) => ({
        source: mapSource(sd.source),
        visitors: Number(sd.lead_count ?? 0),
        bookings: Number(sd.booked ?? 0),
        customers: Number(sd.closed ?? 0),
        revenue: 0, // Revenue per source not tracked at RPC level yet
        conversion_pct: Number(sd.close_rate ?? 0),
      }))
      // Merge duplicate mapped sources (e.g. "funnel" and "funnel_apply" both → "Apply")
      .reduce((acc: any[], row: any) => {
        const existing = acc.find((r: any) => r.source === row.source);
        if (existing) {
          existing.visitors += row.visitors;
          existing.bookings += row.bookings;
          existing.customers += row.customers;
          existing.conversion_pct = existing.visitors > 0 ? (existing.customers / existing.visitors) * 100 : 0;
        } else {
          acc.push({ ...row });
        }
        return acc;
      }, [])
      .sort((a: any, b: any) => b.visitors - a.visitors);
    }
    // Fallback: compute from filtered leads (client-side) if RPC didn't return source_distribution
    const map = new Map<
      string,
      { visitors: number; bookings: number; customers: number; revenue: number }
    >();
    filteredLeads.forEach((l) => {
      const key = mapSource(l.source);
      const row = map.get(key) ?? { visitors: 0, bookings: 0, customers: 0, revenue: 0 };
      row.visitors += 1;
      if (l.has_booking) row.bookings += 1;
      if (l.outcome === "won" || l.payment_status === "paid") {
        row.customers += 1;
        row.revenue += (confirmedRevByLead[l.id] ?? 0) * 100;
      }
      map.set(key, row);
    });
    return [...map.entries()]
      .map(([source, r]) => ({
        source,
        ...r,
        conversion_pct: r.visitors ? (r.customers / r.visitors) * 100 : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors);
  }, [serverKpis, filteredLeads]);

  // ---------- Alert engine (§13) ----------
  const alerts = useMemo(() => {
    const out: Array<{ tone: "critical" | "warning"; label: string; detail: string }> = [];
    stageMetrics.forEach((m) => {
      if (m.trendPct !== null && m.trendPct <= -25) {
        out.push({
          tone: "critical",
          label: `${m.label} dropped ${Math.abs(m.trendPct).toFixed(0)}%`,
          detail: `Sudden decline vs prior period`,
        });
      } else if (m.trendPct !== null && m.trendPct <= -15) {
        out.push({
          tone: "warning",
          label: `${m.label} down ${Math.abs(m.trendPct).toFixed(0)}%`,
          detail: `Trending below baseline`,
        });
      }
    });
    // No-show spike
    const totalAppts = appointments.length;
    const noShows = appointments.filter(
      (a) => a.appointment_status === "no_show" || a.attendance_flag === false,
    ).length;
    const nsRate = totalAppts ? (noShows / totalAppts) * 100 : 0;
    if (totalAppts >= 10 && nsRate >= 50) {
      out.push({
        tone: "critical",
        label: `No-show rate ${nsRate.toFixed(0)}%`,
        detail: `${noShows}/${totalAppts} appointments — review reminders`,
      });
    }
    return out.slice(0, 4);
  }, [stageMetrics, appointments]);

  const funnels = useMemo(() => {
    // ALWAYS show all canonical funnels — even with 0 data
    const dataFunnels = new Set(leads.map((l) => mapSource(l.source)).filter(Boolean));
    const ordered = [...CANONICAL_FUNNELS];
    // Add any extra funnels from data not in canonical list
    dataFunnels.forEach((f) => { if (!ordered.includes(f)) ordered.push(f); });
    return ordered;
  }, [leads]);
  const sources = useMemo(
    () => Array.from(new Set(leads.map((l) => l.source ?? "unknown"))),
    [leads],
  );

  // ---------- Per-stage sparkline series from payload.daily ----------
  const sparkSeries = useMemo(() => {
    const daily = payload?.daily ?? [];
    const seriesFor = (k: string): number[] =>
      daily.map((d: any) => Number(d[k]) || 0);
    return {
      traffic: seriesFor("leads"),
      landing: seriesFor("leads"),
      engagement: seriesFor("leads"),
      booking: seriesFor("bookings"),
      setter: seriesFor("bookings"),
      showing: seriesFor("shows"),
      closer: seriesFor("shows"),
      offer: seriesFor("closes"),
      revenue: seriesFor("revenue_cents"),
    } as Record<StageKey, number[]>;
  }, [payload]);

  // ---------- Traffic Sources (left of funnel row) ----------
  // Compact ranked list with horizontal % bars. Re-uses channelRows volumes.
  const trafficSources = useMemo(() => {
    const total = channelRows.reduce((s, r) => s + r.visitors, 0) || 1;
    const palette = ["#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb923c"];
    return channelRows
      .slice(0, 6)
      .map((r, i) => ({
        source: r.source,
        visitors: r.visitors,
        pct: (r.visitors / total) * 100,
        color: palette[i % palette.length],
      }));
  }, [channelRows]);

  // ---------- Result panel (right of funnel row) — from filtered leads ----------
  const resultPanel = useMemo(() => {
    const revenueCents = kpiStrip.revenueCents;
    const revenuePerLeadCents = kpiStrip.revenuePerLead;
    const roas = null; // No spend data available
    return { revenueCents, revenuePerLeadCents, roas };
  }, [kpiStrip]);

  // ---------- KPI strip trend (vs prior half of window) ----------
  const kpiTrends = useMemo(() => {
    const daily = payload?.daily ?? [];
    if (daily.length < 2) return {} as Record<string, number | null>;
    const half = Math.floor(daily.length / 2);
    const sumK = (arr: any[], k: string) =>
      arr.reduce((s, d) => s + (Number(d[k]) || 0), 0);
    const prior = daily.slice(0, half);
    const recent = daily.slice(half);
    const t = (k: string) => {
      const a = sumK(prior, k);
      const b = sumK(recent, k);
      if (!a) return null;
      return ((b - a) / a) * 100;
    };
    return {
      visitors: t("leads"),
      engagement: t("leads"),
      booking: t("bookings"),
      qualification: t("bookings"),
      show: t("shows"),
      close: t("closes"),
      overall: t("closes"),
      revenue: t("revenue_cents"),
    } as Record<string, number | null>;
  }, [payload]);

  // shellFilters and nested already declared above

  // Access guard — consistent with Talent Flow and Intelligence Control (L6+)
  if (effectiveLevel < 6) return <AccessDenied />;

  return (
    <div data-ci-theme="exec-dark" className={nested ? "" : "min-h-screen"}>
      <div className="container mx-auto py-8 max-w-7xl space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="ci-page-title">Revenue Flow Map™</h1>
          <p className="ci-page-sub">
            {scope === "my" ? "Meine Performance" : userLevel >= 8 ? "Plattform" : userLevel >= 7 ? "Director Area" : "Team Performance"}
            {" · "}{filteredLeads.length} Leads · {windowDays === 1 ? "24h" : `${windowDays}d`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scope switch */}
          {userLevel >= 4 && (
            <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
              <Button
                size="sm"
                variant={scope === "my" ? "default" : "ghost"}
                onClick={() => setScope("my")}
                className="h-7 text-xs px-3"
              >
                Meine
              </Button>
              <Button
                size="sm"
                variant={scope === "team" ? "default" : "ghost"}
                onClick={() => setScope("team")}
                className="h-7 text-xs px-3"
              >
                {userLevel >= 8 ? "Plattform" : userLevel >= 7 ? "Director" : "Team"}
              </Button>
            </div>
          )}
          {nested && (
            <>
              <CrossNavCta variant="to_talent" />
              <CrossNavCta variant="to_intelligence" />
              <span className="mx-1 h-5 w-px bg-white/10" />
            </>
          )}
          {!nested && WINDOWS.map((w) => (
            <Button
              key={w}
              variant={windowDays === w ? "default" : "outline"}
              size="sm"
              onClick={() => setWindowDays(w)}
            >
              {w === 1 ? "24h" : `${w}d`}
            </Button>
          ))}
          <Button onClick={refreshAggregates} disabled={refreshing} size="sm" variant="outline">
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
          <SoundToggle />
          {/* Export: Only appointment export visible */}
          <span className="mx-1 h-5 w-px bg-white/10" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleExport("appointment")}
                  disabled={!!exporting}
                >
                  {exporting === "appointment" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                  Termine
                </Button>
              </TooltipTrigger>
              <TooltipContent>Termine als CSV exportieren{userLevel < 8 ? " (Kontaktdaten maskiert)" : ""}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {userLevel < 5 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="ghost" disabled className="opacity-40 cursor-not-allowed text-[10px]">
                      <Lock className="h-3 w-3 mr-1" />
                      Lead-Daten geschützt
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Ab L5 (Managing Closer) erhältst du vollen Zugriff auf Lead-Daten deiner Unit.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Active filter badges */}
      {(funnelFilter !== "all" || sourceFilter !== "all" || heatFilter !== "all" || search || showSim) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Active:</span>
          {funnelFilter !== "all" && (
            <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer" onClick={() => setFunnelFilter("all")}>
              Funnel: {funnelFilter} ✕
            </Badge>
          )}
          {sourceFilter !== "all" && (
            <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer" onClick={() => setSourceFilter("all")}>
              Source: {sourceFilter} ✕
            </Badge>
          )}
          {heatFilter !== "all" && (
            <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer" onClick={() => setHeatFilter("all")}>
              Heat: {heatFilter} ✕
            </Badge>
          )}
          {search && (
            <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer" onClick={() => setSearch("")}>
              Suche: {search} ✕
            </Badge>
          )}
          {showSim && (
            <Badge variant="outline" className="text-[10px] gap-1 cursor-pointer border-amber-400/50 bg-amber-400/10 text-amber-600" onClick={() => setShowSim(false)}>
              SIM sichtbar ✕
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px]" onClick={() => {
            setFunnelFilter("all"); setSourceFilter("all"); setHeatFilter("all"); setSearch(""); setShowSim(false);
          }}>
            Alle Filter zurücksetzen
          </Button>
        </div>
      )}

      {/* Simulation toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowSim(!showSim)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium transition-colors",
            showSim
              ? "border-amber-400/50 bg-amber-400/15 text-amber-600"
              : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
          )}
        >
          <FlaskConical className="h-3 w-3" />
          {showSim ? "SIM ein" : "SIM aus"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="text-sm font-medium">Keine Daten für diesen Zeitraum gefunden.</div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Zeitraum: {windowDays} Tage · Scope: {scope === "my" ? "Eigene" : "Team"}</p>
              <p>User-Level: L{userLevel} · Teammitglieder: {teamMemberIds.length}</p>
              <p>Funnel-Filter: {funnelFilter === "all" ? "Alle" : funnelFilter} · Source: {sourceFilter === "all" ? "Alle" : sourceFilter} · Heat: {heatFilter}</p>
              <p>Rohdaten gesamt (vor Filter): {leads.length} Leads · davon scope-relevant: {scopedLeads.length}</p>
              {search && <p>Suchbegriff: "{search}"</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              setFunnelFilter("all"); setSourceFilter("all"); setHeatFilter("all"); setSearch("");
            }}>
              Filter zurücksetzen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 1. FUNNEL FLOW ROW */}
          <div className="grid grid-cols-12 gap-4 ci-stagger">
            {/* Traffic Sources */}
            <Card className="col-span-12 lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="ci-section-h">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  Traffic Sources
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {trafficSources.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4">
                    No traffic data in this window.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {trafficSources.map((t) => (
                      <button
                        key={t.source}
                        onClick={() => setSourceFilter(t.source)}
                        className="w-full text-left"
                      >
                        <div className="ci-traffic-row">
                          <span className="truncate">{t.source}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {t.pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="ci-traffic-bar-track">
                          <div
                            className="ci-traffic-bar-fill"
                            style={
                              {
                                width: `${t.pct}%`,
                                ["--ci-bar-color" as any]: t.color,
                              } as React.CSSProperties
                            }
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Funnel Cards (horizontal flow) */}
            <Card className="col-span-12 lg:col-span-6">
              <CardHeader className="pb-2">
                <CardTitle className="ci-section-h">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  Cash Conversion Chain
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="ci-funnel-flow flex flex-row items-stretch gap-2 overflow-x-auto pb-1">
                  {FUNNEL_STEPS.map((step, i) => {
                    const m = stageMetrics.find((x) => x.key === step.stageKey);
                    if (!m) return null;
                    const Icon = step.icon;
                    return (
                      <div
                        key={step.stageKey}
                        className="flex flex-row items-center gap-1 flex-1 min-w-[120px]"
                      >
                        <button
                          onClick={() => setSelectedStage(step.stageKey)}
                          style={
                            { ["--ci-step-color" as any]: step.color } as React.CSSProperties
                          }
                          className={cn(
                            "ci-step flex-1",
                            m.weakness === "weak" && "ci-step--weak",
                            m.weakness === "medium" && "ci-step--medium",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="ci-step-num">{i + 1}</span>
                            <Icon className="ci-step-icon h-4 w-4" />
                          </div>
                          <div className="ci-step-title mt-2">{step.title}</div>
                          <div className="ci-step-desc">{step.desc}</div>
                          <div className="ci-step-num-big">
                            {m.volume.toLocaleString("de-DE")}
                          </div>
                          {m.conversionToNext !== null && (
                            <div className="ci-step-conv">
                              {m.conversionToNext.toFixed(1)}% →
                            </div>
                          )}
                        </button>
                        {i < FUNNEL_STEPS.length - 1 && (
                          <ArrowRight className="ci-step-arrow h-3.5 w-3.5" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Result Panel */}
            <div className="col-span-12 lg:col-span-3">
              <div className="ci-result">
                <div className="ci-result-row">
                  <div className="ci-result-label">Revenue</div>
                  <div className="ci-result-value">
                    {formatEur(resultPanel.revenueCents)}
                  </div>
                </div>
                <div className="ci-result-row">
                  <div className="ci-result-label">Revenue per Lead</div>
                  <div className="ci-result-value">
                    {formatEur(resultPanel.revenuePerLeadCents)}
                  </div>
                </div>
                <div className="ci-result-row">
                  <div className="ci-result-label">ROAS</div>
                  <div
                    className={cn(
                      "ci-result-value",
                      resultPanel.roas !== null && resultPanel.roas >= 1 && "pos",
                    )}
                  >
                    {resultPanel.roas !== null
                      ? `${resultPanel.roas.toFixed(2)}x`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* WhatsApp Confirmation Split */}
          <WhatsAppKpiPanel leads={filteredLeads} />

          {/* ============================================================
           * 2. KPI STRIP — Primary metrics
           * ============================================================ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 ci-stagger">
            <KpiCard
              icon={<Users className="h-4 w-4" />}
              label="Total Leads"
              value={kpiStrip.total.toLocaleString("de-DE")}
              trend={kpiTrends.visitors ?? null}
              onClick={() => setKpiDrilldown("total_leads")}
            />
            <KpiCard
              icon={<CalendarCheck className="h-4 w-4" />}
              label="Booked Calls"
              value={kpiStrip.booked.toLocaleString("de-DE")}
              trend={kpiTrends.booking ?? null}
              onClick={() => setKpiDrilldown("booked_calls")}
            />
            <KpiCard
              icon={<Phone className="h-4 w-4" />}
              label="Show Rate"
              value={`${kpiStrip.showRate.toFixed(1)}%`}
              trend={kpiTrends.show ?? null}
              onClick={() => setKpiDrilldown("booked_calls")}
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="No Shows"
              value={`${kpiStrip.noShows}`}
              trend={null}
              onClick={() => setKpiDrilldown("no_shows")}
            />
            <KpiCard
              icon={<Trophy className="h-4 w-4" />}
              label="Close Rate"
              value={`${kpiStrip.closeRate.toFixed(1)}%`}
              trend={kpiTrends.close ?? null}
              onClick={() => setKpiDrilldown("revenue")}
            />
            <KpiCard
              icon={<TrendingDown className="h-4 w-4" />}
              label="No Close"
              value={`${kpiStrip.noClosed}`}
              trend={null}
              onClick={() => setKpiDrilldown("no_close")}
            />
            <KpiCard
              icon={<Coins className="h-4 w-4" />}
              label="Revenue"
              value={formatEur(kpiStrip.revenueCents)}
              trend={kpiTrends.revenue ?? null}
              onClick={() => setKpiDrilldown("revenue")}
            />
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="Funnel Conv."
              value={`${kpiStrip.overallConv.toFixed(2)}%`}
              trend={kpiTrends.overall ?? null}
              onClick={() => setKpiDrilldown("funnel")}
            />
          </div>

          {/* KPI STRIP — Secondary metrics (Revenue per Lead/Show/Call) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 ci-stagger">
            <KpiCard
              icon={<PercentCircle className="h-4 w-4" />}
              label="Booking Rate"
              value={`${kpiStrip.bookingRate.toFixed(1)}%`}
              trend={kpiTrends.booking ?? null}
            />
            <KpiCard
              icon={<Target className="h-4 w-4" />}
              label="Rev / Lead"
              value={formatEur(kpiStrip.revenuePerLead)}
              trend={null}
            />
            <KpiCard
              icon={<Target className="h-4 w-4" />}
              label="Rev / Show"
              value={formatEur(kpiStrip.revenuePerShow)}
              trend={null}
            />
            <KpiCard
              icon={<Target className="h-4 w-4" />}
              label="Rev / Call"
              value={formatEur(kpiStrip.revenuePerCall)}
              trend={null}
            />
          </div>

          {/* ============================================================
           * 3. BOTTOM GRID — Performance Table | Bottleneck + Channel
           * ============================================================ */}
          <div className="grid grid-cols-12 gap-4 ci-stagger">
            {/* Performance by Stage Table */}
            <Card className="col-span-12 lg:col-span-8">
              <CardHeader>
                <CardTitle className="ci-section-h">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  Performance by Stage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2">Stage</th>
                        <th className="text-right">People</th>
                        <th className="text-right">Conv.</th>
                        <th className="text-right">Drop-off</th>
                        <th className="text-center pl-3 pr-3">Trend</th>
                        <th className="text-left pl-3">Details</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {stageMetrics.map((m, i) => {
                        const step = FUNNEL_STEPS.find((s) => s.stageKey === m.key);
                        const Icon = step?.icon ?? Activity;
                        return (
                          <tr
                            key={m.key}
                            onClick={() => setSelectedStage(m.key)}
                            className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
                          >
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className="ci-step-num"
                                  style={
                                    {
                                      ["--ci-step-color" as any]:
                                        step?.color ?? "var(--ci-accent)",
                                    } as React.CSSProperties
                                  }
                                >
                                  {i + 1}
                                </span>
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">{m.label}</span>
                              </div>
                            </td>
                            <td className="text-right tabular-nums">
                              {m.volume.toLocaleString("de-DE")}
                            </td>
                            <td className="text-right tabular-nums">
                              {m.conversionToNext !== null
                                ? `${m.conversionToNext.toFixed(1)}%`
                                : "—"}
                            </td>
                            <td className="text-right tabular-nums">
                              {m.dropToNext !== null
                                ? `${m.dropToNext.toFixed(1)}%`
                                : "—"}
                            </td>
                            <td className="px-3">
                              <div className="flex items-center justify-center gap-2">
                                <Sparkline
                                  values={sparkSeries[m.key] ?? []}
                                  stroke={
                                    m.trendPct === null
                                      ? "var(--ci-fg-muted)"
                                      : m.trendPct >= 0
                                      ? "var(--ci-pos)"
                                      : "var(--ci-neg)"
                                  }
                                  fill="currentColor"
                                />
                                {m.trendPct !== null && (
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-0.5 tabular-nums text-[10px]",
                                      m.trendPct >= 0
                                        ? "text-emerald-400"
                                        : "text-rose-400",
                                    )}
                                  >
                                    {m.trendPct >= 0 ? (
                                      <TrendingUp className="h-3 w-3" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3" />
                                    )}
                                    {Math.abs(m.trendPct).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="pl-3 text-muted-foreground text-[11px]">
                              {step?.detail ?? "—"}
                            </td>
                            <td>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Right column: Bottleneck + Channel */}
            <div className="col-span-12 lg:col-span-4 space-y-4">
              {/* Bottleneck Analysis */}
              <div className="ci-bottleneck-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="ci-section-h">
                      <Target className="h-3.5 w-3.5 text-rose-400" />
                      Bottleneck Analysis
                    </div>
                    <div className="ci-section-sub">
                      Largest drop-off in the chain
                    </div>
                  </div>
                  {bottleneck && (
                    <Badge className="bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px]">
                      Attention Required
                    </Badge>
                  )}
                </div>
                {bottleneck ? (
                  <>
                    <div>
                      <div className="text-[11px] text-muted-foreground">
                        Biggest Drop-off
                      </div>
                      <div className="text-sm font-medium mt-0.5">
                        {bottleneck.from}{" "}
                        <ArrowRight className="inline h-3 w-3 opacity-60" />{" "}
                        {bottleneck.to}
                      </div>
                      <div className="ci-bottleneck-bar-track mt-2">
                        <div
                          className="ci-bottleneck-bar-fill"
                          style={{ width: `${Math.min(100, bottleneck.drop)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground tabular-nums">
                        <span>{bottleneck.label}</span>
                        <span className="text-rose-400 font-medium">
                          -{bottleneck.drop.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setSelectedStage(bottleneck.from === "Revenue" ? "revenue" : (STAGES.find((s) => s.label === bottleneck.from)?.key ?? null))}
                    >
                      <Zap className="h-3.5 w-3.5 mr-1.5" />
                      View Recommendations
                    </Button>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground py-2">
                    No critical bottleneck detected.
                  </div>
                )}
              </div>

              {/* Channel Performance */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="ci-section-h">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    Channel Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    {channelRows.length === 0 && (
                      <div className="text-xs text-muted-foreground py-4 text-center">
                        No channel data in this segment.
                      </div>
                    )}
                    {channelRows.slice(0, 6).map((r, i) => {
                      const palette = [
                        "#60a5fa",
                        "#a78bfa",
                        "#34d399",
                        "#fbbf24",
                        "#f472b6",
                        "#fb923c",
                      ];
                      const color = palette[i % palette.length];
                      const maxRev = Math.max(...channelRows.map((x) => x.revenue), 1);
                      const roas = r.visitors > 0 ? r.revenue / 100 / r.visitors : 0;
                      return (
                        <button
                          key={r.source}
                          className="w-full text-left"
                          onClick={() => setSourceFilter(r.source)}
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium truncate">
                              {r.source}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {r.customers}/{r.visitors}
                            </span>
                          </div>
                          <div className="ci-traffic-bar-track mt-1">
                            <div
                              className="ci-traffic-bar-fill"
                              style={
                                {
                                  width: `${(r.revenue / maxRev) * 100}%`,
                                  ["--ci-bar-color" as any]: color,
                                } as React.CSSProperties
                              }
                            />
                          </div>
                          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground tabular-nums">
                            <span>{formatEur(r.revenue)}</span>
                            <span className={roas >= 1 ? "text-emerald-400" : ""}>
                              {roas > 0 ? `${roas.toFixed(2)}x` : "—"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ============================================================
           * 3b. SETTER / CLOSER PERFORMANCE BREAKDOWN
           * ============================================================ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 ci-stagger">
            {/* Setter Performance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="ci-section-h">
                  <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  Setter Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SetterCloserTable
                  type="setter"
                  leads={filteredLeads}
                  appointments={appointments}
                />
              </CardContent>
            </Card>

            {/* Closer Performance */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="ci-section-h">
                  <Headphones className="h-3.5 w-3.5 text-muted-foreground" />
                  Closer Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SetterCloserTable
                  type="closer"
                  leads={filteredLeads}
                  appointments={appointments}
                />
              </CardContent>
            </Card>
          </div>

          {/* ============================================================
           * 4. SECONDARY STACK — Alerts · Auto-Fix · Heat
           * (kept below the primary view; same logic, lower visual weight)
           * ============================================================ */}
          {alerts.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="ci-section-h">
                  <Bell className="h-3.5 w-3.5" /> Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
                      a.tone === "critical" && "border-rose-500/40 bg-rose-500/5",
                      a.tone === "warning" && "border-amber-500/40 bg-amber-500/5",
                    )}
                  >
                    <TrendingDown
                      className={cn(
                        "h-4 w-4 mt-0.5 shrink-0",
                        a.tone === "critical" ? "text-rose-400" : "text-amber-400",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{a.label}</div>
                      <div className="text-muted-foreground mt-0.5">{a.detail}</div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Auto-Fix Engine (L46) */}
          <AutoFixEnginePanel metrics={autoFixMetrics} />

          {/* Heat segmentation strip */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Lead Heat Distribution
                </div>
                <div className="text-xs text-muted-foreground">
                  {filteredLeads.length} leads · last {windowDays}d
                </div>
              </div>
              <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
                <div
                  className="bg-sky-400/60"
                  style={{ width: `${heatDistribution.cold.pct}%` }}
                />
                <div
                  className="bg-amber-400/70"
                  style={{ width: `${heatDistribution.warm.pct}%` }}
                />
                <div
                  className="bg-rose-500/80"
                  style={{ width: `${heatDistribution.hot.pct}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                <HeatChip
                  icon={<Snowflake className="h-3.5 w-3.5" />}
                  label="Cold"
                  pct={heatDistribution.cold.pct}
                  n={heatDistribution.cold.n}
                  active={heatFilter === "cold"}
                  onClick={() =>
                    setHeatFilter(heatFilter === "cold" ? "all" : "cold")
                  }
                />
                <HeatChip
                  icon={<Sun className="h-3.5 w-3.5" />}
                  label="Warm"
                  pct={heatDistribution.warm.pct}
                  n={heatDistribution.warm.n}
                  active={heatFilter === "warm"}
                  onClick={() =>
                    setHeatFilter(heatFilter === "warm" ? "all" : "warm")
                  }
                />
                <HeatChip
                  icon={<Flame className="h-3.5 w-3.5" />}
                  label="Hot"
                  pct={heatDistribution.hot.pct}
                  n={heatDistribution.hot.n}
                  active={heatFilter === "hot"}
                  onClick={() => setHeatFilter(heatFilter === "hot" ? "all" : "hot")}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Segment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Select value={funnelFilter} onValueChange={setFunnelFilter}>
                  <SelectTrigger><SelectValue placeholder="Funnel" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Funnels</SelectItem>
                    {funnels.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {sources.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={heatFilter} onValueChange={(v) => setHeatFilter(v as any)}>
                  <SelectTrigger><SelectValue placeholder="Heat" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All heat</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search name / email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Lead-level table (Level 4) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                Leads <span className="text-xs font-normal text-muted-foreground ml-2">click row → journey</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Lead</th>
                      <th className="text-left">Source</th>
                      <th className="text-left">Heat</th>
                      <th className="text-left">Stage</th>
                      <th className="text-right">Score</th>
                      <th className="text-left">Setter</th>
                      <th className="text-left">Closer</th>
                      <th className="text-right">Revenue</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.slice(0, 100).map((l) => (
                      <tr
                        key={l.id}
                        onClick={() => setSelectedLead(l)}
                        className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
                      >
                        <td className="py-2">
                          <div className="font-medium truncate max-w-[160px] flex items-center gap-1.5">
                            {l.name}
                            {(l as any).is_simulation && <span className="shrink-0 inline-flex items-center rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-amber-400/15 text-amber-600 border border-amber-400/30">SIM</span>}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{l.email}</div>
                        </td>
                        <td>{mapSource(l.source)}</td>
                        <td><HeatBadge heat={l.heat} /></td>
                        <td>{l.stage}</td>
                        <td className="text-right tabular-nums">{l.lead_score ?? "—"}</td>
                        <td>{l.setter_id ? (nameCache[l.setter_id] || "Teammitglied") : "—"}</td>
                        <td>{l.closer_id ? (nameCache[l.closer_id] || "Teammitglied") : "—"}</td>
                        <td className="text-right tabular-nums">
                         {confirmedRevByLead[l.id] ? formatEur(confirmedRevByLead[l.id] * 100) : l.deal_value ? `~${formatEur(l.deal_value * 100)}` : "—"}
                        </td>
                        <td><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></td>
                      </tr>
                    ))}
                    {filteredLeads.length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center text-muted-foreground py-8">
                          No leads in this segment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {filteredLeads.length > 100 && (
                  <div className="text-[10px] text-muted-foreground text-right mt-2">
                    Showing first 100 of {filteredLeads.length}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Stage drilldown with lead-level table (Level 2+4) */}
      {selectedStage && (
        <StageLeadsDrilldown
          open={!!selectedStage}
          onClose={() => setSelectedStage(null)}
          stageKey={selectedStage}
          metric={stageMetrics.find((m) => m.key === selectedStage) ?? { label: selectedStage, volume: 0, conversionToNext: null, dropToNext: null, weakness: "good", problem: "" }}
          windowDays={windowDays}
          funnel={funnelFilter !== "all" ? funnelFilter : null}
          source={sourceFilter !== "all" ? sourceFilter : null}
          operatorId={activeOperator}
          levelFilter={levelNum}
          userId={scope === "my" ? userId : null}
        />
      )}

      {/* Lead detail sheet (Level 4) */}
      <Sheet open={!!selectedLead} onOpenChange={(o) => !o && setSelectedLead(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedLead && (
            <LeadDetailPanel leadId={selectedLead.id} />
          )}
        </SheetContent>
      </Sheet>
      {/* KPI drilldown sheet */}
      <Sheet open={!!kpiDrilldown} onOpenChange={(o) => !o && setKpiDrilldown(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {kpiDrilldown && (
            <KpiDrilldownPanel
              type={kpiDrilldown}
              windowDays={windowDays}
              scope={scope}
              userId={userId}
              teamMemberIds={teamMemberIds}
              funnelFilter={funnelFilter}
              sourceFilter={sourceFilter}
              heatFilter={heatFilter}
              search={search}
              stageMetrics={stageMetrics}
              channelRows={channelRows}
              onLeadClick={(l) => { setKpiDrilldown(null); setTimeout(() => setSelectedLead(l), 150); }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Hidden Admin Lead Export Dialog — only accessible via keyboard shortcut */}
      <Dialog open={leadExportDialog} onOpenChange={(o) => { if (!o) { setLeadExportDialog(false); setLeadExportPassword(""); setLeadExportReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-serif">
              <Lock className="h-4 w-4 text-destructive" />
              Lead-Export — Sicherheitsabfrage
            </DialogTitle>
            <DialogDescription className="text-xs">
              Lead-Daten sind ein geschütztes Asset. Dieser Export wird vollständig protokolliert.
              Bitte bestätige deine Identität und gib einen Grund an.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="export-pw" className="text-xs font-medium">Passwort (Re-Authentifizierung)</Label>
              <Input
                id="export-pw"
                type="password"
                value={leadExportPassword}
                onChange={(e) => setLeadExportPassword(e.target.value)}
                placeholder="Dein Account-Passwort"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-reason" className="text-xs font-medium">Begründung (Pflichtfeld, min. 10 Zeichen)</Label>
              <Input
                id="export-reason"
                value={leadExportReason}
                onChange={(e) => setLeadExportReason(e.target.value)}
                placeholder="z.B. DSGVO-Anfrage, Buchhaltung Q2…"
              />
            </div>
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-[11px] text-muted-foreground">
              ⚠️ Dieser Vorgang wird mit Zeitstempel, IP-Adresse und Begründung protokolliert.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setLeadExportDialog(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleAdminLeadExport}
              disabled={!!exporting || !leadExportPassword || leadExportReason.trim().length < 10}
            >
              {exporting === "lead" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
              Export bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
}

// ---------- Subcomponents ----------

function KpiMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="ci-kpi rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  trend,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: number | null;
  onClick?: () => void;
}) {
  const tone = trend === null ? "flat" : trend >= 0 ? "up" : "down";
  return (
    <button onClick={onClick} className="ci-kpi-card text-left cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all">
      <span className="ci-kpi-icon">{icon}</span>
      <div className="ci-kpi-body">
        <span className="ci-kpi-label">{label}</span>
        <span className="ci-kpi-value">{value}</span>
        {trend !== null && (
          <span className={`ci-kpi-trend ${tone}`}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
    </button>
  );
}

function HeatChip({
  icon,
  label,
  pct,
  n,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  pct: number;
  n: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-between rounded-lg border px-3 py-2 transition-colors",
        active ? "border-foreground bg-muted" : "border-border hover:bg-muted/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="tabular-nums">
        {pct.toFixed(0)}% <span className="text-muted-foreground ml-1">({n})</span>
      </span>
    </button>
  );
}

function HeatBadge({ heat }: { heat: Heat }) {
  const cfg = {
    cold: { cls: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300", label: "Cold" },
    warm: { cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", label: "Warm" },
    hot: { cls: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300", label: "Hot" },
  }[heat];
  return <Badge className={cn("text-[10px]", cfg.cls)}>{cfg.label}</Badge>;
}

function StageDrilldown({
  stageKey,
  metric,
  leads,
  appointments,
  calls,
}: {
  stageKey: StageKey;
  metric: StageMetric;
  leads: LeadRow[];
  appointments: Array<{ lead_id: string; appointment_status: string; attendance_flag: boolean | null; outcome: string | null; starts_at: string }>;
  calls: Array<{ id: string; result: string | null; objection_type: string | null; revenue: number | null; deal_size: number | null; created_at: string }>;
}) {
  // Stage-specific breakdown
  let breakdown: Array<{ label: string; value: string | number }> = [];
  if (stageKey === "showing") {
    const booked = appointments.length;
    const attended = appointments.filter((a) => a.attendance_flag).length;
    const noShow = appointments.filter((a) => a.appointment_status === "no_show" || a.attendance_flag === false).length;
    const showRate = booked ? (attended / booked) * 100 : 0;
    breakdown = [
      { label: "Booked calls", value: booked },
      { label: "Attended", value: attended },
      { label: "No-show", value: noShow },
      { label: "Show rate", value: `${showRate.toFixed(1)}%` },
    ];
  } else if (stageKey === "offer" || stageKey === "closer") {
    const closed = calls.filter((c) => c.result === "closed" || (c.revenue ?? 0) > 0).length;
    const objections = calls.filter((c) => c.objection_type).length;
    const closeRate = calls.length ? (closed / calls.length) * 100 : 0;
    const objMap = new Map<string, number>();
    calls.forEach((c) => c.objection_type && objMap.set(c.objection_type, (objMap.get(c.objection_type) || 0) + 1));
    const topObj = [...objMap.entries()].sort((a, b) => b[1] - a[1])[0];
    breakdown = [
      { label: "Close rate", value: `${closeRate.toFixed(1)}%` },
      { label: "Objections raised", value: objections },
      { label: "Top objection", value: topObj ? `${topObj[0]} (${topObj[1]})` : "—" },
    ];
  } else if (stageKey === "engagement") {
    const withQuiz = leads.filter((l) => (l.lead_score ?? 0) > 0).length;
    const completed = leads.filter((l) => l.has_booking || (l.lead_score ?? 0) >= 30).length;
    breakdown = [
      { label: "Quiz started", value: withQuiz },
      { label: "Quiz completed", value: completed },
      { label: "Completion %", value: withQuiz ? `${((completed / withQuiz) * 100).toFixed(1)}%` : "—" },
    ];
  } else if (stageKey === "setter") {
    const handled = leads.filter((l) => !!l.setter_call_outcome).length;
    const qualified = leads.filter((l) => l.setter_call_outcome === "qualified").length;
    breakdown = [
      { label: "Setter touched", value: handled },
      { label: "Qualified", value: qualified },
      { label: "Qualification %", value: handled ? `${((qualified / handled) * 100).toFixed(1)}%` : "—" },
    ];
  } else {
    breakdown = [
      { label: "Volume", value: metric.volume },
      { label: "Conversion to next", value: metric.conversionToNext !== null ? `${metric.conversionToNext.toFixed(1)}%` : "—" },
      { label: "Drop-off", value: metric.dropToNext !== null ? `${metric.dropToNext.toFixed(1)}%` : "—" },
    ];
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-serif">
          {metric.label}
          <Badge
            className={cn(
              "ml-2 text-[10px]",
              metric.weakness === "weak" && "bg-destructive text-destructive-foreground",
              metric.weakness === "medium" && "bg-amber-500/15 text-amber-700",
            )}
          >
            {metric.weakness}
          </Badge>
        </SheetTitle>
      </SheetHeader>
      <div className="mt-6 space-y-3">
        {metric.weakness !== "good" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm flex items-start gap-2">
            <TrendingDown className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>{metric.problem}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {breakdown.map((b) => (
            <div key={b.label} className="rounded-lg border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{b.label}</div>
              <div className="text-base font-serif mt-1 tabular-nums">{b.value}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function LeadTimeline({
  lead,
  appointments,
}: {
  lead: LeadRow;
  appointments: Array<{ lead_id: string; appointment_status: string; attendance_flag: boolean | null; outcome: string | null; starts_at: string }>;
}) {
  const events: Array<{ ts: string; label: string; tone: "good" | "bad" | "neutral" }> = [];
  events.push({ ts: lead.created_at, label: "Lead captured", tone: "neutral" });
  if (lead.lead_score) events.push({ ts: lead.created_at, label: `Quiz scored ${lead.lead_score}`, tone: "neutral" });
  if (lead.has_booking) events.push({ ts: lead.appointment_date ?? lead.created_at, label: "Booked call", tone: "good" });
  appointments.forEach((a) => {
    if (a.attendance_flag === true) events.push({ ts: a.starts_at, label: "Showed up", tone: "good" });
    if (a.attendance_flag === false || a.appointment_status === "no_show")
      events.push({ ts: a.starts_at, label: "No-show", tone: "bad" });
    if (a.outcome) events.push({ ts: a.starts_at, label: `Outcome: ${a.outcome}`, tone: a.outcome === "won" ? "good" : "bad" });
  });
  if (lead.setter_call_outcome) events.push({ ts: lead.created_at, label: `Setter: ${lead.setter_call_outcome}`, tone: "neutral" });
  if (lead.outcome === "won") events.push({ ts: lead.created_at, label: "Closed won", tone: "good" });
  if (lead.outcome === "lost") events.push({ ts: lead.created_at, label: "Lost", tone: "bad" });

  events.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-serif flex items-center gap-2">
          {lead.name}
          <HeatBadge heat={lead.heat} />
          {(lead as any).is_simulation && <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-400/15 text-amber-600 border border-amber-400/30">SIM</span>}
        </SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-1 text-xs text-muted-foreground">
        <div>{lead.email}</div>
        <div>Source: {lead.source ?? "—"} · Score: {lead.lead_score ?? "—"}</div>
      </div>
      <div className="mt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Journey</div>
        <ol className="relative border-l border-border ml-2 space-y-3">
          {events.map((e, i) => (
            <li key={i} className="ml-4">
              <span
                className={cn(
                  "absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border bg-background",
                  e.tone === "good" && "border-emerald-500 bg-emerald-500/30",
                  e.tone === "bad" && "border-destructive bg-destructive/30",
                  e.tone === "neutral" && "border-muted-foreground",
                )}
              />
              <div className="text-sm">{e.label}</div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(e.ts).toLocaleString("de-DE")}
              </div>
            </li>
          ))}
          {events.length === 0 && (
            <li className="ml-4 text-sm text-muted-foreground">No journey events yet.</li>
          )}
        </ol>
      </div>
    </>
  );
}

// ---------- KPI Drilldown Panel ----------

function KpiDrilldownPanel({
  type,
  windowDays,
  scope,
  userId,
  teamMemberIds,
  funnelFilter,
  sourceFilter,
  heatFilter,
  search,
  stageMetrics,
  channelRows,
  onLeadClick,
}: {
  type: string;
  windowDays: number;
  scope: string;
  userId: string | null;
  teamMemberIds: string[];
  funnelFilter: string;
  sourceFilter: string;
  heatFilter: string;
  search: string;
  stageMetrics: StageMetric[];
  channelRows: Array<{ source: string; visitors: number; bookings: number; customers: number; revenue: number; conversion_pct: number }>;
  onLeadClick: (lead: LeadRow) => void;
}) {
  const TITLES: Record<string, string> = {
    total_leads: "Total Leads",
    booked_calls: "Booked Calls",
    no_shows: "No-Show Leads",
    no_close: "No-Close Leads",
    revenue: "Closed Deals",
    funnel: "Funnel Breakdown",
    engagement: "Engaged Leads",
    qualification: "Qualified Leads",
  };

  type SortCol = "name" | "source" | "stage" | "score" | "date" | "deal" | "outcome";
  type SortDir = "asc" | "desc";

  const [sp, setSp] = useSearchParams();
  const sortCol = (sp.get("dsort") || "date") as SortCol;
  const sortDir = (sp.get("ddir") || "desc") as SortDir;
  const PAGE_SIZES = [25, 50, 100] as const;
  const pageSize = Number(sp.get("dpsize") || "50") || 50;
  const page = Number(sp.get("dpage") || "0") || 0;

  const toggleSort = (col: SortCol) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (sortCol === col) {
        next.set("ddir", sortDir === "asc" ? "desc" : "asc");
      } else {
        next.set("dsort", col);
        next.set("ddir", col === "name" || col === "source" || col === "stage" ? "asc" : "desc");
      }
      next.delete("dpage");
      return next;
    }, { replace: true });
  };
  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ArrowUpDown className="inline h-3 w-3 ml-0.5 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="inline h-3 w-3 ml-0.5" />
      : <ArrowDown className="inline h-3 w-3 ml-0.5" />;
  };

  const setPage = (v: number | ((p: number) => number)) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      const resolved = typeof v === "function" ? v(Number(next.get("dpage") || "0") || 0) : v;
      if (resolved === 0) next.delete("dpage"); else next.set("dpage", String(resolved));
      return next;
    }, { replace: true });
  };
  const setPageSize = (v: number) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (v === 50) next.delete("dpsize"); else next.set("dpsize", String(v));
      next.delete("dpage");
      return next;
    }, { replace: true });
  };

  // Funnel view doesn't need server pagination
  if (type === "funnel") {
    return (
      <>
        <SheetHeader>
          <SheetTitle className="font-serif">Funnel Breakdown</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            {stageMetrics.map((m) => {
              const maxVol = Math.max(...stageMetrics.map((s) => s.volume), 1);
              return (
                <div key={m.key} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{m.label}</span>
                    <span className="tabular-nums">{m.volume.toLocaleString("de-DE")}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted mt-2 overflow-hidden">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${(m.volume / maxVol) * 100}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                    <span>{m.conversionToNext !== null ? `→ ${m.conversionToNext.toFixed(1)}%` : "Terminal"}</span>
                    <span>{m.dropToNext !== null ? `Drop: ${m.dropToNext.toFixed(1)}%` : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs font-medium mt-4 mb-2">Channel Performance</div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2">Channel</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right">Bookings</th>
                  <th className="text-right">Won</th>
                  <th className="text-right">Conv.</th>
                  <th className="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {channelRows.map((r) => (
                  <tr key={r.source} className="border-b last:border-0">
                    <td className="py-2 font-medium">{r.source}</td>
                    <td className="text-right tabular-nums">{r.visitors}</td>
                    <td className="text-right tabular-nums">{r.bookings}</td>
                    <td className="text-right tabular-nums">{r.customers}</td>
                    <td className="text-right tabular-nums">{r.conversion_pct.toFixed(1)}%</td>
                    <td className="text-right tabular-nums">{formatEur(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  // ---- Server-side paginated fetch ----
  const [pageLeads, setPageLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      setLoading(true);
      try {
        const teamIds = scope === "team" && teamMemberIds.length > 0 && userId
          ? [userId, ...teamMemberIds]
          : null;
        const { data, error } = await supabase.rpc("get_kpi_drilldown_leads" as never, {
          p_kpi_type: type,
          p_window_days: windowDays,
          p_sort_col: sortCol,
          p_sort_dir: sortDir,
          p_page: page,
          p_page_size: pageSize,
          p_scope: scope,
          p_user_id: scope === "my" ? userId : null,
          p_team_ids: teamIds,
          p_funnel: funnelFilter !== "all" ? funnelFilter : null,
          p_source: sourceFilter !== "all" ? sourceFilter : null,
          p_heat: heatFilter !== "all" ? heatFilter : null,
          p_search: search || null,
        } as never);
        if (error) throw error;
        if (cancelled) return;
        const result = data as any;
        const rows = (result?.rows ?? []).map((r: any) => ({
          ...r,
          heat: r.heat ?? "cold",
          mappedSource: mapSource(r.source),
        }));
        setPageLeads(rows);
        setTotal(result?.total ?? 0);
      } catch (e) {
        console.error("Drilldown fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [type, windowDays, sortCol, sortDir, page, pageSize, scope, userId, teamMemberIds, funnelFilter, sourceFilter, heatFilter, search]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-serif">
          {TITLES[type] ?? type}
          <Badge className="ml-2 text-[10px]" variant="outline">{total}</Badge>
        </SheetTitle>
      </SheetHeader>
      <div className="mt-4 text-xs text-muted-foreground mb-2">
        {type === "no_shows" && "Leads mit mindestens einem No-Show."}
        {type === "no_close" && "Leads mit Call-Teilnahme aber ohne Abschluss."}
        {type === "revenue" && "Leads mit Outcome = Won oder Payment = Paid."}
        {type === "booked_calls" && "Leads mit gebuchtem Termin."}
      </div>
      {/* ---------- Active Filter Chips ---------- */}
      <DrilldownFilterChips
        windowDays={windowDays}
        scope={scope}
        funnelFilter={funnelFilter}
        sourceFilter={sourceFilter}
        heatFilter={heatFilter}
        search={search}
        sortCol={sortCol}
        sortDir={sortDir}
        pageSize={pageSize}
      />
      <div className="overflow-auto">
        {loading && pageLeads.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Lade Daten…
          </div>
        )}
        <table className={cn("w-full text-xs", loading && pageLeads.length > 0 && "opacity-50 pointer-events-none transition-opacity")}>
          <thead>
            <tr className="border-b text-muted-foreground select-none">
              <th className="text-left py-2 cursor-pointer" onClick={() => toggleSort("name")}>Lead <SortIcon col="name" /></th>
              <th className="text-left cursor-pointer" onClick={() => toggleSort("source")}>Source <SortIcon col="source" /></th>
              <th className="text-left cursor-pointer" onClick={() => toggleSort("stage")}>Stage <SortIcon col="stage" /></th>
              <th className="text-right cursor-pointer" onClick={() => toggleSort("score")}>Score <SortIcon col="score" /></th>
              {type === "revenue" && <th className="text-right cursor-pointer" onClick={() => toggleSort("deal")}>Deal <SortIcon col="deal" /></th>}
              {type === "no_shows" && <th className="text-left cursor-pointer" onClick={() => toggleSort("date")}>Termin <SortIcon col="date" /></th>}
              {type === "no_close" && <th className="text-left cursor-pointer" onClick={() => toggleSort("outcome")}>Outcome <SortIcon col="outcome" /></th>}
              <th className="text-left cursor-pointer" onClick={() => toggleSort("date")}>Datum <SortIcon col="date" /></th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {pageLeads.map((l) => (
              <tr
                key={l.id}
                onClick={() => onLeadClick(l)}
                className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
              >
                <td className="py-2">
                  <div className="font-medium truncate max-w-[140px] flex items-center gap-1.5">
                    {l.name}
                    {(l as any).is_simulation && <span className="shrink-0 inline-flex items-center rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-amber-400/15 text-amber-600 border border-amber-400/30">SIM</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{l.email}</div>
                </td>
                <td>{mapSource(l.source)}</td>
                <td>{l.stage}</td>
                <td className="text-right tabular-nums">{l.lead_score ?? "—"}</td>
                {type === "revenue" && <td className="text-right tabular-nums">{l.deal_value ? formatEur(l.deal_value * 100) : "—"}</td>}
                {type === "no_shows" && <td className="text-[10px]">{l.appointment_date ? new Date(l.appointment_date).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : "—"}</td>}
                {type === "no_close" && <td>{l.outcome ?? "pending"}</td>}
                <td className="text-[10px] text-muted-foreground tabular-nums">{new Date(l.created_at).toLocaleDateString("de-DE")}</td>
                <td><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></td>
              </tr>
            ))}
            {!loading && pageLeads.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-8">Keine Leads in diesem Segment.</td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, total)} von {total}
              </span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); }}>
                <SelectTrigger className="h-6 w-[70px] text-[10px] border-border/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s} / Seite</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={safePage === 0}
                onClick={() => setPage(0)}
              >
                ««
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ‹
              </Button>
              <span className="text-[10px] tabular-nums px-2 text-muted-foreground">
                {safePage + 1} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                ›
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
              >
                »»
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ---------- Setter / Closer Performance Table ----------

function SetterCloserTable({
  type,
  leads,
  appointments,
}: {
  type: "setter" | "closer";
  leads: LeadRow[];
  appointments: Array<{ lead_id: string; appointment_status: string; attendance_flag: boolean | null; outcome: string | null; starts_at: string; setter_id: string | null; closer_id: string | null; assigned_operator_id: string | null }>;
}) {
  const rows = useMemo(() => {
    const map = new Map<string, {
      name: string;
      leads: number;
      booked: number;
      shows: number;
      noShows: number;
      closed: number;
      revenue: number;
      noCloseReasons: Map<string, number>;
    }>();

    if (type === "setter") {
      // Group by setter_id from appointments
      const apptBySetter = new Map<string, typeof appointments>();
      appointments.forEach((a) => {
        const sid = a.setter_id ?? a.assigned_operator_id;
        if (!sid) return;
        if (!apptBySetter.has(sid)) apptBySetter.set(sid, []);
        apptBySetter.get(sid)!.push(a);
      });

      // Group leads by setter_id
      leads.forEach((l) => {
        const sid = l.setter_id;
        if (!sid) return;
        const row = map.get(sid) ?? { name: "Teammitglied", leads: 0, booked: 0, shows: 0, noShows: 0, closed: 0, revenue: 0, noCloseReasons: new Map() };
        row.leads++;
        if (l.has_booking) row.booked++;
        if (l.outcome === "won" || l.payment_status === "paid") {
          row.closed++;
          row.revenue += (l.deal_value ?? 0) * 100; // Pipeline-level breakdown (sub-component)
        }
        map.set(sid, row);
      });

      // Enrich with appointment data
      apptBySetter.forEach((appts, sid) => {
        const row = map.get(sid) ?? { name: "Teammitglied", leads: 0, booked: 0, shows: 0, noShows: 0, closed: 0, revenue: 0, noCloseReasons: new Map() };
        appts.forEach((a) => {
          if (a.attendance_flag === true) row.shows++;
          if (a.appointment_status === "no_show") row.noShows++;
        });
        map.set(sid, row);
      });
    } else {
      // Group by closer_id from leads
      leads.forEach((l) => {
        const cid = l.closer_id;
        if (!cid) return;
        const row = map.get(cid) ?? { name: "Teammitglied", leads: 0, booked: 0, shows: 0, noShows: 0, closed: 0, revenue: 0, noCloseReasons: new Map() };
        row.leads++;
        if (l.has_booking) row.booked++;
        if (l.outcome === "won" || l.payment_status === "paid") {
          row.closed++;
          row.revenue += (l.deal_value ?? 0) * 100; // Pipeline-level breakdown (sub-component)
        } else if (l.outcome === "lost") {
          const reason = (l as any).close_reason ?? "unknown";
          row.noCloseReasons.set(reason, (row.noCloseReasons.get(reason) ?? 0) + 1);
        }
        map.set(cid, row);
      });

      // Enrich with appointment data
      appointments.forEach((a) => {
        const cid = a.closer_id;
        if (!cid) return;
        const row = map.get(cid);
        if (!row) return;
        if (a.attendance_flag === true) row.shows++;
        if (a.appointment_status === "no_show") row.noShows++;
      });
    }

    return [...map.entries()]
      .map(([id, r]) => ({ id, ...r, closeRate: r.shows ? (r.closed / r.shows) * 100 : 0, bookingRate: r.leads ? (r.booked / r.leads) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
  }, [type, leads, appointments]);

  // Resolve names
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = rows.map((r) => r.id).filter((id) => !names[id]);
    if (ids.length === 0) return;
    supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", ids.slice(0, 50))
      .then(({ data }) => {
        if (!data) return;
        const m: Record<string, string> = {};
        (data as any[]).forEach((p) => { m[p.id] = p.full_name || "Teammitglied"; });
        setNames((prev) => ({ ...prev, ...m }));
      });
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        Keine {type === "setter" ? "Setter" : "Closer"}-Daten in diesem Zeitraum.
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-2">{type === "setter" ? "Setter" : "Closer"}</th>
            <th className="text-right">Leads</th>
            {type === "setter" && <th className="text-right">Booking %</th>}
            <th className="text-right">Shows</th>
            <th className="text-right">No Shows</th>
            <th className="text-right">Close %</th>
            <th className="text-right">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-2 font-medium">{names[r.id] ?? r.name}</td>
              <td className="text-right tabular-nums">{r.leads}</td>
              {type === "setter" && <td className="text-right tabular-nums">{r.bookingRate.toFixed(0)}%</td>}
              <td className="text-right tabular-nums">{r.shows}</td>
              <td className="text-right tabular-nums">{r.noShows}</td>
              <td className="text-right tabular-nums">{r.closeRate.toFixed(0)}%</td>
              <td className="text-right tabular-nums">{formatEur(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Drilldown Filter Chips ----------
function DrilldownFilterChips({
  windowDays,
  scope,
  funnelFilter,
  sourceFilter,
  heatFilter,
  search,
  sortCol,
  sortDir,
  pageSize,
}: {
  windowDays: number;
  scope: string;
  funnelFilter: string;
  sourceFilter: string;
  heatFilter: string;
  search: string;
  sortCol: string;
  sortDir: string;
  pageSize: number;
}) {
  const [sp, setSp] = useSearchParams();
  const remove = (key: string, fallback?: string) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      if (fallback) next.set(key, fallback); else next.delete(key);
      next.delete("dpage");
      return next;
    }, { replace: true });
  };

  type Chip = { label: string; onRemove?: () => void };
  const chips: Chip[] = [];

  // Scope
  if (scope !== "team") chips.push({ label: `Scope: ${scope === "my" ? "Meine" : scope === "all" ? "Alle" : scope}`, onRemove: () => remove("scope") });

  // Window
  if (windowDays !== 30) chips.push({ label: `${windowDays} Tage`, onRemove: () => remove("days") });

  // Funnel
  if (funnelFilter !== "all") chips.push({ label: `Funnel: ${funnelFilter}`, onRemove: () => remove("funnel") });

  // Source
  if (sourceFilter !== "all") chips.push({ label: `Source: ${sourceFilter}`, onRemove: () => remove("source") });

  // Heat
  if (heatFilter !== "all") {
    const heatLabels: Record<string, string> = { hot: "🔥 Hot", warm: "☀️ Warm", cold: "❄️ Cold" };
    chips.push({ label: heatLabels[heatFilter] ?? heatFilter, onRemove: () => remove("heat") });
  }

  // Search
  if (search) chips.push({ label: `Suche: „${search}"`, onRemove: () => remove("q") });

  // Sort (non-default)
  if (sortCol !== "date" || sortDir !== "desc") {
    const colLabels: Record<string, string> = { name: "Name", source: "Source", stage: "Stage", score: "Score", deal: "Deal", date: "Datum", outcome: "Outcome" };
    chips.push({ label: `Sort: ${colLabels[sortCol] ?? sortCol} ${sortDir === "asc" ? "↑" : "↓"}`, onRemove: () => { setSp((prev) => { const n = new URLSearchParams(prev); n.delete("dsort"); n.delete("ddir"); n.delete("dpage"); return n; }, { replace: true }); } });
  }

  // Page size (non-default)
  if (pageSize !== 50) chips.push({ label: `${pageSize} pro Seite`, onRemove: () => { setSp((prev) => { const n = new URLSearchParams(prev); n.delete("dpsize"); n.delete("dpage"); return n; }, { replace: true }); } });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-[10px] font-medium text-foreground/80 transition-colors hover:bg-muted"
        >
          {c.label}
          {c.onRemove && (
            <button onClick={c.onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors">
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
      {chips.filter((c) => c.onRemove).length > 1 && (
        <button
          onClick={() => setSp((prev) => {
            const next = new URLSearchParams(prev);
            ["funnel", "source", "heat", "q", "dsort", "ddir", "dpsize", "dpage", "days"].forEach((k) => next.delete(k));
            if (next.has("scope")) next.delete("scope");
            return next;
          }, { replace: true })}
          className="text-[10px] text-muted-foreground hover:text-foreground ml-1 underline underline-offset-2"
        >
          Alle zurücksetzen
        </button>
      )}
    </div>
  );
}
