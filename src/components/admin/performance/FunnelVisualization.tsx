import { Card } from "@/components/ui/card";
import type { FunnelStage } from "@/hooks/usePerformanceDashboard";

interface Props { stages: FunnelStage[]; }

export default function FunnelVisualization({ stages }: Props) {
  const top = stages[0]?.count ?? 0;
  return (
    <Card className="p-5 border-border/40">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Funnel</h3>
        <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
          stage → conversion
        </span>
      </div>
      <div className="space-y-2">
        {stages.map((s) => {
          const width = top > 0 ? Math.max((s.count / top) * 100, 2) : 0;
          return (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-[90px] shrink-0 text-right text-xs text-muted-foreground">{s.stage}</span>
              <div className="flex-1 h-7 bg-muted rounded overflow-hidden relative">
                <div
                  className="h-full bg-primary/70 rounded transition-all duration-500"
                  style={{ width: `${width}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-between px-3 text-[11px]">
                  <span className="font-semibold text-foreground">{s.count.toLocaleString()}</span>
                  <span className="text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                    {s.rate_from_top}% top · {s.rate_from_prev}% prev
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
