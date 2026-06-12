import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, AlertTriangle, Info, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import OperatorDetailSheet, { type OperatorDetailRow } from "./OperatorDetailSheet";

type ReliabilityLabel =
  | "ok"
  | "insufficient_data"
  | "suspicious_pattern"
  | "incomplete_funnel"
  | "insufficient_and_suspicious";

interface OperatorRow {
  operator_email: string;
  leads: number; booked: number; showed: number; won: number;
  eligible: boolean;
  reasons: string[];
  booking_rate: number | null;
  show_rate: number | null;
  close_rate: number | null;
  suspicious_flags: string[];
  suspicious: boolean;
  reliability_label: ReliabilityLabel;
}

interface ScanResult {
  days: number;
  thresholds: { min_leads: number; min_booked: number; min_showed: number };
  medians: { booking_rate: number; show_rate: number; close_rate: number; leads: number };
  summary: { operators_total: number; operators_eligible: number; operators_suspicious: number };
  operators: OperatorRow[];
}

const LABELS: Record<ReliabilityLabel, { text: string; tone: string; Icon: typeof Info }> = {
  ok:                          { text: "OK",                      tone: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30", Icon: ShieldCheck },
  insufficient_data:           { text: "Insufficient data",       tone: "text-muted-foreground border-border/40",                       Icon: Info },
  incomplete_funnel:           { text: "Incomplete funnel data",  tone: "text-amber-600 dark:text-amber-400 border-amber-500/30",       Icon: AlertTriangle },
  suspicious_pattern:          { text: "Suspicious pattern",      tone: "text-destructive border-destructive/40",                       Icon: ShieldAlert },
  insufficient_and_suspicious: { text: "Insufficient + suspicious", tone: "text-destructive border-destructive/40",                     Icon: ShieldAlert },
};

const FLAG_LABEL: Record<string, string> = {
  book_high_show_low: "Booking ↑↑ / Show ↓↓",
  close_high_low_volume: "Close ↑↑ / low volume",
  high_volume_low_conversion: "Volume ↑↑ / Conv ↓↓",
};

interface Props { days?: number }

/** Anti-Gaming + Data Integrity panel. Read-only RPC, gated server-side. */
export default function IntegrityPanel({ days = 30 }: Props) {
  const [data, setData] = useState<ScanResult | null>(null);
  const [hidden, setHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<OperatorDetailRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: res, error } = await supabase.rpc("perf_integrity_scan" as never, { _days: days } as never);
      if (cancelled) return;
      if (error) { setHidden(true); return; }
      setData(res as unknown as ScanResult);
    })();
    return () => { cancelled = true; };
  }, [days]);

  if (hidden || !data) return null;
  const { summary, thresholds, operators } = data;
  const flagged = operators.filter(o => o.reliability_label !== "ok");
  const visible = showAll ? operators : flagged;

  const open = (op: OperatorRow) => {
    setSelected(op as OperatorDetailRow);
    setSheetOpen(true);
  };

  return (
    <Card className="p-4 border-border/40">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Anti-Gaming &amp; Data Integrity
        </h3>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {summary.operators_eligible}/{summary.operators_total} eligible · {summary.operators_suspicious} flagged
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
        <Stat label="Min leads" value={thresholds.min_leads} />
        <Stat label="Min booked" value={thresholds.min_booked} />
        <Stat label="Min showed" value={thresholds.min_showed} />
        <Stat label="Period" value={`${data.days}d`} />
      </div>

      {operators.length === 0 ? (
        <p className="text-xs text-muted-foreground">No operator data in this window.</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-muted-foreground">
              {showAll ? `Alle ${operators.length} Operators` : `${flagged.length} mit Auffälligkeit`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => setShowAll(v => !v)}
            >
              {showAll ? "Nur auffällige" : "Alle anzeigen"}
            </Button>
          </div>

          {visible.length === 0 ? (
            <p className="text-xs text-muted-foreground">All operators pass thresholds and pattern checks.</p>
          ) : (
            <div className="space-y-2">
              {visible.map(op => {
                const meta = LABELS[op.reliability_label];
                const Icon = meta.Icon;
                return (
                  <button
                    key={op.operator_email}
                    type="button"
                    onClick={() => open(op)}
                    className={`w-full flex flex-wrap items-center gap-2 rounded-lg border p-2.5 bg-card text-left transition-colors hover:bg-muted/30 ${meta.tone}`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium text-foreground truncate max-w-[220px]">
                      {op.operator_email}
                    </span>
                    <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.text}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {op.leads}L · {op.booked}B · {op.showed}S · {op.won}W
                    </span>
                    <div className="flex gap-1 ml-auto items-center">
                      {op.reasons?.map(r => (
                        <Badge key={r} variant="outline" className="text-[10px] border-border/40 text-muted-foreground">
                          {r}
                        </Badge>
                      ))}
                      {op.suspicious_flags?.map(f => (
                        <Badge key={f} variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                          {FLAG_LABEL[f] ?? f}
                        </Badge>
                      ))}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <OperatorDetailSheet
        row={selected}
        context={data ? { days: data.days, thresholds: data.thresholds, medians: data.medians } : null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-medium text-foreground tabular-nums">{value}</div>
    </div>
  );
}
