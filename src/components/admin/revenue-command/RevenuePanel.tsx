import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatK } from '@/lib/utils';
import { DollarSign, TrendingUp } from 'lucide-react';

interface RevMetrics {
  revenue: number;
  deals: number;
  avgDeal: number;
  closeRate: number;
}

export default function RevenuePanel({ range }: { range: string }) {
  const [m, setM] = useState<RevMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [range]);

  async function load() {
    setLoading(true);
    const since = rangeToDate(range);

    const [wonRes, totalRes] = await Promise.all([
      supabase.from('calls').select('revenue').eq('result', 'won').gte('created_at', since),
      supabase.from('calls').select('id', { count: 'exact', head: true }).gte('created_at', since),
    ]);

    const wonData = wonRes.data ?? [];
    const revenue = wonData.reduce((s, c) => s + ((c as any).revenue ?? 0), 0);
    const deals = wonData.length;
    const totalCalls = totalRes.count ?? 0;

    setM({
      revenue,
      deals,
      avgDeal: deals > 0 ? Math.round(revenue / deals) : 0,
      closeRate: totalCalls > 0 ? Math.round((deals / totalCalls) * 100) : 0,
    });
    setLoading(false);
  }

  if (loading) return <Skeleton className="h-52 rounded-xl" />;
  if (!m) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" /> Revenue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Revenue</p>
          <p className="text-2xl font-bold text-primary">{formatK(m.revenue, '€')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Deals Won" value={m.deals} />
          <Stat label="Avg Deal" value={formatK(m.avgDeal, '€')} />
        </div>
        <div className="rounded-lg border border-border/40 bg-background p-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Close Rate</span>
          </div>
          <span className={`text-lg font-bold ${m.closeRate < 15 ? 'text-destructive' : 'text-foreground'}`}>{m.closeRate}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function rangeToDate(range: string): string {
  const now = new Date();
  if (range === 'today') now.setHours(0, 0, 0, 0);
  else if (range === '7d') now.setDate(now.getDate() - 7);
  else now.setDate(now.getDate() - 30);
  return now.toISOString();
}
