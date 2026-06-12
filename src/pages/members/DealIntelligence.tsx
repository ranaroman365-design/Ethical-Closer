import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LOST_REASONS, WIN_REASONS } from '@/hooks/useDailyExecution';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Eye, Users, Phone, Target, Lightbulb, AlertTriangle } from 'lucide-react';

const COLORS = ['hsl(var(--primary))', 'hsl(0,84%,60%)', 'hsl(39,76%,49%)', 'hsl(217,91%,60%)', 'hsl(142,71%,45%)', 'hsl(280,67%,55%)', 'hsl(200,80%,50%)', 'hsl(340,80%,55%)'];

interface OutcomeRow {
  outcome: string;
  lost_reason: string | null;
  win_reasons: string[] | null;
  deal_value: number | null;
  user_id: string;
  created_at: string;
  call_id: string | null;
}

interface SetterRow {
  id: string;
  setter_id: string | null;
  outcome: string | null;
}

export default function DealIntelligence() {
  const { lang } = useLanguage();
  const { user, profile } = useAuth();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([]);
  const [appointments, setAppointments] = useState<SetterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = profile?.business_stage === 'admin' || profile?.business_stage === 'owner';

  useEffect(() => {
    if (!user?.id) return;
    const fetch = async () => {
      let query = supabase.from('call_outcomes').select('outcome, lost_reason, win_reasons, deal_value, user_id, created_at, call_id').order('created_at', { ascending: false }).limit(500);
      if (!isAdmin) query = query.eq('user_id', user.id);
      const [outRes, aptRes] = await Promise.all([
        query,
        isAdmin ? supabase.from('appointments').select('id, setter_id, outcome').limit(500) : Promise.resolve({ data: [] }),
      ]);
      setOutcomes((outRes.data as OutcomeRow[]) || []);
      setAppointments((aptRes.data as SetterRow[]) || []);
      setLoading(false);
    };
    fetch();
  }, [user?.id, isAdmin]);

  const totalDeals = outcomes.length;
  const wonDeals = outcomes.filter(o => o.outcome === 'won');
  const lostDeals = outcomes.filter(o => o.outcome === 'lost');
  const noShows = outcomes.filter(o => o.outcome === 'no_show');
  const closeRate = totalDeals > 0 ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length || 1)) * 100) : 0;
  const showRate = totalDeals > 0 ? Math.round(((wonDeals.length + lostDeals.length) / totalDeals) * 100) : 0;
  const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0);

  // Loss breakdown
  const lossBreakdown = LOST_REASONS.map(r => {
    const count = lostDeals.filter(d => d.lost_reason === r.value).length;
    return { name: lang === 'de' ? r.label : r.labelEn, value: count, pct: lostDeals.length > 0 ? Math.round((count / lostDeals.length) * 100) : 0 };
  }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

  // Win reasons breakdown
  const winBreakdown = WIN_REASONS.map(r => {
    const count = wonDeals.filter(d => d.win_reasons?.includes(r.value)).length;
    return { name: lang === 'de' ? r.label : r.labelEn, value: count };
  }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

  // Per-closer stats (admin only)
  const closerStats = isAdmin
    ? Object.values(
        outcomes.reduce((acc, o) => {
          if (!acc[o.user_id]) acc[o.user_id] = { user_id: o.user_id, won: 0, lost: 0, no_show: 0, revenue: 0 };
          if (o.outcome === 'won') { acc[o.user_id].won++; acc[o.user_id].revenue += o.deal_value || 0; }
          else if (o.outcome === 'lost') acc[o.user_id].lost++;
          else acc[o.user_id].no_show++;
          return acc;
        }, {} as Record<string, { user_id: string; won: number; lost: number; no_show: number; revenue: number }>),
      )
    : [];

  // Setter impact stats (admin only)
  const setterStats = isAdmin
    ? Object.values(
        appointments.reduce((acc, a) => {
          const sid = a.setter_id || 'unknown';
          if (!acc[sid]) acc[sid] = { setter_id: sid, total: 0, showed: 0, converted: 0 };
          acc[sid].total++;
          if (a.outcome === 'completed' || a.outcome === 'won' || a.outcome === 'lost') acc[sid].showed++;
          if (a.outcome === 'won') acc[sid].converted++;
          return acc;
        }, {} as Record<string, { setter_id: string; total: number; showed: number; converted: number }>),
      ).filter(s => s.setter_id !== 'unknown')
    : [];

  // Pattern insights
  const patterns: { icon: typeof Lightbulb; text: string; type: 'warning' | 'insight' }[] = [];
  if (lossBreakdown.length > 0 && lossBreakdown[0].pct >= 30) {
    patterns.push({
      icon: AlertTriangle,
      text: tl(`⚠️ ${lossBreakdown[0].pct}% der Deals scheitern an: ${lossBreakdown[0].name}`, `⚠️ ${lossBreakdown[0].pct}% of deals fail due to: ${lossBreakdown[0].name}`),
      type: 'warning',
    });
  }
  if (showRate < 70 && totalDeals >= 5) {
    patterns.push({
      icon: AlertTriangle,
      text: tl('⚠️ Show Rate unter 70% — Setter-Qualität prüfen', '⚠️ Show rate below 70% — check setter quality'),
      type: 'warning',
    });
  }
  if (noShows.length > wonDeals.length && totalDeals >= 5) {
    patterns.push({
      icon: AlertTriangle,
      text: tl('⚠️ Mehr No-Shows als gewonnene Deals — Termin-Bestätigung verbessern', '⚠️ More no-shows than won deals — improve appointment confirmation'),
      type: 'warning',
    });
  }
  if (closeRate >= 30 && totalDeals >= 5) {
    patterns.push({
      icon: Lightbulb,
      text: tl(`💡 Close Rate bei ${closeRate}% — starke Performance!`, `💡 Close rate at ${closeRate}% — strong performance!`),
      type: 'insight',
    });
  }
  if (winBreakdown.length > 0) {
    patterns.push({
      icon: Lightbulb,
      text: tl(`💡 Häufigster Gewinngrund: ${winBreakdown[0].name}`, `💡 Top win reason: ${winBreakdown[0].name}`),
      type: 'insight',
    });
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{tl('Deal Intelligence', 'Deal Intelligence')}</h1>
        <p className="text-sm text-muted-foreground">{tl('Warum Deals gewonnen oder verloren werden', 'Why deals are won or lost')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Phone} label={tl('Calls', 'Calls')} value={totalDeals} />
        <KpiCard icon={Target} label={tl('Close Rate', 'Close Rate')} value={`${closeRate}%`} accent />
        <KpiCard icon={Eye} label={tl('Show Rate', 'Show Rate')} value={`${showRate}%`} />
        <KpiCard icon={TrendingUp} label={tl('Umsatz', 'Revenue')} value={`€${totalRevenue.toLocaleString()}`} accent />
      </div>

      {/* Pattern Insights */}
      {patterns.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="h-4 w-4" /> {tl('Muster & Hinweise', 'Patterns & Insights')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {patterns.map((p, i) => (
              <div key={i} className={`text-xs rounded-lg p-2.5 flex items-start gap-2 ${p.type === 'warning' ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20' : 'bg-primary/5 text-primary border border-primary/20'}`}>
                <p.icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{p.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="losses" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="losses">{tl('Verlustgründe', 'Loss Reasons')}</TabsTrigger>
          <TabsTrigger value="wins">{tl('Gewinn-Gründe', 'Win Reasons')}</TabsTrigger>
          {isAdmin && <TabsTrigger value="closers">{tl('Closer Performance', 'Closer Performance')}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="setters">{tl('Setter Impact', 'Setter Impact')}</TabsTrigger>}
        </TabsList>

        <TabsContent value="losses">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{tl('Verlustgründe (%)', 'Loss Reasons (%)')}</CardTitle></CardHeader>
              <CardContent>
                {lossBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">{tl('Keine verlorenen Deals', 'No lost deals')}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={lossBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, pct }) => `${name} ${pct}%`}>
                        {lossBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{tl('Top Verlustgründe', 'Top Loss Reasons')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {lossBreakdown.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm">{r.name}</span>
                    </div>
                    <div className="text-sm font-medium">{r.pct}% <span className="text-muted-foreground">({r.value})</span></div>
                  </div>
                ))}
                {lossBreakdown.length > 0 && lossBreakdown[0] && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700">
                    {tl(`⚡ Hauptverlustgrund: ${lossBreakdown[0].name} (${lossBreakdown[0].pct}%)`, `⚡ Top loss reason: ${lossBreakdown[0].name} (${lossBreakdown[0].pct}%)`)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="wins">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{tl('Warum Deals gewonnen werden', 'Why deals are won')}</CardTitle></CardHeader>
            <CardContent>
              {winBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">{tl('Keine Daten', 'No data')}</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={winBreakdown} layout="vertical">
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="closers">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{tl('Closer Performance', 'Closer Performance')}</CardTitle></CardHeader>
              <CardContent>
                {closerStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">{tl('Keine Daten', 'No data')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">{tl('Closer', 'Closer')}</th>
                          <th className="text-center py-2">Won</th>
                          <th className="text-center py-2">Lost</th>
                          <th className="text-center py-2">No-Show</th>
                          <th className="text-center py-2">Close Rate</th>
                          <th className="text-right py-2">{tl('Umsatz', 'Revenue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closerStats.map(c => {
                          const total = c.won + c.lost;
                          const rate = total > 0 ? Math.round((c.won / total) * 100) : 0;
                          return (
                            <tr key={c.user_id} className="border-b border-border/50">
                              <td className="py-2 font-mono text-xs">{c.user_id.slice(0, 8)}…</td>
                              <td className="text-center text-green-600">{c.won}</td>
                              <td className="text-center text-red-500">{c.lost}</td>
                              <td className="text-center text-amber-500">{c.no_show}</td>
                              <td className="text-center font-medium">{rate}%</td>
                              <td className="text-right">€{c.revenue.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="setters">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> {tl('Setter Impact', 'Setter Impact')}</CardTitle></CardHeader>
              <CardContent>
                {setterStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">{tl('Keine Setter-Daten', 'No setter data')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Setter</th>
                          <th className="text-center py-2">{tl('Termine', 'Appointments')}</th>
                          <th className="text-center py-2">Show Rate</th>
                          <th className="text-center py-2">Conversion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {setterStats.map(s => {
                          const showR = s.total > 0 ? Math.round((s.showed / s.total) * 100) : 0;
                          const convR = s.showed > 0 ? Math.round((s.converted / s.showed) * 100) : 0;
                          return (
                            <tr key={s.setter_id} className="border-b border-border/50">
                              <td className="py-2 font-mono text-xs">{s.setter_id.slice(0, 8)}…</td>
                              <td className="text-center">{s.total}</td>
                              <td className={`text-center font-medium ${showR < 70 ? 'text-red-500' : 'text-green-600'}`}>{showR}%</td>
                              <td className={`text-center font-medium ${convR < 20 ? 'text-amber-500' : 'text-green-600'}`}>{convR}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${accent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
