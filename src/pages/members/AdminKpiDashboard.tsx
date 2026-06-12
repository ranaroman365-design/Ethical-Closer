import { useEffect, useState } from 'react';
import { formatK } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Users, TrendingUp, Calendar, Target, Award, Activity,
  AlertTriangle, CheckCircle2, XCircle, RefreshCw, Shield,
  BarChart3, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

interface KpiData {
  leads: { total: number; today: number; bySource: Record<string, number> };
  quiz: { completions: number; dropOff: number; segments: Record<string, number> };
  appointments: { booked: number; showRate: number; noShowRate: number };
  conversion: { l0ToL1: number; closeRate: number; revenue: number };
  performance: { topSetter: string; topCloser: string; avgLeadQuality: number };
  health: { score: number; status: string; checks: any[]; errors: any[] };
}

const INITIAL: KpiData = {
  leads: { total: 0, today: 0, bySource: {} },
  quiz: { completions: 0, dropOff: 0, segments: {} },
  appointments: { booked: 0, showRate: 0, noShowRate: 0 },
  conversion: { l0ToL1: 0, closeRate: 0, revenue: 0 },
  performance: { topSetter: '-', topCloser: '-', avgLeadQuality: 0 },
  health: { score: 100, status: 'healthy', checks: [], errors: [] },
};

function StatCard({ label, value, icon: Icon, trend, sub }: { label: string; value: string | number; icon: any; trend?: number; sub?: string }) {
  return (
    <Card className="p-4 border-border/40 bg-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {trend !== undefined && (
            <div className={`flex items-center text-[10px] font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function HealthBadge({ status, score }: { status: string; score: number }) {
  const config = {
    healthy: { color: 'bg-green-500/10 text-green-700 border-green-200', icon: CheckCircle2, label: 'Stabil' },
    warning: { color: 'bg-yellow-500/10 text-yellow-700 border-yellow-200', icon: AlertTriangle, label: 'Warnung' },
    critical: { color: 'bg-red-500/10 text-red-700 border-red-200', icon: XCircle, label: 'Kritisch' },
  }[status] || { color: 'bg-muted text-muted-foreground border-border', icon: Activity, label: 'Unbekannt' };
  const Ic = config.icon;
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${config.color}`}>
      <Ic className="h-3.5 w-3.5" />
      {config.label} · {score}/100
    </div>
  );
}

export default function AdminKpiDashboard() {
  const { toast } = useToast();
  const [data, setData] = useState<KpiData>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [leadsRes, callsRes, profilesRes, healthRes, errorsRes, kpisRes] = await Promise.all([
        supabase.from('leads').select('id, stage, source, quiz_result, quiz_score, created_at, lead_level, appointment_date'),
        supabase.from('calls').select('id, user_id, result, revenue, deal_size, booked_at, showed_at, closed_at, status'),
        supabase.from('profiles').select('id, full_name, business_stage'),
        supabase.from('system_health_checks').select('*').order('created_at', { ascending: false }).limit(1),
        supabase.from('system_error_logs').select('*').eq('resolved', false).order('created_at', { ascending: false }).limit(20),
        supabase.from('member_kpis').select('user_id, closing_rate, show_rate, revenue_closed, calls_handled, leads_qualified'),
      ]);

      const leads = leadsRes.data || [];
      const calls = callsRes.data || [];
      const profiles = profilesRes.data || [];
      const health = healthRes.data?.[0];
      const errors = errorsRes.data || [];
      const kpis = kpisRes.data || [];

      // Leads
      const today = new Date().toISOString().slice(0, 10);
      const leadsToday = leads.filter(l => l.created_at?.startsWith(today)).length;
      const bySource: Record<string, number> = {};
      leads.forEach(l => { bySource[l.source || 'unknown'] = (bySource[l.source || 'unknown'] || 0) + 1; });

      // Quiz
      const quizDone = leads.filter(l => l.quiz_result).length;
      const segments: Record<string, number> = {};
      leads.forEach(l => { if (l.quiz_result) segments[l.quiz_result] = (segments[l.quiz_result] || 0) + 1; });

      // Appointments
      const booked = calls.filter(c => c.booked_at).length;
      const showed = calls.filter(c => c.showed_at).length;
      const showRate = booked > 0 ? Math.round((showed / booked) * 100) : 0;

      // Conversion
      const l1Count = leads.filter(l => l.lead_level === 'L1').length;
      const l0Count = leads.filter(l => l.lead_level === 'L0').length;
      const l0ToL1 = (l0Count + l1Count) > 0 ? Math.round((l1Count / (l0Count + l1Count)) * 100) : 0;
      const won = calls.filter(c => c.closed_at && c.result === 'won');
      const totalRevenue = won.reduce((s, c) => s + (c.revenue || c.deal_size || 0), 0);
      const closeRate = showed > 0 ? Math.round((won.length / showed) * 100) : 0;

      // Performance
      const setters = profiles.filter(p => ['setter', 'associate', 'senior_associate'].includes(p.business_stage || ''));
      const closers = profiles.filter(p => ['junior_manager', 'manager', 'senior_manager'].includes(p.business_stage || ''));
      
      let topSetter = '-';
      let topCloser = '-';
      let maxSetterLeads = 0;
      let maxCloserRate = 0;

      kpis.forEach(k => {
        const p = profiles.find(pr => pr.id === k.user_id);
        if (!p) return;
        if (setters.find(s => s.id === k.user_id) && (k.leads_qualified || 0) > maxSetterLeads) {
          maxSetterLeads = k.leads_qualified || 0;
          topSetter = p.full_name || 'Unbekannt';
        }
        if (closers.find(c => c.id === k.user_id) && (k.closing_rate || 0) > maxCloserRate) {
          maxCloserRate = k.closing_rate || 0;
          topCloser = p.full_name || 'Unbekannt';
        }
      });

      setData({
        leads: { total: leads.length, today: leadsToday, bySource },
        quiz: { completions: quizDone, dropOff: leads.length > 0 ? Math.round(((leads.length - quizDone) / leads.length) * 100) : 0, segments },
        appointments: { booked, showRate, noShowRate: 100 - showRate },
        conversion: { l0ToL1, closeRate, revenue: totalRevenue },
        performance: { topSetter, topCloser, avgLeadQuality: 0 },
        health: {
          score: health?.overall_score ?? 100,
          status: health?.status ?? 'healthy',
          checks: health?.details as any[] ?? [],
          errors,
        },
      });
    } catch (e) {
      console.error('KPI load error:', e);
    }
    setLoading(false);
  }

  async function runHealthCheck() {
    setRefreshing(true);
    try {
      await supabase.functions.invoke('run-system-health-check');
      await loadData();
      toast({ title: 'Health Check abgeschlossen' });
    } catch (e) {
      toast({ title: 'Fehler', description: String(e), variant: 'destructive' });
    }
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">System Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">KPIs · Health · Error Detection</p>
        </div>
        <div className="flex items-center gap-3">
          <HealthBadge status={data.health.status} score={data.health.score} />
          <Button variant="outline" size="sm" onClick={runHealthCheck} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            Health Check
          </Button>
        </div>
      </div>

      {/* Section 1: Leads */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Leads
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Gesamt Leads" value={data.leads.total} icon={Users} />
          <StatCard label="Leads Heute" value={data.leads.today} icon={TrendingUp} />
          {Object.entries(data.leads.bySource).slice(0, 2).map(([src, count]) => (
            <StatCard key={src} label={`Quelle: ${src}`} value={count} icon={Target} />
          ))}
        </div>
      </div>

      {/* Section 2: Quiz */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" /> Quiz
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Abgeschlossen" value={data.quiz.completions} icon={CheckCircle2} />
          <StatCard label="Drop-Off Rate" value={`${data.quiz.dropOff}%`} icon={AlertTriangle} />
          {Object.entries(data.quiz.segments).slice(0, 2).map(([seg, count]) => (
            <StatCard key={seg} label={seg} value={count} icon={Target} />
          ))}
        </div>
      </div>

      {/* Section 3: Termine */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" /> Termine
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Gebucht" value={data.appointments.booked} icon={Calendar} />
          <StatCard label="Show-Up Rate" value={`${data.appointments.showRate}%`} icon={CheckCircle2} />
          <StatCard label="No-Show Rate" value={`${data.appointments.noShowRate}%`} icon={XCircle} />
        </div>
      </div>

      {/* Section 4: Conversion */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Conversion
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="L0 → L1 Rate" value={`${data.conversion.l0ToL1}%`} icon={ArrowUpRight} />
          <StatCard label="Close Rate" value={`${data.conversion.closeRate}%`} icon={Target} />
          <StatCard label="Umsatz" value={formatK(data.conversion.revenue, '€')} icon={TrendingUp} />
        </div>
      </div>

      {/* Section 5: Performance */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" /> Performance
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Bester Setter" value={data.performance.topSetter} icon={Award} />
          <StatCard label="Bester Closer" value={data.performance.topCloser} icon={Award} />
          <StatCard label="System Health" value={`${data.health.score}/100`} icon={Activity} />
        </div>
      </div>

      {/* Error Log */}
      {data.health.errors.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Aktive Fehler ({data.health.errors.length})
          </h2>
          <div className="space-y-2">
            {data.health.errors.map((err: any) => (
              <Card key={err.id} className="p-3 border-border/40">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={err.error_level === 'CRITICAL' ? 'destructive' : 'secondary'} className="text-[10px]">
                        {err.error_level}
                      </Badge>
                      <span className="text-xs font-medium text-foreground">{err.title}</span>
                    </div>
                    {err.details && <p className="text-[11px] text-muted-foreground mt-1">{err.details}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Date(err.created_at).toLocaleString('de-DE')}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Health Check Details */}
      {data.health.checks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Letzter Health Check
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.health.checks.map((c: any, i: number) => (
              <Card key={i} className="p-3 border-border/40 flex items-center gap-3">
                {c.passed ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <div>
                  <p className="text-xs font-medium text-foreground">{c.name}</p>
                  {c.detail && <p className="text-[10px] text-muted-foreground">{c.detail}</p>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
