/**
 * Operator Ranking System™ — Decision Engine
 * ────────────────────────────────────────────
 * NOT a dashboard. A control system that answers:
 * "Where do I put the next €10,000?"
 *
 * OSS = 30% Rev/Lead + 25% Close Rate + 20% Show Rate + 15% Booking Rate + 10% Volume Stability
 * Status: Scale (≥75) / Hold (55-74) / Fix (40-54) / Kill (<40 OR close<10% OR 0 rev)
 */

import { useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  ChevronRight, TrendingUp, Pause, Wrench, XCircle,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Design Tokens ──────────────────────────────────────────────
const T = {
  bg: "#F8F5F0",
  card: "#FFFFFF",
  border: "#E8E2D9",
  ink: "#1A1A1A",
  secondary: "#6A6A6A",
  muted: "#9A9590",
  gold: "#C6A96B",
  goldLight: "#F5F0E6",
  danger: "#B04A3A",
  dangerLight: "#FDF2F0",
  success: "#7A9E7E",
  successLight: "#F2F7F3",
  orange: "#C87E3A",
  orangeLight: "#FDF6EE",
} as const;

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(Math.round(n || 0));
const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`;

// ─── Types ──────────────────────────────────────────────────────
export interface OperatorData {
  user_id: string;
  full_name: string;
  business_stage: string;
  level_num: number;
  operator_role: string;
  total_leads: number;
  total_bookings: number;
  total_shows: number;
  total_closes: number;
  total_revenue: number;
  booking_rate: number;
  show_rate: number;
  close_rate: number;
  revenue_per_lead: number;
  consistency_score: number;
  activity_score: number;
  talent_score: number;
  talent_category: string;
  primary_bottleneck: string;
  trend_7d: number;
  sparkline_data: number[];
  tenure_days: number;
}

type OssStatus = "scale" | "hold" | "fix" | "kill";

interface RankedOperator extends OperatorData {
  oss: number;
  ossStatus: OssStatus;
  ossBreakdown: { metric: string; weight: number; normalized: number; raw: number }[];
  budgetDelta: number;
  alerts: string[];
  constraint: "setter" | "closer" | "traffic" | "none";
}

// ─── OSS Calculation ────────────────────────────────────────────
function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function computeOSS(op: OperatorData, allOps: OperatorData[]): RankedOperator {
  // Compute normalization ranges from the cohort
  const revPerLeads = allOps.map(o => o.revenue_per_lead);
  const closeRates = allOps.map(o => o.close_rate);
  const showRates = allOps.map(o => o.show_rate);
  const bookingRates = allOps.map(o => o.booking_rate);

  const rplMin = Math.min(...revPerLeads, 0);
  const rplMax = Math.max(...revPerLeads, 1);
  const crMin = 0;
  const crMax = Math.max(...closeRates, 1);
  const srMin = 0;
  const srMax = Math.max(...showRates, 1);
  const brMin = 0;
  const brMax = Math.max(...bookingRates, 1);

  const nRevPerLead = normalize(op.revenue_per_lead, rplMin, rplMax);
  const nCloseRate = normalize(op.close_rate, crMin, crMax);
  const nShowRate = normalize(op.show_rate, srMin, srMax);
  const nBookingRate = normalize(op.booking_rate, brMin, brMax);
  const nVolStability = Math.min(100, op.consistency_score);

  const oss = Math.round(
    nRevPerLead * 0.30 +
    nCloseRate * 0.25 +
    nShowRate * 0.20 +
    nBookingRate * 0.15 +
    nVolStability * 0.10
  );

  const ossBreakdown = [
    { metric: "Rev / Lead", weight: 30, normalized: nRevPerLead, raw: op.revenue_per_lead },
    { metric: "Close Rate", weight: 25, normalized: nCloseRate, raw: op.close_rate },
    { metric: "Show Rate", weight: 20, normalized: nShowRate, raw: op.show_rate },
    { metric: "Booking Rate", weight: 15, normalized: nBookingRate, raw: op.booking_rate },
    { metric: "Volume Stability", weight: 10, normalized: nVolStability, raw: op.consistency_score },
  ];

  // Status engine
  const isKill = oss < 40 || op.close_rate < 10 || (op.total_revenue === 0 && op.total_leads >= 5);
  const isFix = !isKill && oss >= 40 && oss < 55;
  const isHold = !isKill && !isFix && oss >= 55 && oss < 75;
  const ossStatus: OssStatus = isKill ? "kill" : isFix ? "fix" : isHold ? "hold" : "scale";

  // Budget delta
  const budgetDelta = ossStatus === "scale" ? 30 : ossStatus === "hold" ? 0 : ossStatus === "fix" ? -20 : -100;

  // Constraint detection
  const constraint: RankedOperator["constraint"] =
    op.show_rate < 50 ? "setter" :
    op.close_rate < 15 ? "closer" :
    op.total_leads < 5 ? "traffic" : "none";

  // Alerts
  const alerts: string[] = [];
  if (op.close_rate < 15) alerts.push(`${op.full_name}: Close Rate unter 15%`);
  if (op.show_rate < 50 && op.total_bookings >= 3) alerts.push(`${op.full_name}: ${op.total_bookings - op.total_shows} No-Show Spikes`);
  if (op.total_revenue === 0 && op.total_leads >= 3) alerts.push(`${op.full_name}: Kein Revenue im Zeitraum`);
  if (op.trend_7d < -15) alerts.push(`${op.full_name}: Score-Einbruch (${op.trend_7d.toFixed(0)}%)`);

  return { ...op, oss, ossStatus, ossBreakdown, budgetDelta, alerts, constraint };
}

// ─── Status Config ──────────────────────────────────────────────
const STATUS_CONFIG: Record<OssStatus, {
  label: string; emoji: string; color: string; bg: string; borderColor: string;
  action: string;
}> = {
  scale: { label: "Scale", emoji: "🟢", color: T.success, bg: T.successLight, borderColor: "#C5D9C7", action: "Budget +30% · Skalieren" },
  hold: { label: "Hold", emoji: "🟡", color: T.gold, bg: T.goldLight, borderColor: "#E5DCC8", action: "Budget halten · Beobachten" },
  fix: { label: "Fix", emoji: "🟠", color: T.orange, bg: T.orangeLight, borderColor: "#E8D4B8", action: "Bottleneck fixen · Budget -20%" },
  kill: { label: "Kill", emoji: "🔴", color: T.danger, bg: T.dangerLight, borderColor: "#E8C9C4", action: "Budget pausieren · Team ersetzen" },
};

const STATUS_ICONS: Record<OssStatus, typeof TrendingUp> = {
  scale: TrendingUp,
  hold: Pause,
  fix: Wrench,
  kill: XCircle,
};

// ─── Props ──────────────────────────────────────────────────────
interface Props {
  data: OperatorData[];
  effectiveLevel: number;
  lang: string;
  rangeDays: number;
}

// ─── Component ──────────────────────────────────────────────────
export default function OperatorRankingSystem({ data, effectiveLevel, lang, rangeDays }: Props) {
  const [drillOp, setDrillOp] = useState<RankedOperator | null>(null);
  const t = (de: string, en: string) => (lang === "de" ? de : en);
  const isDirector = effectiveLevel >= 7;

  // Compute OSS for all operators
  const ranked = useMemo(() => {
    const computed = data.map(op => computeOSS(op, data));
    computed.sort((a, b) => b.oss - a.oss);
    return computed;
  }, [data]);

  // All alerts
  const allAlerts = useMemo(() => ranked.flatMap(r => r.alerts), [ranked]);

  // Status distribution
  const statusDist = useMemo(() => {
    const d = { scale: 0, hold: 0, fix: 0, kill: 0 };
    for (const r of ranked) d[r.ossStatus]++;
    return d;
  }, [ranked]);

  if (!data.length) {
    return (
      <section className="rounded-2xl p-8 text-center" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <TrendingUp className="h-10 w-10 mx-auto mb-3" style={{ color: T.border }} />
        <h3 className="text-[15px] font-medium mb-1" style={{ color: T.ink }}>
          {t("Keine Ranking-Daten vorhanden", "No ranking data available")}
        </h3>
        <p className="text-[12px] max-w-md mx-auto" style={{ color: T.muted }}>
          {t(
            "Es wurden im gewählten Zeitraum keine Operator-Daten gefunden. Sobald Units aktiv sind, erscheint hier das Ranking.",
            "No operator data found for the selected period. Rankings will appear once units are active."
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {/* ─── HEADER ──────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[20px] font-light tracking-[-0.02em]"
            style={{ fontFamily: "'Cormorant Garamond', serif", color: T.ink }}>
            Operator Ranking System™
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: T.muted }}>
            {t("Entscheidungs-Engine", "Decision Engine")} · {ranked.length} {t("Operatoren", "Operators")} · {rangeDays}d
          </p>
        </div>
        <div className="text-[11px] font-medium px-3 py-1.5 rounded-xl" style={{ background: T.goldLight, color: T.gold, border: `1px solid ${T.border}` }}>
          {t("Nächste €10k →", "Next €10k →")} {ranked[0]?.full_name ?? "—"}
        </div>
      </div>

      {/* ─── STATUS DISTRIBUTION ─────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {(["scale", "hold", "fix", "kill"] as const).map(s => {
          const cfg = STATUS_CONFIG[s];
          const Icon = STATUS_ICONS[s];
          return (
            <div key={s} className="rounded-2xl px-4 py-3 text-center"
              style={{ background: cfg.bg, border: `1px solid ${cfg.borderColor}` }}>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: cfg.color }}>
                  {cfg.label}
                </span>
              </div>
              <div className="text-[22px] font-semibold tabular-nums" style={{ color: cfg.color }}>
                {statusDist[s]}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── ALERTS ──────────────────────────────── */}
      {allAlerts.length > 0 && (
        <div className="rounded-2xl p-4 space-y-1.5" style={{ background: T.dangerLight, border: `1px solid #E8C9C4` }}>
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: T.danger }} />
            <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: T.danger }}>
              {t("System-Alerts", "System Alerts")} ({allAlerts.length})
            </span>
          </div>
          {allAlerts.slice(0, 5).map((a, i) => (
            <div key={i} className="text-[12px]" style={{ color: T.danger }}>{a}</div>
          ))}
          {allAlerts.length > 5 && (
            <div className="text-[11px]" style={{ color: T.muted }}>+{allAlerts.length - 5} {t("weitere", "more")}</div>
          )}
        </div>
      )}

      {/* ─── LEADERBOARD TABLE ───────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        {/* Header row */}
        <div className="grid gap-0 text-[10px] uppercase tracking-wider font-medium px-4 py-3"
          style={{
            color: T.muted,
            borderBottom: `1px solid ${T.border}`,
            gridTemplateColumns: "32px 1fr 60px 50px 50px 60px 70px 60px 50px 80px 56px",
          }}>
          <span>#</span>
          <span>Operator</span>
          <span className="text-right">Leads</span>
          <span className="text-right">Booked</span>
          <span className="text-right">Shows</span>
          <span className="text-right">Close %</span>
          <span className="text-right">Revenue</span>
          <span className="text-right">Rev/Lead</span>
          <span className="text-right">OSS</span>
          <span className="text-center">Status</span>
          <span />
        </div>

        {ranked.map((r, i) => {
          const cfg = STATUS_CONFIG[r.ossStatus];
          const Icon = STATUS_ICONS[r.ossStatus];
          return (
            <div
              key={r.user_id}
              onClick={() => setDrillOp(r)}
              className="grid gap-0 items-center px-4 py-3.5 cursor-pointer transition-colors hover:bg-[#F5F2ED]"
              style={{
                borderBottom: i < ranked.length - 1 ? `1px solid ${T.border}` : "none",
                gridTemplateColumns: "32px 1fr 60px 50px 50px 60px 70px 60px 50px 80px 56px",
                borderLeft: `3px solid ${cfg.color}`,
              }}>
              {/* Rank */}
              <span className="text-[14px] tabular-nums font-semibold" style={{ color: i < 3 ? T.gold : T.muted }}>
                {i + 1}
              </span>
              {/* Name */}
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate" style={{ color: T.ink }}>{r.full_name}</div>
                <div className="text-[10px]" style={{ color: T.muted }}>L{r.level_num} · {r.operator_role}</div>
              </div>
              {/* Leads */}
              <span className="text-[12px] tabular-nums text-right" style={{ color: T.secondary }}>{fmt(r.total_leads)}</span>
              {/* Booked */}
              <span className="text-[12px] tabular-nums text-right" style={{ color: T.secondary }}>{fmt(r.total_bookings)}</span>
              {/* Shows */}
              <span className="text-[12px] tabular-nums text-right" style={{ color: T.secondary }}>{fmt(r.total_shows)}</span>
              {/* Close % */}
              <span className="text-[12px] tabular-nums text-right font-medium" style={{ color: r.close_rate < 10 ? T.danger : T.ink }}>
                {fmtPct(r.close_rate)}
              </span>
              {/* Revenue */}
              <span className="text-[12px] tabular-nums text-right font-medium" style={{ color: T.ink }}>
                {fmtEur(r.total_revenue)}
              </span>
              {/* Rev/Lead */}
              <span className="text-[12px] tabular-nums text-right" style={{ color: T.secondary }}>
                {fmtEur(r.revenue_per_lead)}
              </span>
              {/* OSS */}
              <span className="text-[16px] tabular-nums text-right font-bold" style={{ color: cfg.color }}>
                {r.oss}
              </span>
              {/* Status */}
              <div className="flex items-center justify-center gap-1">
                <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                <span className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: cfg.color }}>
                  {cfg.label}
                </span>
              </div>
              {/* Arrow */}
              <div className="flex justify-end">
                <ChevronRight className="h-4 w-4" style={{ color: T.border }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── CAPITAL ALLOCATION (L7+ ONLY) ───────── */}
      {isDirector && (
        <div className="rounded-2xl overflow-hidden" style={{ background: T.card, border: `1px solid ${T.border}` }}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${T.border}` }}>
            <h3 className="text-[14px] font-medium" style={{ color: T.ink }}>
              {t("Budget Allocation Engine", "Budget Allocation Engine")}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: T.muted }}>
              {t("Automatische Budget-Empfehlung basierend auf OSS", "Automated budget recommendation based on OSS")}
            </p>
          </div>
          {ranked.map((r, i) => {
            const cfg = STATUS_CONFIG[r.ossStatus];
            const Icon = STATUS_ICONS[r.ossStatus];
            return (
              <div key={r.user_id}
                className="flex items-center gap-4 px-5 py-3.5"
                style={{ borderBottom: i < ranked.length - 1 ? `1px solid ${T.border}` : "none" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium" style={{ color: T.ink }}>{r.full_name}</div>
                  <div className="text-[11px]" style={{ color: T.muted }}>{cfg.action}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                  <span className="text-[14px] tabular-nums font-bold min-w-[60px] text-right"
                    style={{
                      color: r.budgetDelta > 0 ? T.success : r.budgetDelta < 0 ? T.danger : T.muted,
                    }}>
                    {r.budgetDelta > 0 ? "+" : ""}{r.budgetDelta}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── DRILLDOWN SHEET ─────────────────────── */}
      <Sheet open={drillOp !== null} onOpenChange={(o) => !o && setDrillOp(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0"
          style={{ background: T.bg, borderLeft: `1px solid ${T.border}` }}>
          {drillOp && <OperatorDrilldown op={drillOp} lang={lang} t={t} />}
        </SheetContent>
      </Sheet>
    </section>
  );
}

// ─── Drilldown ──────────────────────────────────────────────────
function OperatorDrilldown({ op, lang, t }: { op: RankedOperator; lang: string; t: (de: string, en: string) => string }) {
  const cfg = STATUS_CONFIG[op.ossStatus];
  const Icon = STATUS_ICONS[op.ossStatus];
  const constraintLabel: Record<string, string> = {
    setter: "Setter (Show Rate)",
    closer: "Closer (Close Rate)",
    traffic: "Traffic (Lead Volume)",
    none: t("Kein Engpass", "No constraint"),
  };

  return (
    <div className="px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <div className="text-[11px] uppercase tracking-wider" style={{ color: T.muted }}>
          L{op.level_num} · {op.operator_role}
        </div>
        <h2 className="text-[24px] font-light mt-1" style={{ fontFamily: "'Cormorant Garamond', serif", color: T.ink }}>
          {op.full_name}
        </h2>
        <div className="flex items-center gap-4 mt-3">
          <span className="text-[48px] font-bold tabular-nums leading-none" style={{ color: cfg.color }}>
            {op.oss}
          </span>
          <div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ background: cfg.bg, border: `1px solid ${cfg.borderColor}` }}>
              <Icon className="h-4 w-4" style={{ color: cfg.color }} />
              <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: cfg.color }}>
                {cfg.label}
              </span>
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: T.muted }}>{cfg.action}</div>
          </div>
        </div>
      </div>

      {/* OSS Breakdown */}
      <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-[11px] uppercase tracking-wider mb-4" style={{ color: T.muted }}>
          OSS Breakdown
        </div>
        <div className="space-y-3">
          {op.ossBreakdown.map(b => (
            <div key={b.metric}>
              <div className="flex justify-between text-[12px] mb-1">
                <span style={{ color: T.secondary }}>
                  {b.metric} <span style={{ color: T.muted }}>({b.weight}%)</span>
                </span>
                <span className="tabular-nums font-medium" style={{ color: T.ink }}>
                  {b.metric.includes("Rate") || b.metric === "Volume Stability"
                    ? fmtPct(b.raw)
                    : fmtEur(b.raw)}
                  {" "}→ {Math.round(b.normalized)}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#EDE9E2" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, b.normalized)}%`,
                    background: b.normalized >= 70 ? T.success : b.normalized >= 40 ? T.gold : T.danger,
                  }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Funnel Performance */}
      <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-[11px] uppercase tracking-wider mb-4" style={{ color: T.muted }}>
          Funnel Performance
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: "Leads", v: fmt(op.total_leads) },
            { l: "Bookings", v: fmt(op.total_bookings) },
            { l: "Shows", v: fmt(op.total_shows) },
            { l: "Closes", v: fmt(op.total_closes) },
            { l: "Revenue", v: fmtEur(op.total_revenue) },
            { l: "Rev/Lead", v: fmtEur(op.revenue_per_lead) },
          ].map(s => (
            <div key={s.l} className="rounded-xl px-3 py-2.5" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: T.muted }}>{s.l}</div>
              <div className="text-[14px] tabular-nums font-medium mt-0.5" style={{ color: T.ink }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs per role */}
      <div className="rounded-2xl p-5" style={{ background: T.card, border: `1px solid ${T.border}` }}>
        <div className="text-[11px] uppercase tracking-wider mb-4" style={{ color: T.muted }}>
          {t("KPIs pro Rolle", "KPIs per Role")}
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: T.bg }}>
            <span className="text-[12px] font-medium" style={{ color: T.ink }}>Setter</span>
            <div className="flex gap-4 text-[12px] tabular-nums">
              <span style={{ color: T.secondary }}>Booking: <strong>{fmtPct(op.booking_rate)}</strong></span>
              <span style={{ color: T.secondary }}>Show: <strong>{fmtPct(op.show_rate)}</strong></span>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: T.bg }}>
            <span className="text-[12px] font-medium" style={{ color: T.ink }}>Closer</span>
            <div className="flex gap-4 text-[12px] tabular-nums">
              <span style={{ color: T.secondary }}>Close: <strong>{fmtPct(op.close_rate)}</strong></span>
              <span style={{ color: T.secondary }}>Rev: <strong>{fmtEur(op.total_revenue)}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottleneck Detection */}
      <div className="rounded-2xl p-5" style={{
        background: op.constraint !== "none" ? cfg.bg : T.card,
        border: `1px solid ${op.constraint !== "none" ? cfg.borderColor : T.border}`,
      }}>
        <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: T.muted }}>
          {t("Haupt-Engpass", "Main Constraint")}
        </div>
        <div className="text-[16px] font-semibold" style={{ color: op.constraint !== "none" ? cfg.color : T.success }}>
          {constraintLabel[op.constraint]}
        </div>
        {op.constraint === "setter" && (
          <div className="text-[12px] mt-2" style={{ color: T.secondary }}>
            {t("Show Rate unter 50%. Setter-Qualität oder Confirmation-Flow prüfen.",
              "Show rate below 50%. Check setter quality or confirmation flow.")}
          </div>
        )}
        {op.constraint === "closer" && (
          <div className="text-[12px] mt-2" style={{ color: T.secondary }}>
            {t("Close Rate unter 15%. Script Review und Coaching empfohlen.",
              "Close rate below 15%. Script review and coaching recommended.")}
          </div>
        )}
        {op.constraint === "traffic" && (
          <div className="text-[12px] mt-2" style={{ color: T.secondary }}>
            {t("Weniger als 5 Leads. Traffic erhöhen oder Funnel optimieren.",
              "Less than 5 leads. Increase traffic or optimize funnel.")}
          </div>
        )}
      </div>

      {/* Alerts */}
      {op.alerts.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: T.dangerLight, border: `1px solid #E8C9C4` }}>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="h-3.5 w-3.5" style={{ color: T.danger }} />
            <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: T.danger }}>
              Alerts
            </span>
          </div>
          {op.alerts.map((a, i) => (
            <div key={i} className="text-[12px] py-1" style={{ color: T.danger }}>{a}</div>
          ))}
        </div>
      )}
    </div>
  );
}
