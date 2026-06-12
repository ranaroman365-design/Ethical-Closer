import { Card } from "@/components/ui/card";
import type { OperatorMetrics } from "@/hooks/useOperatorComparison";

interface Props { rows: OperatorMetrics[]; }

interface Winner { label: string; origin: string; value: string; tone: string; }

const fmtPct  = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const fmtX    = (n: number | null) => (n == null ? "—" : !isFinite(n) ? "∞" : `${n.toFixed(2)}x`);
const fmtMon  = (n: number)        => n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`;

function pickMax<T>(arr: T[], score: (x: T) => number | null): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of arr) {
    const s = score(item);
    if (s == null) continue;
    if (s > bestScore) { bestScore = s; best = item; }
  }
  return best;
}

export default function SummaryStrip({ rows }: Props) {
  const winners: Winner[] = [
    {
      label: "Best ROAS",
      ...(() => {
        const w = pickMax(rows, (r) => r.roas);
        return { origin: w?.origin ?? "—", value: fmtX(w?.roas ?? null) };
      })(),
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Highest Revenue",
      ...(() => {
        const w = pickMax(rows, (r) => r.revenue);
        return { origin: w?.origin ?? "—", value: w ? fmtMon(w.revenue) : "—" };
      })(),
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Best Booking Rate",
      ...(() => {
        const w = pickMax(rows, (r) => r.booking_rate);
        return { origin: w?.origin ?? "—", value: fmtPct(w?.booking_rate ?? null) };
      })(),
      tone: "text-foreground",
    },
    {
      label: "Best Show Rate",
      ...(() => {
        const w = pickMax(rows, (r) => r.show_rate);
        return { origin: w?.origin ?? "—", value: fmtPct(w?.show_rate ?? null) };
      })(),
      tone: "text-foreground",
    },
    {
      label: "Best Closing Rate",
      ...(() => {
        const w = pickMax(rows, (r) => r.closing_rate);
        return { origin: w?.origin ?? "—", value: fmtPct(w?.closing_rate ?? null) };
      })(),
      tone: "text-foreground",
    },
    {
      label: "Best Lead-to-Sale",
      ...(() => {
        const w = pickMax(rows, (r) => r.lead_to_sale_rate);
        return { origin: w?.origin ?? "—", value: fmtPct(w?.lead_to_sale_rate ?? null) };
      })(),
      tone: "text-primary",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {winners.map((w) => (
        <Card key={w.label} className="p-4 border-border/40 bg-card">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{w.label}</div>
          <div className={`mt-2 text-lg font-semibold ${w.tone}`} style={{ fontFamily: "DM Mono, monospace" }}>{w.value}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{w.origin}</div>
        </Card>
      ))}
    </div>
  );
}
