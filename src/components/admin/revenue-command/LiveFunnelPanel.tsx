import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';

interface FunnelStage {
  label: string;
  count: number;
  rate: number | null;
}

export default function LiveFunnelPanel({ range }: { range: string }) {
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [range]);

  async function load() {
    setLoading(true);
    const since = rangeToDate(range);

    const [leadsRes, bookedRes, joinRes, attendedRes, qualRes, closedRes] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).not('join_clicked_at', 'is', null).gte('created_at', since),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('attendance_flag', true).gte('created_at', since),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('qualification_result', 'qualified').gte('created_at', since),
      supabase.from('calls').select('id', { count: 'exact', head: true }).eq('result', 'won').gte('created_at', since),
    ]);

    const counts = [
      leadsRes.count ?? 0,
      bookedRes.count ?? 0,
      joinRes.count ?? 0,
      attendedRes.count ?? 0,
      qualRes.count ?? 0,
      closedRes.count ?? 0,
    ];
    const labels = ['Leads', 'Booked', 'Join Click', 'Attended', 'Qualified', 'Closed'];

    const result: FunnelStage[] = labels.map((label, i) => ({
      label,
      count: counts[i],
      rate: i === 0 ? null : counts[i - 1] > 0 ? Math.round((counts[i] / counts[i - 1]) * 100) : 0,
    }));

    setStages(result);
    setLoading(false);
  }

  if (loading) return <Skeleton className="h-52 rounded-xl" />;

  // Find biggest drop-off
  let worstIdx = -1;
  let worstDrop = Infinity;
  stages.forEach((s, i) => {
    if (i > 0 && s.rate !== null && s.rate < worstDrop) {
      worstDrop = s.rate;
      worstIdx = i;
    }
  });

  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Live Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2">
          {stages.map((s, i) => {
            const heightPct = (s.count / maxCount) * 100;
            const isWorst = i === worstIdx;
            return (
              <div key={s.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-foreground">{s.count}</span>
                <div className="w-full rounded-t-sm overflow-hidden bg-muted" style={{ height: 100 }}>
                  <div
                    className={`w-full rounded-t-sm transition-all duration-500 ${isWorst ? 'bg-destructive/70' : 'bg-primary/60'}`}
                    style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }}
                  />
                </div>
                <span className="text-[9px] font-medium text-muted-foreground">{s.label}</span>
                {s.rate !== null && (
                  <span className={`text-[9px] font-semibold ${isWorst ? 'text-destructive' : 'text-foreground'}`}>
                    {isWorst && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                    {s.rate}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function rangeToDate(range: string): string {
  const now = new Date();
  if (range === 'today') now.setHours(0, 0, 0, 0);
  else if (range === '7d') now.setDate(now.getDate() - 7);
  else now.setDate(now.getDate() - 30);
  return now.toISOString();
}
