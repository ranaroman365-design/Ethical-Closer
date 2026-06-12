import { Card } from "@/components/ui/card";
import type { CloserRow } from "@/hooks/usePerformanceDashboard";

interface Props { rows: CloserRow[]; }

const fmtMoney = (n: number | null) => (n == null ? "—" : n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`);

export default function CloserPerformanceTable({ rows }: Props) {
  return (
    <Card className="p-5 border-border/40">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Closer Performance</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left py-2 font-medium">Closer</th>
              <th className="text-right py-2 font-medium">Calls</th>
              <th className="text-right py-2 font-medium">Shows</th>
              <th className="text-right py-2 font-medium">Sales</th>
              <th className="text-right py-2 font-medium">Close Rate</th>
              <th className="text-right py-2 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody style={{ fontFamily: "DM Mono, monospace" }}>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">Keine Closer-Daten.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.closer_id} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-2.5 text-foreground font-medium" style={{ fontFamily: "Inter, sans-serif" }}>{r.closer_name}</td>
                <td className="py-2.5 text-right">{r.calls}</td>
                <td className="py-2.5 text-right">{r.shows}</td>
                <td className="py-2.5 text-right">{r.sales}</td>
                <td className="py-2.5 text-right">{r.close_rate}%</td>
                <td className="py-2.5 text-right font-semibold">{fmtMoney(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
