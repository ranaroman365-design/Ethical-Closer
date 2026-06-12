import { Card } from "@/components/ui/card";
import type { CampaignRow } from "@/hooks/usePerformanceDashboard";

interface Props { rows: CampaignRow[]; }

const fmtMoney = (n: number | null) => (n == null ? "—" : n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`);
const fmtNum   = (n: number | null) => (n == null ? "—" : n.toLocaleString());
const fmtX     = (n: number | null) => (n == null ? "—" : `${n}x`);

export default function CampaignTable({ rows }: Props) {
  return (
    <Card className="p-5 border-border/40">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Campaign Breakdown</h3>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left py-2 font-medium">Campaign</th>
              <th className="text-left py-2 font-medium">Source</th>
              <th className="text-right py-2 font-medium">Spend</th>
              <th className="text-right py-2 font-medium">Leads</th>
              <th className="text-right py-2 font-medium">CPL</th>
              <th className="text-right py-2 font-medium">Sales</th>
              <th className="text-right py-2 font-medium">Revenue</th>
              <th className="text-right py-2 font-medium">ROAS</th>
            </tr>
          </thead>
          <tbody style={{ fontFamily: "DM Mono, monospace" }}>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-xs text-muted-foreground">Keine Kampagnen-Daten.</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.source}-${r.campaign}-${i}`} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-2.5 text-foreground font-medium truncate max-w-[180px]" style={{ fontFamily: "Inter, sans-serif" }} title={r.campaign}>{r.campaign}</td>
                <td className="py-2.5 text-muted-foreground">{r.source}</td>
                <td className="py-2.5 text-right">{fmtMoney(r.spend)}</td>
                <td className="py-2.5 text-right">{fmtNum(r.leads)}</td>
                <td className="py-2.5 text-right text-muted-foreground">{fmtMoney(r.cpl)}</td>
                <td className="py-2.5 text-right">{fmtNum(r.sales)}</td>
                <td className="py-2.5 text-right">{fmtMoney(r.revenue)}</td>
                <td className="py-2.5 text-right font-semibold">{fmtX(r.roas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
