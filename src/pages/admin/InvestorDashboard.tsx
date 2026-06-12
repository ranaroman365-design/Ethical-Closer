import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Globe, TrendingUp, Users, Building2, BarChart3,
  DollarSign, Activity, AlertTriangle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

/* ── types ── */
interface TenantRow {
  id: string;
  name: string;
  status: string;
  tenant_type: string | null;
}

interface TenantRevenueRow {
  tenant_id: string;
  total_revenue: number;
  platform_cut: number;
  partner_cut: number;
  total_leads: number;
  total_calls: number;
  total_closed: number;
  show_rate: number;
  close_rate: number;
}

/* ── helpers ── */
const fmt = (n: number) => n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${n.toFixed(0)}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

export default function InvestorDashboard() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [revenueMap, setRevenueMap] = useState<Record<string, TenantRevenueRow>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'30d' | '90d' | 'all'>('30d');

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, rRes] = await Promise.all([
      supabase.from('tenants').select('id,name,status,tenant_type'),
      supabase.from('tenant_revenue').select('*'),
    ]);
    setTenants((tRes.data ?? []) as TenantRow[]);
    const map: Record<string, TenantRevenueRow> = {};
    for (const r of (rRes.data ?? []) as TenantRevenueRow[]) {
      const prev = map[r.tenant_id];
      if (!prev || r.total_revenue > prev.total_revenue) map[r.tenant_id] = r;
    }
    setRevenueMap(map);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeTenants = tenants.filter(t => t.status === 'active');
  const totalRevenue = Object.values(revenueMap).reduce((s, r) => s + Number(r.total_revenue), 0);
  const platformRevenue = Object.values(revenueMap).reduce((s, r) => s + Number(r.platform_cut), 0);
  const totalLeads = Object.values(revenueMap).reduce((s, r) => s + (r.total_leads ?? 0), 0);
  const avgShowRate = Object.values(revenueMap).length
    ? Object.values(revenueMap).reduce((s, r) => s + Number(r.show_rate), 0) / Object.values(revenueMap).length
    : 0;
  const avgCloseRate = Object.values(revenueMap).length
    ? Object.values(revenueMap).reduce((s, r) => s + Number(r.close_rate), 0) / Object.values(revenueMap).length
    : 0;

  const ranked = [...tenants]
    .map(t => ({ ...t, rev: Number(revenueMap[t.id]?.total_revenue ?? 0) }))
    .sort((a, b) => b.rev - a.rev);

  if (loading) return <div className="p-8 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Globe className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Investor Dashboard</h1>
            <p className="text-sm text-muted-foreground">Plattform-Performance über alle Partner</p>
          </div>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">30 Tage</SelectItem>
            <SelectItem value="90d">90 Tage</SelectItem>
            <SelectItem value="all">Gesamt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon={Building2} label="Aktive Partner" value={String(activeTenants.length)} />
        <KpiCard icon={Users} label="Gesamt Leads" value={String(totalLeads)} />
        <KpiCard icon={DollarSign} label="Gesamt Revenue" value={fmt(totalRevenue)} accent />
        <KpiCard icon={TrendingUp} label="Plattform Revenue" value={fmt(platformRevenue)} accent />
        <KpiCard icon={Activity} label="Ø Show Rate" value={pct(avgShowRate)} />
        <KpiCard icon={BarChart3} label="Ø Close Rate" value={pct(avgCloseRate)} />
      </div>

      {/* Partner Ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Partner Performance Ranking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Partner</th>
                  <th className="pb-2 pr-4">Typ</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4 text-right">Revenue</th>
                  <th className="pb-2 pr-4 text-right">Show Rate</th>
                  <th className="pb-2 pr-4 text-right">Close Rate</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((t, i) => {
                  const r = revenueMap[t.id];
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 pr-4 font-medium">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium">{t.name}</td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline" className="text-xs">{t.tenant_type ?? 'internal'}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={t.status === 'active' ? 'default' : 'secondary'} className="text-xs">{t.status}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono">{fmt(t.rev)}</td>
                      <td className="py-2 pr-4 text-right">{r ? pct(Number(r.show_rate)) : '—'}</td>
                      <td className="py-2 pr-4 text-right">{r ? pct(Number(r.close_rate)) : '—'}</td>
                    </tr>
                  );
                })}
                {ranked.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Noch keine Partner vorhanden</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      {avgShowRate > 0 && avgShowRate < 60 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive font-medium">
              Ø Show Rate unter 60% — systemweite Intervention empfohlen
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-4 gap-1">
        <Icon className={`h-5 w-5 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className={`text-xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</span>
        <span className="text-xs text-muted-foreground text-center">{label}</span>
      </CardContent>
    </Card>
  );
}
