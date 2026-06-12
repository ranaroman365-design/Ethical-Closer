import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatK } from '@/lib/utils';
import {
  Users, TrendingUp, DollarSign, Activity,
  AlertTriangle, CheckCircle2, BarChart3, MessageSquare,
} from 'lucide-react';

interface SystemMetrics {
  totalUsers: number;
  activeUsers: number;
  totalLeads: number;
  totalRevenue: number;
  totalCommissions: number;
  pendingPayouts: number;
  openEscalations: number;
  recentEvents: number;
  stageDistribution: Record<string, number>;
  recentErrors: any[];
  recentAudit: any[];
}

export default function AdminSystemOverview() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function loadMetrics() {
    const [
      profilesRes,
      leadsRes,
      revenueRes,
      commissionsRes,
      pendingRes,
      escalationsRes,
      eventsRes,
      stagesRes,
      errorsRes,
      auditRes,
    ] = await Promise.all([
      supabase.from('profiles').select('id, business_stage', { count: 'exact', head: false }),
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      supabase.from('calls').select('revenue').not('revenue', 'is', null).eq('result', 'won'),
      supabase.from('commissions').select('amount, payout_status'),
      supabase.from('commissions').select('id', { count: 'exact', head: true }).eq('payout_status', 'pending'),
      supabase.from('escalation_alerts').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('event_logs').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('profiles').select('business_stage'),
      supabase.from('event_logs').select('id, event_name, status, error_message, created_at').eq('status', 'error').order('created_at', { ascending: false }).limit(10),
      supabase.from('audit_logs').select('id, action, source_type, note, created_at').order('created_at', { ascending: false }).limit(15),
    ]);

    const totalRevenue = (revenueRes.data ?? []).reduce((s, c) => s + (c.revenue ?? 0), 0);
    const totalCommissions = (commissionsRes.data ?? []).reduce((s, c) => s + (c.amount ?? 0), 0);

    const stageDist: Record<string, number> = {};
    (stagesRes.data ?? []).forEach(p => {
      const st = (p as any).business_stage || 'unknown';
      stageDist[st] = (stageDist[st] || 0) + 1;
    });

    const activeCount = (profilesRes.data ?? []).filter(p =>
      !['prospect', 'applicant', null, undefined].includes((p as any).business_stage)
    ).length;

    setMetrics({
      totalUsers: profilesRes.count ?? 0,
      activeUsers: activeCount,
      totalLeads: leadsRes.count ?? 0,
      totalRevenue,
      totalCommissions,
      pendingPayouts: pendingRes.count ?? 0,
      openEscalations: escalationsRes.count ?? 0,
      recentEvents: eventsRes.count ?? 0,
      stageDistribution: stageDist,
      recentErrors: errorsRes.data ?? [],
      recentAudit: auditRes.data ?? [],
    });
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!metrics) return null;

  const statCards = [
    { label: 'Total Users', value: metrics.totalUsers, icon: Users, color: 'text-primary' },
    { label: 'Active Members', value: metrics.activeUsers, icon: Activity, color: 'text-accent' },
    { label: 'Total Leads', value: metrics.totalLeads, icon: BarChart3, color: 'text-foreground' },
    { label: 'Total Revenue', value: formatK(metrics.totalRevenue, '€'), icon: DollarSign, color: 'text-success' },
    { label: 'Commissions', value: formatK(metrics.totalCommissions, '€'), icon: TrendingUp, color: 'text-accent' },
    { label: 'Pending Payouts', value: metrics.pendingPayouts, icon: DollarSign, color: metrics.pendingPayouts > 0 ? 'text-warning' : 'text-muted-foreground' },
    { label: 'Open Escalations', value: metrics.openEscalations, icon: AlertTriangle, color: metrics.openEscalations > 0 ? 'text-destructive' : 'text-success' },
    { label: 'Events (24h)', value: metrics.recentEvents, icon: MessageSquare, color: 'text-muted-foreground' },
  ];

  const stageOrder = ['prospect', 'opener', 'setter', 'senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner'];
  const stageLabels: Record<string, string> = {
    prospect: 'L0', opener: 'L1', setter: 'L2', senior_associate: 'L3',
    junior_manager: 'L4', manager: 'L5', senior_manager: 'L6', director: 'L7', partner: 'L8',
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Stage Distribution */}
      <Card>
        <CardHeader><CardTitle className="text-sm">User Stage Distribution</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-32">
            {stageOrder.map(st => {
              const count = metrics.stageDistribution[st] || 0;
              const max = Math.max(...Object.values(metrics.stageDistribution), 1);
              const heightPct = (count / max) * 100;
              return (
                <div key={st} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-foreground">{count}</span>
                  <div className="w-full bg-muted rounded-t-sm overflow-hidden" style={{ height: '80px' }}>
                    <div className="w-full bg-primary/60 rounded-t-sm transition-all duration-500" style={{ height: `${heightPct}%`, marginTop: `${100 - heightPct}%` }} />
                  </div>
                  <span className="text-[9px] text-muted-foreground font-medium">{stageLabels[st] || st}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Errors + Audit */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Recent Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.recentErrors.length === 0 ? (
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle2 className="h-4 w-4" /> No recent errors
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-auto">
                {metrics.recentErrors.map(e => (
                  <div key={e.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-2">
                    <p className="text-xs font-medium text-foreground">{e.event_name}</p>
                    <p className="text-[10px] text-destructive truncate">{e.error_message}</p>
                    <p className="text-[9px] text-muted-foreground">{new Date(e.created_at).toLocaleString('de')}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" /> Recent Audit Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-auto">
              {metrics.recentAudit.map(a => (
                <div key={a.id} className="rounded-lg border border-border/40 bg-background p-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">{a.source_type || 'system'}</Badge>
                    <span className="text-xs font-medium text-foreground">{a.action}</span>
                  </div>
                  {a.note && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{a.note}</p>}
                  <p className="text-[9px] text-muted-foreground">{new Date(a.created_at).toLocaleString('de')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
