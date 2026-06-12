import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import type { CloserOriginRow } from "@/hooks/useOriginPerformance";

interface Props { rows: CloserOriginRow[]; }

const fmtMoney = (n: number | null) => (n == null ? "—" : n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`);

function tone(closeRate: number): string {
  if (closeRate >= 30) return "text-emerald-600 dark:text-emerald-400";
  if (closeRate >= 20) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export default function CloserOriginMatrix({ rows }: Props) {
  // Group by closer for compact rendering
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; entries: CloserOriginRow[] }>();
    rows.forEach((r) => {
      const g = map.get(r.closer_id) ?? { name: r.closer_name, entries: [] };
      g.entries.push(r);
      map.set(r.closer_id, g);
    });
    return Array.from(map.entries()).map(([closer_id, g]) => ({
      closer_id,
      name: g.name,
      entries: g.entries.sort((a, b) => b.revenue - a.revenue),
      totalRevenue: g.entries.reduce((s, e) => s + Number(e.revenue), 0),
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [rows]);

  return (
    <Card className="p-5 border-border/40">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Closer × Origin</h3>
        <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
          Gleicher Closer · unterschiedliche Lead-Qualität
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left  py-2 font-medium">Closer</th>
              <th className="text-left  py-2 font-medium">Origin</th>
              <th className="text-right py-2 font-medium">Calls</th>
              <th className="text-right py-2 font-medium">Sales</th>
              <th className="text-right py-2 font-medium">Close Rate</th>
              <th className="text-right py-2 font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody style={{ fontFamily: "DM Mono, monospace" }}>
            {grouped.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">Keine Closer × Origin-Daten.</td></tr>
            )}
            {grouped.map((g) => g.entries.map((r, idx) => (
              <tr key={`${g.closer_id}-${r.origin_id}`} className={`border-b border-border/20 hover:bg-muted/30 ${idx === 0 ? "border-t-2 border-t-border/40" : ""}`}>
                <td className="py-2.5 text-foreground font-medium" style={{ fontFamily: "Inter, sans-serif" }}>
                  {idx === 0 ? g.name : <span className="text-muted-foreground/60">↳</span>}
                </td>
                <td className="py-2.5 text-muted-foreground">{r.origin_label}</td>
                <td className="py-2.5 text-right">{r.calls}</td>
                <td className="py-2.5 text-right">{r.sales}</td>
                <td className={`py-2.5 text-right font-semibold ${tone(r.close_rate)}`}>{r.close_rate}%</td>
                <td className="py-2.5 text-right">{fmtMoney(r.revenue)}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
