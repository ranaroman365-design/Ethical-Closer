import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SourceRow } from "@/hooks/usePerformanceDashboard";

interface Props { rows: SourceRow[]; }

const REC_TONE: Record<SourceRow["recommendation"], string> = {
  SCALE:    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  OPTIMIZE: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  PAUSE:    "bg-destructive/10 text-destructive border-destructive/30",
};

const fmtMoney = (n: number | null) => (n == null ? "—" : n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`);
const fmtNum   = (n: number | null) => (n == null ? "—" : n.toLocaleString());
const fmtX     = (n: number | null) => (n == null ? "—" : n >= 999 ? "∞" : `${n}x`);

export default function SourcePerformanceTable({ rows }: Props) {
  return (
    <Card className="p-5 border-border/40">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Source Performance</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left py-2 font-medium">Source</th>
              <th className="text-right py-2 font-medium">Leads</th>
              <th className="text-right py-2 font-medium">Sales</th>
              <th className="text-right py-2 font-medium">Revenue</th>
              <th className="text-right py-2 font-medium">Spend</th>
              <th className="text-right py-2 font-medium">CPL</th>
              <th className="text-right py-2 font-medium">CAC</th>
              <th className="text-right py-2 font-medium">ROAS</th>
              <th className="text-right py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody style={{ fontFamily: "DM Mono, monospace" }}>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="py-6 text-center text-xs text-muted-foreground">Keine Daten im Zeitraum.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.source} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-2.5 text-foreground font-medium" style={{ fontFamily: "Inter, sans-serif" }}>{r.source}</td>
                <td className="py-2.5 text-right">{fmtNum(r.leads)}</td>
                <td className="py-2.5 text-right">{fmtNum(r.sales)}</td>
                <td className="py-2.5 text-right">{fmtMoney(r.revenue)}</td>
                <td className="py-2.5 text-right text-muted-foreground">{fmtMoney(r.spend)}</td>
                <td className="py-2.5 text-right text-muted-foreground">{fmtMoney(r.cpl)}</td>
                <td className="py-2.5 text-right text-muted-foreground">{fmtMoney(r.cac)}</td>
                <td className="py-2.5 text-right font-semibold">{fmtX(r.roas)}</td>
                <td className="py-2.5 text-right">
                  <Badge variant="outline" className={`text-[10px] ${REC_TONE[r.recommendation]}`}>
                    {r.recommendation}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
