import { Bot, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiSetterSummaryProps {
  motivation: number;
  clarity: number;
  commitment: number;
  recommendation: "closable" | "needs_call" | "not_ready";
  summary: string;
}

/**
 * Compact AI qualification summary card for setter workspace.
 * Shows key scores and recommendation at a glance.
 */
export default function AiSetterSummary({
  motivation,
  clarity,
  commitment,
  recommendation,
  summary,
}: AiSetterSummaryProps) {
  const overall = Math.round((motivation + clarity + commitment) / 3);

  const recConfig = {
    closable: { label: "Closable", color: "text-green-600 bg-green-50 border-green-200", icon: CheckCircle2 },
    needs_call: { label: "Call empfohlen", color: "text-amber-600 bg-amber-50 border-amber-200", icon: TrendingUp },
    not_ready: { label: "Nicht bereit", color: "text-red-500 bg-red-50 border-red-200", icon: AlertTriangle },
  };

  const rec = recConfig[recommendation] || recConfig.needs_call;
  const RecIcon = rec.icon;

  return (
    <div className="rounded-lg border border-border/40 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          AI Setter Summary
        </span>
        <div className={cn("ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", rec.color)}>
          <RecIcon className="h-3 w-3" />
          {rec.label}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Motivation", value: motivation },
          { label: "Klarheit", value: clarity },
          { label: "Commitment", value: commitment },
          { label: "Gesamt", value: overall },
        ].map((s) => (
          <div key={s.label} className="space-y-0.5">
            <p className="text-lg font-semibold text-foreground">{s.value}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {summary && (
        <p className="text-xs text-muted-foreground italic leading-relaxed border-t border-border/30 pt-2">
          {summary}
        </p>
      )}
    </div>
  );
}
