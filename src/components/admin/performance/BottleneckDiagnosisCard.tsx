import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingDown, AlertTriangle, ShieldAlert, ShieldCheck, Info,
  Target, Zap, ArrowRight, MinusCircle,
} from "lucide-react";
import type { BottleneckOperator, BottleneckType, ConfidenceLevel } from "@/hooks/useBottleneckDiagnosis";

interface Props {
  operator: BottleneckOperator;
  /** Compact = single column for sheets/sidebars */
  compact?: boolean;
}

const BOTTLENECK_LABEL: Record<BottleneckType, string> = {
  traffic_problem:      "Traffic-Problem",
  booking_problem:      "Booking-Problem",
  setting_show_problem: "Setting / Show-Up-Problem",
  closing_problem:      "Closing-Problem",
  no_meaningful_gap:    "Kein Bottleneck",
  insufficient_data:    "Zu wenig Daten",
  incomplete_funnel:    "Funnel-Daten unvollständig",
  suspicious_data:      "Daten-Pattern auffällig",
};

const CONFIDENCE_META: Record<ConfidenceLevel, { text: string; tone: string; Icon: typeof Info }> = {
  high_confidence:   { text: "High Confidence",   tone: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30", Icon: ShieldCheck },
  medium_confidence: { text: "Medium Confidence", tone: "text-foreground border-border/40",                              Icon: ShieldCheck },
  low_confidence:    { text: "Low Confidence",    tone: "text-amber-600 dark:text-amber-400 border-amber-500/30",       Icon: AlertTriangle },
  blocked:           { text: "Blocked",           tone: "text-destructive border-destructive/40",                       Icon: ShieldAlert },
};

const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;

const fmtMoney = (v: number) =>
  Number.isFinite(v)
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)
    : "—";

export default function BottleneckDiagnosisCard({ operator, compact = false }: Props) {
  const { primary_bottleneck, confidence, recommendation } = operator;
  const conf = CONFIDENCE_META[confidence];
  const ConfIcon = conf.Icon;

  const isBlocked = confidence === "blocked";
  const isNoIssue = primary_bottleneck === "no_meaningful_gap";

  return (
    <Card className="p-5 border-border/40">
      {/* Header line: problem + confidence */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        {isBlocked ? (
          <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
        ) : isNoIssue ? (
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <TrendingDown className="h-4 w-4 text-foreground shrink-0" />
        )}
        <h3 className="text-sm font-semibold text-foreground">
          {BOTTLENECK_LABEL[primary_bottleneck]}
        </h3>
        <Badge variant="outline" className={`text-[10px] ${conf.tone}`}>
          <ConfIcon className="h-3 w-3 mr-1" />
          {conf.text}
        </Badge>
        {operator.suspicious && (
          <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
            suspicious pattern
          </Badge>
        )}
      </div>

      {/* Sub-line: cause */}
      <p className="text-xs text-muted-foreground mb-4">{recommendation.cause}</p>

      {/* Cost block — only when we actually have a diagnosis */}
      {!isBlocked && !isNoIssue && (
        <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"} gap-3 mb-4 pb-4 border-b border-border/40`}>
          <Stat
            label="Stage actual"
            value={fmtPct(operator.primary_actual)}
            sub={`vs Median ${fmtPct(operator.primary_benchmark)}`}
            tone="text-destructive"
          />
          <Stat
            label="Gap"
            value={`${operator.primary_gap_pct_points.toFixed(1)} pp`}
            sub="unter Median"
            tone="text-destructive"
          />
          <Stat
            label="Verlorene Wins"
            value={Math.round(operator.estimated_lost_wins).toString()}
            sub="im Zeitraum"
          />
          <Stat
            label="Verlorener Umsatz"
            value={fmtMoney(operator.estimated_lost_revenue)}
            sub="geschätzt"
            highlight
          />
        </div>
      )}

      {/* Stage strip */}
      {!isBlocked && (
        <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-4"} gap-2 mb-4`}>
          <StageBar label="Quiz"    actual={operator.stages.quiz_rate}    benchmark={operator.stages.quiz_benchmark} />
          <StageBar label="Booking" actual={operator.stages.booking_rate} benchmark={operator.stages.booking_benchmark} />
          <StageBar label="Show"    actual={operator.stages.show_rate}    benchmark={operator.stages.show_benchmark} />
          <StageBar label="Close"   actual={operator.stages.close_rate}   benchmark={operator.stages.close_benchmark} />
        </div>
      )}

      {/* Recommended actions */}
      {recommendation.actions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Empfohlene Maßnahmen
            </h4>
            {recommendation.leverage && (
              <span className="text-[10px] text-muted-foreground ml-auto inline-flex items-center gap-1">
                <Target className="h-3 w-3" />
                {recommendation.leverage}
              </span>
            )}
          </div>
          <ul className="space-y-1.5">
            {recommendation.actions.map(a => (
              <li key={a} className="flex items-start gap-2 text-xs text-foreground">
                <ArrowRight className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Volume footer (always) */}
      <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-muted-foreground tabular-nums">
        {operator.volume.leads}L · {operator.volume.quiz}Q · {operator.volume.booked}B · {operator.volume.showed}S · {operator.volume.won}W
      </div>
    </Card>
  );
}

function Stat({
  label, value, sub, tone, highlight,
}: { label: string; value: string; sub?: string; tone?: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${highlight ? "text-foreground" : tone ?? "text-foreground"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}

function StageBar({ label, actual, benchmark }: { label: string; actual: number | null; benchmark: number | null }) {
  const a = actual ?? 0;
  const b = benchmark ?? 0;
  const ratio = b > 0 ? a / b : 0;
  const tone =
    actual === null || benchmark === null ? "text-muted-foreground" :
    ratio >= 1     ? "text-emerald-600 dark:text-emerald-400" :
    ratio >= 0.85  ? "text-foreground" :
                     "text-destructive";
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{benchmark === null ? "—" : `≥ ${(b * 100).toFixed(0)}%`}</span>
      </div>
      <div className={`text-sm font-semibold tabular-nums ${tone}`}>
        {actual === null ? <MinusCircle className="h-3.5 w-3.5 inline-block text-muted-foreground" /> : `${(a * 100).toFixed(1)}%`}
      </div>
    </div>
  );
}
