import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import { Users, TrendingUp, Phone, AlertTriangle, MessageCircle, BookOpen, RefreshCw, UserPlus, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from '@/hooks/use-toast';

interface MenteeProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  business_stage: string;
  certified: boolean;
  onboarding_completed: boolean;
  current_phase: number;
}

interface MenteeKpis {
  closing_rate: number | null;
  show_rate: number | null;
  calls_per_week: number | null;
  storno_rate: number | null;
  qualification_accuracy: number | null;
  calls_handled: number | null;
  revenue_closed: number | null;
}

interface MenteeData {
  profile: MenteeProfile;
  kpis: MenteeKpis | null;
  moduleProgress: number;
  assignedAt: string | null;
  source: string;
}

interface PotentialMentee {
  id: string;
  full_name: string | null;
  email: string | null;
  business_stage: string;
  certified: boolean;
}

interface MentorSuggestion {
  id: string;
  mentee_id: string;
  status: string;
  created_at: string;
  mentee_name?: string;
}

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Bewerber', opener: 'Trainee', setter: 'Setter',
  senior_associate: 'Senior Setter', junior_manager: 'Closer (Placement Track)',
  manager: 'Closer', senior_manager: 'Senior Closer',
  director: 'Director', partner: 'Partner',
};

const STAGE_ORDER = [
  'prospect', 'opener', 'setter', 'senior_associate',
  'junior_manager', 'manager', 'senior_manager',
  'director', 'partner',
];

// Get the stage one level below
function getStageBelowIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(normalizeBusinessStage(stage));
  return Math.max(0, idx - 1);
}

const STATUS_CONFIG: Record<string, { icon: React.ComponentType<any>; labelDe: string; labelEn: string; color: string }> = {
  suggested: { icon: Clock, labelDe: 'Vorgeschlagen', labelEn: 'Suggested', color: 'text-yellow-500' },
  reviewing: { icon: Clock, labelDe: 'In Prüfung', labelEn: 'Under Review', color: 'text-blue-400' },
  approved: { icon: CheckCircle, labelDe: 'Freigegeben', labelEn: 'Approved', color: 'text-green-500' },
  rejected: { icon: XCircle, labelDe: 'Abgelehnt', labelEn: 'Rejected', color: 'text-destructive' },
};

export default function MentorSpace() {
  const { user, profile, isAdmin } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;
  const [mentees, setMentees] = useState<MenteeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [eligibility, setEligibility] = useState<{ is_eligible: boolean; kpi_score: number; reason_blocked: string | null } | null>(null);
  const [potentialMentees, setPotentialMentees] = useState<PotentialMentee[]>([]);
  const [suggestions, setSuggestions] = useState<MentorSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'mentees' | 'discover'>('mentees');

  const userStage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Load eligibility status
    const { data: eligData } = await supabase
      .from('mentor_eligibility' as any)
      .select('is_eligible, kpi_score, reason_blocked')
      .eq('user_id', user.id)
      .single();
    setEligibility(eligData as any);

    // Load assignments
    const { data: assignments } = await supabase
      .from('mentor_assignments')
      .select('mentee_id, created_at, source')
      .eq('mentor_id', user.id)
      .eq('active', true);

    if (!assignments?.length) {
      setMentees([]);
    } else {
      const menteeIds = assignments.map((a: any) => a.mentee_id);
      const assignMap = new Map(assignments.map((a: any) => [a.mentee_id, a]));

      const [{ data: profiles }, { data: kpis }, { data: progress }, { data: modules }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, business_stage, certified, onboarding_completed, current_phase').in('id', menteeIds),
        supabase.from('member_kpis').select('user_id, closing_rate, show_rate, calls_per_week, storno_rate, qualification_accuracy, calls_handled, revenue_closed').in('user_id', menteeIds),
        supabase.from('member_progress').select('user_id, completed').in('user_id', menteeIds).eq('completed', true),
        supabase.from('modules').select('id'),
      ]);

      const kpiMap = new Map((kpis ?? []).map((k: any) => [k.user_id, k]));
      const totalModules = (modules ?? []).length || 1;
      const progressMap = new Map<string, number>();
      (progress ?? []).forEach((p: any) => {
        progressMap.set(p.user_id, (progressMap.get(p.user_id) || 0) + 1);
      });

      setMentees(((profiles as MenteeProfile[]) ?? []).map(p => ({
        profile: p,
        kpis: kpiMap.get(p.id) || null,
        moduleProgress: Math.round(((progressMap.get(p.id) || 0) / totalModules) * 100),
        assignedAt: assignMap.get(p.id)?.created_at || null,
        source: assignMap.get(p.id)?.source || 'unknown',
      })));
    }

    // Load potential mentees (one level below)
    const belowIdx = getStageBelowIndex(userStage);
    const belowStage = STAGE_ORDER[belowIdx];
    if (belowStage && belowStage !== userStage) {
      const { data: potentials } = await supabase
        .from('profiles')
        .select('id, full_name, email, business_stage, certified')
        .eq('business_stage', belowStage)
        .limit(50);
      setPotentialMentees((potentials as PotentialMentee[]) ?? []);
    }

    // Load existing suggestions
    const { data: sugData } = await supabase
      .from('mentor_suggestions' as any)
      .select('id, mentee_id, status, created_at')
      .eq('mentor_id', user.id);
    
    // Enrich with mentee names
    const sugList = (sugData as any[]) ?? [];
    if (sugList.length > 0) {
      const sugMenteeIds = sugList.map(s => s.mentee_id);
      const { data: sugProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', sugMenteeIds);
      const nameMap = new Map((sugProfiles ?? []).map((p: any) => [p.id, p.full_name]));
      setSuggestions(sugList.map(s => ({
        ...s,
        mentee_name: nameMap.get(s.mentee_id) || null,
      })));
    } else {
      setSuggestions([]);
    }

    setLoading(false);
  }, [user, userStage]);

  useEffect(() => { load(); }, [load]);

  const handleSuggest = async (menteeId: string) => {
    if (!user) return;
    setSuggesting(menteeId);
    try {
      const { error } = await supabase
        .from('mentor_suggestions' as any)
        .insert({ mentor_id: user.id, mentee_id: menteeId } as any);
      if (error) throw error;
      toast({ title: t('Vorschlag gesendet', 'Suggestion sent'), description: t('Admin wird benachrichtigt.', 'Admin will be notified.') });
      await load();
    } catch (e: any) {
      toast({ title: t('Fehler', 'Error'), description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSuggesting(null);
    }
  };

  const suggestedMenteeIds = new Set(suggestions.map(s => s.mentee_id));
  const assignedMenteeIds = new Set(mentees.map(m => m.profile.id));

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-32 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mentor Space</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Mentees betreuen und neue Mentorings vorschlagen.', 'Manage mentees and suggest new mentorings.')}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => load()} className="text-xs">
          <RefreshCw className="h-3 w-3 mr-1.5" /> {t('Aktualisieren', 'Refresh')}
        </Button>
      </div>

      {/* Eligibility Status */}
      {eligibility && (
        <div className={`rounded-xl border p-4 ${eligibility.is_eligible ? 'border-primary/20 bg-primary/5' : 'border-destructive/20 bg-destructive/5'}`}>
          <div className="flex items-center gap-2">
            {eligibility.is_eligible ? (
              <Badge className="bg-primary/10 text-primary border-0 text-[10px]">✓ {t('Mentor-berechtigt', 'Mentor Eligible')}</Badge>
            ) : (
              <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]">✗ {t('Nicht berechtigt', 'Not Eligible')}</Badge>
            )}
            <span className="text-[11px] text-muted-foreground">KPI Score: {Math.round(eligibility.kpi_score)}</span>
          </div>
          {eligibility.reason_blocked && (
            <p className="text-[11px] text-destructive mt-1">{eligibility.reason_blocked}</p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/40 pb-2">
        <button
          onClick={() => setActiveTab('mentees')}
          className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
            activeTab === 'mentees'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('Meine Mentees', 'My Mentees')} ({mentees.length})
        </button>
        <button
          onClick={() => setActiveTab('discover')}
          className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
            activeTab === 'discover'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('Mentoring entdecken', 'Discover Mentees')}
        </button>
      </div>

      {/* === TAB: My Mentees === */}
      {activeTab === 'mentees' && (
        <>
          {/* Pending Suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                {t('Vorschläge', 'Suggestions')}
              </p>
              {suggestions.map(s => {
                const cfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.suggested;
                const StatusIcon = cfg.icon;
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/30 bg-card p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground font-semibold text-xs">
                        {(s.mentee_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.mentee_name || t('Unbekannt', 'Unknown')}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleDateString('de-DE')}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 ${cfg.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-medium">{lang === 'de' ? cfg.labelDe : cfg.labelEn}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {mentees.length === 0 && suggestions.length === 0 && (
            <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">{t('Noch keine Mentees', 'No Mentees Yet')}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('Wechsle zum Tab "Mentoring entdecken", um Mentees vorzuschlagen.', 'Switch to "Discover Mentees" to suggest mentorings.')}
              </p>
            </div>
          )}

          <div className="space-y-4">
            {mentees.map(({ profile: m, kpis, moduleProgress, assignedAt, source }) => (
              <div key={m.id} className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {(m.full_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{m.full_name || m.email || 'Unbekannt'}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {STAGE_LABELS[m.business_stage] || m.business_stage}
                        {assignedAt && ` · seit ${new Date(assignedAt).toLocaleDateString('de-DE')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {m.certified && <Badge className="bg-primary/10 text-primary border-0 text-[9px]">{t('Zertifiziert', 'Certified')}</Badge>}
                    <Badge variant="outline" className="text-[9px]">{source}</Badge>
                  </div>
                </div>

                {/* Module Progress */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">{t('Modul-Fortschritt', 'Module Progress')}</span>
                    <span className="text-[11px] font-medium text-foreground">{moduleProgress}%</span>
                  </div>
                  <Progress value={moduleProgress} className="h-1.5" />
                </div>

                {/* KPIs */}
                {kpis && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { label: 'Close Rate', value: kpis.closing_rate, suffix: '%', warn: (kpis.closing_rate ?? 0) < 15 && kpis.closing_rate !== null },
                      { label: 'Show Rate', value: kpis.show_rate, suffix: '%', warn: (kpis.show_rate ?? 0) < 60 && kpis.show_rate !== null },
                      { label: 'Calls/W', value: kpis.calls_per_week, suffix: '', warn: (kpis.calls_per_week ?? 0) < 8 },
                      { label: 'Storno', value: kpis.storno_rate, suffix: '%', warn: (kpis.storno_rate ?? 0) > 10 },
                      { label: 'Quali', value: kpis.qualification_accuracy, suffix: '%', warn: false },
                    ].map(kpi => (
                      <div key={kpi.label} className="rounded-lg border border-border/30 bg-background p-2 text-center">
                        <p className="text-[9px] text-muted-foreground">{kpi.label}</p>
                        <p className={`text-sm font-bold ${kpi.warn ? 'text-destructive' : 'text-foreground'}`}>
                          {kpi.value !== null ? `${kpi.value}${kpi.suffix}` : '—'}
                        </p>
                        {kpi.warn && <AlertTriangle className="h-3 w-3 mx-auto text-destructive mt-0.5" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* === TAB: Discover Mentees === */}
      {activeTab === 'discover' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              `Nutzer auf Level ${STAGE_LABELS[STAGE_ORDER[getStageBelowIndex(userStage)]] || '—'} — schlage ein Mentoring vor.`,
              `Users at level ${STAGE_LABELS[STAGE_ORDER[getStageBelowIndex(userStage)]] || '—'} — suggest a mentoring.`
            )}
          </p>

          {potentialMentees.length === 0 && (
            <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">
                {t('Keine verfügbaren Mentees', 'No available mentees')}
              </p>
            </div>
          )}

          {potentialMentees.map(pm => {
            const alreadySuggested = suggestedMenteeIds.has(pm.id);
            const alreadyAssigned = assignedMenteeIds.has(pm.id);
            const existingSuggestion = suggestions.find(s => s.mentee_id === pm.id);

            return (
              <div key={pm.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground font-semibold text-sm">
                    {(pm.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{pm.full_name || pm.email || t('Unbekannt', 'Unknown')}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {STAGE_LABELS[pm.business_stage] || pm.business_stage}
                      {pm.certified && ` · ${t('Zertifiziert', 'Certified')}`}
                    </p>
                  </div>
                </div>
                <div>
                  {alreadyAssigned ? (
                    <Badge className="bg-primary/10 text-primary border-0 text-[10px]">{t('Bereits Mentee', 'Already Mentee')}</Badge>
                  ) : alreadySuggested && existingSuggestion ? (
                    (() => {
                      const cfg = STATUS_CONFIG[existingSuggestion.status] || STATUS_CONFIG.suggested;
                      const StatusIcon = cfg.icon;
                      return (
                        <div className={`flex items-center gap-1 ${cfg.color}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          <span className="text-[11px] font-medium">{lang === 'de' ? cfg.labelDe : cfg.labelEn}</span>
                        </div>
                      );
                    })()
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      disabled={suggesting === pm.id}
                      onClick={() => handleSuggest(pm.id)}
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                      {suggesting === pm.id
                        ? t('Wird gesendet…', 'Sending…')
                        : t('Mentoring vorschlagen', 'Suggest Mentoring')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
