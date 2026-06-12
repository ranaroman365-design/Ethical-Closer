import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type CoverageLabel = "complete" | "partial" | "empty";

interface OperatorCoverage {
  operator_email: string;
  leads: number; booked: number; showed: number; won: number;
  present_events: string[];
  missing_events: string[];
  unreliable_metrics: string[];
  coverage_label: CoverageLabel;
}

interface CompletenessResult {
  days: number;
  generated_at: string;
  summary: {
    operators_total: number;
    operators_complete: number;
    operators_partial: number;
    operators_empty: number;
  };
  operators: OperatorCoverage[];
}

const CRITICAL_EVENTS: { key: string; label: string }[] = [
  { key: "lead_created", label: "lead" },
  { key: "booked",       label: "booked" },
  { key: "showed",       label: "showed" },
  { key: "closed_won",   label: "won" },
];

const METRIC_LABEL: Record<string, string> = {
  booking_rate: "Booking-Rate",
  show_rate:    "Show-Rate",
  close_rate:   "Close-Rate",
  lead_to_sale: "Lead → Sale",
};

const COVERAGE_META: Record<CoverageLabel, { text: string; tone: string; Icon: typeof CheckCircle2 }> = {
  complete: { text: "Vollständig",   tone: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
  partial:  { text: "Lückenhaft",    tone: "text-amber-600 dark:text-amber-400 border-amber-500/30",       Icon: AlertTriangle },
  empty:    { text: "Keine Events",  tone: "text-destructive border-destructive/40",                       Icon: XCircle },
};

interface Props { days?: number }

export default function FunnelCompletenessPanel({ days = 30 }: Props) {
  const [data, setData] = useState<CompletenessResult | null>(null);
  const [hidden, setHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: res, error } = await supabase.rpc(
        "perf_funnel_completeness" as never,
        { _days: days } as never,
      );
      if (cancelled) return;
      if (error) { setHidden(true); return; }
      const parsed = res as unknown as CompletenessResult & { error?: string };
      if (parsed?.error) { setHidden(true); return; }
      setData(parsed);
    })();
    return () => { cancelled = true; };
  }, [days]);

  if (hidden || !data) return null;

  const { summary, operators } = data;
  const incomplete = operators.filter(o => o.coverage_label !== "complete");
  const visible = showAll ? operators : incomplete;

  return (
    <Card className="p-4 border-border/40">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Funnel-Event Completeness
        </h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {summary.operators_complete}/{summary.operators_total} vollständig · {summary.operators_partial} lückenhaft · {summary.operators_empty} leer
        </span>
      </div>

      {operators.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine Operator-Daten in diesem Zeitraum.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-muted-foreground">
              {showAll ? `Alle ${operators.length} Operators` : `${incomplete.length} mit fehlenden Events`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => setShowAll(v => !v)}
            >
              {showAll ? "Nur unvollständige" : "Alle anzeigen"}
            </Button>
          </div>

          {visible.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Alle Operators haben vollständige Funnel-Events in diesem Zeitraum.
            </p>
          ) : (
            <div className="space-y-2">
              {visible.map(op => {
                const meta = COVERAGE_META[op.coverage_label];
                const Icon = meta.Icon;
                const presentSet = new Set(op.present_events);
                return (
                  <div
                    key={op.operator_email}
                    className={`rounded-lg border p-2.5 bg-card ${meta.tone}`}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate max-w-[220px]">
                        {op.operator_email}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.text}</Badge>
                      <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                        {op.leads}L · {op.booked}B · {op.showed}S · {op.won}W
                      </span>
                    </div>

                    {/* Event coverage row */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
                        Events
                      </span>
                      {CRITICAL_EVENTS.map(ev => {
                        const present = presentSet.has(ev.key);
                        return (
                          <Badge
                            key={ev.key}
                            variant="outline"
                            className={`text-[10px] ${
                              present
                                ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                                : "border-destructive/40 text-destructive line-through"
                            }`}
                          >
                            {ev.label}
                          </Badge>
                        );
                      })}
                    </div>

                    {/* Affected metrics */}
                    {op.unreliable_metrics.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
                          Unzuverlässig
                        </span>
                        {op.unreliable_metrics.map(m => (
                          <Badge
                            key={m}
                            variant="outline"
                            className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400"
                          >
                            {METRIC_LABEL[m] ?? m}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
