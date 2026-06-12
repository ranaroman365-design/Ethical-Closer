import { Card } from "@/components/ui/card";
import type { OperatorMetrics } from "@/hooks/useOperatorComparison";
import { TrendingUp, AlertTriangle, Trophy } from "lucide-react";

interface Props { rows: OperatorMetrics[]; }

interface Insight { tone: "win" | "warn" | "info"; text: string; }

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

function buildInsights(rows: OperatorMetrics[]): Insight[] {
  if (rows.length === 0) return [];
  const insights: Insight[] = [];

  const wRoas = pickMax(rows, (r) => r.roas);
  if (wRoas?.roas != null) {
    insights.push({ tone: "win", text: `Best performer on equal budget: ${wRoas.origin} (${isFinite(wRoas.roas) ? wRoas.roas.toFixed(2) + "x" : "∞"} ROAS)` });
  }

  const wRev = pickMax(rows, (r) => r.revenue);
  if (wRev && wRev.revenue > 0 && wRev.origin !== wRoas?.origin) {
    insights.push({ tone: "info", text: `Highest revenue contribution: ${wRev.origin} (€${Math.round(wRev.revenue).toLocaleString()})` });
  }

  const wL2S = pickMax(rows, (r) => r.lead_to_sale_rate);
  if (wL2S?.lead_to_sale_rate != null) {
    insights.push({ tone: "info", text: `${wL2S.origin} converts the full funnel most efficiently (${(wL2S.lead_to_sale_rate * 100).toFixed(1)}% Lead→Sale)` });
  }

  // Per-origin weakness diagnostics — operational, short
  for (const r of rows) {
    if (r.leads === 0) continue;
    if (r.quiz_rate    != null && r.quiz_rate    < 0.50) insights.push({ tone: "warn", text: `${r.origin} loses too many leads before quiz completion (${(r.quiz_rate * 100).toFixed(0)}%) — Funnel-/Traffic-Problem` });
    if (r.booking_rate != null && r.booking_rate < 0.15) insights.push({ tone: "warn", text: `${r.origin} has weak booking conversion (${(r.booking_rate * 100).toFixed(0)}%) — Funnel-Problem` });
    if (r.show_rate    != null && r.show_rate    < 0.60) insights.push({ tone: "warn", text: `${r.origin} has weak show rate (${(r.show_rate * 100).toFixed(0)}%) — Setter-/Reminder-Problem` });
    if (r.offer_rate   != null && r.offer_rate   < 0.60) insights.push({ tone: "warn", text: `${r.origin} reaches calls but too few offers are made (${(r.offer_rate * 100).toFixed(0)}%) — Closer-Problem im Call` });
    if (r.closing_rate != null && r.closing_rate < 0.20) insights.push({ tone: "warn", text: `${r.origin} gets calls but closes poorly (${(r.closing_rate * 100).toFixed(0)}%) — Closer-Problem im Abschluss` });
  }

  return insights;
}

const TONE: Record<Insight["tone"], { icon: typeof Trophy; cls: string }> = {
  win:  { icon: Trophy,         cls: "text-emerald-600 dark:text-emerald-400" },
  warn: { icon: AlertTriangle,  cls: "text-destructive" },
  info: { icon: TrendingUp,     cls: "text-foreground" },
};

export default function InsightBox({ rows }: Props) {
  const insights = buildInsights(rows);

  return (
    <Card className="p-5 border-border/40 h-full">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Insights · Bottleneck
      </h3>
      {insights.length === 0 ? (
        <p className="text-xs text-muted-foreground">Keine signifikanten Auffälligkeiten im Zeitraum.</p>
      ) : (
        <ul className="space-y-2.5">
          {insights.map((ins, i) => {
            const Icon = TONE[ins.tone].icon;
            return (
              <li key={i} className="flex gap-2.5 items-start text-sm leading-relaxed">
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${TONE[ins.tone].cls}`} />
                <span className="text-foreground">{ins.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5 pt-4 border-t border-border/30">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Diagnose-Logik</div>
        <ul className="space-y-1 text-[11px] text-muted-foreground">
          <li>· Quiz-Rate &lt; 50% → Traffic-/Funnel-Problem</li>
          <li>· Show-Rate &lt; 60% → Setter-/Reminder-Problem</li>
          <li>· Offer/Close &lt; Threshold → Closer-Problem</li>
        </ul>
      </div>
    </Card>
  );
}
