/**
 * Intelligence Control™ — Dashboard 3 of the ETC Operating System (Layer 47)
 * --------------------------------------------------------------------------
 * Canon: ETC OS · Visualization Layer · Block "intelligence"
 * Purpose: Make Communication + AI + Learning visible, controllable, optimizable.
 * Connects: Revenue Engine ↔ Talent Engine.
 * Access: L6 (Operators), L7 (Directors), L8 (Partners), Admins/Owners.
 *
 * 4 Intelligence Sections (canonical order):
 *   1. Revenue Intelligence     (funnel KPIs, bottlenecks, AI decisions — revenue side)
 *   2. Talent Intelligence      (operator scoring, talent flags, coaching — talent side)
 *   3. Communication Intelligence (channel performance, touchpoint map)
 *   4. Data Quality Intelligence  (lead completeness, field coverage, anomalies)
 */

import { useEffect, useMemo, useState } from "react";
import { useLoadingTimeout } from "@/hooks/useLoadingTimeout";
import LoadingTimeoutFallback from "@/components/ui/LoadingTimeoutFallback";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/i18n/LanguageContext";
import { getLevelForStage } from "@/lib/kpi-config";
import AccessDenied from "@/components/members/AccessDenied";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Coins,
  Database,
  GitBranch,
  History,
  Loader2,
  MessageSquare,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { playCue } from "@/lib/sound-design";
import "./conversion-intelligence-theme.css";
import { useOptionalPerformanceFilters } from "@/contexts/PerformanceFiltersContext";
import { CrossNavCta } from "@/components/performance/CrossNavCta";
import OperatorCanonPanel from "@/components/performance/OperatorCanonPanel";
import CommunicationAuditPanel from "@/components/performance/CommunicationAuditPanel";
import OperatorPerformanceCards from "@/components/performance/OperatorPerformanceCards";
import OperatorRankingSystem from "@/components/performance/OperatorRankingSystem";
import type { OperatorData } from "@/components/performance/OperatorRankingSystem";
import { formatEur } from "@/lib/canonical-funnel-intelligence";

// ─── Types ──────────────────────────────────────────────────────────────────

type ChannelKey = "whatsapp" | "sms" | "email" | "push" | "voice";
type RangeKey = "24h" | "7d" | "30d" | "90d";

interface TouchpointNode {
  key: string;
  label: string;
  side: "revenue" | "talent";
  count: number;
  impact: "high" | "medium" | "low";
}

interface ChannelStats {
  channel: ChannelKey;
  sent: number;
  delivered: number;
  opened: number;
  responded: number;
  converted: number;
  effectiveness: number;
}

interface AiDecisionRow {
  id: string;
  action: string;
  reason: string | null;
  funnel_key: string | null;
  status: string | null;
  confidence: number | null;
  run_at: string | null;
  created_at: string;
  category: "revenue" | "talent";
}

interface FixRow {
  id: string;
  problem_label: string | null;
  problem_class: string | null;
  severity: string | null;
  scope_label: string | null;
  metric_key: string | null;
  metric_value: number | null;
  metric_threshold: number | null;
  status: string | null;
  detected_at: string | null;
}

interface ChangeRow {
  change_id: string;
  module: string | null;
  change_type: string | null;
  reason: string | null;
  expected_impact: string | null;
  risk_level: string | null;
  reversible: boolean | null;
  created_at: string;
}

interface InsightRow {
  id: string;
  insight_title: string;
  insight_summary: string | null;
  category: string | null;
  recommended_level: number | null;
  source_count: number | null;
  approval_status: string | null;
  suggested_application: string | null;
  created_at: string;
}

interface DataQualityMetric {
  field: string;
  label: string;
  total: number;
  filled: number;
  pct: number;
  severity: "good" | "warning" | "critical";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const RANGE_DAYS: Record<RangeKey, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

const sinceIso = (range: RangeKey) =>
  new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000).toISOString();

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n));
const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

const TALENT_ACTIONS = new Set(["coach", "promote", "intervene", "mentor_nudge", "level_review"]);
function categorize(action: string): "revenue" | "talent" {
  const a = action.toLowerCase();
  return TALENT_ACTIONS.has(a) || a.includes("operator") || a.includes("coach") || a.includes("level")
    ? "talent"
    : "revenue";
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function IntelligenceControl() {
  const { profile, isAdmin, isOwner, user } = useAuth();
  const { lang } = useLanguage();

  const stage = (profile as any)?.business_stage ?? "opener";
  const level = isAdmin || isOwner ? 8 : getLevelForStage(stage);
  const allowed = level >= 6 || isAdmin || isOwner;

  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const shellFilters = useOptionalPerformanceFilters();
  const nested = !!shellFilters;

  const [range, setRange] = useState<RangeKey>(
    (shellFilters?.filters.range as RangeKey) ?? "30d",
  );
  const [funnel, setFunnel] = useState<string>(shellFilters?.filters.funnel ?? "__all");
  const [funnels, setFunnels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { timedOut } = useLoadingTimeout(loading);

  // Sync from shared filters
  useEffect(() => {
    if (!shellFilters) return;
    const sf = shellFilters.filters;
    if (sf.range) setRange(sf.range as RangeKey);
    if (sf.funnel) setFunnel(sf.funnel);
  }, [shellFilters?.filters.range, shellFilters?.filters.funnel]); // eslint-disable-line

  const [touchpoints, setTouchpoints] = useState<TouchpointNode[]>([]);
  const [channels, setChannels] = useState<ChannelStats[]>([]);
  const [decisions, setDecisions] = useState<AiDecisionRow[]>([]);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [fixes, setFixes] = useState<FixRow[]>([]);
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [operatorData, setOperatorData] = useState<OperatorData[]>([]);
  const [reloadTick, setReloadTick] = useState(0);

  // Revenue intelligence data
  const [revenueKpis, setRevenueKpis] = useState<{
    totalLeads: number; booked: number; shows: number; noShows: number;
    closed: number; revenue: number; showRate: number; closeRate: number;
  } | null>(null);

  // Data quality
  const [dataQuality, setDataQuality] = useState<DataQualityMetric[]>([]);

  // ── Data load ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const since = sinceIso(range);
      const rangeDays = RANGE_DAYS[range];

      // Funnels list
      const { data: funnelRows } = await supabase
        .from("per_funnel_feature_flags")
        .select("funnel_key")
        .order("funnel_key");
      if (cancelled) return;
      const fk = (funnelRows ?? []).map((r: any) => r.funnel_key).filter(Boolean);
      setFunnels(fk);

      // ── Parallel fetches ─────────────────────────────────────────
      const [
        sendRes, perfRes, nbaRes, insightRes, fixRes, changeRes,
        lifeRes, levelRes, leadsRes,
      ] = await Promise.all([
        supabase.from("message_library_send_log").select("channel,status").gte("created_at", since).limit(1500),
        supabase.from("message_performance_events").select("channel,event_type").gte("occurred_at", since).limit(1500),
        (() => {
          let q = supabase.from("lead_next_best_action").select("id,action,reason,funnel_key,status,confidence,run_at,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(50);
          if (funnel !== "__all") q = q.eq("funnel_key", funnel);
          return q;
        })(),
        supabase.from("learning_insights").select("id,insight_title,insight_summary,category,recommended_level,source_count,approval_status,suggested_application,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
        (() => {
          let q = supabase.from("auto_fix_queue").select("id,problem_label,problem_class,severity,scope_label,metric_key,metric_value,metric_threshold,status,detected_at,funnel_key").neq("status", "resolved").order("priority_rank", { ascending: true }).limit(15);
          if (funnel !== "__all") q = q.eq("funnel_key", funnel);
          return q;
        })(),
        supabase.from("change_audit_log").select("change_id,module,change_type,reason,expected_impact,risk_level,reversible,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(20),
        (() => {
          let q = supabase.from("lifecycle_touchpoint_jobs").select("step_id,status,funnel_key").gte("created_at", since).limit(2000);
          if (funnel !== "__all") q = q.eq("funnel_key", funnel);
          return q;
        })(),
        supabase.from("level_message_jobs").select("phase,status").gte("created_at", since).limit(1000),
        (() => {
          let q = supabase.from("leads").select("id,email,phone,source,lead_score,stage,has_booking,setter_id,closer_id,outcome,deal_value,payment_status,no_show_flag,total_calls_attended,appointment_date").gte("created_at", since).limit(2000);
          // L6 scope: only leads assigned to this operator's unit
          if (level < 8 && !(isAdmin || isOwner) && profile?.id) {
            q = q.or(`setter_id.eq.${profile.id},closer_id.eq.${profile.id}`);
          }
          return q;
        })(),
      ]);

      if (cancelled) return;

      // ── Revenue Intelligence KPIs ───────────────────────────────
      const leads = (leadsRes.data ?? []) as any[];
      const totalLeads = leads.length;
      const booked = leads.filter((l: any) => l.has_booking).length;
      const shows = leads.filter((l: any) => (l.total_calls_attended ?? 0) > 0).length;
      const noShows = leads.filter((l: any) => l.no_show_flag).length;
      const closed = leads.filter((l: any) => l.outcome === "won" || l.payment_status === "paid").length;
      const revenue = leads.filter((l: any) => l.outcome === "won" || l.payment_status === "paid").reduce((s: number, l: any) => s + ((l.deal_value ?? 0) * 100), 0);
      const showRate = booked > 0 ? (shows / booked) * 100 : 0;
      const closeRate = shows > 0 ? (closed / shows) * 100 : 0;
      setRevenueKpis({ totalLeads, booked, shows, noShows, closed, revenue, showRate, closeRate });

      // ── Data Quality ────────────────────────────────────────────
      const dqFields: Array<{ field: string; label: string; check: (l: any) => boolean }> = [
        { field: "email", label: "E-Mail", check: (l) => !!l.email },
        { field: "phone", label: t("Telefon", "Phone"), check: (l) => !!l.phone },
        { field: "source", label: "Source", check: (l) => !!l.source },
        { field: "lead_score", label: "Lead Score", check: (l) => l.lead_score != null },
        { field: "setter_id", label: "Setter", check: (l) => !!l.setter_id },
        { field: "closer_id", label: "Closer", check: (l) => !!l.closer_id },
        { field: "stage", label: "Stage", check: (l) => !!l.stage && l.stage !== "lead" },
        { field: "appointment_date", label: t("Termin", "Appointment"), check: (l) => !!l.appointment_date },
      ];
      const dq: DataQualityMetric[] = dqFields.map(({ field, label, check }) => {
        const filled = leads.filter(check).length;
        const p = totalLeads > 0 ? (filled / totalLeads) * 100 : 0;
        return {
          field,
          label,
          total: totalLeads,
          filled,
          pct: p,
          severity: p >= 80 ? "good" : p >= 50 ? "warning" : "critical",
        };
      });
      setDataQuality(dq);

      // ── Touchpoints ─────────────────────────────────────────────
      const REVENUE_STEPS: Array<{ key: string; label: string; matcher: (s: string) => boolean }> = [
        { key: "first_visit", label: t("Erstbesuch", "First visit"), matcher: (s) => s.includes("visit") || s.includes("landing") },
        { key: "quiz_start", label: t("Quiz Start", "Quiz start"), matcher: (s) => s.includes("quiz_start") },
        { key: "quiz_complete", label: t("Quiz Ende", "Quiz complete"), matcher: (s) => s.includes("quiz_complete") || s.includes("qualified") },
        { key: "booking", label: t("Buchung", "Booking"), matcher: (s) => s.includes("book") },
        { key: "reminder", label: t("Reminder", "Reminder"), matcher: (s) => s.includes("remind") || s.includes("attendance") },
        { key: "setter_call", label: t("Setter Call", "Setter call"), matcher: (s) => s.includes("setter") },
        { key: "showing", label: t("Showing", "Showing"), matcher: (s) => s.includes("show") },
        { key: "closer_call", label: t("Closer Call", "Closer call"), matcher: (s) => s.includes("closer") || s.includes("close") },
      ];
      const TALENT_STEPS: Array<{ key: string; label: string; matcher: (s: string) => boolean }> = [
        { key: "onboarding", label: t("Onboarding", "Onboarding"), matcher: (s) => s.includes("onboard") || s.includes("welcome") || s === "L1" },
        { key: "level_start", label: t("Level Start", "Level start"), matcher: (s) => s.startsWith("L") || s.includes("level") },
        { key: "mentoring", label: t("Mentoring", "Mentoring"), matcher: (s) => s.includes("mentor") },
        { key: "feedback", label: t("Feedback", "Feedback"), matcher: (s) => s.includes("feedback") || s.includes("review") },
        { key: "promotion", label: t("Promotion", "Promotion"), matcher: (s) => s.includes("promote") || s.includes("promotion") },
        { key: "intervention", label: t("Intervention", "Intervention"), matcher: (s) => s.includes("intervene") || s.includes("recovery") },
      ];

      const lifeArr = (lifeRes.data ?? []) as any[];
      const levelArr = (levelRes.data ?? []) as any[];

      const revenueNodes: TouchpointNode[] = REVENUE_STEPS.map((s) => {
        const count = lifeArr.filter((r) => s.matcher(String(r.step_id ?? "").toLowerCase())).length;
        return { key: s.key, label: s.label, side: "revenue", count, impact: count > 100 ? "high" : count > 20 ? "medium" : "low" };
      });
      const talentNodes: TouchpointNode[] = TALENT_STEPS.map((s) => {
        const count = levelArr.filter((r) => s.matcher(String(r.phase ?? "").toLowerCase())).length;
        return { key: s.key, label: s.label, side: "talent", count, impact: count > 50 ? "high" : count > 10 ? "medium" : "low" };
      });
      setTouchpoints([...revenueNodes, ...talentNodes]);

      // ── Channels ────────────────────────────────────────────────
      const send = (sendRes.data ?? []) as any[];
      const perf = (perfRes.data ?? []) as any[];
      const channelKeys: ChannelKey[] = ["whatsapp", "sms", "email", "push", "voice"];
      const stats: ChannelStats[] = channelKeys.map((c) => {
        const sentRows = send.filter((r) => String(r.channel ?? "").toLowerCase() === c);
        const delivered = sentRows.filter((r) => ["sent", "delivered"].includes(String(r.status ?? "").toLowerCase())).length;
        const sentCount = sentRows.length;
        const events = perf.filter((r) => String(r.channel ?? "").toLowerCase() === c);
        const opened = events.filter((r) => String(r.event_type ?? "").toLowerCase() === "opened").length;
        const responded = events.filter((r) => ["responded", "replied", "clicked"].includes(String(r.event_type ?? "").toLowerCase())).length;
        const converted = events.filter((r) => String(r.event_type ?? "").toLowerCase() === "converted").length;
        const openR = pct(opened, Math.max(delivered, sentCount));
        const respR = pct(responded, Math.max(delivered, sentCount));
        const convR = pct(converted, Math.max(delivered, sentCount));
        const effectiveness = Math.round(Math.min(100, openR * 0.2 + respR * 0.4 + convR * 0.4));
        return { channel: c, sent: sentCount, delivered, opened, responded, converted, effectiveness };
      });
      setChannels(stats);

      // ── AI decisions ────────────────────────────────────────────
      setDecisions(((nbaRes.data ?? []) as any[]).map((d) => ({ ...d, category: categorize(String(d.action ?? "")) })));
      setInsights((insightRes.data ?? []) as InsightRow[]);
      setFixes((fixRes.data ?? []) as FixRow[]);
      setChanges((changeRes.data ?? []) as ChangeRow[]);

      // ── Operator data ───────────────────────────────────────────
      const rpcArgs: Record<string, any> = { p_range_days: rangeDays };
      if (funnel && funnel !== "__all") rpcArgs.p_funnel = funnel;
      if (level < 8 && !(isAdmin || isOwner) && profile?.id) rpcArgs.p_user_id = profile.id;
      const { data: scoreData } = await supabase.rpc("compute_talent_scores", rpcArgs);
      if (!cancelled) setOperatorData((scoreData as unknown as OperatorData[]) ?? []);

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [allowed, range, funnel, reloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ─────────────────────────────────────────────────────────────
  const bestChannel = useMemo(
    () => channels.slice().sort((a, b) => b.effectiveness - a.effectiveness)[0],
    [channels],
  );
  const totals = useMemo(() => {
    const totalMessages = channels.reduce((s, c) => s + c.sent, 0);
    const totalDecisions = decisions.length;
    const approved = decisions.filter((d) => d.status === "approved").length;
    const aiSuccessRate = pct(approved, Math.max(1, totalDecisions));
    const openExperiments = insights.filter((i) => i.approval_status === "pending").length;
    const openFixes = fixes.length;
    return { totalMessages, totalDecisions, aiSuccessRate, openExperiments, openFixes };
  }, [channels, decisions, insights, fixes]);

  const dqScore = useMemo(() => {
    if (dataQuality.length === 0) return 0;
    return dataQuality.reduce((s, d) => s + d.pct, 0) / dataQuality.length;
  }, [dataQuality]);

  // Revenue decisions / talent decisions split
  const revenueDecisions = useMemo(() => decisions.filter((d) => d.category === "revenue"), [decisions]);
  const talentDecisions = useMemo(() => decisions.filter((d) => d.category === "talent"), [decisions]);

  useEffect(() => {
    if (fixes.some((f) => f.severity === "critical")) playCue("bottleneck");
  }, [fixes]);

  if (!allowed) return <AccessDenied />;

  const rangeLabel = range === "24h" ? "24h" : `${RANGE_DAYS[range]}d`;

  return (
    <div data-ci-theme="exec-dark" className={nested ? "" : "min-h-screen"}>
      <div className="mx-auto max-w-[1400px] space-y-8 p-6 lg:p-10">
        {/* Header */}
        <header className={`space-y-3 ${nested ? "" : "border-b border-white/5 pb-6"}`}>
          {!nested && (
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--ci-fg-dim)]">
              ETC OS · Visualization Layer · Layer 47
            </p>
          )}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl font-light tracking-tight text-[color:var(--ci-fg)]">
                Intelligence Control™
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-[color:var(--ci-fg-muted)]">
                {t(
                  "Revenue · Talent · Kommunikation · Datenqualität — alle Signale auf einen Blick.",
                  "Revenue · Talent · Communication · Data Quality — all signals at a glance.",
                )}
              </p>
            </div>
            {nested ? (
              <div className="flex items-center gap-2">
                <CrossNavCta variant="to_revenue" />
                <CrossNavCta variant="to_talent" />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">
                  {t("Funnel", "Funnel")}
                </span>
                <Select value={funnel} onValueChange={setFunnel}>
                  <SelectTrigger className="h-9 w-[200px] border-white/10 bg-white/5 text-[color:var(--ci-fg)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">{t("Alle Funnels", "All funnels")}</SelectItem>
                    {funnels.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                  <SelectTrigger className="h-9 w-[120px] border-white/10 bg-white/5 text-[color:var(--ci-fg)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">{t("7 Tage", "7 days")}</SelectItem>
                    <SelectItem value="30d">{t("30 Tage", "30 days")}</SelectItem>
                    <SelectItem value="90d">{t("90 Tage", "90 days")}</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="gap-1.5 border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Live
                </Badge>
              </div>
            )}
          </div>
        </header>

        {/* Operator Canon + Performance + Ranking */}
        <OperatorCanonPanel />
        <OperatorPerformanceCards />
        <OperatorRankingSystem
          data={operatorData}
          effectiveLevel={level}
          lang={lang}
          rangeDays={RANGE_DAYS[range]}
        />

        {loading ? (
          timedOut ? (
            <LoadingTimeoutFallback onRetry={() => setReloadTick(tick => tick + 1)} />
          ) : (
            <div className="flex h-[60vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ci-fg-muted)]" />
            </div>
          )
        ) : (
          <>
            {/* ════════════════════════════════════════════════════════════
             * SECTION 1 — REVENUE INTELLIGENCE
             * ════════════════════════════════════════════════════════════ */}
            <Section
              icon={<Coins className="h-4 w-4" />}
              title={t("Revenue Intelligence", "Revenue Intelligence")}
              hint={
                <span className="text-[11px] text-[color:var(--ci-fg-muted)]">
                  {rangeLabel} · {revenueKpis?.totalLeads ?? 0} Leads
                </span>
              }
            >
              {/* Revenue KPI Strip */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <KpiTile icon={<Users className="h-3.5 w-3.5" />} label={t("Leads", "Leads")} value={fmt(revenueKpis?.totalLeads ?? 0)} />
                <KpiTile icon={<Activity className="h-3.5 w-3.5" />} label={t("Show Rate", "Show Rate")} value={fmtPct(revenueKpis?.showRate ?? 0, 1)} tone={(revenueKpis?.showRate ?? 0) >= 60 ? "pos" : (revenueKpis?.showRate ?? 0) >= 40 ? "neutral" : "neg"} />
                <KpiTile icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={t("Close Rate", "Close Rate")} value={fmtPct(revenueKpis?.closeRate ?? 0, 1)} tone={(revenueKpis?.closeRate ?? 0) >= 20 ? "pos" : (revenueKpis?.closeRate ?? 0) >= 10 ? "neutral" : "neg"} />
                <KpiTile icon={<Coins className="h-3.5 w-3.5" />} label="Revenue" value={formatEur((revenueKpis?.revenue ?? 0))} tone={(revenueKpis?.revenue ?? 0) > 0 ? "pos" : "neutral"} />
              </div>

              {/* Revenue-side AI decisions */}
              <Card className="ci-card overflow-hidden mt-3">
                <div className="px-4 py-2 border-b border-white/5">
                  <span className="text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">
                    {t("KI-Entscheidungen (Revenue)", "AI Decisions (Revenue)")} · {revenueDecisions.length}
                  </span>
                </div>
                {revenueDecisions.length === 0 ? (
                  <EmptyRow text={t("Keine Revenue-Entscheidungen im Zeitraum.", "No revenue decisions in this range.")} />
                ) : (
                  <div className="divide-y divide-white/5">
                    {revenueDecisions.slice(0, 6).map((d) => (
                      <DecisionRow key={d.id} d={d} t={t} />
                    ))}
                  </div>
                )}
              </Card>

              {/* Fix Queue (revenue-focused) */}
              {fixes.length > 0 && (
                <Card className="ci-card overflow-hidden mt-3">
                  <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-[color:var(--ci-fg-muted)]" />
                    <span className="text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">Fix Queue · {fixes.length}</span>
                    {fixes.some((f) => f.severity === "critical") && (
                      <Badge className="border-rose-400/30 bg-rose-400/10 text-rose-300 text-[9px]">{t("Kritisch", "Critical")}</Badge>
                    )}
                  </div>
                  <div className="divide-y divide-white/5">
                    {fixes.map((f) => <FixRowItem key={f.id} f={f} t={t} />)}
                  </div>
                </Card>
              )}
            </Section>

            {/* ════════════════════════════════════════════════════════════
             * SECTION 2 — TALENT INTELLIGENCE
             * ════════════════════════════════════════════════════════════ */}
            <Section
              icon={<Brain className="h-4 w-4" />}
              title={t("Talent Intelligence", "Talent Intelligence")}
              hint={
                <span className="text-[11px] text-[color:var(--ci-fg-muted)]">
                  {operatorData.length} {t("Operatoren", "Operators")}
                </span>
              }
            >
              {/* Talent-side AI decisions */}
              <Card className="ci-card overflow-hidden">
                <div className="px-4 py-2 border-b border-white/5">
                  <span className="text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">
                    {t("KI-Entscheidungen (Talent)", "AI Decisions (Talent)")} · {talentDecisions.length}
                  </span>
                </div>
                {talentDecisions.length === 0 ? (
                  <EmptyRow text={t("Keine Talent-Entscheidungen im Zeitraum.", "No talent decisions in this range.")} />
                ) : (
                  <div className="divide-y divide-white/5">
                    {talentDecisions.slice(0, 6).map((d) => (
                      <DecisionRow key={d.id} d={d} t={t} />
                    ))}
                  </div>
                )}
              </Card>

              {/* Learning & Optimization */}
              <div className="grid gap-3 md:grid-cols-2 mt-3">
                {insights.length === 0 ? (
                  <Card className="ci-card md:col-span-2">
                    <EmptyRow text={t("Noch keine Insights generiert.", "No insights generated yet.")} />
                  </Card>
                ) : (
                  insights.slice(0, 6).map((i) => <InsightCard key={i.id} insight={i} t={t} />)
                )}
              </div>
            </Section>

            {/* ════════════════════════════════════════════════════════════
             * SECTION 3 — COMMUNICATION INTELLIGENCE
             * ════════════════════════════════════════════════════════════ */}
            <Section
              icon={<MessageSquare className="h-4 w-4" />}
              title={t("Communication Intelligence", "Communication Intelligence")}
              hint={
                bestChannel ? (
                  <span className="text-[11px] text-[color:var(--ci-fg-muted)]">
                    ★ {t("Bester Kanal", "Best channel")}:{" "}
                    <span className="text-[color:var(--ci-accent)]">{bestChannel.channel.toUpperCase()}</span>
                  </span>
                ) : null
              }
            >
              {/* KPI row */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <KpiTile icon={<MessageSquare className="h-3.5 w-3.5" />} label={t("Nachrichten", "Messages")} value={fmt(totals.totalMessages)} />
                <KpiTile icon={<Zap className="h-3.5 w-3.5" />} label={t("KI Erfolgsrate", "AI Success Rate")} value={fmtPct(totals.aiSuccessRate, 0)} tone={totals.aiSuccessRate >= 60 ? "pos" : totals.aiSuccessRate >= 30 ? "neutral" : "neg"} />
                <KpiTile icon={<Sparkles className="h-3.5 w-3.5" />} label={t("Offene Experimente", "Open Experiments")} value={fmt(totals.openExperiments)} />
              </div>

              {/* Channel cards */}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5 mt-3">
                {channels.map((c) => (
                  <ChannelCard key={c.channel} stats={c} isBest={bestChannel?.channel === c.channel} />
                ))}
              </div>

              {/* Touchpoint Map */}
              <div className="grid gap-4 md:grid-cols-2 mt-3">
                <TouchpointFlow
                  side="revenue"
                  title={t("Revenue Touchpoints", "Revenue Touchpoints")}
                  nodes={touchpoints.filter((n) => n.side === "revenue")}
                />
                <TouchpointFlow
                  side="talent"
                  title={t("Talent Touchpoints", "Talent Touchpoints")}
                  nodes={touchpoints.filter((n) => n.side === "talent")}
                />
              </div>

              {/* Communication Audit */}
              <CommunicationAuditPanel />
            </Section>

            {/* ════════════════════════════════════════════════════════════
             * SECTION 4 — DATA QUALITY INTELLIGENCE
             * ════════════════════════════════════════════════════════════ */}
            <Section
              icon={<Database className="h-4 w-4" />}
              title={t("Data Quality Intelligence", "Data Quality Intelligence")}
              hint={
                <Badge
                  variant="outline"
                  className={
                    dqScore >= 80
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : dqScore >= 50
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                      : "border-rose-400/30 bg-rose-400/10 text-rose-300"
                  }
                >
                  {t("Score", "Score")}: {fmtPct(dqScore, 0)}
                </Badge>
              }
            >
              {/* Overall DQ bar */}
              <Card className="ci-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-wider text-[color:var(--ci-fg-muted)]">
                    {t("Gesamtabdeckung", "Overall Coverage")} · {revenueKpis?.totalLeads ?? 0} Leads · {rangeLabel}
                  </span>
                  <span className={`font-serif text-lg font-light ${dqScore >= 80 ? "text-emerald-300" : dqScore >= 50 ? "text-amber-300" : "text-rose-300"}`}>
                    {fmtPct(dqScore, 0)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${dqScore}%`,
                      background: dqScore >= 80 ? "var(--ci-pos)" : dqScore >= 50 ? "var(--ci-warn)" : "var(--ci-neg)",
                    }}
                  />
                </div>
              </Card>

              {/* Per-field breakdown */}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 mt-3">
                {dataQuality.map((dq) => (
                  <Card key={dq.field} className="ci-card p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-[color:var(--ci-fg)]">{dq.label}</span>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          dq.severity === "good" ? "bg-emerald-400" : dq.severity === "warning" ? "bg-amber-400" : "bg-rose-400"
                        }`}
                      />
                    </div>
                    <div className="mt-2 font-serif text-xl font-light text-[color:var(--ci-fg)]">{fmtPct(dq.pct, 0)}</div>
                    <div className="text-[10px] text-[color:var(--ci-fg-dim)] tabular-nums mt-0.5">
                      {fmt(dq.filled)} / {fmt(dq.total)}
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${dq.pct}%`,
                          background: dq.severity === "good" ? "var(--ci-pos)" : dq.severity === "warning" ? "var(--ci-warn)" : "var(--ci-neg)",
                        }}
                      />
                    </div>
                  </Card>
                ))}
              </div>

              {/* DQ alerts */}
              {dataQuality.filter((d) => d.severity === "critical").length > 0 && (
                <Card className="ci-card p-4 mt-3 border-rose-500/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[color:var(--ci-fg)]">
                        {t("Kritische Datenlücken erkannt", "Critical data gaps detected")}
                      </div>
                      <div className="text-xs text-[color:var(--ci-fg-muted)] mt-1">
                        {dataQuality
                          .filter((d) => d.severity === "critical")
                          .map((d) => `${d.label} (${fmtPct(d.pct, 0)})`)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </Section>

            {/* ── Change History ──────────────────────────────────────── */}
            <Section icon={<History className="h-4 w-4" />} title={t("Change History", "Change History")}>
              <Card className="ci-card overflow-hidden">
                {changes.length === 0 ? (
                  <EmptyRow text={t("Keine Änderungen im Zeitraum.", "No changes in this range.")} />
                ) : (
                  <div className="divide-y divide-white/5">
                    {changes.slice(0, 10).map((c) => (
                      <ChangeRowItem key={c.change_id} c={c} t={t} />
                    ))}
                  </div>
                )}
              </Card>
            </Section>

            <div className="pt-4 text-center text-[10px] uppercase tracking-[0.18em] text-[color:var(--ci-fg-dim)]">
              {t(
                "Verbunden mit Revenue Flow Map™ · Talent Flow Map™",
                "Connected to Revenue Flow Map™ · Talent Flow Map™",
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub components ─────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[color:var(--ci-fg-muted)]">{icon}</span>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--ci-fg)]">{title}</h2>
        </div>
        {hint}
      </div>
      {children}
    </section>
  );
}

function KpiTile({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "pos" | "neg" | "warn";
}) {
  const toneColor =
    tone === "pos"
      ? "text-emerald-300"
      : tone === "neg"
      ? "text-rose-300"
      : tone === "warn"
      ? "text-amber-300"
      : "text-[color:var(--ci-fg)]";
  return (
    <Card className="ci-card p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-muted)]">
        {icon}
        {label}
      </div>
      <div className={`mt-2 font-serif text-2xl font-light ${toneColor}`}>{value}</div>
    </Card>
  );
}

function TouchpointFlow({
  side,
  title,
  nodes,
}: {
  side: "revenue" | "talent";
  title: string;
  nodes: TouchpointNode[];
}) {
  const accent = side === "revenue" ? "var(--ci-info)" : "var(--ci-accent)";
  return (
    <Card className="ci-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--ci-fg)]">{title}</p>
        <span className="h-1.5 w-8 rounded-full" style={{ background: accent }} />
      </div>
      <div className="space-y-1.5">
        {nodes.map((n, idx) => {
          const intensity = n.impact === "high" ? 0.85 : n.impact === "medium" ? 0.5 : 0.2;
          return (
            <div
              key={n.key}
              className="group flex items-center gap-3 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 transition-colors hover:border-white/15"
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-[color:var(--ci-fg-dim)]"
                style={{ background: `color-mix(in srgb, ${accent} ${intensity * 100}%, transparent)` }}
              >
                {idx + 1}
              </span>
              <span className="flex-1 text-sm text-[color:var(--ci-fg)]">{n.label}</span>
              <span className="text-xs font-mono text-[color:var(--ci-fg-muted)]">{fmt(n.count)}</span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    n.impact === "high" ? "var(--ci-pos)" : n.impact === "medium" ? "var(--ci-warn)" : "var(--ci-fg-dim)",
                }}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ChannelCard({ stats, isBest }: { stats: ChannelStats; isBest: boolean }) {
  const openR = pct(stats.opened, Math.max(stats.delivered, stats.sent));
  const respR = pct(stats.responded, Math.max(stats.delivered, stats.sent));
  return (
    <Card className={`ci-card p-4 ${isBest ? "ci-card-glow" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--ci-fg)]">
          {stats.channel}
        </span>
        {isBest && <span className="text-[10px] text-[color:var(--ci-accent)]">★ {`${stats.effectiveness}`}</span>}
      </div>
      <div className="mt-2 font-mono text-xl text-[color:var(--ci-fg)]">{fmt(stats.sent)}</div>
      <div className="text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">sent</div>
      <div className="mt-3 space-y-1 text-[11px]">
        <Stat row label="open" value={fmtPct(openR, 0)} />
        <Stat row label="reply" value={fmtPct(respR, 0)} />
        <Stat row label="conv" value={fmt(stats.converted)} />
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full"
          style={{
            width: `${stats.effectiveness}%`,
            background:
              stats.effectiveness >= 60
                ? "var(--ci-pos)"
                : stats.effectiveness >= 30
                ? "var(--ci-warn)"
                : "var(--ci-neg)",
          }}
        />
      </div>
    </Card>
  );
}

function Stat({ label, value, row = false }: { label: string; value: string; row?: boolean }) {
  return (
    <div className={row ? "flex justify-between" : ""}>
      <span className="text-[color:var(--ci-fg-dim)]">{label}</span>
      <span className="font-mono text-[color:var(--ci-fg)]">{value}</span>
    </div>
  );
}

function DecisionRow({ d, t }: { d: AiDecisionRow; t: (de: string, en: string) => string }) {
  const statusTone =
    d.status === "approved"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : d.status === "skipped"
      ? "border-white/10 bg-white/5 text-[color:var(--ci-fg-dim)]"
      : "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-[color:var(--ci-fg)]">
          <span className="font-medium">{d.action.replace(/_/g, " ")}</span>
          {d.funnel_key && <span className="text-xs text-[color:var(--ci-fg-dim)]">· {d.funnel_key}</span>}
        </div>
        {d.reason && <p className="truncate text-xs text-[color:var(--ci-fg-muted)]">{d.reason}</p>}
      </div>
      <span className="font-mono text-xs text-[color:var(--ci-fg-muted)]">
        {Math.round((d.confidence ?? 0) * 100)}%
      </span>
      <Badge variant="outline" className={`text-[10px] ${statusTone}`}>
        {d.status ?? "pending"}
      </Badge>
    </div>
  );
}

function InsightCard({ insight, t }: { insight: InsightRow; t: (de: string, en: string) => string }) {
  return (
    <Card className="ci-card p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
        <Badge variant="outline" className="border-white/10 bg-white/5 text-[color:var(--ci-fg-muted)]">
          {insight.category ?? "insight"}
        </Badge>
        {insight.recommended_level && (
          <Badge variant="outline" className="border-white/10 bg-white/5 text-[color:var(--ci-fg-muted)]">
            L{insight.recommended_level}+
          </Badge>
        )}
        <Badge
          className={
            insight.approval_status === "published"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-amber-400/30 bg-amber-400/10 text-amber-300"
          }
        >
          {insight.approval_status}
        </Badge>
      </div>
      <p className="mt-2 text-sm font-medium text-[color:var(--ci-fg)]">{insight.insight_title}</p>
      {insight.insight_summary && (
        <p className="mt-1 text-xs text-[color:var(--ci-fg-muted)]">{insight.insight_summary}</p>
      )}
      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">
        <span>{insight.source_count ?? 0} {t("Quellen", "samples")}</span>
        {insight.suggested_application && <span>→ {insight.suggested_application}</span>}
      </div>
    </Card>
  );
}

function FixRowItem({ f, t }: { f: FixRow; t: (de: string, en: string) => string }) {
  const sevTone =
    f.severity === "critical"
      ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
      : f.severity === "high"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : "border-white/10 bg-white/5 text-[color:var(--ci-fg-muted)]";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Badge variant="outline" className={`text-[10px] ${sevTone}`}>
        {f.severity ?? "info"}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-[color:var(--ci-fg)]">{f.problem_label ?? f.problem_class}</div>
        <div className="text-xs text-[color:var(--ci-fg-muted)]">
          {f.scope_label ?? "—"}
          {f.metric_key && ` · ${f.metric_key}`}
          {f.metric_value != null && f.metric_threshold != null && (
            <>
              {" "}· {Number(f.metric_value).toFixed(2)} / {Number(f.metric_threshold).toFixed(2)}
            </>
          )}
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 text-[color:var(--ci-fg-muted)]">
        {f.status ?? "open"}
      </Badge>
    </div>
  );
}

function ChangeRowItem({ c, t }: { c: ChangeRow; t: (de: string, en: string) => string }) {
  const riskTone =
    c.risk_level === "high"
      ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
      : c.risk_level === "medium"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : "border-white/10 bg-white/5 text-[color:var(--ci-fg-muted)]";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <GitBranch className="h-3.5 w-3.5 text-[color:var(--ci-fg-dim)]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-[color:var(--ci-fg)]">
          <span className="font-medium">{c.module ?? "system"}</span>
          <span className="text-xs text-[color:var(--ci-fg-dim)]">· {c.change_type}</span>
        </div>
        {c.reason && <p className="truncate text-xs text-[color:var(--ci-fg-muted)]">{c.reason}</p>}
        {c.expected_impact && (
          <p className="truncate text-[11px] text-[color:var(--ci-fg-dim)]">→ {c.expected_impact}</p>
        )}
      </div>
      <span className="text-[10px] text-[color:var(--ci-fg-dim)]">
        {new Date(c.created_at).toLocaleDateString()}
      </span>
      <Badge variant="outline" className={`text-[10px] ${riskTone}`}>
        {c.risk_level ?? "low"}
      </Badge>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-4 py-6 text-center text-sm text-[color:var(--ci-fg-muted)]">{text}</div>;
}
