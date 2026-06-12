import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  TrendingUp, Award, AlertTriangle,
} from 'lucide-react';

const STAGE_ORDER = ['prospect', 'opener', 'setter', 'senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner', 'inner_circle'];
const STAGE_LABELS: Record<string, string> = {
  prospect: 'L0 Bewerber', opener: 'L1 Trainee', setter: 'L2 Associate Setter', senior_associate: 'L3 Senior Setter',
  junior_manager: 'L4 Closer (Placement Track)', manager: 'L5 Managing Closer', senior_manager: 'L6 Senior Closer',
  director: 'L7 Director', partner: 'L8 Partner', inner_circle: 'Inner Circle',
};

interface Candidate {
  id: string;
  full_name: string | null;
  email: string | null;
  business_stage: string;
  certified: boolean;
  placement_ready: boolean;
  created_at: string;
  onboarding_completed: boolean;
  kpis: {
    closing_rate: number | null;
    show_rate: number | null;
    calls_per_week: number | null;
    follow_up_rate: number | null;
    crm_hygiene_score: number | null;
    revenue_closed: number | null;
    calls_handled: number | null;
  } | null;
  daysOnLevel: number;
  nextStage: string;
}

export default function PromotionQueue() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => { loadCandidates(); }, []);

  async function loadCandidates() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, business_stage, certified, placement_ready, created_at, onboarding_completed')
      .order('created_at');

    if (!profiles) { setLoading(false); return; }

    const userIds = profiles.map(p => p.id);
    const { data: kpisData } = await supabase
      .from('member_kpis')
      .select('user_id, closing_rate, show_rate, calls_per_week, follow_up_rate, crm_hygiene_score, revenue_closed, calls_handled')
      .in('user_id', userIds);

    const kpiMap = new Map<string, any>();
    (kpisData ?? []).forEach(k => kpiMap.set(k.user_id, k));

    const now = Date.now();
    const result: Candidate[] = profiles
      .map(p => {
        const stageIdx = STAGE_ORDER.indexOf(p.business_stage || 'opener');
        const nextStage = stageIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[stageIdx + 1] : '';
        const daysOnLevel = Math.floor((now - new Date(p.created_at).getTime()) / 86400000);
        const kpis = kpiMap.get(p.id) ?? null;
        return { ...p, business_stage: p.business_stage || 'opener', kpis, daysOnLevel, nextStage } as Candidate;
      })
      .filter(c => c.nextStage && isPromotionCandidate(c));

    setCandidates(result);
    setLoading(false);
  }

  function isPromotionCandidate(c: Candidate): boolean {
    const s = c.business_stage;
    if (s === 'opener') return c.onboarding_completed && c.daysOnLevel >= 7;
    if (s === 'setter') return c.daysOnLevel >= 14;
    if (s === 'closer') return c.certified && c.daysOnLevel >= 14;
    if (s === 'placement') return c.certified && c.daysOnLevel >= 14;
    if (s === 'advanced_lab') return c.placement_ready && c.daysOnLevel >= 30;
    if (s === 'community') return c.daysOnLevel >= 30;
    if (s === 'scaling') return c.daysOnLevel >= 60;
    return false;
  }

  function getReadinessScore(c: Candidate): number {
    let score = 0;
    const k = c.kpis;
    if (c.onboarding_completed) score += 10;
    if (c.certified) score += 20;
    if (c.placement_ready) score += 15;
    if (k) {
      if ((k.closing_rate ?? 0) >= 15) score += 15;
      if ((k.show_rate ?? 0) >= 60) score += 10;
      if ((k.calls_per_week ?? 0) >= 10) score += 10;
      if ((k.follow_up_rate ?? 0) >= 80) score += 10;
      if ((k.crm_hygiene_score ?? 0) >= 80) score += 10;
    }
    return Math.min(score, 100);
  }

  async function handlePromotion(candidate: Candidate, action: 'approve' | 'reject') {
    setProcessing(candidate.id);
    const note = notes[candidate.id] || '';

    if (action === 'approve') {
      await supabase.from('profiles').update({
        business_stage: candidate.nextStage,
        updated_at: new Date().toISOString(),
      }).eq('id', candidate.id);

      await supabase.from('audit_logs').insert({
        action: 'promotion_approved',
        actor_id: user?.id,
        target_user_id: candidate.id,
        source_type: 'admin',
        before_state: { business_stage: candidate.business_stage },
        after_state: { business_stage: candidate.nextStage },
        note: note || `Promotion: ${STAGE_LABELS[candidate.business_stage]} → ${STAGE_LABELS[candidate.nextStage]}`,
      });

      toast({ title: 'Promotion genehmigt', description: `${candidate.full_name || candidate.email} → ${STAGE_LABELS[candidate.nextStage]}` });
    } else {
      await supabase.from('audit_logs').insert({
        action: 'promotion_rejected',
        actor_id: user?.id,
        target_user_id: candidate.id,
        source_type: 'admin',
        before_state: { business_stage: candidate.business_stage },
        after_state: { business_stage: candidate.business_stage },
        note: note || 'Promotion abgelehnt',
      });

      toast({ title: 'Promotion abgelehnt', description: candidate.full_name || candidate.email || '' });
    }

    setCandidates(prev => prev.filter(c => c.id !== candidate.id));
    setProcessing(null);
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Lade Promotion-Kandidaten…</div>;
  }

  if (candidates.length === 0) {
    return (
      <div className="py-12 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-primary/40 mb-3" />
        <p className="text-sm text-muted-foreground">Keine offenen Promotions.</p>
        <p className="text-xs text-muted-foreground mt-1">Kandidaten erscheinen hier, sobald sie die Mindestanforderungen erfüllen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-2">{candidates.length} Kandidat{candidates.length !== 1 ? 'en' : ''} bereit zur Bewertung</p>
      {candidates.map(c => {
        const score = getReadinessScore(c);
        const expanded = expandedId === c.id;
        const isProcessing = processing === c.id;

        return (
          <div key={c.id} className="rounded-xl border border-border/40 bg-card overflow-hidden">
            {/* Header */}
            <button
              onClick={() => setExpandedId(expanded ? null : c.id)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{c.full_name || 'Kein Name'}</p>
                <p className="text-[11px] text-muted-foreground truncate">{c.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px]">
                  {STAGE_LABELS[c.business_stage]} → {STAGE_LABELS[c.nextStage]}
                </Badge>
                <div className={`flex items-center gap-1 text-[10px] font-bold ${score >= 80 ? 'text-primary' : score >= 50 ? 'text-accent' : 'text-destructive'}`}>
                  <TrendingUp className="h-3 w-3" />{score}%
                </div>
                {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {/* Expanded Detail */}
            {expanded && (
              <div className="border-t border-border/30 p-4 space-y-4">
                {/* KPI Snapshot */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">KPI Snapshot</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Close Rate', value: c.kpis?.closing_rate, suffix: '%', target: 15 },
                      { label: 'Show Rate', value: c.kpis?.show_rate, suffix: '%', target: 60 },
                      { label: 'Calls/Woche', value: c.kpis?.calls_per_week, suffix: '', target: 10 },
                      { label: 'Follow-Up', value: c.kpis?.follow_up_rate, suffix: '%', target: 80 },
                      { label: 'CRM Hygiene', value: c.kpis?.crm_hygiene_score, suffix: '%', target: 80 },
                      { label: 'Revenue', value: c.kpis?.revenue_closed, suffix: '€', target: 0 },
                      { label: 'Calls Total', value: c.kpis?.calls_handled, suffix: '', target: 0 },
                    ].map(kpi => {
                      const val = kpi.value ?? 0;
                      const met = kpi.target > 0 ? val >= kpi.target : true;
                      return (
                        <div key={kpi.label} className={`rounded-lg border p-2.5 text-center ${met ? 'border-primary/20 bg-primary/[0.03]' : 'border-border/30'}`}>
                          <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                          <p className={`text-sm font-bold ${met ? 'text-primary' : 'text-foreground'}`}>
                            {val}{kpi.suffix}
                          </p>
                          {kpi.target > 0 && (
                            <p className="text-[9px] text-muted-foreground">Ziel: {kpi.target}{kpi.suffix}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg border border-border/30 p-2 text-center">
                    <p className="text-muted-foreground">Tage auf Level</p>
                    <p className="font-bold text-foreground">{c.daysOnLevel}</p>
                  </div>
                  <div className="rounded-lg border border-border/30 p-2 text-center">
                    <p className="text-muted-foreground">Zertifiziert</p>
                    <p className="font-bold text-foreground">{c.certified ? '✓' : '✗'}</p>
                  </div>
                  <div className="rounded-lg border border-border/30 p-2 text-center">
                    <p className="text-muted-foreground">Placement Ready</p>
                    <p className="font-bold text-foreground">{c.placement_ready ? '✓' : '✗'}</p>
                  </div>
                </div>

                {/* Readiness Score */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${score >= 80 ? 'bg-primary' : score >= 50 ? 'bg-accent' : 'bg-destructive'}`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold ${score >= 80 ? 'text-primary' : score >= 50 ? 'text-accent' : 'text-destructive'}`}>
                    {score >= 80 ? 'Ready' : score >= 50 ? 'Fast Ready' : 'Nicht Ready'}
                  </span>
                </div>

                {/* Note */}
                <div>
                  <Textarea
                    placeholder="Notiz zur Entscheidung (optional)…"
                    value={notes[c.id] || ''}
                    onChange={e => setNotes(prev => ({ ...prev, [c.id]: e.target.value }))}
                    rows={2}
                    className="text-xs"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => handlePromotion(c, 'approve')}
                    disabled={isProcessing}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs"
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    {isProcessing ? 'Wird befördert…' : 'Promotion genehmigen'}
                  </Button>
                  <Button
                    onClick={() => handlePromotion(c, 'reject')}
                    disabled={isProcessing}
                    variant="outline"
                    className="flex-1 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                  >
                    <XCircle className="mr-1.5 h-3.5 w-3.5" />Ablehnen
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
