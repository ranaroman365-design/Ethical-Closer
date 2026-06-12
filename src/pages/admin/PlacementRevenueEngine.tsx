import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Users, Target, DollarSign, CheckCircle2, TrendingUp,
  Search, RefreshCw, Briefcase, Award, ArrowRight,
  BarChart3, Building2, UserCheck, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────
interface CloserPool {
  id: string;
  full_name: string;
  level: number;
  show_rate: number;
  close_rate: number;
  calls_handled: number;
  revenue_closed: number;
  certified: boolean;
  placement_ready: boolean;
  conversation_style?: string;
  performance_score: number;
}

interface PlacementRow {
  id: string;
  closer_id: string;
  closer_name: string;
  tenant_name: string;
  company_name: string;
  status: string;
  start_date: string | null;
  revenue: number;
  calls: number;
  close_rate: number;
}

interface OpportunityRow {
  id: string;
  company: string;
  role_title: string;
  status: string;
  min_close_rate: number;
  min_show_rate: number;
  ticket_size: string;
  created_at: string;
}

// ── Readiness criteria (configurable defaults) ────────────────
const READINESS_CRITERIA = {
  minCalls: 20,
  minShowRate: 50,
  minCloseRate: 15,
  certified: true,
};

function calcPerformanceScore(m: any): number {
  const cr = Math.min(40, (m.closing_rate || 0) * 1.3);
  const sr = Math.min(30, (m.show_rate || 0) * 0.5);
  const calls = Math.min(20, (m.calls_handled || 0) * 0.5);
  const rev = Math.min(10, Math.log10(Math.max(1, m.revenue_closed || 1)) * 2);
  return Math.round(Math.min(100, cr + sr + calls + rev));
}

function isPlacementReady(m: any): boolean {
  return (
    (m.calls_handled || 0) >= READINESS_CRITERIA.minCalls &&
    (m.show_rate || 0) >= READINESS_CRITERIA.minShowRate &&
    (m.closing_rate || 0) >= READINESS_CRITERIA.minCloseRate
  );
}

// ── Main Component ────────────────────────────────────────────
export default function PlacementRevenueEngine() {
  const { lang } = useLanguage();
  const { isAdmin } = useAuth();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  const [tab, setTab] = useState('pool');
  const [pool, setPool] = useState<CloserPool[]>([]);
  const [placements, setPlacements] = useState<PlacementRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [kpisRes, profilesRes, certRes, placementsRes, oppsRes, metricsRes] = await Promise.all([
        supabase.from('member_kpis').select('user_id, show_rate, closing_rate, calls_handled, revenue_closed, calls_per_week'),
        supabase.from('profiles').select('id, full_name, level, certified, placement_ready, business_stage'),
        supabase.from('certification_status').select('user_id, final_score, current_level'),
        supabase.from('placements').select('*').order('created_at', { ascending: false }),
        supabase.from('placement_opportunities').select('*').order('created_at', { ascending: false }),
        supabase.from('placement_metrics').select('*'),
      ]);

      const profiles = (profilesRes.data ?? []) as any[];
      const kpis = (kpisRes.data ?? []) as any[];
      const kpiMap = new Map(kpis.map(k => [k.user_id, k]));
      const profileMap = new Map(profiles.map(p => [p.id, p]));

      // Build closer pool
      const closerPool: CloserPool[] = profiles
        .filter(p => {
          const kpi = kpiMap.get(p.id);
          return kpi && isPlacementReady(kpi);
        })
        .map(p => {
          const kpi = kpiMap.get(p.id) || {};
          return {
            id: p.id,
            full_name: p.full_name || 'Unknown',
            level: p.level || 1,
            show_rate: kpi.show_rate || 0,
            close_rate: kpi.closing_rate || 0,
            calls_handled: kpi.calls_handled || 0,
            revenue_closed: kpi.revenue_closed || 0,
            certified: p.certified || false,
            placement_ready: true,
            performance_score: calcPerformanceScore(kpi),
          };
        })
        .sort((a, b) => b.performance_score - a.performance_score);
      setPool(closerPool);

      // Build placements view
      const placementRows: PlacementRow[] = (placementsRes.data ?? []).map((pl: any) => {
        const closer = profileMap.get(pl.closer_id);
        const metrics = (metricsRes.data ?? []).filter((m: any) => m.placement_id === pl.id);
        const totalRev = metrics.reduce((s: number, m: any) => s + (m.revenue || 0), 0);
        const totalCalls = metrics.reduce((s: number, m: any) => s + (m.calls || 0), 0);
        const avgCr = metrics.length > 0 ? Math.round(metrics.reduce((s: number, m: any) => s + (m.close_rate || 0), 0) / metrics.length) : 0;
        return {
          id: pl.id,
          closer_id: pl.closer_id,
          closer_name: closer?.full_name || 'Unknown',
          tenant_name: pl.tenant_id || '—',
          company_name: pl.company_id || '—',
          status: pl.status,
          start_date: pl.start_date,
          revenue: totalRev,
          calls: totalCalls,
          close_rate: avgCr,
        };
      });
      setPlacements(placementRows);

      // Opportunities
      setOpportunities((oppsRes.data ?? []).map((o: any) => ({
        id: o.id,
        company: o.company || '—',
        role_title: o.role_title || '—',
        status: o.status,
        min_close_rate: o.min_close_rate || 0,
        min_show_rate: o.min_show_rate || 0,
        ticket_size: o.ticket_size || '—',
        created_at: o.created_at,
      })));

    } catch (err) {
      console.error('[PlacementEngine] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function runMatching(oppId: string) {
    toast.info(tl('Matching läuft...', 'Running matching...'));
    const { data, error } = await supabase.functions.invoke('run-placement-matching', { body: { opportunity_id: oppId } });
    if (error) { toast.error(error.message); return; }
    toast.success(`${data?.matches?.length || 0} Matches gefunden`);
    fetchData();
  }

  async function createPlacement(closerId: string, oppId?: string) {
    const { error } = await supabase.from('placements').insert({
      closer_id: closerId,
      opportunity_id: oppId || null,
      status: 'matched',
      start_date: new Date().toISOString().split('T')[0],
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(tl('Placement erstellt', 'Placement created'));
    fetchData();
  }

  // Stats
  const totalPoolRevenue = pool.reduce((s, p) => s + p.revenue_closed, 0);
  const activePlacements = placements.filter(p => p.status === 'active' || p.status === 'in_trial').length;
  const placementRevenue = placements.reduce((s, p) => s + p.revenue, 0);

  const filteredPool = pool.filter(p => !search || p.full_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Placement & Revenue Engine</h1>
          <p className="text-xs text-muted-foreground">{tl('Closer platzieren · Umsatz tracken · Performance messen', 'Place closers · Track revenue · Measure performance')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5 text-xs">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/40"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><UserCheck className="h-4 w-4 text-green-500" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{tl('Pool-Größe', 'Pool Size')}</span></div>
          <p className="text-2xl font-bold font-mono">{pool.length}</p>
        </CardContent></Card>
        <Card className="border-border/40"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Briefcase className="h-4 w-4 text-primary" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{tl('Aktive', 'Active')}</span></div>
          <p className="text-2xl font-bold font-mono">{activePlacements}</p>
        </CardContent></Card>
        <Card className="border-border/40"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-green-600" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">Placement Rev</span></div>
          <p className="text-2xl font-bold font-mono">€{placementRevenue.toLocaleString()}</p>
        </CardContent></Card>
        <Card className="border-border/40"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Target className="h-4 w-4 text-amber-500" /><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{tl('Opportunities', 'Opportunities')}</span></div>
          <p className="text-2xl font-bold font-mono">{opportunities.filter(o => o.status === 'open').length}</p>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="pool" className="text-xs gap-1"><Users className="h-3 w-3" /> {tl('Closer Pool', 'Closer Pool')}</TabsTrigger>
          <TabsTrigger value="placements" className="text-xs gap-1"><Briefcase className="h-3 w-3" /> Placements</TabsTrigger>
          <TabsTrigger value="opportunities" className="text-xs gap-1"><Building2 className="h-3 w-3" /> {tl('Angebote', 'Opportunities')}</TabsTrigger>
        </TabsList>

        {/* ── Closer Pool ──────────────────────────────── */}
        <TabsContent value="pool" className="space-y-3 mt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder={tl('Suche...', 'Search...')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-xs" />
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {tl(`Min: ${READINESS_CRITERIA.minCalls} Calls, ${READINESS_CRITERIA.minCloseRate}% CR, ${READINESS_CRITERIA.minShowRate}% SR`, `Min: ${READINESS_CRITERIA.minCalls} Calls, ${READINESS_CRITERIA.minCloseRate}% CR, ${READINESS_CRITERIA.minShowRate}% SR`)}
            </Badge>
          </div>

          <Card className="border-border/40">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px]">
                      <TableHead>#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Lvl</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Show%</TableHead>
                      <TableHead>Close%</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>{tl('Zertifiziert', 'Certified')}</TableHead>
                      <TableHead>Score</TableHead>
                      {isAdmin && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPool.map((c, i) => (
                      <TableRow key={c.id} className="text-xs">
                        <TableCell className="py-2 font-mono text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="py-2 font-medium">{c.full_name}</TableCell>
                        <TableCell className="py-2 font-mono">L{c.level}</TableCell>
                        <TableCell className="py-2 font-mono">{c.calls_handled}</TableCell>
                        <TableCell className={`py-2 font-mono ${c.show_rate >= 60 ? 'text-green-500' : 'text-amber-500'}`}>{c.show_rate}%</TableCell>
                        <TableCell className={`py-2 font-mono ${c.close_rate >= 20 ? 'text-green-500' : 'text-amber-500'}`}>{c.close_rate}%</TableCell>
                        <TableCell className="py-2 font-mono">€{c.revenue_closed.toLocaleString()}</TableCell>
                        <TableCell className="py-2">{c.certified ? <Award className="h-3.5 w-3.5 text-primary" /> : <span className="text-muted-foreground text-[10px]">—</span>}</TableCell>
                        <TableCell className="py-2"><Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">{c.performance_score}</Badge></TableCell>
                        {isAdmin && (
                          <TableCell className="py-2">
                            <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={() => createPlacement(c.id)}>
                              <Zap className="h-3 w-3 mr-1" /> Place
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {filteredPool.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">{tl('Keine placement-ready Closer', 'No placement-ready closers')}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Placements ──────────────────────────────── */}
        <TabsContent value="placements" className="space-y-3 mt-4">
          <Card className="border-border/40">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px]">
                      <TableHead>Closer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>{tl('Start', 'Start')}</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Close%</TableHead>
                      <TableHead>Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {placements.map(p => (
                      <TableRow key={p.id} className="text-xs">
                        <TableCell className="py-2 font-medium">{p.closer_name}</TableCell>
                        <TableCell className="py-2">
                          <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-[9px] capitalize">{p.status}</Badge>
                        </TableCell>
                        <TableCell className="py-2 font-mono text-[10px]">{p.start_date || '—'}</TableCell>
                        <TableCell className="py-2 font-mono">{p.calls}</TableCell>
                        <TableCell className="py-2 font-mono">{p.close_rate}%</TableCell>
                        <TableCell className="py-2 font-mono">€{p.revenue.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {placements.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{tl('Noch keine Placements', 'No placements yet')}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Opportunities ──────────────────────────── */}
        <TabsContent value="opportunities" className="space-y-3 mt-4">
          <Card className="border-border/40">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px]">
                      <TableHead>{tl('Unternehmen', 'Company')}</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Min CR</TableHead>
                      <TableHead>Min SR</TableHead>
                      <TableHead>Ticket</TableHead>
                      {isAdmin && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opportunities.map(o => (
                      <TableRow key={o.id} className="text-xs">
                        <TableCell className="py-2 font-medium">{o.company}</TableCell>
                        <TableCell className="py-2">{o.role_title}</TableCell>
                        <TableCell className="py-2"><Badge variant={o.status === 'open' ? 'default' : 'secondary'} className="text-[9px] capitalize">{o.status}</Badge></TableCell>
                        <TableCell className="py-2 font-mono">{o.min_close_rate}%</TableCell>
                        <TableCell className="py-2 font-mono">{o.min_show_rate}%</TableCell>
                        <TableCell className="py-2">{o.ticket_size}</TableCell>
                        {isAdmin && o.status === 'open' && (
                          <TableCell className="py-2">
                            <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={() => runMatching(o.id)}>
                              <Zap className="h-3 w-3 mr-1" /> Match
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {opportunities.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{tl('Keine Opportunities', 'No opportunities')}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
