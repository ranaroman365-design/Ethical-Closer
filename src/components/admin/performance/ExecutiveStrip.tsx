import { Card } from "@/components/ui/card";
import { TrendingUp, Banknote, Target, Users } from "lucide-react";
import type { ExecutiveStrip as Data } from "@/hooks/usePerformanceDashboard";

interface Props { data: Data | null; }

function fmtEUR(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`;
  return `€${Math.round(n)}`;
}
function fmt(n: number | null | undefined, suffix = "") {
  if (n == null) return "—";
  return `${n}${suffix}`;
}

/** Color tone (semantic-only). green / amber / red based on value vs threshold. */
function tone(value: number | null | undefined, thresholds: { green: number; amber: number }, higherIsBetter = true): string {
  if (value == null) return "text-muted-foreground";
  if (higherIsBetter) {
    if (value >= thresholds.green) return "text-emerald-600 dark:text-emerald-400";
    if (value >= thresholds.amber) return "text-amber-600 dark:text-amber-400";
    return "text-destructive";
  }
  if (value <= thresholds.green) return "text-emerald-600 dark:text-emerald-400";
  if (value <= thresholds.amber) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export default function ExecutiveStrip({ data }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <Stat icon={Banknote} label="Revenue Today"        value={fmtEUR(data?.revenue_today)} />
      <Stat icon={Banknote} label="Revenue 7d"           value={fmtEUR(data?.revenue_7d)} />
      <Stat icon={Banknote} label={`Revenue ${data?.days ?? 30}d`} value={fmtEUR(data?.revenue_30d)} accent />
      <Stat icon={TrendingUp} label="Spend"              value={fmtEUR(data?.spend)} />
      <Stat icon={TrendingUp} label="ROAS"
            value={data?.roas != null ? `${data.roas}x` : "—"}
            valueClassName={tone(data?.roas, { green: 3, amber: 1.5 }, true)} />
      <Stat icon={Target} label="CAC"
            value={fmtEUR(data?.cac)}
            valueClassName={tone(data?.cac, { green: 200, amber: 500 }, false)} />
      <Stat icon={Users} label="CPL"
            value={fmtEUR(data?.cpl)}
            valueClassName={tone(data?.cpl, { green: 10, amber: 25 }, false)} />
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent, valueClassName }:
  { icon: any; label: string; value: string; accent?: boolean; valueClassName?: string }) {
  return (
    <Card className={`p-4 border-border/40 ${accent ? "bg-primary/[0.04]" : "bg-card"}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className={`mt-1 text-xl font-bold truncate ${valueClassName ?? "text-foreground"}`}>{value}</p>
        </div>
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
      </div>
    </Card>
  );
}
