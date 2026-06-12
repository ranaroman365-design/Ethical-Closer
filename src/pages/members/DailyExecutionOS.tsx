import { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useKpis } from '@/hooks/useKpis';
import { useDailyExecution } from '@/hooks/useDailyExecution';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CallOutcomeModal from '@/components/daily-execution/CallOutcomeModal';
import DailyReflectionBlock from '@/components/daily-execution/DailyReflectionBlock';
import RecentCallsRecorder from '@/components/daily-execution/RecentCallsRecorder';
import {
  Phone, CheckCircle2, XCircle, UserX, DollarSign,
  AlertCircle, ArrowRight, Zap, TrendingUp, Clock,
  Target, BarChart3, CircleDot
} from 'lucide-react';

// ── Today Stats ───────────────────────────────────────────────
function TodayStats({ userId }: { userId: string }) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;
  const [stats, setStats] = useState({ planned: 0, done: 0, won: 0, lost: 0, noShow: 0, revenue: 0 });

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      supabase.from('calls').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('scheduled_for', `${today}T00:00:00`).lte('scheduled_for', `${today}T23:59:59`),
      supabase.from('call_outcomes').select('outcome, deal_value').eq('user_id', userId).gte('created_at', `${today}T00:00:00`),
    ]).then(([callsRes, outcomesRes]) => {
      const outcomes = (outcomesRes.data ?? []) as { outcome: string; deal_value: number }[];
      setStats({
        planned: callsRes.count ?? 0,
        done: outcomes.length,
        won: outcomes.filter(o => o.outcome === 'won').length,
        lost: outcomes.filter(o => o.outcome === 'lost').length,
        noShow: outcomes.filter(o => o.outcome === 'no_show').length,
        revenue: outcomes.filter(o => o.outcome === 'won').reduce((s, o) => s + (o.deal_value || 0), 0),
      });
    });
  }, [userId]);

  const items = [
    { label: tl('Geplant', 'Planned'), value: stats.planned, icon: Clock, color: 'text-muted-foreground' },
    { label: tl('Durchgeführt', 'Completed'), value: stats.done, icon: Phone, color: 'text-primary' },
    { label: 'Won', value: stats.won, icon: CheckCircle2, color: 'text-green-500' },
    { label: 'Lost', value: stats.lost, icon: XCircle, color: 'text-red-500' },
    { label: 'No-Show', value: stats.noShow, icon: UserX, color: 'text-amber-500' },
    { label: 'Revenue', value: `€${stats.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-green-600' },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {items.map(item => (
        <Card key={item.label} className="border-border/40">
          <CardContent className="p-3 text-center">
            <item.icon className={`h-4 w-4 mx-auto mb-1 ${item.color}`} />
            <p className="text-lg font-bold">{item.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── KPI Strip ─────────────────────────────────────────────────
function KpiStrip({ role }: { role: string }) {
  const { kpis } = useKpis();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  const baseKpis = [
    { label: 'Show Rate', value: `${kpis?.show_rate ?? 0}%`, icon: Target },
    { label: 'Close Rate', value: `${kpis?.closing_rate ?? 0}%`, icon: TrendingUp },
    { label: tl('Umsatz', 'Revenue'), value: `€${(kpis?.revenue_closed ?? 0).toLocaleString()}`, icon: DollarSign },
  ];

  const setterKpis = [
    { label: 'Booking Rate', value: `${kpis?.handover_rate ?? 0}%`, icon: BarChart3 },
    { label: tl('Qualifikation', 'Qualification'), value: `${kpis?.qualification_accuracy ?? 0}%`, icon: CircleDot },
  ];

  const closerKpis = [
    { label: tl('Umsatz/Call', 'Rev/Call'), value: `€${kpis?.revenue_per_call ?? 0}`, icon: BarChart3 },
    { label: 'Storno', value: `${kpis?.storno_rate ?? 0}%`, icon: CircleDot },
  ];

  const roleKpis = role === 'setter' ? setterKpis : closerKpis;
  const allKpis = [...baseKpis, ...roleKpis];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {allKpis.map(k => (
        <div key={k.label} className="flex items-center gap-2 rounded-xl border border-border/40 bg-card px-3 py-2 min-w-fit">
          <k.icon className="h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <p className="text-xs font-bold">{k.value}</p>
            <p className="text-[9px] text-muted-foreground uppercase">{k.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Next Best Action ──────────────────────────────────────────
function NextBestAction({ pendingTasks, outcomesCount, reflection }: { pendingTasks: any[]; outcomesCount: number; reflection: any }) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  let action = { title: '', reason: '', urgent: false };

  // Priority 1: Missing call outcomes
  if (pendingTasks.some(t => t.task_type === 'log_outcome')) {
    action = {
      title: tl('Fehlende Call Outcomes eintragen', 'Log missing call outcomes'),
      reason: tl('Pflichtfeld — Calls ohne Ergebnis blockieren deinen Fortschritt', 'Required — calls without outcomes block your progress'),
      urgent: true,
    };
  }
  // Priority 2: Follow-ups
  else if (pendingTasks.some(t => t.task_type === 'follow_up')) {
    action = {
      title: tl('Follow-ups bearbeiten', 'Process follow-ups'),
      reason: tl('Fällige Leads warten auf deine Kontaktaufnahme', 'Due leads waiting for your contact'),
      urgent: true,
    };
  }
  // Priority 3: Daily reflection
  else if (!reflection) {
    action = {
      title: tl('Tagesreflexion ausfüllen', 'Complete daily reflection'),
      reason: tl('Erfahrung in Verbesserung übersetzen', 'Translate experience into improvement'),
      urgent: false,
    };
  }
  // Priority 4: General tasks
  else if (pendingTasks.length > 0) {
    action = {
      title: pendingTasks[0].task_title,
      reason: pendingTasks[0].task_description || '',
      urgent: pendingTasks[0].priority <= 3,
    };
  }
  // All done
  else {
    action = {
      title: tl('Alles erledigt — stark!', 'All done — great!'),
      reason: tl('Fokus auf deinen nächsten Call', 'Focus on your next call'),
      urgent: false,
    };
  }

  return (
    <div className={`flex items-center gap-4 rounded-2xl border p-4 transition-all ${action.urgent ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-primary/15 bg-primary/[0.03]'}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.urgent ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
        {action.urgent ? <AlertCircle className="h-5 w-5 text-amber-500" /> : <Zap className="h-5 w-5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-0.5">
          {tl('Deine #1 Aktion jetzt', 'Your #1 action now')}
        </p>
        <p className="text-sm font-semibold text-foreground truncate">{action.title}</p>
        <p className="text-xs text-muted-foreground truncate">{action.reason}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
    </div>
  );
}

// ── Task List ─────────────────────────────────────────────────
function TaskList({ tasks, onComplete }: { tasks: any[]; onComplete: (id: string) => void }) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  if (tasks.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        {tl('Keine offenen Aufgaben — weiter so!', 'No open tasks — keep going!')}
      </div>
    );
  }

  const priorityColor = (p: number) => p <= 2 ? 'bg-red-500' : p <= 4 ? 'bg-amber-500' : 'bg-muted-foreground';

  return (
    <div className="space-y-1.5">
      {tasks.map(task => (
        <div key={task.id} className="flex items-center gap-3 rounded-lg border border-border/40 p-3 hover:bg-muted/30 transition-colors">
          <div className={`h-2 w-2 rounded-full ${priorityColor(task.priority)}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{task.task_title}</p>
            {task.task_description && <p className="text-xs text-muted-foreground truncate">{task.task_description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onComplete(task.id)} className="shrink-0 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {tl('Erledigt', 'Done')}
          </Button>
        </div>
      ))}
    </div>
  );
}

// ── Outcomes Today ────────────────────────────────────────────
function OutcomesToday({ outcomes }: { outcomes: any[] }) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  if (outcomes.length === 0) return null;

  const outcomeIcon = (o: string) => {
    if (o === 'won') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    if (o === 'lost') return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    return <UserX className="h-3.5 w-3.5 text-amber-500" />;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{tl('Call-Ergebnisse heute', 'Call Outcomes Today')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {outcomes.slice(0, 8).map(o => (
          <div key={o.id} className="flex items-center gap-3 text-sm">
            {outcomeIcon(o.outcome)}
            <span className="font-medium capitalize">{o.outcome}</span>
            {o.deal_value > 0 && <Badge variant="secondary" className="text-xs">€{o.deal_value.toLocaleString()}</Badge>}
            {o.lost_reason && <span className="text-xs text-muted-foreground">{o.lost_reason}</span>}
            {o.self_rating && <span className="text-xs text-muted-foreground ml-auto">{o.self_rating}/10</span>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function DailyExecutionOS() {
  const { user, profile } = useAuth();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;
  const { pendingTasks, doneTasks, outcomes, reflection, loading, completeTask, submitOutcome, submitReflection } = useDailyExecution();
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);

  const stage = (profile as any)?.business_stage || 'opener';
  const role = stage.includes('closer') || stage === 'senior' ? 'closer' : 'setter';

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{tl('Daily Execution', 'Daily Execution')}</h1>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <Button onClick={() => setOutcomeModalOpen(true)} size="sm" className="gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            {tl('Call Outcome', 'Call Outcome')}
          </Button>
        </div>

        {/* Today Overview */}
        <TodayStats userId={user.id} />

        {/* Core KPIs */}
        <KpiStrip role={role} />

        {/* Next Best Action */}
        <NextBestAction pendingTasks={pendingTasks} outcomesCount={outcomes.length} reflection={reflection} />

        {/* Open Tasks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <span>{tl('Offene Aufgaben', 'Open Tasks')} ({pendingTasks.length})</span>
              {doneTasks.length > 0 && <Badge variant="secondary" className="text-[10px]">{doneTasks.length} {tl('erledigt', 'done')}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TaskList tasks={pendingTasks} onComplete={completeTask} />
          </CardContent>
        </Card>

        {/* Outcomes Today */}
        <OutcomesToday outcomes={outcomes} />

        {/* Recent calls awaiting transcript upload */}
        <RecentCallsRecorder />

        {/* Daily Reflection */}
        <DailyReflectionBlock reflection={reflection} onSubmit={submitReflection} />

        {/* Call Outcome Modal */}
        <CallOutcomeModal
          open={outcomeModalOpen}
          onSubmit={submitOutcome}
          onClose={() => setOutcomeModalOpen(false)}
        />
      </div>
    </div>
  );
}
