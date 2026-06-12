import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  RefreshCw, Search, AlertTriangle, TrendingUp, TrendingDown,
  Users, Phone, DollarSign, Target, CheckCircle2, XCircle,
  ArrowUpDown, Filter, Activity, BarChart3, Zap,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────
interface TeamMember {
  id: string;
  full_name: string;
  business_stage: string;
  level: number;
  // KPI data
  show_rate: number;
  close_rate: number;
  calls_7d: number;
  calls_today: number;
  won_today: number;
  won_7d: number;
  revenue_7d: number;
  revenue_30d: number;
  // Compliance
  missing_outcomes: number;
  open_tasks: number;
  reflection_done: boolean;
  days_without_reflection: number;
  last_call_date: string | null;
  compliance_score: number;
}

interface Bottleneck {
  type: 'closing' | 'setter' | 'reminder' | 'data';
  user: string;
  userId: string;
  detail: string;
  severity: 'high' | 'medium';
}

interface FunnelStep {
  label: string;
  value: number;
  rate?: number;
}

type TimeFilter = 'today' | '7d' | '30d';
type SortField = 'full_name' | 'close_rate' | 'show_rate' | 'revenue_7d' | 'compliance_score' | 'calls_7d';

// ── Helpers ───────────────────────────────────────────────────
function statusColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
}

function statusBadge(score: number) {
  if (score >= 80) return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">OK</Badge>;
  if (score >= 50) return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">Warn</Badge>;
  return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">Action</Badge>;
}

// ── Main Component ────────────────────────────────────────────
export default function PerformanceControlLayer() {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7d');
  const [sortField, setSortField] = useState<SortField>('compliance_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
      const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();

      // Fetch profiles, KPIs, daily data in parallel
      const [profilesRes, kpisRes, outcomesTodayRes, outcomes7dRes, tasksRes, reflectionsRes, callsRes, leadsRes, appointmentsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, business_stage, level').not('business_stage', 'eq', 'applicant'),
        supabase.from('member_kpis').select('user_id, show_rate, closing_rate, calls_handled, revenue_closed, calls_per_week'),
        supabase.from('call_outcomes').select('user_id, outcome, deal_value').gte('created_at', `${todayStr}T00:00:00`),
        supabase.from('call_outcomes').select('user_id, outcome, deal_value').gte('created_at', d7),
        supabase.from('daily_tasks').select('user_id, task_status').eq('due_date', todayStr).eq('task_status', 'pending'),
        supabase.from('daily_reflections').select('user_id, reflection_date').gte('reflection_date', new Date(now.getTime() - 3 * 86400000).toISOString().split('T')[0]),
        supabase.from('calls').select('user_id, status, result, scheduled_for, revenue').gte('created_at', d7),
        supabase.from('leads').select('id, status').gte('created_at', d30),
        supabase.from('appointments').select('id, appointment_status, outcome').gte('created_at', d30),
      ]);

      const profiles = (profilesRes.data ?? []) as any[];
      const kpis = (kpisRes.data ?? []) as any[];
      const outcomesToday = (outcomesTodayRes.data ?? []) as any[];
      const outcomes7d = (outcomes7dRes.data ?? []) as any[];
      const tasks = (tasksRes.data ?? []) as any[];
      const reflections = (reflectionsRes.data ?? []) as any[];
      const calls7d = (callsRes.data ?? []) as any[];

      const kpiMap = new Map(kpis.map(k => [k.user_id, k]));

      // Build aggregate maps
      const todayOutcomeMap = new Map<string, { won: number; lost: number; noShow: number; rev: number }>();
      for (const o of outcomesToday) {
        const e = todayOutcomeMap.get(o.user_id) || { won: 0, lost: 0, noShow: 0, rev: 0 };
        if (o.outcome === 'won') { e.won++; e.rev += o.deal_value || 0; }
        else if (o.outcome === 'lost') e.lost++;
        else e.noShow++;
        todayOutcomeMap.set(o.user_id, e);
      }

      const weekOutcomeMap = new Map<string, { won: number; rev: number; total: number }>();
      for (const o of outcomes7d) {
        const e = weekOutcomeMap.get(o.user_id) || { won: 0, rev: 0, total: 0 };
        e.total++;
        if (o.outcome === 'won') { e.won++; e.rev += o.deal_value || 0; }
        weekOutcomeMap.set(o.user_id, e);
      }

      const taskMap = new Map<string, number>();
      for (const t of tasks) {
        taskMap.set(t.user_id, (taskMap.get(t.user_id) || 0) + 1);
      }

      const reflectionSet = new Set(reflections.map(r => `${r.user_id}_${r.reflection_date}`));

      // Calls without outcomes
      const callsWithoutOutcome = new Map<string, number>();
      const lastCallMap = new Map<string, string>();
      for (const c of calls7d) {
        if (c.scheduled_for) {
          const existing = lastCallMap.get(c.user_id);
          if (!existing || c.scheduled_for > existing) lastCallMap.set(c.user_id, c.scheduled_for);
        }
        if (!c.result && c.status !== 'scheduled') {
          callsWithoutOutcome.set(c.user_id, (callsWithoutOutcome.get(c.user_id) || 0) + 1);
        }
      }

      // Build members
      const teamMembers: TeamMember[] = profiles.map(p => {
        const kpi = kpiMap.get(p.id) || {};
        const todayData = todayOutcomeMap.get(p.id) || { won: 0, lost: 0, noShow: 0, rev: 0 };
        const weekData = weekOutcomeMap.get(p.id) || { won: 0, rev: 0, total: 0 };
        const openTasks = taskMap.get(p.id) || 0;
        const missingOutcomes = callsWithoutOutcome.get(p.id) || 0;
        const reflectionToday = reflectionSet.has(`${p.id}_${todayStr}`);

        // Days without reflection (check last 3 days)
        let daysNoReflection = 0;
        for (let i = 0; i < 3; i++) {
          const d = new Date(now.getTime() - i * 86400000).toISOString().split('T')[0];
          if (!reflectionSet.has(`${p.id}_${d}`)) daysNoReflection++;
        }

        // Compliance score
        const outcomeCompleteness = Math.max(0, 100 - missingOutcomes * 20);
        const taskCompletion = openTasks === 0 ? 100 : Math.max(0, 100 - openTasks * 15);
        const reflectionConsistency = daysNoReflection === 0 ? 100 : Math.max(0, 100 - daysNoReflection * 30);
        const activityScore = (kpi.calls_per_week || 0) >= 10 ? 100 : Math.round(((kpi.calls_per_week || 0) / 10) * 100);
        const compliance = Math.round((outcomeCompleteness * 0.3 + taskCompletion * 0.25 + reflectionConsistency * 0.25 + activityScore * 0.2));

        return {
          id: p.id,
          full_name: p.full_name || 'Unknown',
          business_stage: p.business_stage || 'opener',
          level: p.level || 1,
          show_rate: kpi.show_rate || 0,
          close_rate: kpi.closing_rate || 0,
          calls_7d: weekData.total,
          calls_today: todayData.won + todayData.lost + todayData.noShow,
          won_today: todayData.won,
          won_7d: weekData.won,
          revenue_7d: weekData.rev,
          revenue_30d: kpi.revenue_closed || 0,
          missing_outcomes: missingOutcomes,
          open_tasks: openTasks,
          reflection_done: reflectionToday,
          days_without_reflection: daysNoReflection,
          last_call_date: lastCallMap.get(p.id) || null,
          compliance_score: Math.min(100, Math.max(0, compliance)),
        };
      });

      setMembers(teamMembers);

      // Bottleneck detection
      const detectedBottlenecks: Bottleneck[] = [];
      for (const m of teamMembers) {
        if (m.show_rate >= 60 && m.close_rate < 10 && m.calls_7d >= 5) {
          detectedBottlenecks.push({
            type: 'closing', user: m.full_name, userId: m.id, severity: 'high',
            detail: `${m.calls_7d} Shows, ${m.close_rate}% Close Rate → Closing Review nötig`,
          });
        }
        if (m.missing_outcomes > 3) {
          detectedBottlenecks.push({
            type: 'data', user: m.full_name, userId: m.id, severity: 'medium',
            detail: `${m.missing_outcomes} Calls ohne Outcome → Datenqualität gefährdet`,
          });
        }
        if (m.days_without_reflection >= 2) {
          detectedBottlenecks.push({
            type: 'data', user: m.full_name, userId: m.id, severity: 'medium',
            detail: `${m.days_without_reflection} Tage ohne Reflection`,
          });
        }
      }
      setBottlenecks(detectedBottlenecks);

      // Funnel health
      const totalLeads = (leadsRes.data ?? []).length;
      const appointments = (appointmentsRes.data ?? []) as any[];
      const totalBookings = appointments.length;
      const totalShows = appointments.filter(a => a.appointment_status === 'completed' || a.outcome === 'showed').length;
      const totalCloses = outcomes7d.filter(o => o.outcome === 'won').length;
      const totalRevenue = outcomes7d.filter(o => o.outcome === 'won').reduce((s, o) => s + (o.deal_value || 0), 0);

      setFunnel([
        { label: 'Leads', value: totalLeads },
        { label: 'Bookings', value: totalBookings, rate: totalLeads > 0 ? Math.round((totalBookings / totalLeads) * 100) : 0 },
        { label: 'Shows', value: totalShows, rate: totalBookings > 0 ? Math.round((totalShows / totalBookings) * 100) : 0 },
        { label: 'Closes', value: totalCloses, rate: totalShows > 0 ? Math.round((totalCloses / totalShows) * 100) : 0 },
        { label: 'Revenue', value: totalRevenue },
      ]);

    } catch (err) {
      console.error('[PerformanceControl] fetch error:', err);
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

  // Filtering & sorting
  const filtered = members
    .filter(m => {
      if (search && !m.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (roleFilter === 'setter' && !['opener', 'setter', 'associate'].some(s => m.business_stage.includes(s))) return false;
      if (roleFilter === 'closer' && !['closer', 'senior', 'manager'].some(s => m.business_stage.includes(s))) return false;
      return true;
    })
    .sort((a, b) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      if (typeof av === 'string' && typeof bv === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && <ArrowUpDown className="h-3 w-3" />}
      </div>
    </TableHead>
  );

  // Aggregate stats
  const totalRevenue = members.reduce((s, m) => s + m.revenue_7d, 0);
  const totalCalls = members.reduce((s, m) => s + m.calls_7d, 0);
  const avgCompliance = members.length > 0 ? Math.round(members.reduce((s, m) => s + m.compliance_score, 0) / members.length) : 0;
  const alertCount = bottlenecks.filter(b => b.severity === 'high').length;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{tl('Performance Control Layer', 'Performance Control Layer')}</h1>
          <p className="text-xs text-muted-foreground">
            {tl('Team-Steuerung & Compliance', 'Team Control & Compliance')} · {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5 text-xs">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/40"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-primary" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{tl('Team', 'Team')}</span></div>
          <p className="text-2xl font-bold font-mono">{members.length}</p>
        </CardContent></Card>
        <Card className="border-border/40"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Phone className="h-4 w-4 text-green-500" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Calls (7d)</span></div>
          <p className="text-2xl font-bold font-mono">{totalCalls}</p>
        </CardContent></Card>
        <Card className="border-border/40"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-green-600" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue (7d)</span></div>
          <p className="text-2xl font-bold font-mono">€{totalRevenue.toLocaleString()}</p>
        </CardContent></Card>
        <Card className="border-border/40"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Activity className={`h-4 w-4 ${statusColor(avgCompliance)}`} /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Compliance</span></div>
          <p className={`text-2xl font-bold font-mono ${statusColor(avgCompliance)}`}>{avgCompliance}%</p>
        </CardContent></Card>
      </div>

      {/* Alerts / Bottlenecks */}
      {bottlenecks.length > 0 && (
        <Card className="border-red-500/20 bg-red-500/[0.02]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              {tl('Handlungsbedarf', 'Action Required')} ({bottlenecks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {bottlenecks.slice(0, 8).map((b, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/20 px-3 py-2 text-sm">
                <Badge variant={b.severity === 'high' ? 'destructive' : 'secondary'} className="text-[10px]">{b.severity}</Badge>
                <span className="font-medium">{b.user}</span>
                <span className="text-muted-foreground text-xs flex-1">{b.detail}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Funnel Health */}
      <Card className="border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            {tl('Funnel-Gesundheit (30d)', 'Funnel Health (30d)')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto">
            {funnel.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="text-center min-w-[80px]">
                  <p className="text-lg font-bold font-mono">{step.label === 'Revenue' ? `€${step.value.toLocaleString()}` : step.value}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{step.label}</p>
                </div>
                {i < funnel.length - 1 && step.rate !== undefined && (
                  <div className="flex flex-col items-center px-1">
                    <span className={`text-[10px] font-mono font-bold ${(step.rate ?? 0) >= 50 ? 'text-green-500' : (step.rate ?? 0) >= 20 ? 'text-amber-500' : 'text-red-500'}`}>
                      {funnel[i + 1]?.rate ?? 0}%
                    </span>
                    <div className="w-8 h-[1px] bg-border" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder={tl('Suche...', 'Search...')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-xs" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[120px] h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tl('Alle', 'All')}</SelectItem>
            <SelectItem value="setter">Setter</SelectItem>
            <SelectItem value="closer">Closer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Team Table */}
      <Card className="border-border/40">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <SortableHeader field="full_name">Name</SortableHeader>
                  <TableHead className="text-[10px]">{tl('Rolle', 'Role')}</TableHead>
                  <TableHead className="text-[10px]">Lvl</TableHead>
                  <SortableHeader field="calls_7d">Calls</SortableHeader>
                  <TableHead className="text-[10px]">Won</TableHead>
                  <SortableHeader field="revenue_7d">Rev (7d)</SortableHeader>
                  <SortableHeader field="show_rate">Show%</SortableHeader>
                  <SortableHeader field="close_rate">Close%</SortableHeader>
                  <TableHead className="text-[10px]">{tl('Tasks', 'Tasks')}</TableHead>
                  <TableHead className="text-[10px]">{tl('Outcomes', 'Outcomes')}</TableHead>
                  <TableHead className="text-[10px]">{tl('Reflection', 'Reflection')}</TableHead>
                  <SortableHeader field="compliance_score">Score</SortableHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(m => (
                  <TableRow key={m.id} className="text-xs">
                    <TableCell className="font-medium py-2">{m.full_name}</TableCell>
                    <TableCell className="py-2"><Badge variant="outline" className="text-[9px] capitalize">{m.business_stage}</Badge></TableCell>
                    <TableCell className="py-2 font-mono">L{m.level}</TableCell>
                    <TableCell className="py-2 font-mono">{m.calls_today}/{m.calls_7d}</TableCell>
                    <TableCell className="py-2 font-mono">{m.won_today}/{m.won_7d}</TableCell>
                    <TableCell className="py-2 font-mono">€{m.revenue_7d.toLocaleString()}</TableCell>
                    <TableCell className={`py-2 font-mono ${m.show_rate >= 60 ? 'text-green-500' : m.show_rate >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{m.show_rate}%</TableCell>
                    <TableCell className={`py-2 font-mono ${m.close_rate >= 20 ? 'text-green-500' : m.close_rate >= 10 ? 'text-amber-500' : 'text-red-500'}`}>{m.close_rate}%</TableCell>
                    <TableCell className="py-2">{m.open_tasks > 0 ? <Badge variant="destructive" className="text-[9px]">{m.open_tasks}</Badge> : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}</TableCell>
                    <TableCell className="py-2">{m.missing_outcomes > 0 ? <Badge variant="destructive" className="text-[9px]">{m.missing_outcomes}</Badge> : <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}</TableCell>
                    <TableCell className="py-2">{m.reflection_done ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}</TableCell>
                    <TableCell className="py-2">{statusBadge(m.compliance_score)}<span className={`ml-1 font-mono text-[10px] ${statusColor(m.compliance_score)}`}>{m.compliance_score}</span></TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">{tl('Keine Mitglieder gefunden', 'No members found')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        {tl(`${filtered.length} Mitglieder · Auto-Refresh 60s`, `${filtered.length} members · Auto-Refresh 60s`)}
      </p>
    </div>
  );
}
