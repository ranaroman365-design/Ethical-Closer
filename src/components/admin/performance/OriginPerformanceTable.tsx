import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OriginRow } from "@/hooks/useOriginPerformance";

interface Props { rows: OriginRow[]; }

const REC_TONE: Record<OriginRow["recommendation"], string> = {
  SCALE:    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  OPTIMIZE: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  PAUSE:    "bg-destructive/10 text-destructive border-destructive/30",
};

const TYPE_TONE: Record<OriginRow["origin_type"], string> = {
  DL:      "bg-muted text-muted-foreground border-border",
  TEAM:    "bg-primary/10 text-primary border-primary/30",
  FOUNDER: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  PARTNER: "bg-secondary text-secondary-foreground border-border",
};

const fmtMoney = (n: number | null) => (n == null ? "—" : n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`);
const fmtNum   = (n: number | null) => (n == null ? "—" : n.toLocaleString());
const fmtX     = (n: number | null) => (n == null ? "—" : n >= 999 ? "∞" : `${n}x`);

export default function OriginPerformanceTable({ rows }: Props) {
  return (
    <Card className="p-5 border-border/40">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Origin Performance</h3>
        <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
          Wer ist verantwortlich · DL / Team / Founder / Partner
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left  py-2 font-medium">Origin</th>
              <th className="text-left  py-2 font-medium">Type</th>
              <th className="text-right py-2 font-medium">Leads</th>
              <th className="text-right py-2 font-medium">Bookings</th>
              <th className="text-right py-2 font-medium">Shows</th>
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
              <tr><td colSpan={12} className="py-6 text-center text-xs text-muted-foreground">Keine Origin-Daten im Zeitraum.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.origin_id} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-2.5 text-foreground font-medium" style={{ fontFamily: "Inter, sans-serif" }}>{r.label}</td>
                <td className="py-2.5">
                  <Badge variant="outline" className={`text-[10px] ${TYPE_TONE[r.origin_type]}`}>{r.origin_type}</Badge>
                </td>
                <td className="py-2.5 text-right">{fmtNum(r.leads)}</td>
                <td className="py-2.5 text-right">{fmtNum(r.bookings)}</td>
                <td className="py-2.5 text-right">{fmtNum(r.shows)}</td>
                <td className="py-2.5 text-right">{fmtNum(r.sales)}</td>
                <td className="py-2.5 text-right">{fmtMoney(r.revenue)}</td>
                <td className="py-2.5 text-right text-muted-foreground">{fmtMoney(r.spend)}</td>
                <td className="py-2.5 text-right text-muted-foreground">{fmtMoney(r.cpl)}</td>
                <td className="py-2.5 text-right text-muted-foreground">{fmtMoney(r.cac)}</td>
                <td className="py-2.5 text-right font-semibold">{fmtX(r.roas)}</td>
                <td className="py-2.5 text-right">
                  <Badge variant="outline" className={`text-[10px] ${REC_TONE[r.recommendation]}`}>{r.recommendation}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
