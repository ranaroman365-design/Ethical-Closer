import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Activity, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface IntegrityData {
  last_event_at: string | null;
  last_webhook_at: string | null;
  events_24h: number;
  mapped_24h: number;
  unmapped_24h: number;
  mapped_pct: number | null;
  duplicates_prevented: number;
  webhook_health: "healthy" | "degraded" | "stale" | "no_data";
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const HEALTH_STYLES: Record<IntegrityData["webhook_health"], { label: string; tone: string; Icon: typeof Activity }> = {
  healthy:  { label: "Healthy",   tone: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  degraded: { label: "Degraded",  tone: "text-amber-600 dark:text-amber-400",     Icon: AlertTriangle },
  stale:    { label: "Stale",     tone: "text-destructive",                        Icon: AlertTriangle },
  no_data:  { label: "No data",   tone: "text-muted-foreground",                   Icon: Clock },
};

/** Trust strip for L6/Admin: ingestion health + dedup signals. */
export default function DataIntegrityStrip() {
  const [data, setData] = useState<IntegrityData | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: res, error } = await supabase.rpc("get_data_integrity_strip" as never);
      if (cancelled) return;
      if (error) {
        setHidden(true);
        return;
      }
      setData(res as unknown as IntegrityData);
    })();
    return () => { cancelled = true; };
  }, []);

  if (hidden || !data) return null;
  const health = HEALTH_STYLES[data.webhook_health];
  const Icon = health.Icon;

  return (
    <Card className="p-4 border-border/40">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Data Integrity
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Last event</div>
          <div className="font-medium text-foreground">{fmtAgo(data.last_event_at)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Webhook</div>
          <div className={`font-medium flex items-center gap-1.5 ${health.tone}`}>
            <Icon className="h-3.5 w-3.5" />
            {health.label}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Mapped (24h)</div>
          <div className="font-medium text-foreground">
            {data.mapped_24h}/{data.events_24h}
            {data.mapped_pct != null && (
              <span className="text-muted-foreground text-xs ml-1">({data.mapped_pct}%)</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Duplicates prevented</div>
          <div className="font-medium text-foreground">{data.duplicates_prevented}</div>
        </div>
      </div>
    </Card>
  );
}
