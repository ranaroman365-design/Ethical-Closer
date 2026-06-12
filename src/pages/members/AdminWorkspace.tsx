import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  Shield, Users, Search, ArrowLeft, Activity, Calendar,
  BookOpen, TrendingUp, Clock, CheckCircle2, BarChart3, User,
} from 'lucide-react';
import AdminEngagementPanel from '@/components/members/AdminEngagementPanel';

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  business_stage: string;
  current_phase: number;
  certified: boolean;
  placement_ready: boolean;
  onboarding_completed: boolean;
  created_at: string;
  first_login_at: string | null;
  member_status: string;
}

interface UserAnalytics {
  totalModules: number;
  completedModules: number;
  quizAttempts: number;
  quizPassed: number;
  practiceCalls: number;
  avgCallScore: number | null;
  progressHistory: { module_id: string; completed_at: string | null; completed: boolean }[];
  recentActivity: { action: string; date: string }[];
}

const STAGE_LABELS: Record<string, string> = {
  prospect: 'L0 Bewerber', opener: 'L1 Trainee', setter: 'L2 Associate Setter',
  senior_associate: 'L3 Senior Setter', junior_manager: 'L4 Closer (Placement Track)',
  manager: 'L5 Managing Closer', senior_manager: 'L6 Senior Closer',
  director: 'L7 Director', partner: 'L8 Partner',
};

export default function AdminWorkspace() {
  const { lang } = useLanguage();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'engagement'>('members');

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  useEffect(() => {
    supabase.from('profiles')
      .select('id, email, full_name, business_stage, current_phase, certified, placement_ready, onboarding_completed, created_at, first_login_at, member_status')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setUsers((data as UserRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  const loadUserAnalytics = async (userId: string) => {
    setAnalyticsLoading(true);
    const [progressRes, quizRes, practiceRes, modulesRes, xpRes] = await Promise.all([
      supabase.from('member_progress').select('module_id, completed, completed_at').eq('user_id', userId),
      supabase.from('quiz_attempts').select('id, passed, score, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('practice_calls').select('id, total_score, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('modules').select('id'),
      supabase.from('user_xp').select('action, created_at, xp_amount').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    ]);

    const progress = (progressRes.data ?? []) as any[];
    const quizzes = (quizRes.data ?? []) as any[];
    const practice = (practiceRes.data ?? []) as any[];
    const totalMods = (modulesRes.data ?? []).length;
    const xpActions = (xpRes.data ?? []) as any[];

    const scoredCalls = practice.filter(p => p.total_score != null);
    const avgScore = scoredCalls.length > 0
      ? Math.round(scoredCalls.reduce((s: number, c: any) => s + c.total_score, 0) / scoredCalls.length)
      : null;

    const recentActivity: { action: string; date: string }[] = [];
    xpActions.forEach((x: any) => recentActivity.push({ action: x.action, date: x.created_at }));
    quizzes.slice(0, 5).forEach((q: any) => recentActivity.push({
      action: `Quiz ${q.passed ? 'bestanden' : 'nicht bestanden'} (${q.score}%)`,
      date: q.created_at,
    }));
    practice.slice(0, 5).forEach((p: any) => recentActivity.push({
      action: `Practice Call ${p.status}${p.total_score ? ` (${p.total_score}/100)` : ''}`,
      date: p.created_at,
    }));

    recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setAnalytics({
      totalModules: totalMods,
      completedModules: progress.filter(p => p.completed).length,
      quizAttempts: quizzes.length,
      quizPassed: quizzes.filter(q => q.passed).length,
      practiceCalls: practice.length,
      avgCallScore: avgScore,
      progressHistory: progress,
      recentActivity: recentActivity.slice(0, 20),
    });
    setAnalyticsLoading(false);
  };

  const handleSelectUser = (user: UserRow) => {
    setSelectedUser(user);
    loadUserAnalytics(user.id);
  };

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-10 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // User Detail View
  if (selectedUser) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-10">
        <button onClick={() => { setSelectedUser(null); setAnalytics(null); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />{t('Zurück zur Übersicht', 'Back to Overview')}
        </button>

        <div className="mb-8">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
              <User className="h-7 w-7" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold text-foreground">{selectedUser.full_name || 'Kein Name'}</h1>
              <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
            </div>
          </div>
        </div>

        {analyticsLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
          </div>
        ) : analytics ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
              {[
                { label: t('Aktuelles Level', 'Current Level'), value: STAGE_LABELS[selectedUser.business_stage] || selectedUser.business_stage, icon: TrendingUp },
                { label: t('Module abgeschlossen', 'Modules Completed'), value: `${analytics.completedModules}/${analytics.totalModules}`, icon: BookOpen },
                { label: t('Quiz bestanden', 'Quizzes Passed'), value: `${analytics.quizPassed}/${analytics.quizAttempts}`, icon: CheckCircle2 },
                { label: t('Practice Calls', 'Practice Calls'), value: analytics.practiceCalls, icon: Activity },
                { label: t('Ø Call Score', 'Avg Call Score'), value: analytics.avgCallScore != null ? `${analytics.avgCallScore}/100` : '—', icon: BarChart3 },
                { label: t('Zertifiziert', 'Certified'), value: selectedUser.certified ? '✓' : '✗', icon: Shield },
                { label: t('Placement Ready', 'Placement Ready'), value: selectedUser.placement_ready ? '✓' : '✗', icon: CheckCircle2 },
                { label: t('Beigetreten', 'Joined'), value: new Date(selectedUser.created_at).toLocaleDateString('de-DE'), icon: Calendar },
              ].map(card => (
                <div key={card.label} className="rounded-xl border border-border/40 bg-card p-4">
                  <card.icon className="h-4 w-4 text-muted-foreground/50 mb-2" />
                  <p className="text-xl font-bold text-foreground">{card.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{card.label}</p>
                </div>
              ))}
            </div>

            {/* Module Progress */}
            <div className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                {t('MODULFORTSCHRITT', 'MODULE PROGRESS')}
              </h2>
              <div className="rounded-xl border border-border/40 bg-card p-5">
                <div className="h-2 w-full rounded-full bg-muted mb-3">
                  <div
                    className="h-2 rounded-full bg-accent transition-all"
                    style={{ width: `${analytics.totalModules > 0 ? (analytics.completedModules / analytics.totalModules) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {analytics.completedModules} {t('von', 'of')} {analytics.totalModules} {t('Modulen abgeschlossen', 'modules completed')}
                  {' '}({analytics.totalModules > 0 ? Math.round((analytics.completedModules / analytics.totalModules) * 100) : 0}%)
                </p>
              </div>
            </div>

            {/* Activity Timeline */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                {t('AKTIVITÄTSVERLAUF', 'ACTIVITY TIMELINE')}
              </h2>
              <div className="rounded-xl border border-border/40 bg-card divide-y divide-border/30">
                {analytics.recentActivity.length === 0 && (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('Noch keine Aktivitäten.', 'No activities yet.')}</p>
                )}
                {analytics.recentActivity.map((act, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-3">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/40" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-foreground">{act.action}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground/60">
                      {new Date(act.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  // User List View
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-10">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Admin Workspace
          </h1>
          <Badge className="bg-accent/15 text-accent border-0 text-[11px]">
            <Shield className="mr-1 h-3 w-3" />Admin
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
         {t('Vollständige Nutzerübersicht, Aktivitäts-Logbook und Qualitätskontrolle.', 'Complete user overview, activity logbook, and quality control.')}
        </p>
      </div>

      {/* Tab switcher */}
      <div className="mb-6 flex gap-2">
        {[
          { key: 'members' as const, label: t('Mitglieder', 'Members'), icon: Users },
          { key: 'engagement' as const, label: t('Engagement & Revenue', 'Engagement & Revenue'), icon: TrendingUp },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'engagement' && <AdminEngagementPanel />}

      {activeTab === 'members' && (
        <>

      {/* Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
        <Input
          placeholder={t('Mitglied suchen…', 'Search member…')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 text-sm"
        />
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t('Gesamt', 'Total'), value: users.length },
          { label: t('Aktive', 'Active'), value: users.filter(u => u.member_status !== 'applicant').length },
          { label: t('Zertifiziert', 'Certified'), value: users.filter(u => u.certified).length },
          { label: t('Placement Ready', 'Placement Ready'), value: users.filter(u => u.placement_ready).length },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/40 bg-card p-4 text-center">
            <p className="text-xl font-bold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* User List */}
      <div className="space-y-2">
        {filtered.map(u => (
          <button
            key={u.id}
            onClick={() => handleSelectUser(u)}
            className="flex w-full items-center gap-4 rounded-xl border border-border/40 bg-card p-4 text-left transition-all hover:border-accent/30 hover:shadow-sm"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-foreground truncate">{u.full_name || 'Kein Name'}</p>
              <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">{STAGE_LABELS[u.business_stage] || u.business_stage}</Badge>
            <div className="flex items-center gap-2 shrink-0">
              {u.certified && <Badge className="bg-primary/10 text-primary border-0 text-[9px]">Cert</Badge>}
              <span className="text-[10px] text-muted-foreground">
                {new Date(u.created_at).toLocaleDateString('de-DE')}
              </span>
            </div>
          </button>
        ))}
      {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">{t('Keine Mitglieder gefunden.', 'No members found.')}</p>
        )}
      </div>
      </>
      )}
    </div>
  );
}
