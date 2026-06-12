import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { BottleneckResult } from "@/hooks/usePerformanceDashboard";

interface Props { data: BottleneckResult | null; }

export default function BottleneckDetector({ data }: Props) {
  if (!data) return null;

  if (data.all_green) {
    return (
      <Card className="p-5 border-emerald-500/30 bg-emerald-500/[0.04]">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">All systems green</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Booking {data.booking_rate}% · Show {data.show_rate}% · Closing {data.closing_rate}% — alle über Threshold.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-destructive/30 bg-destructive/[0.04]">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            Biggest Leak: <span className="text-destructive">{data.biggest_leak}</span>
          </h3>
          {data.recommended_fix && (
            <p className="text-xs text-foreground/80 mt-1">{data.recommended_fix}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {data.flags.map((f) => (
              <span key={f.stage}
                className="text-[10px] px-2 py-0.5 rounded-full border border-destructive/30 text-destructive bg-destructive/10 uppercase tracking-wider"
                style={{ fontFamily: "DM Mono, monospace" }}>
                {f.stage}: {f.rate}% &lt; {f.threshold}%
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-border/40">
            <Metric label="Booking" value={`${data.booking_rate}%`} ok={data.booking_rate >= 15} />
            <Metric label="Show"    value={`${data.show_rate}%`}    ok={data.show_rate    >= 60} />
            <Metric label="Closing" value={`${data.closing_rate}%`} ok={data.closing_rate >= 20} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
         style={{ fontFamily: "DM Mono, monospace" }}>{value}</p>
    </div>
  );
}
