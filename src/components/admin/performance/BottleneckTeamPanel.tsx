import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import type { BottleneckDiagnosis, BottleneckType, ConfidenceLevel } from "@/hooks/useBottleneckDiagnosis";

interface Props {
  data: BottleneckDiagnosis;
  /** Optional filter: only show these operator emails (for director scope). */
  operatorEmails?: string[];
  onSelect?: (operatorEmail: string) => void;
}

const BOTTLENECK_LABEL: Record<BottleneckType, string> = {
  traffic_problem:      "Traffic",
  booking_problem:      "Booking",
  setting_show_problem: "Setting/Show",
  closing_problem:      "Closing",
  no_meaningful_gap:    "Healthy",
  insufficient_data:    "Insufficient",
  incomplete_funnel:    "Incomplete",
  suspicious_data:      "Suspicious",
};

const CONFIDENCE_TONE: Record<ConfidenceLevel, string> = {
  high_confidence:   "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  medium_confidence: "border-border/40 text-foreground",
  low_confidence:    "border-amber-500/30 text-amber-600 dark:text-amber-400",
  blocked:           "border-destructive/40 text-destructive",
};

const fmtMoney = (v: number) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)
    : "—";

export default function BottleneckTeamPanel({ data, operatorEmails, onSelect }: Props) {
  const ops = operatorEmails
    ? data.operators.filter(o => operatorEmails.includes(o.operator_email))
    : data.operators;

  // Local aggregation when scoped to a director's team subset
  const scopedTotal = ops.reduce((s, o) => s + (o.confidence === "blocked" ? 0 : o.estimated_lost_revenue), 0);
  const scopedDist = ops.reduce<Record<string, number>>((acc, o) => {
    acc[o.primary_bottleneck] = (acc[o.primary_bottleneck] ?? 0) + 1;
    return acc;
  }, {});
  const mostCommon = Object.entries(scopedDist)
    .filter(([k]) => ["traffic_problem","booking_problem","setting_show_problem","closing_problem"].includes(k))
    .sort(([,a],[,b]) => b - a)[0]?.[0] as BottleneckType | undefined;

  return (
    <Card className="p-5 border-border/40">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Team Bottleneck Intelligence
        </h3>
        <span className="ml-auto text-[11px] text-muted-foreground">{ops.length} Operators · Letzte {data.days} Tage</span>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 pb-4 border-b border-border/40">
        <Summary label="Häufigster Bottleneck" value={mostCommon ? BOTTLENECK_LABEL[mostCommon] : "—"} />
        <Summary label="Gesamt verlorener Umsatz" value={fmtMoney(scopedTotal)} highlight />
        <Summary label="Diagnostiziert" value={`${ops.filter(o => o.confidence !== "blocked").length}/${ops.length}`} />
        <Summary label="Blocked" value={ops.filter(o => o.confidence === "blocked").length.toString()} />
      </div>

      {/* Distribution chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {Object.entries(scopedDist)
          .sort(([,a],[,b]) => b - a)
          .map(([key, n]) => (
            <Badge key={key} variant="outline" className="text-[10px] border-border/40 text-muted-foreground">
              {BOTTLENECK_LABEL[key as BottleneckType] ?? key} · {n}
            </Badge>
          ))}
      </div>

      {/* Operator table */}
      {ops.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine Operators in diesem Scope.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium px-2 py-2">Operator</th>
                <th className="text-left font-medium px-2 py-2">Reliability</th>
                <th className="text-left font-medium px-2 py-2">Primary Bottleneck</th>
                <th className="text-right font-medium px-2 py-2">Largest Gap</th>
                <th className="text-right font-medium px-2 py-2">Lost Revenue</th>
                <th className="text-left font-medium px-2 py-2">Recommended Focus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {ops.map(o => (
                <tr
                  key={o.operator_email}
                  className={`hover:bg-muted/30 ${onSelect ? "cursor-pointer" : ""}`}
                  onClick={() => onSelect?.(o.operator_email)}
                >
                  <td className="px-2 py-2 font-medium text-foreground truncate max-w-[180px]">
                    {o.operator_email}
                  </td>
                  <td className="px-2 py-2">
                    <Badge variant="outline" className={`text-[10px] ${CONFIDENCE_TONE[o.confidence]}`}>
                      <ConfIcon level={o.confidence} />
                      <span className="ml-1">{o.confidence.replace("_", " ")}</span>
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-foreground">
                    {BOTTLENECK_LABEL[o.primary_bottleneck]}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    {o.confidence === "blocked" ? "—" : `${o.primary_gap_pct_points.toFixed(1)} pp`}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-foreground">
                    {o.confidence === "blocked" ? "—" : fmtMoney(o.estimated_lost_revenue)}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground truncate max-w-[260px]">
                    {o.recommendation.leverage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top opportunities (only when not scoped — uses global pre-aggregated list) */}
      {!operatorEmails && data.global.top_opportunities.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border/40">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Top 3 Hebel
          </h4>
          <div className="space-y-1.5">
            {data.global.top_opportunities.map(t => (
              <div key={t.operator_email} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px] border-border/40 text-muted-foreground">
                  {BOTTLENECK_LABEL[t.primary_bottleneck]}
                </Badge>
                <span className="text-foreground truncate flex-1">{t.operator_email}</span>
                <span className="tabular-nums text-foreground">{fmtMoney(t.estimated_lost_revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Summary({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${highlight ? "text-foreground" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function ConfIcon({ level }: { level: ConfidenceLevel }) {
  if (level === "blocked")           return <ShieldAlert    className="h-3 w-3 inline" />;
  if (level === "low_confidence")    return <AlertTriangle  className="h-3 w-3 inline" />;
  if (level === "high_confidence")   return <ShieldCheck    className="h-3 w-3 inline" />;
  return <ShieldCheck className="h-3 w-3 inline" />;
}
