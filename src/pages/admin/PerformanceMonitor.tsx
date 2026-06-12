import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Users, Phone, MessageCircle, Inbox, TrendingUp, RefreshCw, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlatformLoad {
  newUsers: number;
  calls: number;
  messages: number;
  leads: number;
}

interface StageRow { business_stage: string; count: number }
interface PromoRow { target_level: number; count: number; avg_show: number; avg_close: number }
interface TopPerformer { user_id: string; full_name: string; close_rate: number; show_rate: number; total_calls: number; total_revenue: number }

export default function PerformanceMonitor() {
  const [load, setLoad] = useState<PlatformLoad>({ newUsers: 0, calls: 0, messages: 0, leads: 0 });
  const [stages, setStages] = useState<StageRow[]>([]);
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

      // Panel A — Platform Load (parallel)
      const [usersRes, callsRes, msgsRes, leadsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
        supabase.from('calls').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
        supabase.from('community_messages').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
        supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      ]);

      setLoad({
        newUsers: usersRes.count || 0,
        calls: callsRes.count || 0,
        messages: msgsRes.count || 0,
        leads: leadsRes.count || 0,
      });

      // Panel B — Stage Distribution
      const { data: profileData } = await supabase
        .from('profiles')
        .select('business_stage');
      if (profileData) {
        const counts: Record<string, number> = {};
        for (const p of profileData) {
          const s = (p as any).business_stage || 'unknown';
          counts[s] = (counts[s] || 0) + 1;
        }
        const sorted = Object.entries(counts)
          .map(([business_stage, count]) => ({ business_stage, count }))
          .sort((a, b) => b.count - a.count);
        setStages(sorted);
      }

      // Panel D — Promotion Activity (last 30 days)
      const { data: promoData } = await supabase
        .from('promotion_evaluations')
        .select('target_level, show_rate, close_rate')
        .gte('created_at', thirtyDaysAgo);
      if (promoData) {
        const groups: Record<number, { count: number; showSum: number; closeSum: number }> = {};
        for (const row of promoData) {
          const lvl = (row as any).target_level;
          if (!groups[lvl]) groups[lvl] = { count: 0, showSum: 0, closeSum: 0 };
          groups[lvl].count++;
          groups[lvl].showSum += (row as any).show_rate || 0;
          groups[lvl].closeSum += (row as any).close_rate || 0;
        }
        const promoRows = Object.entries(groups)
          .map(([lvl, g]) => ({
            target_level: parseInt(lvl),
            count: g.count,
            avg_show: g.count > 0 ? Math.round(g.showSum / g.count * 10) / 10 : 0,
            avg_close: g.count > 0 ? Math.round(g.closeSum / g.count * 10) / 10 : 0,
          }))
          .sort((a, b) => a.target_level - b.target_level);
        setPromos(promoRows);
      }

      // Panel E — Top KPI Performers
      const { data: kpiData } = await supabase
        .from('member_kpis')
        .select('user_id, closing_rate, show_rate, calls_handled, revenue_closed')
        .order('closing_rate', { ascending: false })
        .limit(10);
      if (kpiData) {
        const userIds = kpiData.map((k: any) => k.user_id);
        const { data: profileNames } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        const nameMap = new Map((profileNames || []).map((p: any) => [p.id, p.full_name || 'Unknown']));
        setTopPerformers(
          kpiData.map((k: any) => ({
            user_id: k.user_id,
            full_name: nameMap.get(k.user_id) || 'Unknown',
            close_rate: k.closing_rate || 0,
            show_rate: k.show_rate || 0,
            total_calls: k.calls_handled || 0,
            total_revenue: k.revenue_closed || 0,
          }))
        );
      }
    } catch (err) {
      console.error('[PerformanceMonitor] fetch error:', err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const loadCards = [
    { label: 'New Users (7d)', value: load.newUsers, icon: Users, color: 'text-blue-400' },
    { label: 'Calls Logged (7d)', value: load.calls, icon: Phone, color: 'text-green-400' },
    { label: 'Messages (7d)', value: load.messages, icon: MessageCircle, color: 'text-purple-400' },
    { label: 'Leads (7d)', value: load.leads, icon: Inbox, color: 'text-amber-400' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold text-foreground">Performance Monitor</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Auto-refresh 60s · Last: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="text-xs gap-1.5">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Panel A — Platform Load */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loadCards.map((c) => (
          <Card key={c.label} className="border-border/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={`h-4 w-4 ${c.color}`} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground font-mono">{c.value.toLocaleString()}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Panel B — Stage Distribution */}
        <Card className="border-border/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-accent" />
            <h2 className="text-[12px] font-semibold text-foreground">Stage Distribution</h2>
          </div>
          <div className="space-y-1.5">
            {stages.map((s) => (
              <div key={s.business_stage} className="flex items-center justify-between rounded-md bg-muted/20 px-3 py-1.5">
                <span className="text-[11px] text-foreground font-mono">{s.business_stage}</span>
                <Badge variant="outline" className="text-[10px] font-mono">{s.count}</Badge>
              </div>
            ))}
            {stages.length === 0 && <p className="text-[11px] text-muted-foreground">No data</p>}
          </div>
        </Card>

        {/* Panel D — Promotion Activity */}
        <Card className="border-border/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h2 className="text-[12px] font-semibold text-foreground">Promotion Activity (30d)</h2>
          </div>
          <div className="space-y-1.5">
            {promos.map((p) => (
              <div key={p.target_level} className="flex items-center justify-between rounded-md bg-muted/20 px-3 py-1.5">
                <span className="text-[11px] text-foreground font-mono">L{p.target_level}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground">{p.count} evals</span>
                  <span className="text-[10px] text-muted-foreground">Show {p.avg_show}%</span>
                  <span className="text-[10px] text-muted-foreground">Close {p.avg_close}%</span>
                </div>
              </div>
            ))}
            {promos.length === 0 && <p className="text-[11px] text-muted-foreground">No promotions in last 30 days</p>}
          </div>
        </Card>
      </div>

      {/* Panel E — Top Performers */}
      <Card className="border-border/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="h-4 w-4 text-accent" />
          <h2 className="text-[12px] font-semibold text-foreground">Top 10 Performers (by Close Rate)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/30 text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">#</th>
                <th className="text-left py-2 px-2 font-medium">Name</th>
                <th className="text-right py-2 px-2 font-medium">Close %</th>
                <th className="text-right py-2 px-2 font-medium">Show %</th>
                <th className="text-right py-2 px-2 font-medium">Calls</th>
                <th className="text-right py-2 px-2 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topPerformers.map((p, i) => (
                <tr key={p.user_id} className="border-b border-border/10 hover:bg-muted/10">
                  <td className="py-2 px-2 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="py-2 px-2 text-foreground font-medium">{p.full_name}</td>
                  <td className="py-2 px-2 text-right font-mono">{p.close_rate}%</td>
                  <td className="py-2 px-2 text-right font-mono">{p.show_rate}%</td>
                  <td className="py-2 px-2 text-right font-mono">{p.total_calls}</td>
                  <td className="py-2 px-2 text-right font-mono">€{p.total_revenue.toLocaleString()}</td>
                </tr>
              ))}
              {topPerformers.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No KPI data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
