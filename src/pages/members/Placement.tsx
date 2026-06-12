import { useEffect, useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useAcademyData } from '@/hooks/useAcademyData';
import { useKpis } from '@/hooks/useKpis';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getUserLevel } from '@/components/members/CareerPath';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  CheckCircle2, Circle, Lock, TrendingUp, MapPin, DollarSign, Phone,
  ArrowRight, Send, Clock, XCircle, Star, Target, Eye,
} from 'lucide-react';

interface Opportunity {
  id: string;
  company: string;
  industry: string;
  offer_type: string;
  commission_model: string;
  call_volume: string;
  status: string;
  description: string | null;
  niche: string | null;
  language: string | null;
  region: string | null;
  min_close_rate: number | null;
  min_show_rate: number | null;
  experience_level: string | null;
}

interface Application {
  id: string;
  opportunity_id: string;
  status: string;
  match_score: number;
  user_notes: string | null;
  created_at: string;
}

const APP_STATUS_LABELS: Record<string, string> = {
  submitted: 'Eingereicht',
  under_review: 'In Prüfung',
  shortlisted: 'Shortlist',
  interview: 'Interview',
  matched: 'Matched',
  declined: 'Abgelehnt',
  placed: 'Platziert',
};

const APP_STATUS_COLORS: Record<string, string> = {
  submitted: 'text-muted-foreground',
  under_review: 'text-accent',
  shortlisted: 'text-primary',
  interview: 'text-accent',
  matched: 'text-primary',
  declined: 'text-destructive',
  placed: 'text-primary',
};

const PLACEMENT_KPI_TARGETS = [
  { key: 'closing_rate', label: 'Close Rate', target: 25, suffix: '%' },
  { key: 'calls_per_week', label: 'Calls/Woche', target: 15, suffix: '' },
  { key: 'show_rate', label: 'Show Rate', target: 70, suffix: '%' },
  { key: 'follow_up_rate', label: 'Follow-Up', target: 100, suffix: '%' },
  { key: 'crm_hygiene_score', label: 'CRM Hygiene', target: 100, suffix: '%' },
  { key: 'ethical_alignment_score', label: 'Ethical Score', target: 75, suffix: '%' },
  { key: 'awareness_score', label: 'Awareness', target: 70, suffix: '%' },
];

function calculateMatchScore(opp: Opportunity, kpis: any): number {
  let score = 0;
  const cr = kpis?.closing_rate ?? 0;
  const sr = kpis?.show_rate ?? 0;
  const cpw = kpis?.calls_per_week ?? 0;
  const fur = kpis?.follow_up_rate ?? 0;
  const crm = kpis?.crm_hygiene_score ?? 0;
  const ethicalScore = kpis?.ethical_alignment_score ?? 0;
  const awarenessScore = kpis?.awareness_score ?? 0;
  const pressureIdx = kpis?.pressure_index ?? 100;

  const minCR = opp.min_close_rate ?? 20;
  const minSR = opp.min_show_rate ?? 60;

  // KPI fit (30%)
  if (cr >= minCR) score += 12; else score += Math.round((cr / minCR) * 8);
  if (sr >= minSR) score += 9; else score += Math.round((sr / minSR) * 6);
  if (cpw >= 15) score += 5;
  if (fur >= 90) score += 4;

  // Ethical alignment (30%)
  if (ethicalScore >= 75) score += 15; else score += Math.round((ethicalScore / 75) * 10);
  if (pressureIdx <= 30) score += 10; else score += Math.max(0, 10 - Math.round(pressureIdx / 10));
  if (awarenessScore >= 70) score += 5;

  // Industry & profile fit (20%)
  score += 15;

  // Availability (10%)
  score += 10;

  // Bonus (10%)
  if (cr >= 30) score += 5;
  if (crm >= 90) score += 3;
  if (ethicalScore >= 85) score += 2;

  return Math.min(100, score);
}

export default function Placement() {
  const { profile, user, isAdmin } = useAuth();
  const { overallProgress } = useAcademyData();
  const { kpis } = useKpis();
  const { toast } = useToast();
  const { lang } = useLanguage();

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingTo, setApplyingTo] = useState<string | null>(null);
  const [applyNote, setApplyNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const stage = (profile as any)?.business_stage || 'opener';
  const userLevel = getUserLevel(stage);
  const isPlacementReady = profile?.placement_ready ?? false;
  const isCertified = profile?.certified ?? false;

  // Level 3 can see the page but content is locked/blurred
  const isPreviewOnly = userLevel === 3 && !isAdmin;
  const hasFullAccess = userLevel >= 4 || isAdmin;

  const kpisMet = PLACEMENT_KPI_TARGETS.every(t => ((kpis as any)?.[t.key] ?? 0) >= t.target);

  const readinessChecklist = [
    { label: t('Alle Module abgeschlossen', 'All modules completed'), done: overallProgress === 100 },
    { label: t('Zertifizierung bestanden', 'Certification passed'), done: isCertified },
    { label: t('Alle 5 KPI-Schwellenwerte erreicht', 'All 5 KPI thresholds met'), done: kpisMet },
    { label: t('Placement Readiness freigegeben', 'Placement readiness approved'), done: isPlacementReady },
  ];
  const readinessDone = readinessChecklist.filter(i => i.done).length;
  const readinessPercent = Math.round((readinessDone / readinessChecklist.length) * 100);

  useEffect(() => {
    loadData();
  }, [user?.id]);

  async function loadData() {
    setLoading(true);
    const [oppRes, appRes] = await Promise.all([
      supabase.from('placement_opportunities').select('*').order('created_at', { ascending: false }),
      user?.id
        ? supabase.from('placement_applications').select('*').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
    ]);
    setOpportunities((oppRes.data as Opportunity[]) ?? []);
    setApplications((appRes.data as Application[]) ?? []);
    setLoading(false);
  }

  const appMap = useMemo(() => {
    const m = new Map<string, Application>();
    applications.forEach(a => m.set(a.opportunity_id, a));
    return m;
  }, [applications]);

  const openOpportunities = opportunities.filter(o => o.status === 'open');

  const scoredOpportunities = useMemo(() =>
    openOpportunities.map(opp => ({
      ...opp,
      matchScore: calculateMatchScore(opp, kpis),
    })).sort((a, b) => b.matchScore - a.matchScore),
    [openOpportunities, kpis]
  );

  async function submitApplication(oppId: string) {
    if (!user?.id) return;
    setSubmitting(true);
    const score = calculateMatchScore(
      opportunities.find(o => o.id === oppId)!,
      kpis
    );
    const { data, error } = await supabase.from('placement_applications').insert({
      user_id: user.id,
      opportunity_id: oppId,
      status: 'submitted',
      match_score: score,
      user_notes: applyNote || null,
    }).select().single();

    if (error) {
      toast({ title: t('Fehler', 'Error'), description: error.message, variant: 'destructive' });
    } else {
      setApplications(prev => [...prev, data as Application]);
      toast({ title: t('Bewerbung eingereicht', 'Application submitted') });
    }
    setApplyingTo(null);
    setApplyNote('');
    setSubmitting(false);
  }

  async function withdrawApplication(appId: string) {
    await supabase.from('placement_applications').delete().eq('id', appId);
    setApplications(prev => prev.filter(a => a.id !== appId));
    toast({ title: t('Bewerbung zurückgezogen', 'Application withdrawn') });
  }

  // Preview mode for Level 3
  if (isPreviewOnly) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
        <div className="mb-8">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Placement Track</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Dein Weg zu echten Placement-Möglichkeiten.', 'Your path to real placement opportunities.')}
          </p>
        </div>

        {/* Readiness Score visible */}
        <div className="mb-8 rounded-xl border border-border/40 bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-base font-semibold text-foreground">Placement Readiness</h2>
            <span className="text-sm font-bold text-muted-foreground">{readinessPercent}%</span>
          </div>
          <Progress value={readinessPercent} className="mb-4 h-1.5 bg-muted" />
          <div className="space-y-2">
            {readinessChecklist.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                {item.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
                <span className={`text-[13px] ${item.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Blurred opportunity preview */}
        <div className="relative">
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm">
            <Lock className="h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="font-serif text-base font-semibold text-foreground">
              {t('Ab Level 4 verfügbar', 'Available from Level 4')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm text-center">
              {t(
                'Werde Closer (Placement Track), um vollen Zugang zu Placement-Opportunities zu erhalten.',
                'Become a Closer (Placement Track) to get full access to placement opportunities.'
              )}
            </p>
          </div>
          <div className="space-y-3 opacity-30 pointer-events-none select-none blur-[2px]">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-border/40 bg-card p-5">
                <div className="h-4 w-32 bg-muted rounded mb-2" />
                <div className="h-3 w-48 bg-muted/60 rounded mb-3" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-3 w-full bg-muted/40 rounded" />
                  <div className="h-3 w-full bg-muted/40 rounded" />
                  <div className="h-3 w-full bg-muted/40 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Placement Track</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('Dein Weg zu echten Placement-Möglichkeiten.', 'Your path to real placement opportunities.')}</p>
      </div>

      {/* Readiness Score */}
      <div className="mb-8 rounded-xl border border-border/40 bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-base font-semibold text-foreground">Placement Readiness</h2>
          <span className={`text-sm font-bold ${isPlacementReady ? 'text-primary' : 'text-accent'}`}>{readinessPercent}%</span>
        </div>
        <Progress value={readinessPercent} className="mb-4 h-1.5 bg-muted" />
        <div className="space-y-2">
          {readinessChecklist.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              {item.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
              <span className={`text-[13px] ${item.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* KPI Detail */}
        <div className="mt-4 pt-3 border-t border-border/30">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" /> 5 Placement KPIs
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {PLACEMENT_KPI_TARGETS.map(t => {
              const current = (kpis as any)?.[t.key] ?? 0;
              const met = current >= t.target;
              const pct = Math.min(100, Math.round((current / t.target) * 100));
              return (
                <div key={t.key} className={`rounded-lg border p-2.5 ${met ? 'border-primary/30 bg-primary/5' : 'border-border/30'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {met ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <Circle className="h-3 w-3 text-muted-foreground/40" />}
                    <p className="text-[10px] font-semibold text-muted-foreground">{t.label}</p>
                  </div>
                  <Progress value={pct} className="h-1 bg-muted mb-1" />
                  <p className="text-[9px] text-muted-foreground">{current}{t.suffix} / {t.target}{t.suffix}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Applications */}
      {applications.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('Deine Bewerbungen', 'Your Applications')}</h2>
          <div className="space-y-2">
            {applications.map(app => {
              const opp = opportunities.find(o => o.id === app.opportunity_id);
              if (!opp) return null;
              const canWithdraw = ['submitted', 'under_review'].includes(app.status);
              return (
                <div key={app.id} className="rounded-xl border border-border/40 bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">{opp.company}</p>
                      <p className="text-[12px] text-muted-foreground">{opp.offer_type} · {opp.industry}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={`text-[10px] ${APP_STATUS_COLORS[app.status] ?? 'text-muted-foreground'}`}>
                        {APP_STATUS_LABELS[app.status] ?? app.status}
                      </Badge>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-primary">
                        <Target className="h-3 w-3" />{app.match_score}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />{new Date(app.created_at).toLocaleDateString('de-DE')}
                    </p>
                    {canWithdraw && (
                      <Button variant="ghost" size="sm" className="text-[10px] h-6 text-destructive hover:text-destructive" onClick={() => withdrawApplication(app.id)}>
                        <XCircle className="mr-1 h-3 w-3" />{t('Zurückziehen', 'Withdraw')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Opportunity Board */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('Verfügbare Opportunities', 'Available Opportunities')}</h2>
        {!isPlacementReady && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            <Lock className="mr-1 h-3 w-3" />{t('Freischaltung erforderlich', 'Unlock required')}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
      ) : (
        <div className={`space-y-3 ${!isPlacementReady ? 'opacity-40 pointer-events-none select-none' : ''}`}>
          {scoredOpportunities.map(opp => {
            const existing = appMap.get(opp.id);
            const isApplying = applyingTo === opp.id;
            return (
              <div key={opp.id} className="rounded-xl border border-border/40 bg-card p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">{opp.company}</p>
                    <p className="text-[12px] text-muted-foreground">{opp.industry}{opp.niche ? ` · ${opp.niche}` : ''}</p>
                    {opp.description && <p className="text-[11px] text-muted-foreground mt-1">{opp.description}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className={`flex items-center gap-1 text-[11px] font-bold ${opp.matchScore >= 80 ? 'text-primary' : opp.matchScore >= 60 ? 'text-accent' : 'text-muted-foreground'}`}>
                      <Star className="h-3 w-3" />Match {opp.matchScore}%
                    </div>
                    {opp.language && <span className="text-[9px] text-muted-foreground">{opp.language}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1.5 text-[12px] text-muted-foreground sm:grid-cols-3 mb-3">
                  <div className="flex items-center gap-2"><MapPin className="h-3 w-3" />{opp.offer_type}{opp.region ? ` · ${opp.region}` : ''}</div>
                  <div className="flex items-center gap-2"><DollarSign className="h-3 w-3" />{opp.commission_model}</div>
                  <div className="flex items-center gap-2"><Phone className="h-3 w-3" />{opp.call_volume}</div>
                </div>
                {opp.min_close_rate || opp.min_show_rate ? (
                  <div className="flex gap-3 text-[10px] text-muted-foreground mb-3">
                    {opp.min_close_rate ? <span>Min. Close Rate: {opp.min_close_rate}%</span> : null}
                    {opp.min_show_rate ? <span>Min. Show Rate: {opp.min_show_rate}%</span> : null}
                  </div>
                ) : null}

                {existing ? (
                  <Badge variant="outline" className={`text-[10px] ${APP_STATUS_COLORS[existing.status]}`}>
                    {APP_STATUS_LABELS[existing.status]} · Match {existing.match_score}%
                  </Badge>
                ) : isApplying ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder={t('Kurze Notiz (optional) — warum passt diese Opportunity zu dir?', 'Short note (optional) — why is this opportunity right for you?')}
                      value={applyNote}
                      onChange={e => setApplyNote(e.target.value)}
                      rows={2}
                      className="text-xs"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="text-xs" onClick={() => submitApplication(opp.id)} disabled={submitting}>
                        <Send className="mr-1 h-3 w-3" />{submitting ? t('Wird gesendet…', 'Sending…') : t('Bewerbung absenden', 'Submit application')}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setApplyingTo(null); setApplyNote(''); }}>{t('Abbrechen', 'Cancel')}</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setApplyingTo(opp.id)}>
                    {t('Bewerben', 'Apply')} <ArrowRight className="ml-2 h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
          {scoredOpportunities.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t('Aktuell keine Opportunities verfügbar.', 'No opportunities currently available.')}</p>
          )}
        </div>
      )}
    </div>
  );
}