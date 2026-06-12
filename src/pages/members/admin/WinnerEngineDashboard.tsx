/**
 * /members/admin/winner-engine — Canonical Experiment Engine dashboard (UX v3)
 *
 * READ-ONLY CRO Command Center. Keine Mutation. Keine Funnel-/Tracking-/
 * Rollup-/Confidence-/Attribution-Logik berührt.
 *
 * Ziel v3: 80–90% weniger Scrollhöhe bei identischer Datenbasis.
 *  • Executive Summary: Funnel-Rates + Health Score (0-100, Ampel)
 *  • Top Winners (Top 5 als kompakte Karten – keine Tabellen)
 *  • Top Impact Panel ("Größter Hebel aktuell")
 *  • Needs Data / Attention Required
 *  • Experiment Explorer: Suche + Filter-Chips
 *  • Akkordeon: ALLE Slots eingeklappt by default
 *  • Auto-Hide für Low-Signal Slots (Toggle "Low Signal anzeigen")
 *  • Audit/Confidence/Coverage Panels hinter Toggle → kein Auto-Scroll-Müll
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import AccessDenied from "@/components/members/AccessDenied";
import { useUserLevel } from "@/hooks/useUserLevel";
import {
  Loader2, RefreshCw, Trophy, PauseCircle, AlertTriangle, ChevronDown, ChevronRight,
  Search, TrendingUp, Database, AlertCircle, CheckCircle2, Activity, Zap, EyeOff, Eye,
} from "lucide-react";
import ExperimentAuditPanels from "@/components/admin/ExperimentAuditPanels";
import ConfidenceEnginePanels from "@/components/admin/ConfidenceEnginePanels";
import AbSlotsCoveragePanel from "@/components/admin/AbSlotsCoveragePanel";
import LpV2ComparisonPanel from "@/components/admin/LpV2ComparisonPanel";
import CloserKarriereWinnerSection from "@/components/admin/CloserKarriereWinnerSection";

interface WeightRow {
  slot: string;
  variant: string;
  weight: number;
  paused: boolean;
  is_winner: boolean;
  exposures: number;
  conversions: number;
  conversion_rate: number;
  wilson_lower: number;
  score: number;
  lead_count: number;
  booking_count: number;
  hql_count: number;
  quiz_completed_count: number;
  quiz_started_count: number;
  confidence: number;
  confidence_level: string;
  winner_status: string;
  experiment_health: number;
  updated_at: string;
}

type Category = "hero" | "cta" | "trust" | "quiz" | "booking" | "identity" | "progress" | "other";
type FilterKey = "all" | "hero" | "cta" | "trust" | "quiz" | "booking" | "identity" | "progress";

function fmt(n: number) { return n.toLocaleString(); }
function pctNum(n: number, d: number) { return d > 0 ? (n / d) * 100 : 0; }
function pct(n: number, d: number) { return d ? `${pctNum(n, d).toFixed(1)}%` : "—"; }

function categorize(slot: string): Category {
  const s = slot.toLowerCase();
  if (s.includes("hero")) return "hero";
  if (s.includes("cta") || s.includes("button")) return "cta";
  if (s.includes("trust") || s.includes("proof") || s.includes("social")) return "trust";
  if (s.includes("quiz") || s.startsWith("apply_")) return "quiz";
  if (s.includes("booking") || s.includes("calendly") || s.includes("calendar")) return "booking";
  if (s.includes("identity") || s.includes("persona")) return "identity";
  if (s.includes("progress") || s.includes("step")) return "progress";
  return "other";
}

interface SlotAgg {
  slot: string;
  category: Category;
  variants: WeightRow[];
  exposures: number;
  quiz_started: number;
  quiz_completed: number;
  leads: number;
  hql: number;
  bookings: number;
  best: WeightRow;
  control?: WeightRow;
  uplift: number; // % business-rate uplift winner vs control
  confidence: number;
  hasWinner: boolean;
  hasPaused: boolean;
  warnings: string[];
  businessRank: number;
}

function aggregateSlot(slot: string, variants: WeightRow[]): SlotAgg {
  const sum = (k: keyof WeightRow) => variants.reduce((a, v) => a + ((v[k] as number) || 0), 0);
  const exposures = sum("exposures");
  const leads = sum("lead_count");
  const hql = sum("hql_count");
  const bookings = sum("booking_count");
  const quiz_started = sum("quiz_started_count");
  const quiz_completed = sum("quiz_completed_count");
  const best = variants.reduce((a, b) => (b.score > a.score ? b : a));
  const control = variants.find((v) => !v.is_winner && v.variant !== best.variant);
  const businessRate = (v: WeightRow) =>
    v.exposures > 0 ? (v.booking_count * 12 + v.hql_count * 8 + v.lead_count * 4) / v.exposures : 0;
  const uplift = control && businessRate(control) > 0
    ? ((businessRate(best) - businessRate(control)) / businessRate(control)) * 100
    : 0;
  const hasWinner = variants.some((v) => v.is_winner);
  const hasPaused = variants.some((v) => v.paused);
  const totalWeight = variants.reduce((a, v) => a + (v.weight || 0), 0);
  const warnings: string[] = [];
  if (hasWinner && (best.confidence || 0) < 0.7) warnings.push("Winner Confidence <70%");
  variants.forEach((v) => {
    if (v.paused && v.weight > 0) warnings.push(`${v.variant}: paused mit Traffic`);
    if (!v.paused && v.weight === 0 && exposures > 0) warnings.push(`${v.variant}: aktiv mit 0% Weight`);
  });
  if (totalWeight > 1.01) warnings.push(`Weight ${(totalWeight * 100).toFixed(0)}% >100`);
  if (exposures > 200 && leads === 0 && bookings === 0 && hql === 0) warnings.push("Keine Business-Signale");
  const businessRank =
    bookings * 100000 + hql * 1000 + leads * 100 + quiz_completed * 10 + quiz_started + exposures / 1e6;
  return {
    slot, category: categorize(slot), variants,
    exposures, quiz_started, quiz_completed, leads, hql, bookings,
    best, control, uplift, confidence: best.confidence || 0,
    hasWinner, hasPaused, warnings, businessRank,
  };
}

/* ─────────────── UI atoms ─────────────── */

function MetricCard({ label, value, sub, tone }: {
  label: string; value: React.ReactNode; sub?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const color =
    tone === "good" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "warn" ? "text-amber-600 dark:text-amber-400" :
    tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <Card className="border-border/40">
      <CardContent className="p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
        {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function HealthRing({ score }: { score: number }) {
  const tone = score >= 80 ? "emerald" : score >= 60 ? "amber" : "rose";
  const ring = score >= 80 ? "ring-emerald-500" : score >= 60 ? "ring-amber-500" : "ring-rose-500";
  const text = score >= 80 ? "text-emerald-600 dark:text-emerald-400"
    : score >= 60 ? "text-amber-600 dark:text-amber-400" : "text-destructive";
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Watch" : "Critical";
  return (
    <Card className={`border-border/40 ring-2 ${ring}/30`}>
      <CardContent className="p-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Health Score</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${text}`}>{score}<span className="text-xs text-muted-foreground">/100</span></p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
        </div>
        <div className={`h-10 w-10 rounded-full bg-${tone}-500/15 flex items-center justify-center`}>
          <Activity className={`h-5 w-5 ${text}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function WinnerCard({ agg, rank }: { agg: SlotAgg; rank: number }) {
  const conf = Math.round(agg.confidence * 100);
  const confTone = conf >= 90 ? "good" : conf >= 70 ? "warn" : "bad";
  const upliftStr = agg.uplift !== 0 ? `${agg.uplift > 0 ? "+" : ""}${agg.uplift.toFixed(0)}%` : "—";
  return (
    <Card className="border-border/40 hover:border-primary/40 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-muted-foreground">#{rank}</span>
              <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
              <span className="font-mono text-[11px] truncate">{agg.slot}</span>
            </div>
            <p className="mt-1.5 truncate font-mono text-sm font-semibold">{agg.best.variant}</p>
          </div>
          <Badge className={
            confTone === "good" ? "bg-emerald-600" : confTone === "warn" ? "bg-amber-500" : "bg-rose-600"
          }>{conf}%</Badge>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
          <Mini label="Book" v={agg.bookings} accent />
          <Mini label="HQL" v={agg.hql} />
          <Mini label="Lead" v={agg.leads} />
          <Mini label="Weight" v={`${Math.round(agg.best.weight * 100)}%`} />
        </div>
        {upliftStr !== "—" && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Uplift vs. Control: <span className={agg.uplift > 0 ? "text-emerald-600 font-semibold" : "text-destructive"}>{upliftStr}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Mini({ label, v, accent }: { label: string; v: number | string; accent?: boolean }) {
  return (
    <div className="rounded bg-muted/40 px-1 py-1">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-xs tabular-nums ${accent ? "font-bold text-foreground" : "font-medium"}`}>{v}</p>
    </div>
  );
}

function VariantTable({ variants }: { variants: WeightRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1.5 pr-2">Variant</th>
            <th className="py-1.5 pr-2 text-right">Exp</th>
            <th className="py-1.5 pr-2 text-right">QS</th>
            <th className="py-1.5 pr-2 text-right">QC</th>
            <th className="py-1.5 pr-2 text-right">Lead</th>
            <th className="py-1.5 pr-2 text-right">HQL</th>
            <th className="py-1.5 pr-2 text-right">Book</th>
            <th className="py-1.5 pr-2 text-right">Score</th>
            <th className="py-1.5 pr-2 text-right">Conf</th>
            <th className="py-1.5 pr-2 text-right">Weight</th>
            <th className="py-1.5 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.variant} className={`border-b ${v.paused ? "opacity-40" : ""}`}>
              <td className="py-1.5 pr-2 font-mono">{v.variant}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{v.exposures}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{v.quiz_started_count}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{v.quiz_completed_count}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{v.lead_count}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{v.hql_count}</td>
              <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{v.booking_count}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{v.score.toFixed(3)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{Math.round((v.confidence || 0) * 100)}%</td>
              <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{Math.round(v.weight * 100)}%</td>
              <td className="py-1.5 text-right">
                {v.is_winner ? <Badge className="bg-amber-500 text-[10px]">Winner</Badge>
                  : v.paused ? <Badge variant="destructive" className="text-[10px]">Paused</Badge>
                  : <Badge variant="outline" className="text-[10px]">Active</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Accordion-Row: standardmäßig EINGEKLAPPT. */
function SlotRow({ agg }: { agg: SlotAgg }) {
  const [open, setOpen] = useState(false);
  const conf = Math.round(agg.confidence * 100);
  return (
    <Card className="border-border/40">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left hover:bg-muted/30 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="font-mono text-xs truncate">{agg.slot}</span>
                {agg.hasWinner && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                {agg.hasPaused && <PauseCircle className="h-3 w-3 text-destructive shrink-0" />}
                {agg.warnings.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums shrink-0">
                <span><span className="text-foreground font-medium">{agg.bookings}</span>bk</span>
                <span><span className="text-foreground font-medium">{agg.hql}</span>hql</span>
                <span><span className="text-foreground font-medium">{agg.leads}</span>lead</span>
                <span>{fmt(agg.exposures)}exp</span>
                <span className="hidden sm:inline">conf {conf}%</span>
                <span className="hidden sm:inline">w {Math.round(agg.best.weight * 100)}%</span>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-3 py-3">
            <VariantTable variants={agg.variants} />
            {agg.warnings.length > 0 && (
              <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
                <strong>Warnungen:</strong> {agg.warnings.join(" · ")}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/* ─────────────── Page ─────────────── */

export default function WinnerEngineDashboard() {
  const { level, loading: levelLoading } = useUserLevel();
  const [rows, setRows] = useState<WeightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showLowSignal, setShowLowSignal] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const load = async () => {
    setRefreshing(true);
    const { data } = await supabase.from("ab_slot_weights").select("*").order("slot");
    if (data) setRows(data as WeightRow[]);
    setLoading(false);
    setRefreshing(false);
  };
  useEffect(() => { void load(); }, []);

  const triggerRollup = async () => {
    setRefreshing(true);
    try { await supabase.functions.invoke("ab-winner-rollup"); } catch { /* noop */ }
    await load();
  };

  const slots: SlotAgg[] = useMemo(() => {
    const map = new Map<string, WeightRow[]>();
    for (const r of rows) {
      const arr = map.get(r.slot) ?? [];
      arr.push(r);
      map.set(r.slot, arr);
    }
    return Array.from(map.entries())
      .map(([slot, vs]) => aggregateSlot(slot, vs.sort((a, b) => b.score - a.score)))
      .sort((a, b) => b.businessRank - a.businessRank);
  }, [rows]);

  // Aggregate funnel
  const totals = useMemo(() => {
    const exposures = slots.reduce((a, s) => a + s.exposures, 0);
    const quiz_started = slots.reduce((a, s) => a + s.quiz_started, 0);
    const quiz_completed = slots.reduce((a, s) => a + s.quiz_completed, 0);
    const leads = slots.reduce((a, s) => a + s.leads, 0);
    const hql = slots.reduce((a, s) => a + s.hql, 0);
    const bookings = slots.reduce((a, s) => a + s.bookings, 0);
    return { exposures, quiz_started, quiz_completed, leads, hql, bookings };
  }, [slots]);

  // Health Score 0-100
  const health = useMemo(() => {
    if (slots.length === 0) return 0;
    const decidable = slots.filter((s) => s.exposures >= 100).length;
    const decidableShare = slots.length > 0 ? decidable / slots.length : 0;
    const winners = slots.filter((s) => s.hasWinner).length;
    const winnerShare = decidable > 0 ? winners / decidable : 0;
    const warnings = slots.filter((s) => s.warnings.length > 0).length;
    const warnPenalty = Math.min(0.4, warnings / Math.max(slots.length, 1));
    const businessShare = totals.exposures > 0 ? Math.min(1, (totals.leads + totals.bookings * 5) / Math.max(totals.exposures / 50, 1)) : 0;
    const raw = decidableShare * 35 + winnerShare * 25 + businessShare * 30 + (1 - warnPenalty) * 10;
    return Math.round(Math.max(0, Math.min(100, raw)));
  }, [slots, totals]);

  const topWinners = useMemo(
    () => slots.filter((s) => s.hasWinner || s.bookings > 0 || s.hql > 0 || s.leads > 0).slice(0, 5),
    [slots],
  );

  const topImpact = useMemo(() => {
    const candidates = slots.filter((s) => s.hasWinner && s.uplift > 0 && s.confidence >= 0.7 && s.control);
    return candidates.sort((a, b) => b.uplift * b.confidence - a.uplift * a.confidence)[0] ?? null;
  }, [slots]);

  const needsData = useMemo(
    () => slots.filter((s) => s.leads < 50 || s.confidence < 0.7).slice(0, 8),
    [slots],
  );

  const attention = useMemo(() => slots.filter((s) => s.warnings.length > 0).slice(0, 8), [slots]);

  const explorerSlots = useMemo(() => {
    const q = search.trim().toLowerCase();
    return slots.filter((s) => {
      if (q && !s.slot.toLowerCase().includes(q)) return false;
      if (filter !== "all" && s.category !== filter) return false;
      const isLow = s.leads === 0 && s.bookings === 0 && s.exposures < 250 && s.confidence < 0.6;
      if (isLow && !showLowSignal) return false;
      return true;
    });
  }, [slots, search, filter, showLowSignal]);

  const lowSignalCount = useMemo(() =>
    slots.filter((s) => s.leads === 0 && s.bookings === 0 && s.exposures < 250 && s.confidence < 0.6).length,
    [slots]);

  if (levelLoading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;
  if (level === null || level < 6) return <AccessDenied />;

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Alle" },
    { key: "hero", label: "Hero" },
    { key: "cta", label: "CTA" },
    { key: "trust", label: "Trust" },
    { key: "quiz", label: "Quiz" },
    { key: "booking", label: "Booking" },
    { key: "identity", label: "Identity" },
    { key: "progress", label: "Progress" },
  ];

  // Funnel rates
  const r_lp_quiz = pctNum(totals.quiz_started, totals.exposures);
  const r_quiz_comp = pctNum(totals.quiz_completed, totals.quiz_started);
  const r_comp_lead = pctNum(totals.leads, totals.quiz_completed);
  const r_lead_hql = pctNum(totals.hql, totals.leads);
  const r_hql_book = pctNum(totals.bookings, totals.hql);

  const tone = (v: number, good: number, warn: number): "good" | "warn" | "bad" =>
    v >= good ? "good" : v >= warn ? "warn" : "bad";

  return (
    <div className="container mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Winner Engine</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            CRO Command Center · Booking ×12 · HQL ×8 · Lead ×4 · QC ×2 · QS ×1 · <strong>CTR niemals</strong>
          </p>
        </div>
        <Button onClick={triggerRollup} disabled={refreshing} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Rollup
        </Button>
      </header>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>
      ) : (
        <>
          {/* ───── Executive Summary ───── */}
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            <HealthRing score={health} />
            <MetricCard label="LP→Quiz" value={`${r_lp_quiz.toFixed(1)}%`} sub={`${fmt(totals.quiz_started)} / ${fmt(totals.exposures)}`} tone={tone(r_lp_quiz, 25, 10)} />
            <MetricCard label="Quiz→Comp" value={`${r_quiz_comp.toFixed(1)}%`} sub={`${fmt(totals.quiz_completed)}`} tone={tone(r_quiz_comp, 60, 35)} />
            <MetricCard label="Comp→Lead" value={`${r_comp_lead.toFixed(1)}%`} sub={`${fmt(totals.leads)} Leads`} tone={tone(r_comp_lead, 50, 25)} />
            <MetricCard label="Lead→HQL" value={`${r_lead_hql.toFixed(1)}%`} sub={`${fmt(totals.hql)} HQL`} tone={tone(r_lead_hql, 30, 15)} />
            <MetricCard label="HQL→Book" value={`${r_hql_book.toFixed(1)}%`} sub={`${fmt(totals.bookings)} Bookings`} tone={tone(r_hql_book, 40, 20)} />
          </section>

          {/* ───── LP V1 vs LP V2 (dedicated comparison) ───── */}
          <LpV2ComparisonPanel />

          {/* ───── Closer Karriere LP (additive, read-only) ───── */}
          <CloserKarriereWinnerSection />




          {/* ───── Top Impact (Größter Hebel) ───── */}
          {topImpact && (
            <Card className="border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                    <Zap className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Größter Hebel aktuell</p>
                    <p className="mt-0.5 font-mono text-sm truncate">
                      {topImpact.slot} → <span className="font-bold">{topImpact.best.variant}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground">Uplift</p>
                    <p className="font-bold text-emerald-600">+{topImpact.uplift.toFixed(0)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground">Confidence</p>
                    <p className="font-bold">{Math.round(topImpact.confidence * 100)}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground">Leads</p>
                    <p className="font-bold tabular-nums">{topImpact.leads}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ───── Top Winners ───── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-amber-500" /> Top 5 Winners
              </h2>
              <span className="text-[10px] text-muted-foreground">sortiert: Booking → HQL → Lead → QC → QS</span>
            </div>
            {topWinners.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-xs text-muted-foreground">Noch keine Winner-Slots.</CardContent></Card>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {topWinners.map((s, i) => <WinnerCard key={s.slot} agg={s} rank={i + 1} />)}
              </div>
            )}
          </section>

          {/* ───── Needs Data + Attention ───── */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="border-border/40">
              <CardHeader className="py-2.5 px-3">
                <CardTitle className="flex items-center gap-1.5 text-xs"><Database className="h-3.5 w-3.5" /> Needs Data <span className="text-muted-foreground font-normal">({needsData.length})</span></CardTitle>
                <CardDescription className="text-[10px]">&lt;50 Leads ODER Confidence &lt;70%</CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                {needsData.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Alle Slots haben genug Daten.</p>
                ) : (
                  <ul className="space-y-0.5 text-[11px]">
                    {needsData.map((s) => (
                      <li key={s.slot} className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
                        <span className="font-mono truncate">{s.slot}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {s.leads}L · {Math.round(s.confidence * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/40">
              <CardHeader className="py-2.5 px-3">
                <CardTitle className="flex items-center gap-1.5 text-xs"><AlertCircle className="h-3.5 w-3.5 text-destructive" /> Attention Required <span className="text-muted-foreground font-normal">({attention.length})</span></CardTitle>
                <CardDescription className="text-[10px]">Coverage · Confidence · Attribution · Tracking</CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0">
                {attention.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Keine Warnungen.</p>
                ) : (
                  <ul className="space-y-0.5 text-[11px]">
                    {attention.map((s) => (
                      <li key={s.slot} className="border-b py-1 last:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono truncate">{s.slot}</span>
                          <Badge variant="destructive" className="text-[9px] h-4 px-1.5">{s.warnings.length}</Badge>
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground truncate">{s.warnings[0]}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ───── Experiment Explorer ───── */}
          <section className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Experiment Explorer <span className="text-muted-foreground/60 font-normal">({explorerSlots.length} / {slots.length})</span>
              </h2>
              {lowSignalCount > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setShowLowSignal((v) => !v)}>
                  {showLowSignal ? <><EyeOff className="mr-1.5 h-3 w-3" />Low Signal verstecken</> : <><Eye className="mr-1.5 h-3 w-3" />Low Signal anzeigen ({lowSignalCount})</>}
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Slot suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8 text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {filters.map((f) => (
                  <Button
                    key={f.key}
                    size="sm"
                    variant={filter === f.key ? "default" : "outline"}
                    onClick={() => setFilter(f.key)}
                    className="h-7 px-2 text-[11px]"
                  >{f.label}</Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              {explorerSlots.map((agg) => <SlotRow key={agg.slot} agg={agg} />)}
              {explorerSlots.length === 0 && (
                <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">
                  Keine Slots im Filter.
                </CardContent></Card>
              )}
            </div>
          </section>

          <p className="px-1 pt-2 text-[10px] text-muted-foreground">
            Reweighting: 50/50 → 60/40 → 70/30 → 80/20. Loser-Floor 20%. Auto-Pause bei ≥40% niedrigerer Business-Rate (mit ≥50 Leads oder ≥5 Bookings).
          </p>

          {/* ───── Audit / Confidence / Coverage (collapsed by default) ───── */}
          <div className="pt-4">
            <Button variant="outline" size="sm" onClick={() => setShowAudit((v) => !v)} className="w-full justify-between">
              <span className="flex items-center gap-2 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Audit · Confidence · Coverage</span>
              {showAudit ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
            {showAudit && (
              <div className="mt-3 space-y-4">
                <AbSlotsCoveragePanel />
                <ConfidenceEnginePanels />
                <ExperimentAuditPanels />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
