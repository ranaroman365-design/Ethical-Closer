import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Phone, UserX, Clock } from 'lucide-react';

interface CallMetrics {
  total: number;
  attended: number;
  noShow: number;
  showRate: number;
}

export default function CallPerformancePanel({ range }: { range: string }) {
  const [m, setM] = useState<CallMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [range]);

  async function load() {
    setLoading(true);
    const since = rangeToDate(range);
    const [totalRes, attendedRes, noShowRes] = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('attendance_flag', true).gte('created_at', since),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('call_status', 'no_show').gte('created_at', since),
    ]);
    const total = totalRes.count ?? 0;
    const attended = attendedRes.count ?? 0;
    const noShow = noShowRes.count ?? 0;
    setM({ total, attended, noShow, showRate: total > 0 ? Math.round((attended / total) * 100) : 0 });
    setLoading(false);
  }

  if (loading) return <Skeleton className="h-40 rounded-xl" />;
  if (!m) return null;

  const cards = [
    { label: 'Total Calls', value: m.total, icon: Phone, color: 'text-foreground' },
    { label: 'Attended', value: m.attended, icon: Phone, color: 'text-primary' },
    { label: 'No-Shows', value: m.noShow, icon: UserX, color: m.noShow > 0 ? 'text-destructive' : 'text-muted-foreground' },
    { label: 'Show Rate', value: `${m.showRate}%`, icon: Clock, color: m.showRate < 70 ? 'text-destructive' : 'text-primary' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Call Performance</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {cards.map(c => (
            <div key={c.label} className="rounded-lg border border-border/40 bg-background p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground">{c.value}</p>
            </div>
          ))}
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
