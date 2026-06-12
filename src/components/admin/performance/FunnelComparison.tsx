import { Card } from "@/components/ui/card";
import type { FunnelComparisonRow } from "@/hooks/useOriginPerformance";

interface Props { rows: FunnelComparisonRow[]; }

/** Color tone based on rate vs threshold (semantic-only). */
function tone(value: number, threshold: number): string {
  if (value >= threshold)        return "text-emerald-600 dark:text-emerald-400";
  if (value >= threshold * 0.66) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export default function FunnelComparison({ rows }: Props) {
  return (
    <Card className="p-5 border-border/40">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Funnel Comparison</h3>
        <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
          Booking ≥15% · Show ≥60% · Closing ≥20%
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left  py-2 font-medium">Origin</th>
              <th className="text-left  py-2 font-medium">Funnel</th>
              <th className="text-right py-2 font-medium">Leads</th>
              <th className="text-right py-2 font-medium">Booking</th>
              <th className="text-right py-2 font-medium">Show</th>
              <th className="text-right py-2 font-medium">Closing</th>
            </tr>
          </thead>
          <tbody style={{ fontFamily: "DM Mono, monospace" }}>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">Keine Funnel-Daten im Zeitraum.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.origin_id}-${r.funnel_id}-${i}`} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-2.5 text-foreground font-medium" style={{ fontFamily: "Inter, sans-serif" }}>{r.label}</td>
                <td className="py-2.5 text-muted-foreground">{r.funnel_id}</td>
                <td className="py-2.5 text-right">{r.leads.toLocaleString()}</td>
                <td className={`py-2.5 text-right font-semibold ${tone(r.booking_rate, 15)}`}>{r.booking_rate}%</td>
                <td className={`py-2.5 text-right font-semibold ${tone(r.show_rate, 60)}`}>{r.show_rate}%</td>
                <td className={`py-2.5 text-right font-semibold ${tone(r.closing_rate, 20)}`}>{r.closing_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
