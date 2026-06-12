import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Users, Target } from "lucide-react";
import { useAttributionDashboard } from "@/hooks/useAttributionDashboard";
import type { DateRange } from "@/hooks/usePerformanceDashboard";

interface Props { days: DateRange; }

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`;
const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("de-DE");
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const fmtHours = (n: number | null | undefined) =>
  n == null ? "—" : n < 24 ? `${n.toFixed(1)}h` : `${(n / 24).toFixed(1)}d`;

function healthTone(part: number, total: number): string {
  if (total === 0) return "bg-muted text-muted-foreground border-border";
  const r = part / total;
  if (r >= 0.95) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (r >= 0.7)  return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
  return "bg-destructive/10 text-destructive border-destructive/30";
}

export default function AttributionPanel({ days }: Props) {
  const { revenue, community, health, loading, forbidden } = useAttributionDashboard(days);

  if (forbidden) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Attribution
          </h2>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            First-touch · Community influence · Datenqualität
          </p>
        </div>
        {loading && <span className="text-[10px] text-muted-foreground">lädt…</span>}
      </div>

      {/* Health strip */}
      {health && (
        <Card className="p-4 border-border/40">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Attribution Health · {days}d
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <HealthBox
              label="Leads mit Origin"
              part={health.leads_with_origin}
              total={health.leads_total}
            />
            <HealthBox
              label="Bookings mit Lead"
              part={health.bookings_with_lead}
              total={health.bookings_total}
            />
            <HealthBox
              label="Deals mit Origin"
              part={health.deals_with_origin}
              total={health.deals_total}
            />
          </div>
        </Card>
      )}

      {/* Revenue by source */}
      <Card className="p-5 border-border/40">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Revenue by Source
          </h3>
          <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
            First-touch · {days}d
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <th className="text-left  py-2 font-medium">Source</th>
                <th className="text-right py-2 font-medium">Leads</th>
                <th className="text-right py-2 font-medium">Deals</th>
                <th className="text-right py-2 font-medium">Conv.</th>
                <th className="text-right py-2 font-medium">Revenue</th>
                <th className="text-right py-2 font-medium">Community-Influenced</th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: "DM Mono, monospace" }}>
              {revenue.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                  Noch keine attribuierten Daten in diesem Zeitraum.
                </td></tr>
              )}
              {revenue.map((r) => (
                <tr key={r.origin_source} className="border-b border-border/20 hover:bg-muted/30">
                  <td className="py-2.5 text-foreground font-medium" style={{ fontFamily: "Inter, sans-serif" }}>
                    {r.origin_source}
                  </td>
                  <td className="py-2.5 text-right">{fmtNum(r.leads)}</td>
                  <td className="py-2.5 text-right">{fmtNum(r.deals)}</td>
                  <td className="py-2.5 text-right text-muted-foreground">{fmtPct(r.conversion_rate)}</td>
                  <td className="py-2.5 text-right font-semibold">{fmtMoney(r.revenue)}</td>
                  <td className="py-2.5 text-right text-muted-foreground">
                    {r.community_influenced_revenue > 0 ? fmtMoney(r.community_influenced_revenue) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Community ROI */}
      {community && (
        <Card className="p-5 border-border/40">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Community Impact · {days}d
            </h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Members"           value={fmtNum(community.community_members)} />
            <Stat label="Path Completed"    value={fmtNum(community.path_completed)} />
            <Stat label="Completion Rate"   value={fmtPct(community.path_completion_rate)} />
            <Stat label="Influenced Deals"  value={fmtNum(community.community_influenced_deals)} />
            <Stat label="Revenue"           value={fmtMoney(community.community_influenced_revenue)} highlight />
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2 text-xs text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            <span>Avg. Time to Conversion (Community-Path → Deal):</span>
            <span className="font-semibold text-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              {fmtHours(community.avg_time_to_conversion_hours)}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

function HealthBox({ label, part, total }: { label: string; part: number; total: number }) {
  const tone = healthTone(part, total);
  const pct = total > 0 ? (part / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold text-foreground tabular-nums">
          {total > 0 ? `${pct.toFixed(0)}%` : "—"}
        </span>
        <Badge variant="outline" className={`text-[10px] ${tone}`}>
          {fmtNum(part)} / {fmtNum(total)}
        </Badge>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg tabular-nums ${highlight ? "font-bold text-primary" : "font-semibold text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
