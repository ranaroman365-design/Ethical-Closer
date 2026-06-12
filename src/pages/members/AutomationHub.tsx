import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import {
  Zap, ArrowRight, AlertTriangle, TrendingUp, Users, Clock,
  RefreshCw, Brain, Shield, Activity, CheckCircle2, XCircle,
  BarChart3, Lightbulb, Loader2, Target, Play,
} from 'lucide-react';

type EventRow = Record<string, any>;
type KpiRow = Record<string, any>;
type ProfileRow = Record<string, any>;
type LeadRow = Record<string, any>;

export default function AutomationHub() {
  const { lang } = useLanguage();
  const { user, profile } = useAuth();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [performanceFlags, setPerformanceFlags] = useState<any[]>([]);
  const [followupCount, setFollowupCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [evtRes, kpiRes, profRes, leadRes] = await Promise.all([
        supabase.from('lead_events').select('*')
          .in('event_type', ['auto_routing_suggested', 'followup_triggered', 'performance_flagged', 'setter_assigned', 'closer_assigned'])
          .order('created_at', { ascending: false }).limit(100),
        supabase.from('member_kpis').select('*'),
        supabase.from('profiles').select('id, full_name, business_stage'),
        supabase.from('leads').select('id, stage, setter_id, closer_id, lead_quality, created_at').limit(500),
      ]);
      setEvents(evtRes.data ?? []);
      setKpis(kpiRes.data ?? []);
      setProfiles(profRes.data ?? []);
      setLeads(leadRes.data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  // Derived stats
  const funnelStats = useMemo(() => {
    const total = leads.length;
    const withSetter = leads.filter(l => l.setter_id).length;
    const withCloser = leads.filter(l => l.closer_id).length;
    const won = leads.filter(l => l.stage === 'closed_won').length;
    const lost = leads.filter(l => l.stage === 'closed_lost').length;
    const inProgress = leads.filter(l => !['closed_won', 'closed_lost', 'cancelled', 'recycled'].includes(l.stage)).length;
    const conversion = total > 0 ? Math.round((won / total) * 100) : 0;
    return { total, withSetter, withCloser, won, lost, inProgress, conversion };
  }, [leads]);

  const bottlenecks = useMemo(() => {
    const b: { text: string; severity: 'warning' | 'critical' }[] = [];
    const unassigned = leads.filter(l => !l.setter_id && l.stage === 'in_pool').length;
    if (unassigned > 5) b.push({ text: tl(`${unassigned} Leads ohne Setter`, `${unassigned} leads without setter`), severity: 'critical' });
    const readyForCloser = leads.filter(l => l.stage === 'ready_for_closer' && !l.closer_id).length;
    if (readyForCloser > 3) b.push({ text: tl(`${readyForCloser} Leads warten auf Closer`, `${readyForCloser} leads waiting for closer`), severity: 'warning' });
    const recentFollowups = events.filter(e => e.event_type === 'followup_triggered').length;
    if (recentFollowups > 10) b.push({ text: tl(`${recentFollowups} offene Follow-Ups`, `${recentFollowups} open follow-ups`), severity: 'warning' });
    return b;
  }, [leads, events, tl]);

  const recentAutomationEvents = useMemo(() => {
    return events.slice(0, 30).map(e => ({
      notes: e.notes as string | null,
      created_at: e.created_at as string,
      label: ({
        auto_routing_suggested: tl('Routing-Vorschlag', 'Routing suggestion'),
        followup_triggered: tl('Follow-Up ausgelöst', 'Follow-up triggered'),
        performance_flagged: tl('Performance-Flag', 'Performance flag'),
        setter_assigned: tl('Setter zugewiesen', 'Setter assigned'),
        closer_assigned: tl('Closer zugewiesen', 'Closer assigned'),
      } as Record<string, string>)[e.event_type] || e.event_type,
      isAlert: e.event_type === 'performance_flagged',
    }));
  }, [events, tl]);

  const runFollowups = async () => {
    setRunningAction('followups');
    try {
      const { data, error } = await supabase.functions.invoke('automation-engine', {
        body: { action: 'process_followups' },
      });
      if (error) throw error;
      setFollowupCount(data?.followups ?? 0);
      toast({ title: tl('Follow-Ups verarbeitet', 'Follow-ups processed'), description: `${data?.followups ?? 0} ${tl('neue Follow-Ups erstellt', 'new follow-ups created')}` });
    } catch {
      toast({ title: tl('Fehler', 'Error'), variant: 'destructive' });
    } finally {
      setRunningAction(null);
    }
  };

  const runPerformanceCheck = async () => {
    setRunningAction('performance');
    try {
      const { data, error } = await supabase.functions.invoke('automation-engine', {
        body: { action: 'check_performance' },
      });
      if (error) throw error;
      setPerformanceFlags(data?.flags ?? []);
      toast({ title: tl('Performance-Check', 'Performance check'), description: `${data?.flags?.length ?? 0} ${tl('Flags erkannt', 'flags detected')}` });
    } catch {
      toast({ title: tl('Fehler', 'Error'), variant: 'destructive' });
    } finally {
      setRunningAction(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            {tl('Automation Hub', 'Automation Hub')}
          </h1>
          <p className="text-sm text-muted-foreground">{tl('Automatisches Routing, Follow-Ups & Performance-Optimierung', 'Automated routing, follow-ups & performance optimization')}</p>
        </div>
        <Badge variant="outline" className="text-xs">
          <Shield className="h-3 w-3 mr-1" />
          {tl('System schlägt vor — Sie entscheiden', 'System suggests — you decide')}
        </Badge>
      </div>

      {/* Bottleneck Alerts */}
      {bottlenecks.length > 0 && (
        <div className="space-y-2">
          {bottlenecks.map((b, i) => (
            <div key={i} className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm',
              b.severity === 'critical' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-amber-500/30 bg-amber-500/5 text-amber-700'
            )}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lead Flow Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Users} label={tl('Leads gesamt', 'Total Leads')} value={funnelStats.total} />
        <StatCard icon={ArrowRight} label={tl('In Bearbeitung', 'In Progress')} value={funnelStats.inProgress} />
        <StatCard icon={Target} label="Conversion" value={`${funnelStats.conversion}%`} accent />
        <StatCard icon={TrendingUp} label={tl('Gewonnen', 'Won')} value={funnelStats.won} accent />
      </div>

      {/* Action Buttons */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{tl('Follow-Up Automation', 'Follow-Up Automation')}</p>
              <p className="text-xs text-muted-foreground">{tl('No-Shows & verlorene Deals nachfassen', 'Follow up on no-shows & lost deals')}</p>
            </div>
            <Button size="sm" onClick={runFollowups} disabled={!!runningAction} className="gap-2">
              {runningAction === 'followups' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {tl('Ausführen', 'Run')}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{tl('Performance Check', 'Performance Check')}</p>
              <p className="text-xs text-muted-foreground">{tl('Schwache Setter/Closer erkennen', 'Detect weak setters/closers')}</p>
            </div>
            <Button size="sm" onClick={runPerformanceCheck} disabled={!!runningAction} className="gap-2">
              {runningAction === 'performance' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
              {tl('Prüfen', 'Check')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="flags" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="flags">{tl('Performance Flags', 'Performance Flags')}</TabsTrigger>
          <TabsTrigger value="events">{tl('Automation Log', 'Automation Log')}</TabsTrigger>
        </TabsList>

        <TabsContent value="flags">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {tl('Empfehlungen', 'Recommendations')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {performanceFlags.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{tl('Performance Check ausführen für Ergebnisse', 'Run performance check for results')}</p>
              ) : (
                <div className="space-y-3">
                  {performanceFlags.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
                      <div className={cn(
                        'p-1.5 rounded-lg shrink-0',
                        f.recommendation === 'training' ? 'bg-amber-500/10 text-amber-600' : 'bg-destructive/10 text-destructive'
                      )}>
                        {f.recommendation === 'training' ? <Lightbulb className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{f.name || tl('Unbekannt', 'Unknown')}</p>
                        <p className="text-xs text-muted-foreground">{lang === 'de' ? f.message_de : f.message_en}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {f.recommendation === 'training' ? tl('Training', 'Training') :
                         f.recommendation === 'fewer_leads' ? tl('Weniger Leads', 'Fewer Leads') :
                         tl('Review', 'Review')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {tl('Letzte Automations-Events', 'Recent Automation Events')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentAutomationEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{tl('Keine Events', 'No events')}</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {recentAutomationEvents.map((e, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50">
                      <div className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        e.isAlert ? 'bg-destructive' : 'bg-primary'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{e.label}</p>
                        {e.notes && <p className="text-[11px] text-muted-foreground truncate">{e.notes}</p>}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(e.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('p-2 rounded-lg', accent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
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
